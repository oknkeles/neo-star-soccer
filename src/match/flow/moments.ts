import type {
  AttrKey, Footballer, GameState, Kit, MomentOutcome, MomentPlayerSpec, MomentResult, MomentSetup, MomentStats,
  MomentTeamSpec, MomentType, Position, Vec2, Weather,
} from '../../core/types';
import { Rng } from '../../core/rng';
import { avg, clamp } from '../../core/util';
import { getSettings } from '../../core/settings';
import { t } from '../../core/i18n';
import { autoResolve } from '../engine/api';
import { assignSlots, isAttackingRole } from './formation';
import './strings';

export const MATCH_MOMENT_TYPES = [
  'open_play', 'counter', 'one_on_one', 'cross_receive', 'wing_cross', 'build_up', 'defend', 'free_kick', 'penalty', 'corner',
] as const;
export type MatchMomentType = (typeof MATCH_MOMENT_TYPES)[number];
export type DrillType = Extract<MomentType, `drill_${string}`>;
export const DRILL_TYPES: DrillType[] = ['drill_free_kick', 'drill_finishing', 'drill_passing'];

/** Moment mix by the user's position (docs/ARCHITECTURE.md §4). Set pieces are added when the user is the taker. */
export const MOMENT_MIX: Record<Position, Partial<Record<MatchMomentType, number>>> = {
  ST: { one_on_one: 3, cross_receive: 3, open_play: 3, counter: 2 },
  W: { wing_cross: 3, open_play: 3, counter: 2, cross_receive: 1.5, one_on_one: 1 },
  AM: { open_play: 3, build_up: 2, counter: 2, one_on_one: 1, cross_receive: 0.5 },
  CM: { open_play: 2.5, build_up: 3, counter: 1.5, defend: 2 },
  DM: { build_up: 3, defend: 3, open_play: 1.5, counter: 0.5 },
  FB: { wing_cross: 3, defend: 3, build_up: 2, counter: 0.5 },
  CB: { defend: 4, build_up: 2, cross_receive: 1 },
  GK: { defend: 1 },
};

/** Seconds of simulated play before a moment auto-ends. */
export const TIME_LIMIT: Record<MomentType, number> = {
  open_play: 16, counter: 14, one_on_one: 10, cross_receive: 10, wing_cross: 14, build_up: 18, defend: 14,
  free_kick: 10, penalty: 8, corner: 12, drill_free_kick: 20, drill_finishing: 20, drill_passing: 20,
};

/** Rough expected goals FOR the user's team from one moment (before user skill), used to balance the background sim. */
export const MOMENT_XG: Record<MatchMomentType, number> = {
  one_on_one: 0.38, counter: 0.28, cross_receive: 0.24, open_play: 0.2, wing_cross: 0.16, build_up: 0.08,
  free_kick: 0.1, corner: 0.07, penalty: 0.76, defend: 0,
};
/** Rough probability that a defend moment ends in a goal against. */
export const DEFEND_CONCEDE = 0.16;

/** xG assigned to a user shot by moment type (team stats). */
export const SHOT_XG: Partial<Record<MomentType, number>> = {
  penalty: 0.76, one_on_one: 0.36, counter: 0.24, cross_receive: 0.2, free_kick: 0.07, corner: 0.12,
};

export const isSetPiece = (type: MomentType) => type === 'free_kick' || type === 'penalty' || type === 'corner';

export interface TypeContext {
  position: Position;
  setPieces: { freeKicks: boolean; penalties: boolean; corners: boolean };
  setPieceMoments: number;
  diff: number;           // our goals − their goals
  minute: number;
  momentumUs: number;     // 0..1 momentum toward the user's team
  lastTypes: MomentType[];
}

export function momentWeights(c: TypeContext): Partial<Record<MatchMomentType, number>> {
  const mix: Partial<Record<MatchMomentType, number>> = { ...MOMENT_MIX[c.position] };
  if (c.setPieces.freeKicks && c.setPieceMoments < 2) mix.free_kick = c.position === 'ST' ? 0.9 : 1.2;
  if (c.setPieces.corners && c.setPieceMoments < 2) {
    mix.corner = ['W', 'AM', 'CM', 'FB'].includes(c.position) ? 1.2 : 0.5;
  }
  const late = c.minute >= 70;
  const out: Partial<Record<MatchMomentType, number>> = {};
  for (const [k, base] of Object.entries(mix) as [MatchMomentType, number][]) {
    let w = base;
    if (k === 'defend') {
      if (c.diff < 0 && late) w *= 0.4;
      if (c.diff > 0 && late) w *= 1.6;
      if (c.momentumUs < 0.4) w *= 1.5;
      if (c.momentumUs > 0.6) w *= 0.7;
    } else if (!isSetPiece(k)) {
      if (c.diff < 0 && late) w *= 1.3;
      if (c.momentumUs > 0.6) w *= 1.2;
    }
    if (k === 'counter' && (c.momentumUs < 0.4 || (c.diff > 0 && late))) w *= 1.4;
    const n = c.lastTypes.length;
    if (n && c.lastTypes[n - 1] === k) w *= 0.5;
    if (n > 1 && c.lastTypes[n - 2] === k) w *= 0.8;
    out[k] = w;
  }
  return out;
}

export function chooseMomentType(rng: Rng, c: TypeContext): MatchMomentType {
  const w = momentWeights(c);
  const keys = Object.keys(w) as MatchMomentType[];
  if (!keys.length) return 'open_play';
  return rng.weighted(keys, (k) => w[k] ?? 0);
}

/** Expected share of 'defend' moments for a position (no set pieces). */
export function defendShare(pos: Position): number {
  const mix = MOMENT_MIX[pos];
  const total = Object.values(mix).reduce((a, b) => a + (b ?? 0), 0);
  return total ? (mix.defend ?? 0) / total : 0;
}

/** Average team xG per moment for a position (no set pieces). */
export function avgMomentXg(pos: Position): number {
  const mix = MOMENT_MIX[pos];
  let total = 0;
  let xg = 0;
  for (const [k, w] of Object.entries(mix) as [MatchMomentType, number][]) {
    total += w;
    xg += w * MOMENT_XG[k];
  }
  return total ? xg / total : 0.15;
}

/** Ball spot for a set piece in the us-attack-+x frame. */
export function setPieceSpot(type: MomentType, rng: Rng): Vec2 | undefined {
  if (type === 'penalty') return { x: 52.5 - 11, y: 0 };
  if (type === 'corner') return { x: 52.5, y: rng.chance(0.5) ? 34 : -34 };
  if (type === 'free_kick' || type === 'drill_free_kick') {
    const y = rng.float(-14, 14);
    const d = rng.float(Math.abs(y) < 20 ? 19 : 17, 29);
    return { x: 52.5 - d, y: Math.round(y * 10) / 10 };
  }
  return undefined;
}

// ───────── player / team specs ─────────

const DEFAULT_APPEARANCE = { skin: 2, hairStyle: 1, hairColor: '#2b1d14', beard: 0, boots: '#ffffff', height: 180 };

export function syntheticAttrs(q: number, role: Position) {
  const v = clamp(Math.round(q), 20, 95);
  return {
    shooting: v, curl: v, passing: v, dribbling: v, firstTouch: v, heading: v, tackling: v,
    pace: v, acceleration: v, stamina: v, strength: v, jumping: v, vision: v, composure: v, positioning: v,
    goalkeeping: role === 'GK' ? v : 12,
  };
}

export function displayName(p: Pick<Footballer, 'lastName' | 'nickname'> | undefined, fallback = '?'): string {
  if (!p) return fallback;
  return p.nickname || p.lastName || fallback;
}

export interface SpecInput { id: string; role: Position; isUser: boolean; fitness: number; number?: number; name?: string }

export function toPlayerSpec(state: GameState, inp: SpecInput, side: 'us' | 'them', fallbackQuality: number): MomentPlayerSpec {
  const p = state.world.players[inp.id];
  return {
    id: inp.id,
    name: inp.name ?? displayName(p, t(inp.role === 'GK' ? 'match.drill.keeper' : 'match.drill.defender')),
    number: inp.number ?? p?.shirtNumber ?? 0,
    side,
    role: inp.role,
    isUser: inp.isUser,
    attrs: p ? { ...p.attrs } : syntheticAttrs(fallbackQuality, inp.role),
    foot: p?.foot ?? 'R',
    weakFoot: p?.weakFoot ?? 2,
    fitness: Math.round(clamp(inp.fitness, 0, 100)),
    appearance: p ? { ...p.appearance } : { ...DEFAULT_APPEARANCE },
  };
}

function hexRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Rough perceptual distance between two css hex colours (0..~440). Unknown formats → far apart. */
export function colourDistance(a: string, b: string): number {
  const x = hexRgb(a);
  const y = hexRgb(b);
  if (!x || !y) return 999;
  const rm = (x[0] + y[0]) / 2;
  const dr = x[0] - y[0];
  const dg = x[1] - y[1];
  const db = x[2] - y[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/** Make sure 'them' is readable against 'us' in 3D: use the alternative kit, or a neutral contrast kit. */
export function resolveKitClash(us: Kit, them: Kit, alternative?: Kit): Kit {
  if (colourDistance(us.primary, them.primary) > 120) return them;
  if (alternative && colourDistance(us.primary, alternative.primary) > 120) return alternative;
  const light = (hexRgb(us.primary) ?? [0, 0, 0]).reduce((a, b) => a + b, 0) > 380;
  return light ? { primary: '#1b1f2a', secondary: '#e8e8e8', style: 'plain' } : { primary: '#f2f2f2', secondary: '#1b1f2a', style: 'plain' };
}

export function buildTeamSpec(
  state: GameState,
  base: { name: string; shortName: string; kit: Kit; formation: MomentTeamSpec['formation']; style: MomentTeamSpec['style'] },
  ids: string[],
  side: 'us' | 'them',
  userId: string | null,
  fitnessOf: (id: string) => number,
  numberOf: (id: string) => number | undefined,
  quality: number,
): MomentTeamSpec {
  const posOf = (id: string): Position => state.world.players[id]?.position ?? 'CM';
  const slots = assignSlots(ids, base.formation, posOf, side === 'us' ? userId : null);
  return {
    ...base,
    players: slots.map((s) => toPlayerSpec(state, {
      id: s.id, role: s.role, isUser: s.id === userId, fitness: fitnessOf(s.id), number: numberOf(s.id),
    }, side, quality)),
  };
}

/** Moment difficulty 0..1 from settings + relative opponent strength + stakes. */
export function difficultyFor(usOverall: number, themOverall: number, importance: number): number {
  const base = { easy: 0.3, normal: 0.5, hard: 0.72 }[getSettings().difficulty] ?? 0.5;
  return Math.round(clamp(base + (themOverall - usOverall) * 0.012 + importance * 0.05, 0.08, 0.95) * 100) / 100;
}

// ───────── resolution ─────────

export const emptyMomentStats = (): MomentStats => ({
  shots: 0, shotsOnTarget: 0, passes: 0, passesCompleted: 0, keyPasses: 0, dribbles: 0, tackles: 0,
  interceptions: 0, foulsWon: 0, foulsConceded: 0, goals: 0, assists: 0,
});

const DELTA: Record<MomentOutcome, number> = {
  goal: 1.1, assist: 0.7, chance_created: 0.3, saved: 0.1, missed: -0.15, woodwork: 0.1, blocked: -0.05,
  lost_ball: -0.3, offside: -0.1, foul_won: 0.2, penalty_won: 0.5, tackle_won: 0.35, interception: 0.3,
  tackle_lost: -0.3, foul_conceded: -0.25, pass_completed: 0.15, cleared: 0.2, conceded: -0.8, timeout: 0,
  drill_complete: 0,
};

function pickId(rng: Rng, players: MomentPlayerSpec[], weight: (p: MomentPlayerSpec) => number): string | null {
  const pool = players.filter((p) => weight(p) > 0);
  if (!pool.length) return null;
  return rng.weighted(pool, weight).id;
}

const scorerWeight = (p: MomentPlayerSpec) =>
  p.isUser || p.role === 'GK' ? 0 : ({ ST: 5, W: 3, AM: 3, CM: 1.3, DM: 0.7, FB: 0.5, CB: 1 } as Record<string, number>)[p.role] ?? 1;

/**
 * Statistical resolution used when the engine's autoResolve is unavailable. Mirrors the
 * balancing targets in docs/ARCHITECTURE.md §4 (slightly worse than skilled manual play).
 */
export function fallbackResolve(setup: MomentSetup, rng: Rng): MomentResult {
  const user = setup.us.players.find((p) => p.isUser) ?? setup.us.players[0];
  const a = user?.attrs ?? syntheticAttrs(55, 'CM');
  const sk = (keys: AttrKey[]) => avg(keys.map((k) => a[k])) / 100;
  const d = setup.difficulty - 0.5;
  const stats = emptyMomentStats();
  const xp: Partial<Record<AttrKey, number>> = {};
  const addXp = (k: AttrKey, v: number) => { xp[k] = (xp[k] ?? 0) + v; };
  // assigned inside closures below — keep the declared (wide) types
  let outcome = 'timeout' as MomentOutcome;
  let goalFor = false as boolean;
  let goalAgainst = false as boolean;
  let scorerId = null as string | null;
  let assistId = null as string | null;
  let followUp = null as MomentResult['followUp'];
  const fin = sk(['shooting', 'composure', 'firstTouch']);

  const shoot = (pGoal: number, pOnTarget: number) => {
    stats.shots += 1;
    addXp('shooting', 2); addXp('composure', 1);
    const r = rng.next();
    if (r < pGoal) {
      stats.shotsOnTarget += 1; stats.goals += 1;
      goalFor = true; scorerId = user?.id ?? null; outcome = 'goal';
    } else if (r < pGoal + (1 - pGoal) * pOnTarget) {
      stats.shotsOnTarget += 1; outcome = 'saved';
    } else {
      outcome = rng.chance(0.12) ? 'woodwork' : rng.chance(0.3) ? 'blocked' : 'missed';
    }
  };
  const teammateFinish = (pGoal: number) => {
    stats.passes += 1; stats.passesCompleted += 1; stats.keyPasses += 1;
    addXp('passing', 2); addXp('vision', 1);
    if (rng.chance(pGoal)) {
      goalFor = true; outcome = 'assist'; stats.assists += 1;
      scorerId = pickId(rng, setup.us.players, scorerWeight); assistId = user?.id ?? null;
    } else outcome = 'chance_created';
  };

  switch (setup.type) {
    case 'penalty':
      shoot(clamp(0.62 + (fin - 0.6) * 0.6 - d * 0.15, 0.45, 0.88), 0.6);
      break;
    case 'free_kick': {
      const fk = sk(['curl', 'shooting']);
      shoot(clamp(0.08 + (fk - 0.55) * 0.35 - d * 0.06, 0.03, 0.28), 0.45);
      addXp('curl', 2);
      break;
    }
    case 'one_on_one':
      if (rng.chance(0.12 + d * 0.1)) { outcome = 'lost_ball'; addXp('dribbling', 1); break; }
      shoot(clamp(0.34 + (fin - 0.6) * 0.6 - d * 0.15, 0.15, 0.6), 0.55);
      break;
    case 'counter':
    case 'open_play': {
      const r = rng.next();
      const dr = sk(['dribbling', 'pace', 'firstTouch']);
      const pShot = setup.type === 'counter' ? 0.55 : 0.45;
      if (r < pShot + (dr - 0.55) * 0.3) {
        stats.dribbles += 1; addXp('dribbling', 1);
        shoot(clamp((setup.type === 'counter' ? 0.25 : 0.18) + (fin - 0.6) * 0.5 - d * 0.1, 0.06, 0.45), 0.5);
      } else if (r < 0.75) {
        teammateFinish(0.2 + (sk(['passing', 'vision']) - 0.55) * 0.3);
      } else if (r < 0.82) {
        stats.foulsWon += 1; outcome = rng.chance(0.25) ? 'penalty_won' : 'foul_won';
        followUp = outcome === 'penalty_won'
          ? { type: 'penalty', spot: { x: 41.5, y: 0 } }
          : { type: 'free_kick', spot: { x: 52.5 - rng.float(19, 27), y: rng.float(-12, 12) } };
      } else outcome = rng.chance(0.3) ? 'offside' : 'lost_ball';
      break;
    }
    case 'cross_receive': {
      const air = sk(['heading', 'jumping', 'positioning']);
      if (rng.chance(clamp(0.55 + (air - 0.55) * 0.6 - d * 0.1, 0.3, 0.85))) {
        addXp('heading', 2);
        shoot(clamp(0.24 + (air - 0.55) * 0.4 - d * 0.08, 0.08, 0.45), 0.5);
      } else outcome = rng.chance(0.75) ? 'lost_ball' : 'offside';
      break;
    }
    case 'wing_cross':
    case 'corner': {
      const del = sk(['curl', 'passing', setup.type === 'corner' ? 'vision' : 'dribbling']);
      stats.passes += 1;
      addXp('curl', 1); addXp('passing', 1);
      if (rng.chance(clamp(0.5 + (del - 0.55) * 0.8 - d * 0.1, 0.25, 0.85))) {
        stats.passes -= 1;
        teammateFinish(setup.type === 'corner' ? 0.13 : 0.2);
      } else outcome = 'lost_ball';
      break;
    }
    case 'build_up': {
      const n = rng.int(2, 5);
      const pc = clamp(0.82 + (sk(['passing', 'firstTouch', 'composure']) - 0.55) * 0.4 - d * 0.1, 0.6, 0.97);
      let ok = 0;
      for (let i = 0; i < n; i++) if (rng.chance(pc)) ok++;
      stats.passes += n; stats.passesCompleted += ok;
      addXp('passing', 2); addXp('vision', 1);
      if (ok < n) outcome = 'lost_ball';
      else if (rng.chance(0.18)) { stats.passes -= 1; stats.passesCompleted -= 1; teammateFinish(0.3); }
      else outcome = 'pass_completed';
      break;
    }
    case 'defend': {
      const df = sk(['tackling', 'positioning', 'pace', 'strength']);
      addXp('tackling', 2); addXp('positioning', 1);
      if (rng.chance(clamp(0.58 + (df - 0.55) * 0.8 - d * 0.2, 0.3, 0.88))) {
        const r = rng.next();
        if (r < 0.5) { outcome = 'tackle_won'; stats.tackles += 1; } else if (r < 0.8) { outcome = 'interception'; stats.interceptions += 1; } else outcome = 'cleared';
      } else {
        const r = rng.next();
        if (r < 0.2) {
          outcome = 'foul_conceded'; stats.foulsConceded += 1;
          followUp = rng.chance(0.2)
            ? { type: 'penalty', spot: { x: -41.5, y: 0 } }
            : { type: 'free_kick', spot: { x: -52.5 + rng.float(19, 30), y: rng.float(-15, 15) } };
        } else if (r < 0.2 + DEFEND_CONCEDE / 0.42) {
          outcome = 'conceded'; goalAgainst = true;
          scorerId = pickId(rng, setup.them.players, (p) => (p.role === 'GK' ? 0 : ({ ST: 5, W: 3, AM: 3 } as Record<string, number>)[p.role] ?? 1));
        } else outcome = 'tackle_lost';
      }
      break;
    }
    default: {
      // drills
      const keys: AttrKey[] = setup.type === 'drill_passing' ? ['passing', 'vision', 'firstTouch'] : setup.type === 'drill_free_kick' ? ['curl', 'shooting'] : ['shooting', 'composure'];
      const score = clamp(Math.round(35 + (sk(keys) - 0.5) * 90 - d * 20 + rng.normal(0, 9)), 5, 95);
      keys.forEach((k) => addXp(k, 1));
      return {
        type: setup.type, outcome: 'drill_complete', goalFor: false, goalAgainst: false, scorerId: null, assistId: null,
        stats, ratingDelta: 0, xp, followUp: null, highlight: false, replay: [], skipped: true, drillScore: score,
      };
    }
  }

  const imp = 1 + setup.importance * 0.2;
  let delta = DELTA[outcome];
  if (setup.type === 'penalty') delta = goalFor ? 0.7 : -0.6;
  if (delta > 0) delta *= imp;
  return {
    type: setup.type, outcome, goalFor, goalAgainst, scorerId, assistId, stats,
    ratingDelta: Math.round(clamp(delta, -1.5, 2) * 100) / 100,
    xp, followUp, highlight: goalFor || outcome === 'woodwork' || (outcome === 'saved' && setup.type === 'one_on_one'),
    replay: [], skipped: true,
  };
}

/** engine.autoResolve with the local statistical fallback (never throws). */
export function safeAutoResolve(setup: MomentSetup, rng: Rng): MomentResult {
  try {
    const r = autoResolve(setup, rng);
    if (r && typeof r.outcome === 'string') return r;
  } catch {
    /* engine not available — fall through */
  }
  return fallbackResolve(setup, rng);
}

// ───────── drills ─────────

const BIBS: Kit = { primary: '#ff7a1a', secondary: '#1b1f2a', style: 'plain' };
const DRILL_ATTEMPTS: Record<DrillType, number> = { drill_free_kick: 6, drill_finishing: 8, drill_passing: 6 };

/**
 * Training drill against teammates in bibs. Uses the user's own club squad when possible,
 * otherwise synthetic training partners around the user's level.
 */
export function buildDrillSetup(state: GameState, type: DrillType, seed: number): MomentSetup {
  const rng = new Rng(seed);
  const user = state.world.players[state.career.playerId];
  const club = user?.clubId ? state.world.clubs[user.clubId] : undefined;
  const quality = user ? avg(Object.values(user.attrs).filter((v) => v > 20)) : 55;
  const mates = (club?.squad ?? [])
    .map((id) => state.world.players[id])
    .filter((p): p is Footballer => !!p && !p.isUser && p.id !== user?.id && !p.injury);
  const used = new Set<string>();
  const take = (roles: Position[]): Footballer | undefined => {
    for (const r of roles) {
      const found = mates.find((p) => p.position === r && !used.has(p.id));
      if (found) { used.add(found.id); return found; }
    }
    return undefined;
  };
  const synth = (role: Position, idx: number, side: 'us' | 'them'): MomentPlayerSpec => ({
    id: `drill-${side}-${idx}`, name: t(role === 'GK' ? 'match.drill.keeper' : side === 'us' ? 'match.drill.mate' : 'match.drill.defender'),
    number: side === 'us' ? 20 + idx : 30 + idx, side, role, isUser: false,
    attrs: syntheticAttrs(quality + rng.int(-4, 4), role), foot: 'R', weakFoot: 2, fitness: 95,
    appearance: { ...DEFAULT_APPEARANCE, skin: rng.int(0, 5), hairStyle: rng.int(0, 7) },
  });
  const spec = (roles: Position[], idx: number, side: 'us' | 'them'): MomentPlayerSpec => {
    const p = take(roles);
    const role = roles[0];
    return p ? toPlayerSpec(state, { id: p.id, role, isUser: false, fitness: 95 }, side, quality) : synth(role, idx, side);
  };

  const usRoles: Position[][] = type === 'drill_passing'
    ? [['CM', 'DM'], ['W', 'AM'], ['ST'], ['FB', 'CB']]
    : type === 'drill_finishing' ? [['CM', 'AM', 'W']] : [];
  const themRoles: Position[][] = type === 'drill_free_kick'
    ? [['GK'], ['CB'], ['CB'], ['DM', 'CM'], ['FB', 'CM']]
    : type === 'drill_finishing' ? [['GK'], ['CB']] : [['GK'], ['DM', 'CM'], ['CB'], ['FB', 'CB']];

  const userSpec: MomentPlayerSpec | null = user
    ? toPlayerSpec(state, { id: user.id, role: user.position, isUser: true, fitness: clamp(state.career.energy, 40, 100) }, 'us', quality)
    : null;
  const usPlayers = [...(userSpec ? [userSpec] : []), ...usRoles.map((r, i) => spec(r, i, 'us'))];
  const themPlayers = themRoles.map((r, i) => spec(r, i, 'them'));
  const kit = club?.kit ?? { primary: '#b8ff3c', secondary: '#060d09', style: 'plain' as const };
  const attempts = DRILL_ATTEMPTS[type];
  const weather: Weather = { kind: 'clear', time: 'day', wind: { x: rng.float(-1.5, 1.5), y: rng.float(-1.5, 1.5) }, temperature: rng.int(12, 24) };
  const diff = { easy: 0.3, normal: 0.45, hard: 0.65 }[getSettings().difficulty] ?? 0.45;

  return {
    type,
    seed,
    minute: 0,
    us: { name: club?.name ?? t('match.drill.team.us'), shortName: club?.shortName ?? 'NSS', kit, formation: club?.formation ?? '4-3-3', style: club?.style ?? 'balanced', players: usPlayers },
    them: { name: t('match.drill.team.them'), shortName: 'BIB', kit: resolveKitClash(kit, BIBS), formation: '4-4-2', style: 'pressing', players: themPlayers },
    userId: user?.id ?? usPlayers[0]?.id ?? 'USER',
    weather,
    difficulty: diff,
    teammateTrust: 85,
    score: { us: 0, them: 0 },
    importance: 0,
    timeLimit: TIME_LIMIT[type] * attempts,
    spot: type === 'drill_free_kick' ? setPieceSpot('free_kick', rng) : type === 'drill_finishing' ? { x: 52.5 - 24, y: 0 } : undefined,
    drill: { attempts },
  };
}

export { isAttackingRole };
