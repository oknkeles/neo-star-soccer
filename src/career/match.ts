/**
 * After a user match: growth, form, morale, fame, followers, relationships, bonuses,
 * the personal match log and the injury roll.
 */
import type { AttrKey, Effects, GameState, MatchSummary, RelKey, UserMatchRecord } from '../core/types';
import type { Rng } from '../core/rng';
import { getLang, t } from '../core/i18n';
import { clamp, formatMoney } from '../core/util';
import { POSITION_WEIGHTS } from '../core/ratings';
import {
  findFixture, fixtureImportance, hasTrait, isDerby, nationalTeamOfNation, round1, teamName, userPlayer,
} from './helpers';
import { applyEffects } from './effects';
import { applyXp } from './xp';
import { rollInjury } from './progression';
import { injuryName } from './injuries';
import { userMarketValue } from './value';

const MATCH_LOG_MAX = 200;
/** The engine reports generous per-moment xp; scaled so a season of matches stays realistic. */
const ENGINE_XP_SCALE = 0.6;
const EXPECTED_RATING = { star: 7.1, starter: 6.8, rotation: 6.5, prospect: 6.2 } as const;

export function afterUserMatch(state: GameState, fixtureId: string, summary: MatchSummary, rng: Rng): string[] {
  const c = state.career;
  if (c.retired) return [];
  const p = userPlayer(state);
  const notes: string[] = [];
  const fixture = findFixture(state, fixtureId);
  const comp = fixture ? state.competitions[fixture.compId] : undefined;

  // which side were we?
  const nt = nationalTeamOfNation(state, p.nation);
  let teamId: string | null = null;
  if (fixture) {
    if (p.clubId && (fixture.homeId === p.clubId || fixture.awayId === p.clubId)) teamId = p.clubId;
    else if (nt && (fixture.homeId === nt.id || fixture.awayId === nt.id)) teamId = nt.id;
  }
  const home = fixture ? fixture.homeId === teamId : true;
  const gf = home ? summary.homeGoals : summary.awayGoals;
  const ga = home ? summary.awayGoals : summary.homeGoals;
  const won = gf > ga || (gf === ga && !!summary.pens && (home ? summary.pens.home > summary.pens.away : summary.pens.away > summary.pens.home));
  const lost = gf < ga || (gf === ga && !!summary.pens && !won);
  const importance = fixture ? fixtureImportance(state, fixture, teamId) : 0.45;
  const derby = fixture ? isDerby(state, fixture, teamId) : false;
  const big = importance >= 0.8;

  const u = summary.user;
  const minutes = u?.stats.minutes ?? summary.minutes?.[p.id] ?? 0;
  if (!u || minutes <= 0) {
    notes.push(t('career.match.unused'));
    notes.push(...applyEffects(state, { morale: -1 }));
    return notes;
  }

  const r = clamp(u.rating, 3, 10);
  const goals = u.stats.goals;
  const assists = u.stats.assists;
  const motm = summary.motmId === p.id;
  const bigMult = big && hasTrait(p, 'big_game') ? 1.5 : 1;

  // ── xp: engine xp + general match experience by position importance ──
  const xp: Partial<Record<AttrKey, number>> = {};
  for (const [k, v] of Object.entries(u.xp) as [AttrKey, number][]) if (Number.isFinite(v)) xp[k] = v * ENGINE_XP_SCALE;
  const exp = (minutes / 90) * 10;
  for (const [k, w] of Object.entries(POSITION_WEIGHTS[p.position]) as [AttrKey, number][]) {
    xp[k] = (xp[k] ?? 0) + exp * w;
  }
  xp.composure = (xp.composure ?? 0) + (big ? 1.5 : 0.5);
  const progress = applyXp(state, xp);
  for (const pn of progress) notes.push(`+${pn.delta} ${t(`common.attr.${pn.attr}`)}`);

  const e: Effects = { rel: {} };
  const rel = e.rel as Partial<Record<RelKey, number>>;

  // form & morale
  e.form = (r - 6.3) * 6 * (big && hasTrait(p, 'big_game') ? 1.25 : 1);
  let morale = (won ? 3 : lost ? -3 : 0) + (r >= 8 ? 3 : r <= 5 ? -3 : 0) + Math.min(4, goals * 2);
  if (hasTrait(p, 'hothead')) morale *= 1.5;
  if (morale < 0 && hasTrait(p, 'calm')) morale *= 0.6;
  e.morale = morale;

  // fame: big games and goals count more; harder to grow when already famous
  let fame = goals * (0.4 + importance * 0.6) + (r >= 8 ? 0.6 : 0) + (motm ? 0.5 : 0) + (won && big ? 0.4 : 0) - (r < 5 ? 0.3 : 0);
  if (hasTrait(p, 'showman')) fame *= fame > 0 ? 1.3 : 1;
  if (hasTrait(p, 'clinical') && goals > 0) fame += 0.2;
  fame *= bigMult;
  e.fame = round1(fame > 0 ? fame * 0.8 * (1 - c.fame / 130) : fame);

  // followers
  const base = 40 + Math.pow(c.fame, 2.4) * 0.5;
  let follow = base * (0.3 + Math.max(0, r - 6) * 0.5 + goals * 0.6 + (motm ? 0.5 : 0)) * (0.7 + importance * 0.6);
  if (hasTrait(p, 'showman')) follow *= 1.5;
  if (hasTrait(p, 'media_darling')) follow *= 1.3;
  if (r < 5) follow = -c.followers * 0.002;
  e.followers = Math.round(follow);

  // manager: rating against what your role demands
  const role = p.contract?.role ?? 'rotation';
  let mgr = clamp((r - EXPECTED_RATING[role]) * 3, -6, 6);
  const mTemp = p.clubId ? state.world.managers[state.world.clubs[p.clubId]?.managerId ?? '']?.temperament : undefined;
  if (mTemp === 'fiery' || mTemp === 'demanding') mgr *= 1.3;
  if (mgr < 0 && hasTrait(p, 'hothead')) mgr *= 1.3;
  if (teamId === p.clubId) rel.manager = mgr;

  // fans: goals, results, derbies
  let fans = goals * (derby ? 4 : 2) + (won ? 1 : lost ? -1 : 0) + (derby && won ? 2 : derby && lost ? -3 : 0) + (r >= 8 ? 1 : r <= 5 ? -2 : 0);
  if (fans > 0 && hasTrait(p, 'fan_favourite')) fans *= 1.5;
  if (fans > 0 && hasTrait(p, 'mercenary')) fans *= 0.7;
  if (fans < 0 && hasTrait(p, 'fan_favourite')) fans *= 0.6;
  rel.fans = fans;

  // teammates: assists & passing; selfish shooting costs
  const passRate = u.stats.passes > 0 ? u.stats.passesCompleted / u.stats.passes : 0;
  let mates = assists * (hasTrait(p, 'playmaker') ? 3 : 2) + (passRate >= 0.8 && u.stats.passes >= 10 ? 1 : 0) + (won ? 0.5 : 0);
  if (u.stats.shots >= 5 && goals === 0) mates -= 1;
  if (mates > 0 && hasTrait(p, 'leader')) mates *= 1.5;
  rel.teammates = mates;

  // media: extremes make headlines
  let media = r >= 8.5 ? 2 : r <= 4.5 ? -2 : 0;
  if (goals > 0 && hasTrait(p, 'showman')) media += 1;
  if (media > 0 && hasTrait(p, 'media_darling')) media *= 1.5;
  if (media < 0 && hasTrait(p, 'hothead')) media *= 1.3;
  rel.media = media;

  // money: contract bonuses
  const contract = p.contract;
  const bonus = teamId === p.clubId && contract ? contract.goalBonus * goals + contract.appearanceBonus : 0;
  if (bonus > 0) e.money = bonus;

  // physical cost of the match
  e.energy = -(6 + 14 * Math.min(1, minutes / 90));

  notes.push(...applyEffects(state, e));
  if (bonus > 0) notes.push(t('career.match.bonus', { v: formatMoney(bonus, getLang()) }));
  if (motm) notes.push(t('career.match.motm'));
  p.fitness = round1(clamp(p.fitness + 3, 0, 100));

  // personal match log
  const record: UserMatchRecord = {
    fixtureId,
    season: fixture?.season ?? state.season,
    week: fixture?.week ?? state.week,
    compName: comp?.name ?? '',
    opponent: fixture ? teamName(state, home ? fixture.awayId : fixture.homeId) : '',
    home,
    goalsFor: gf,
    goalsAgainst: ga,
    rating: round1(r),
    goals,
    assists,
    minutes,
    motm,
  };
  c.matches = c.matches.filter((m) => m.fixtureId !== fixtureId);
  c.matches.push(record);
  if (c.matches.length > MATCH_LOG_MAX) c.matches.splice(0, c.matches.length - MATCH_LOG_MAX);
  state.flags['career.benchStreak'] = 0;

  // injury roll
  const intensity = 0.4 + Math.min(1, minutes / 90) * 0.4 + importance * 0.2 + (u.stats.tackles >= 5 ? 0.1 : 0);
  const injury = rollInjury(state, rng, intensity);
  if (injury) notes.push(t('career.inj.happened', { injury: injuryName(injury.key), n: injury.weeksLeft }));

  p.value = userMarketValue(state);
  return notes;
}
