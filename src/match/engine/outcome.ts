/**
 * Outcome classification (why did the moment end, what does it mean for the user),
 * banners, and the MomentResult: user stats, rating delta, xp, follow-ups, replay.
 */
import type { AttrKey, MomentOutcome, MomentResult, MomentStats, MomentType } from '../../core/types';
import { clamp } from '../../core/util';
import { t } from '../../core/i18n';
import { GH, HL } from './constants';
import type { Engine } from './engine';
import { inBox } from './geom';
import type { UserLog } from './internal';
import { resolveStatistically } from './resolve';

export type EndReason =
  | 'goal_for' | 'goal_against' | 'out' | 'time' | 'possession' | 'keeper' | 'stale' | 'progress'
  | 'offside' | 'foul_us' | 'foul_them';

const shotResult = (r: string | undefined, onTarget: boolean): MomentOutcome => {
  switch (r) {
    case 'goal': return 'goal';
    case 'saved': return 'saved';
    case 'woodwork': return 'woodwork';
    case 'blocked': return 'blocked';
    case 'missed': return 'missed';
    default: return onTarget ? 'saved' : 'missed';
  }
};

/** Did the user set up a team-mate's shot (key pass)? */
function userKeyPass(e: Engine): boolean {
  const u = e.user;
  return e.kicks.some((k) => k.isShot && k.side === 'us' && k.by !== u.i && k.assistBy === u.i);
}

/** The user's own shot is the last shot of the move. */
function userShotIsLatest(e: Engine): boolean {
  const L = e.log;
  if (!L.lastShot) return false;
  for (let i = e.kicks.length - 1; i >= 0; i--) {
    const k = e.kicks[i];
    if (k.isShot && k.side === 'us') return k === L.lastShot;
  }
  return false;
}

export function classify(e: Engine, reason: EndReason): MomentOutcome {
  const L = e.log;
  const u = e.user;
  if (e.drill) return 'drill_complete';
  if (e.attackSide === 'them') {
    switch (reason) {
      case 'goal_for':
        if (e.scorerId === u.id) return 'goal';
        if (e.assistId === u.id) return 'assist';
        return L.wonBy === 'tackle' ? 'tackle_won' : L.wonBy === 'interception' ? 'interception' : 'cleared';
      case 'goal_against':
        return 'conceded';
      case 'foul_us':
        if (L.wonBy) return L.wonBy === 'tackle' ? 'tackle_won' : 'interception';
        return L.foulsWon > 0 ? 'foul_won' : 'timeout';
      case 'foul_them':
      case 'offside':
        return L.wonBy ? (L.wonBy === 'tackle' ? 'tackle_won' : 'interception') : 'timeout';
      default:
        if (L.wonBy) return L.wonBy === 'tackle' ? 'tackle_won' : 'interception';
        if (L.cleared || L.blocks > 0) return 'cleared';
        if (reason === 'out' && e.state.ball.lastTouchId === u.id) return 'cleared';
        if (reason === 'time' && (L.tackleLost || L.beaten)) return 'tackle_lost';
        return 'timeout';
    }
  }
  switch (reason) {
    case 'goal_for':
      if (e.scorerId === u.id) return 'goal';
      if (e.assistId === u.id) return 'assist';
      if (userKeyPass(e) || L.passesCompleted > 0 || L.lastTouchT >= 0) return 'chance_created';
      return 'timeout';
    case 'goal_against':
      return 'conceded';
    case 'offside':
    case 'foul_them':
      if (L.lastShot && userShotIsLatest(e)) return shotResult(L.lastShot.result, L.lastShot.onTarget);
      return 'timeout';
    case 'foul_us':
      return 'foul_won';
    default: {
      if (L.lastShot && userShotIsLatest(e)) return shotResult(L.lastShot.result, L.lastShot.onTarget);
      if (userKeyPass(e)) return 'chance_created';
      if (L.lostBall || (L.lostT >= 0 && L.lostT >= L.lastTouchT - 0.01)) return 'lost_ball';
      if (reason === 'progress') return 'pass_completed';
      if (L.passesCompleted > 0) return 'pass_completed';
      // the user still has the ball when the clock runs out
      return 'timeout';
    }
  }
}

export function bannerFor(e: Engine, outcome: MomentOutcome): string {
  const k = e.log.lastShot;
  switch (outcome) {
    case 'goal': return t('engine.banner.goal');
    case 'assist': return t('engine.banner.goal');
    case 'chance_created': return t('engine.banner.chance');
    case 'saved': return t('engine.banner.save');
    case 'woodwork': return t('engine.banner.post');
    case 'missed': return t(e.state.ball.pos.z > GH || (k && k.kind !== 'header' && e.state.ball.pos.z > 2) ? 'engine.banner.over' : 'engine.banner.wide');
    case 'blocked': return t('engine.banner.blocked');
    case 'offside': return t('engine.banner.offside');
    case 'foul_won':
    case 'foul_conceded': return t('engine.banner.foul');
    case 'penalty_won': return t('engine.banner.penalty');
    case 'tackle_won': return t('engine.banner.tackle');
    case 'interception': return t('engine.banner.interception');
    case 'cleared': return t('engine.banner.cleared');
    case 'lost_ball': return t('engine.banner.lost');
    case 'tackle_lost': return t('engine.banner.beaten');
    case 'pass_completed': return t('engine.banner.passOk');
    case 'conceded': return t('engine.banner.goalAgainst');
    case 'drill_complete': return t('engine.banner.drillDone');
    default: return t('engine.banner.time');
  }
}

// ───────────────────────── rating & xp ─────────────────────────

export interface DeltaCtx {
  type: MomentType;
  difficulty: number;
  importance: number;
  /** xG of the user's decisive shot (0 if none). */
  xg: number;
  /** The user's own error led to the goal against. */
  error: boolean;
  dribbles: number;
  penaltyConceded?: boolean;
}

/** Rating contribution of one moment (−1.5 .. +2.0). */
export function ratingDelta(o: MomentOutcome, c: DeltaCtx): number {
  const d = clamp(c.difficulty, 0, 1);
  const imp = 1 + 0.15 * clamp(c.importance, 0, 1);
  const pen = c.type === 'penalty';
  let v: number;
  switch (o) {
    case 'goal': v = pen ? 0.8 + 0.3 * d : 1.2 + 0.6 * d + 0.6 * clamp(0.25 - c.xg, 0, 0.25); break;
    case 'assist': v = 0.8 + 0.1 * d; break;
    case 'chance_created': v = 0.3; break;
    case 'saved': v = pen ? -0.6 : 0.1; break;
    case 'missed': v = pen ? -0.7 : -(0.1 + 0.4 * clamp(c.xg, 0, 0.5)); break;
    case 'woodwork': v = pen ? -0.5 : 0.05; break;
    case 'blocked': v = -0.1; break;
    case 'lost_ball': v = -0.3; break;
    case 'offside': v = -0.15; break;
    case 'foul_won': v = 0.2; break;
    case 'penalty_won': v = 0.5; break;
    case 'tackle_won': v = 0.4; break;
    case 'interception': v = 0.35; break;
    case 'tackle_lost': v = -0.3; break;
    case 'foul_conceded': v = c.penaltyConceded ? -0.8 : -0.3; break;
    case 'pass_completed': v = 0.15; break;
    case 'cleared': v = 0.2; break;
    case 'conceded': v = c.error ? -0.8 : -0.25; break;
    case 'drill_complete': return 0;
    default: v = 0;
  }
  if (v > 0) v *= imp;
  v += Math.min(0.15, 0.05 * Math.max(0, c.dribbles));
  return Math.round(clamp(v, -1.5, 2) * 100) / 100;
}

export const emptyStats = (): MomentStats => ({
  shots: 0, shotsOnTarget: 0, passes: 0, passesCompleted: 0, keyPasses: 0, dribbles: 0, tackles: 0, interceptions: 0,
  foulsWon: 0, foulsConceded: 0, goals: 0, assists: 0,
});

/** Experience per attribute the user actually used. */
export function xpFrom(st: MomentStats, extra: Partial<Pick<UserLog, 'curlKicks' | 'headers' | 'controls' | 'tackleAttempts' | 'sprintTime' | 'pressuredShots' | 'blocks' | 'carryTime'>>, type: MomentType): Partial<Record<AttrKey, number>> {
  const xp: Partial<Record<AttrKey, number>> = {};
  const add = (k: AttrKey, v: number) => { if (v > 0) xp[k] = Math.min(6, Math.round(((xp[k] ?? 0) + v) * 10) / 10); };
  add('shooting', st.shots * 1.5 + st.goals * 2);
  add('curl', (extra.curlKicks ?? 0) * 1.5);
  add('passing', st.passes + st.passesCompleted * 0.5);
  add('vision', st.keyPasses * 2 + st.assists * 2);
  add('dribbling', st.dribbles * 2 + (extra.carryTime ?? 0) * 0.15);
  add('firstTouch', (extra.controls ?? 0) * 1);
  add('heading', (extra.headers ?? 0) * 2);
  add('jumping', (extra.headers ?? 0) * 0.8);
  add('tackling', (extra.tackleAttempts ?? 0) + st.tackles * 1.5);
  add('positioning', st.interceptions * 2 + st.goals + (type === 'defend' ? 1 : 0));
  add('strength', (st.tackles + (extra.blocks ?? 0)) * 0.6);
  const sprint = extra.sprintTime ?? 0;
  add('pace', sprint * 0.2);
  add('acceleration', sprint * 0.12);
  add('stamina', sprint * 0.15);
  add('composure', (extra.pressuredShots ?? 0) * 1.5 + (type === 'penalty' ? 2 : 0));
  return xp;
}

/** xp for a drill: the drill's attributes, scaled by attempts and score. */
export function drillXp(type: MomentType, attempts: number, score: number): Partial<Record<AttrKey, number>> {
  const keys: AttrKey[] = type === 'drill_free_kick' ? ['curl', 'shooting', 'composure'] : type === 'drill_finishing' ? ['shooting', 'composure', 'positioning'] : ['passing', 'vision', 'firstTouch'];
  const base = clamp(attempts * 0.45, 1, 5) * (0.6 + 0.6 * clamp(score, 0, 100) / 100);
  const xp: Partial<Record<AttrKey, number>> = {};
  keys.forEach((k, i) => { xp[k] = Math.round(base * (i === 0 ? 1 : 0.6) * 10) / 10; });
  return xp;
}

// ───────────────────────── result ─────────────────────────

function statsFrom(e: Engine): MomentStats {
  const L = e.log;
  const u = e.user;
  const keyPasses = Math.max(L.keyPasses, e.kicks.filter((k) => k.isShot && k.side === 'us' && k.by !== u.i && k.assistBy === u.i).length);
  return {
    shots: L.shots, shotsOnTarget: L.shotsOnTarget, passes: L.passes, passesCompleted: Math.min(L.passes, L.passesCompleted),
    keyPasses, dribbles: L.dribbles, tackles: L.tackles, interceptions: L.interceptions, foulsWon: L.foulsWon,
    foulsConceded: L.foulsConceded, goals: L.goals, assists: L.assists,
  };
}

export function buildResult(e: Engine, skipped = false): MomentResult {
  const s = e.state;
  const setup = e.setup;
  if (e.drill) return drillResult(e, skipped);
  if (skipped && !s.outcome) return skipResult(e);
  const outcome: MomentOutcome = s.outcome ?? classify(e, 'time');
  const L = e.log;
  const stats = statsFrom(e);
  const shotXg = L.lastShot ? L.lastShot.xg : 0;
  const penaltyConceded = outcome === 'foul_conceded' && inBox({ x: s.ball.pos.x, y: s.ball.pos.y }, -1);
  let followUp = e.followUp;
  if (!followUp && outcome === 'foul_conceded') {
    const b = s.ball.pos;
    if (penaltyConceded) followUp = { type: 'penalty', spot: { x: -HL + 11, y: 0 } };
    else if (b.x < -12) followUp = { type: 'free_kick', spot: { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10 } };
  }
  const ratingCtx: DeltaCtx = {
    type: setup.type, difficulty: setup.difficulty, importance: setup.importance, xg: shotXg,
    error: L.error || L.lostBall || L.tackleLost || L.beaten, dribbles: stats.dribbles, penaltyConceded,
  };
  const highlight = e.highlight || e.goalFor || outcome === 'woodwork' || (outcome === 'saved' && shotXg > 0.25);
  return {
    type: setup.type,
    outcome,
    goalFor: e.goalFor,
    goalAgainst: e.goalAgainst,
    scorerId: e.scorerId,
    assistId: e.assistId,
    stats,
    ratingDelta: ratingDelta(outcome, ratingCtx),
    xp: xpFrom(stats, L, setup.type),
    followUp,
    highlight,
    replay: highlight ? e.replayFrames() : [],
    skipped: skipped || e.skipped,
  };
}

/** Skip pressed mid-moment: resolve the rest statistically, keeping what already happened. */
function skipResult(e: Engine): MomentResult {
  const base = resolveStatistically(e.setup, e.rng);
  const live = statsFrom(e);
  const stats = emptyStats();
  for (const k of Object.keys(stats) as (keyof MomentStats)[]) stats[k] = base.stats[k] + live[k];
  stats.passesCompleted = Math.min(stats.passes, stats.passesCompleted);
  return { ...base, stats, skipped: true, replay: [] };
}

function drillResult(e: Engine, skipped: boolean): MomentResult {
  const d = e.drill!;
  let score = d.score;
  if (skipped && d.best.length < d.attempts) {
    // remaining attempts estimated from the statistical drill model
    const est = resolveStatistically(e.setup, e.rng).drillScore ?? 40;
    const remaining = d.attempts - d.best.length;
    score = Math.round((d.best.reduce((p, q) => p + q, 0) + est * remaining) / d.attempts);
  }
  const stats = statsFrom(e);
  return {
    type: e.setup.type,
    outcome: 'drill_complete',
    goalFor: false,
    goalAgainst: false,
    scorerId: null,
    assistId: null,
    stats,
    ratingDelta: 0,
    xp: drillXp(e.setup.type, d.attempts, score),
    followUp: null,
    highlight: false,
    replay: [],
    skipped: skipped || e.skipped,
    drillScore: clamp(score, 0, 100),
  };
}
