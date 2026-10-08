/**
 * Week-to-week body & mind: training, drills, recovery, morale/form drift, injuries,
 * end-of-season ageing.
 */
import type { AttrKey, GameState, Injury, MomentType, TrainingFocus } from '../core/types';
import type { Rng } from '../core/rng';
import { t } from '../core/i18n';
import { absWeek, age as ageOf, avg, clamp } from '../core/util';
import { ATTR_KEYS, POSITION_WEIGHTS, overall, positionGroup } from '../core/ratings';
import type { ProgressNote, TrainingFocusDef } from './model';
import {
  SEASON_END_WEEK, clubOf, getFlagNum, hasTrait, nowIndex, round1, userPlayer,
} from './helpers';
import { applyXp, mergeNotes } from './xp';
import { applyEffects } from './effects';
import { itemPerks } from './shop';
import { INJURIES } from './injuries';
import { userMarketValue } from './value';

export const TRAINING_FOCUSES: TrainingFocusDef[] = [
  { id: 'balanced', icon: 'activity', name: { tr: 'Dengeli Program', en: 'Balanced Programme' }, attrs: ['passing', 'firstTouch', 'shooting', 'stamina', 'positioning', 'tackling'] },
  { id: 'shooting', icon: 'crosshair', name: { tr: 'Bitiricilik', en: 'Finishing' }, attrs: ['shooting', 'composure', 'positioning'] },
  { id: 'passing', icon: 'eye', name: { tr: 'Pas ve Oyun Görüşü', en: 'Passing & Vision' }, attrs: ['passing', 'vision', 'firstTouch'] },
  { id: 'dribbling', icon: 'footprints', name: { tr: 'Top Sürme ve Çalım', en: 'Dribbling & Skills' }, attrs: ['dribbling', 'firstTouch', 'acceleration'] },
  { id: 'physical', icon: 'dumbbell', name: { tr: 'Fizik ve Kondisyon', en: 'Physical Conditioning' }, attrs: ['pace', 'acceleration', 'stamina', 'strength', 'jumping'] },
  { id: 'defending', icon: 'shield', name: { tr: 'Savunma', en: 'Defending' }, attrs: ['tackling', 'positioning', 'heading', 'strength'] },
  { id: 'setpieces', icon: 'target', name: { tr: 'Duran Toplar ve Falso', en: 'Set Pieces & Curl' }, attrs: ['curl', 'shooting', 'passing'] },
  { id: 'mental', icon: 'brain', name: { tr: 'Zihinsel Gelişim', en: 'Mental Sharpness' }, attrs: ['composure', 'vision', 'positioning'] },
];

const FOCUS_ENERGY: Record<TrainingFocus, number> = {
  balanced: 3, shooting: 3, passing: 2, dribbling: 4, physical: 6, defending: 4, setpieces: 2, mental: 1,
};

/** Base raw xp per training week (tuned so a 17-year-old with minutes gains ~3–7 overall a season). */
const TRAINING_BASE_XP = 26;

const OUTFIELD_ATTRS = ATTR_KEYS.filter((k) => k !== 'goalkeeping');

/** How the week's xp is spread: the focus attrs plus a share by position importance. */
function focusDistribution(focus: TrainingFocusDef, position: GameState['world']['players'][string]['position']): Partial<Record<AttrKey, number>> {
  const out: Partial<Record<AttrKey, number>> = {};
  const add = (k: AttrKey, w: number) => { if (k !== 'goalkeeping') out[k] = (out[k] ?? 0) + w; };
  const posW = POSITION_WEIGHTS[position];
  const posSum = Object.values(posW).reduce((a, b) => a + (b ?? 0), 0) || 1;
  if (focus.id === 'balanced') {
    for (const [k, w] of Object.entries(posW) as [AttrKey, number][]) add(k, (0.75 * w) / posSum);
    for (const k of OUTFIELD_ATTRS) add(k, 0.25 / OUTFIELD_ATTRS.length);
  } else {
    for (const k of focus.attrs) add(k, 0.72 / focus.attrs.length);
    for (const [k, w] of Object.entries(posW) as [AttrKey, number][]) add(k, (0.28 * w) / posSum);
  }
  return out;
}

export function trainWeek(state: GameState, rng: Rng): ProgressNote[] {
  const c = state.career;
  if (c.retired) return [];
  const p = userPlayer(state);
  if (p.injury) {
    // rehab week: watching tape and gym-free mental work
    return applyXp(state, { vision: 2, composure: 2, positioning: 1 });
  }
  const focus = TRAINING_FOCUSES.find((f) => f.id === c.trainingFocus) ?? TRAINING_FOCUSES[0];
  const club = clubOf(state, p.clubId);
  const perks = itemPerks(state);
  const workaholic = hasTrait(p, 'workaholic');

  let base = TRAINING_BASE_XP;
  base *= 0.8 + (club ? club.facilities : 30) / 250;
  base *= 1 + perks.trainingBoost;
  base *= c.energy < 25 ? 0.55 : c.energy < 45 ? 0.8 : 1;
  base *= 0.9 + clamp(p.morale, 0, 100) / 500;
  if (workaholic) base *= 1.25;
  const mentor = c.mentorId ? state.world.players[c.mentorId] : undefined;
  if (mentor && !mentor.retired && mentor.clubId === p.clubId) base *= positionGroup(mentor.position) === positionGroup(p.position) ? 1.09 : 1.04;
  if (state.week > SEASON_END_WEEK) base *= workaholic ? 0.9 : 0.6; // summer break
  base *= rng.float(0.85, 1.15);

  const dist = focusDistribution(focus, p.position);
  const xp: Partial<Record<AttrKey, number>> = {};
  for (const [k, w] of Object.entries(dist) as [AttrKey, number][]) xp[k] = base * w;

  c.energy = round1(clamp(c.energy - FOCUS_ENERGY[focus.id] - (workaholic ? 1 : 0), 0, 100));
  if (focus.id === 'physical') p.fitness = round1(clamp(p.fitness + 2, 0, 100));
  return applyXp(state, xp);
}

// ───────── drills ─────────

const DRILL_ATTRS: Partial<Record<MomentType, AttrKey[]>> = {
  drill_free_kick: ['curl', 'shooting', 'composure'],
  drill_finishing: ['shooting', 'composure', 'positioning', 'firstTouch'],
  drill_passing: ['passing', 'vision', 'firstTouch'],
  free_kick: ['curl', 'shooting'],
  penalty: ['composure', 'shooting'],
  corner: ['curl', 'passing'],
  one_on_one: ['composure', 'shooting', 'dribbling'],
  cross_receive: ['heading', 'positioning', 'jumping'],
  wing_cross: ['passing', 'curl', 'pace'],
  build_up: ['passing', 'vision', 'firstTouch'],
  defend: ['tackling', 'positioning', 'strength'],
  counter: ['pace', 'dribbling', 'passing'],
  open_play: ['dribbling', 'passing', 'shooting'],
};

const drillFlag = (drill: MomentType) => `career.drill.${drill}`;

export function drillAvailable(state: GameState, drill: MomentType): boolean {
  return state.flags[drillFlag(drill)] !== absWeek(state.season, state.week);
}

export function applyDrill(state: GameState, drill: MomentType, score: number): ProgressNote[] {
  if (state.career.retired || !drillAvailable(state, drill)) return [];
  state.flags[drillFlag(drill)] = absWeek(state.season, state.week);
  const p = userPlayer(state);
  const s = clamp(Number.isFinite(score) ? score : 0, 0, 100);
  let total = 2 + s * 0.1; // 2..12 raw xp
  if (hasTrait(p, 'workaholic')) total *= 1.15;
  const attrs = DRILL_ATTRS[drill] ?? ['passing', 'shooting'];
  const xp: Partial<Record<AttrKey, number>> = {};
  attrs.forEach((k, i) => { xp[k] = i === 0 ? total * 0.5 : (total * 0.5) / (attrs.length - 1); });
  const notes = applyXp(state, xp);
  applyEffects(state, { energy: -2, morale: s >= 85 ? 2 : s < 20 ? -1 : 0 });
  return notes;
}

// ───────── recovery ─────────

function userClubPlayedThisWeek(state: GameState, clubId: string | null): number {
  if (!clubId) return 0;
  let n = 0;
  for (const comp of Object.values(state.competitions)) {
    for (const f of comp.fixtures) {
      if (f.week === state.week && f.season === state.season && f.played && (f.homeId === clubId || f.awayId === clubId)) n++;
    }
  }
  return n;
}

const lastActFlag = (cat: string) => `career.lastAct.${cat}`;

export function weeklyRecovery(state: GameState, rng: Rng): string[] {
  const c = state.career;
  const notes: string[] = [];
  if (c.retired) return notes;
  const p = userPlayer(state);
  const perks = itemPerks(state);
  const now = nowIndex(state);

  // energy
  const regen = 30 + perks.energyRegen + (hasTrait(p, 'iron_man') ? 6 : 0) + (p.injury ? 5 : 0);
  c.energy = round1(clamp(c.energy + regen, 0, 100));

  // injury countdown
  if (p.injury) {
    p.injury.weeksLeft -= 1;
    if (perks.injuryResist >= 0.15 && p.injury.weeksLeft > 1 && rng.chance(0.35)) {
      p.injury.weeksLeft -= 1;
      notes.push(t('career.rec.physioFast'));
    }
    if (p.injury.weeksLeft <= 0) {
      p.injury = null;
      p.morale = clamp(p.morale + 6, 0, 100);
      p.fitness = Math.min(p.fitness, 65);
      notes.push(t('career.rec.healed'));
    } else if (p.injury.weeksLeft <= 2 || p.injury.weeksLeft % 4 === 0) {
      notes.push(t('career.rec.injuryLeft', { n: p.injury.weeksLeft }));
    }
  }

  // playing time
  const played = c.matches.some((m) => m.season === state.season && m.week === state.week && m.minutes > 0);
  const clubGames = userClubPlayedThisWeek(state, p.clubId);
  let streak = getFlagNum(state, 'career.benchStreak');
  if (played) streak = 0;
  else if (clubGames > 0 && !p.injury) streak += 1;
  state.flags['career.benchStreak'] = streak;

  // fitness (sharpness + freshness)
  const target = 55 + c.energy * 0.35 + (played ? 10 : 0) - (p.injury ? 30 : 0);
  p.fitness = round1(clamp(p.fitness + (target - p.fitness) * 0.5, 20, 100));

  // morale drift toward 55, pushed by life around you
  const promised = p.contract?.role === 'starter' || p.contract?.role === 'star';
  const rels = [c.relationships.manager, c.relationships.teammates, c.relationships.family];
  if (c.partnerId) rels.push(c.relationships.partner);
  let dm = (55 - p.morale) * 0.12 + perks.morale * 0.4 + (avg(rels) - 50) / 25;
  if (played) dm += 1;
  if (streak >= 2) {
    dm -= Math.min(4, streak) * (promised ? 1.2 : 0.6);
    if (streak === 2 || streak % 4 === 0) notes.push(t('career.rec.benchMorale'));
  }
  if (promised && streak >= 3) {
    c.relationships.manager = round1(clamp(c.relationships.manager - 1.5, 0, 100));
    if (streak === 3 || streak % 4 === 0) notes.push(t('career.rec.brokenPromise'));
  }
  if (c.money < 0) {
    dm -= 2;
    if (c.money <= -25_000) notes.push(t('career.rec.debt'));
  }
  if (hasTrait(p, 'family_first') && c.relationships.family >= 70) dm += 1;
  if (dm < 0) dm *= hasTrait(p, 'calm') ? 0.6 : hasTrait(p, 'hothead') ? 1.3 : 1;
  p.morale = round1(clamp(p.morale + dm, 0, 100));

  // form drifts back to neutral
  p.form = round1(p.form + (50 - p.form) * 0.12);

  // relationships: perks, neglect, natural drift
  for (const [k, v] of Object.entries(perks.rel) as [keyof typeof c.relationships, number][]) {
    if (k === 'partner' && !c.partnerId) continue;
    c.relationships[k] = round1(clamp(c.relationships[k] + v, 0, 100));
  }
  if (c.partnerId) {
    if (typeof state.flags[lastActFlag('romance')] !== 'number') state.flags[lastActFlag('romance')] = now;
    const since = now - getFlagNum(state, lastActFlag('romance'), now);
    if (since > 5) {
      c.relationships.partner = round1(clamp(c.relationships.partner - 1.5, 0, 100));
      if (since === 8) {
        const partner = c.people.find((x) => x.id === c.partnerId);
        if (partner) notes.push(t('career.rec.partnerDrift', { name: partner.name }));
      }
    }
    if (c.relationships.partner < 8) {
      const partner = c.people.find((x) => x.id === c.partnerId);
      notes.push(t('career.rec.breakup', { name: partner?.name ?? '?' }));
      if (partner) c.people = c.people.filter((x) => x.id !== partner.id); // the ex simply leaves the circle (no 'friend' leftovers)
      c.partnerId = null;
      c.relationships.partner = 0;
      delete state.flags['career.married'];
      p.morale = clamp(p.morale - 12, 0, 100);
    }
  }
  if (typeof state.flags[lastActFlag('family')] !== 'number') state.flags[lastActFlag('family')] = now;
  const familySince = now - getFlagNum(state, lastActFlag('family'), now);
  if (familySince > 8) {
    c.relationships.family = round1(clamp(c.relationships.family - (hasTrait(p, 'family_first') ? 1.2 : 0.6), 0, 100));
    if (familySince === 10) notes.push(t('career.rec.familyMiss'));
  }
  c.relationships.media = round1(c.relationships.media + (45 - c.relationships.media) * 0.02);
  if (hasTrait(p, 'fan_favourite')) c.relationships.fans = Math.max(c.relationships.fans, 30);
  if (hasTrait(p, 'loyal') && p.clubId && getFlagNum(state, 'career.joinedIdx', now) <= now - 52) {
    c.relationships.fans = round1(clamp(c.relationships.fans + 0.2, 0, 100));
  }
  for (const person of c.people) {
    if (c.partnerId && person.id === c.partnerId) person.relationship = Math.round(c.relationships.partner);
    else if (person.role === 'agent') person.relationship = Math.round(c.relationships.agent);
  }

  // fame fades slowly unless fed; followers grow with fame
  c.fame = round1(clamp(c.fame - 0.08 * (c.fame / 50) + perks.fameWeekly, 0, 100));
  c.followers = Math.round(c.followers + Math.pow(c.fame, 2.2) * 0.15 + perks.fameWeekly * 2_000);

  if (c.energy < 25) notes.push(t('career.rec.lowEnergy'));
  p.value = userMarketValue(state);
  return notes;
}

// ───────── injuries ─────────

export function rollInjury(state: GameState, rng: Rng, intensity: number): Injury | null {
  const c = state.career;
  const p = userPlayer(state);
  if (p.injury || c.retired) return null;
  const a = ageOf(p, state.season);
  const perks = itemPerks(state);
  const glass = hasTrait(p, 'glass_bones');
  const iron = hasTrait(p, 'iron_man');

  let chance = 0.03 * clamp(Number.isFinite(intensity) ? intensity : 0.5, 0, 1.5);
  chance *= c.energy < 30 ? 1.8 : c.energy < 50 ? 1.3 : 1;
  chance *= p.fitness < 60 ? 1.3 : 1;
  if (a > 30) chance *= 1 + (a - 30) * 0.08;
  if (glass) chance *= 1.9;
  if (iron) chance *= 0.45;
  chance *= 1 - perks.injuryResist;
  if (!rng.chance(chance)) return null;

  const sevWeights: [number, number, number] = glass ? [0.5, 0.37, 0.13] : iron ? [0.75, 0.22, 0.03] : [0.62, 0.3, 0.08];
  const r = rng.next();
  const severity: 1 | 2 | 3 = r < sevWeights[0] ? 1 : r < sevWeights[0] + sevWeights[1] ? 2 : 3;
  const entry = rng.pick(INJURIES[severity]);
  let weeks = rng.int(entry.weeks[0], entry.weeks[1]);
  if (glass) weeks = Math.round(weeks * 1.3);
  if (a > 30) weeks = Math.round(weeks * (1 + (a - 30) * 0.05));
  const injury: Injury = { key: entry.key, weeksLeft: Math.max(1, weeks), severity };
  p.injury = injury;
  p.fitness = round1(clamp(p.fitness - 10, 0, 100));
  p.morale = round1(clamp(p.morale - severity * 3, 0, 100));
  return injury;
}

// ───────── ageing ─────────

/** Fame & followers for the season's trophies and awards (once per season). */
function seasonRewards(state: GameState): void {
  const key = `career.seasonRewards.${state.season}`;
  if (state.flags[key]) return;
  state.flags[key] = true;
  const c = state.career;
  const trophies = c.trophies.filter((x) => x.season === state.season).length;
  let fame = trophies * 3;
  for (const aw of c.awards.filter((x) => x.season === state.season)) fame += aw.key === 'golden_ball' ? 10 : 2.5;
  if (fame > 0) applyEffects(state, { fame: Math.min(fame, 20), followers: Math.round(fame * (2_000 + c.followers * 0.01)) });
}

export function userSeasonAgeing(state: GameState, rng: Rng): ProgressNote[] {
  if (state.career.retired) return [];
  const p = userPlayer(state);
  seasonRewards(state);
  const nextAge = state.season + 1 - p.birthYear;
  const lists: ProgressNote[][] = [];

  if (nextAge <= 22) {
    // natural physical maturation
    lists.push(applyXp(state, { strength: rng.int(20, 50), stamina: rng.int(15, 40), jumping: rng.int(10, 30) }));
  }
  if (hasTrait(p, 'late_bloomer') && nextAge >= 23 && nextAge <= 27) {
    const keys = Object.keys(POSITION_WEIGHTS[p.position]) as AttrKey[];
    const xp: Partial<Record<AttrKey, number>> = {};
    for (const k of rng.shuffle([...keys]).slice(0, 4)) xp[k] = 60;
    lists.push(applyXp(state, xp));
  }

  const declineStart = 31 + (hasTrait(p, 'late_bloomer') ? 2 : 0) + (hasTrait(p, 'iron_man') ? 1 : 0);
  if (nextAge >= declineStart) {
    const years = nextAge - declineStart + 1;
    const drops: ProgressNote[] = [];
    const drop = (k: AttrKey, d: number) => {
      const real = Math.min(d, p.attrs[k] - 1);
      if (real > 0) { p.attrs[k] -= real; drops.push({ attr: k, delta: -real }); }
    };
    for (const k of ['pace', 'acceleration', 'stamina', 'jumping', 'strength'] as AttrKey[]) {
      let d = rng.int(0, 1) + Math.floor(years * 0.6);
      if (k === 'strength') d = Math.floor(d / 2);
      if ((k === 'pace' || k === 'acceleration') && hasTrait(p, 'speedster')) d += 1;
      if (hasTrait(p, 'iron_man')) d -= 1;
      drop(k, clamp(d, 0, 5));
    }
    if (years >= 3) for (const k of ['firstTouch', 'dribbling', 'shooting'] as AttrKey[]) drop(k, rng.int(0, 1));
    lists.push(drops);
    if (nextAge <= 34) {
      // experience still sharpens the mind
      const gains: ProgressNote[] = [];
      for (const k of ['composure', 'vision', 'positioning'] as AttrKey[]) {
        if (rng.chance(0.5) && p.attrs[k] < 99) { p.attrs[k] += 1; gains.push({ attr: k, delta: 1 }); }
      }
      lists.push(gains);
    }
    const ovr = overall(p);
    p.potential = Math.max(ovr, Math.min(p.potential, ovr + 2));
  }
  p.value = userMarketValue(state);
  return mergeNotes(...lists);
}

/** Record that an activity category was done this week (used by neglect drift). */
export function markActivity(state: GameState, category: string): void {
  state.flags[lastActFlag(category)] = nowIndex(state);
}
