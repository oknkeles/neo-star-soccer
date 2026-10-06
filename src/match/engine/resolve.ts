/**
 * Statistical moment resolution ("Simulate" button, skip, headless careers). Probabilities
 * follow the engine's balancing targets but sit a little below skilled manual play, so
 * playing the moment yourself is rewarded.
 */
import type { AttrKey, MomentOutcome, MomentPlayerSpec, MomentResult, MomentSetup } from '../../core/types';
import type { Rng } from '../../core/rng';
import { clamp } from '../../core/util';
import { HL } from './constants';
import { drillXp, emptyStats, ratingDelta, xpFrom } from './outcome';

const avg = (xs: number[]) => xs.reduce((p, q) => p + q, 0) / (xs.length || 1);

const SCORER_W: Partial<Record<string, number>> = { ST: 5, W: 3, AM: 3, CM: 1.3, DM: 0.7, FB: 0.5, CB: 1 };

function pickId(rng: Rng, players: readonly MomentPlayerSpec[], weight: (p: MomentPlayerSpec) => number): string | null {
  const pool = players.filter((p) => weight(p) > 0);
  if (!pool.length) return null;
  return rng.weighted(pool, weight).id;
}

export function resolveStatistically(setup: MomentSetup, rng: Rng): MomentResult {
  const user = setup.us.players.find((p) => p.isUser || p.id === setup.userId) ?? setup.us.players.find((p) => p.role !== 'GK') ?? setup.us.players[0];
  const a = user?.attrs;
  const sk = (keys: AttrKey[]) => (a ? avg(keys.map((k) => clamp(a[k], 1, 99))) : 55) / 100;
  const diff = clamp(setup.difficulty, 0, 1) - 0.5;
  const stats = emptyStats();
  const extra = { curlKicks: 0, headers: 0, controls: 0, tackleAttempts: 0, sprintTime: 0, pressuredShots: 0, blocks: 0, carryTime: 0 };
  // assigned inside the closures below — keep the declared (wide) types
  let outcome = 'timeout' as MomentOutcome;
  let goalFor = false as boolean;
  let goalAgainst = false as boolean;
  let scorerId = null as string | null;
  let assistId = null as string | null;
  let followUp = null as MomentResult['followUp'];
  let xg = 0;
  let error = false;
  const uid = user?.id ?? null;
  const fin = sk(['shooting', 'composure', 'firstTouch']);

  const shoot = (pGoal: number, pOnTarget: number, shotXg: number) => {
    stats.shots += 1;
    xg = shotXg;
    const r = rng.next();
    if (r < pGoal) {
      stats.shotsOnTarget += 1; stats.goals += 1;
      goalFor = true; scorerId = uid; outcome = 'goal';
    } else if (r < pGoal + (1 - pGoal) * pOnTarget) {
      stats.shotsOnTarget += 1; outcome = 'saved';
    } else {
      outcome = rng.chance(0.1) ? 'woodwork' : rng.chance(0.3) ? 'blocked' : 'missed';
    }
  };
  const mateFinish = (pGoal: number) => {
    stats.passes += 1; stats.passesCompleted += 1; stats.keyPasses += 1;
    if (rng.chance(pGoal)) {
      goalFor = true; outcome = 'assist'; stats.assists += 1;
      scorerId = pickId(rng, setup.us.players, (p) => (p.id === uid || p.role === 'GK' ? 0 : SCORER_W[p.role] ?? 1));
      assistId = uid;
    } else outcome = 'chance_created';
  };

  switch (setup.type) {
    case 'penalty':
      extra.pressuredShots = 1;
      shoot(clamp(0.68 + (fin - 0.6) * 0.5 - diff * 0.12, 0.5, 0.86), 0.62, 0.76);
      break;
    case 'free_kick': {
      const fk = sk(['curl', 'shooting', 'composure']);
      const d = setup.spot ? Math.hypot(HL - setup.spot.x, setup.spot.y) : 24;
      extra.curlKicks = 1;
      shoot(clamp(0.06 + (fk - 0.55) * 0.4 - diff * 0.06 - Math.max(0, d - 24) * 0.006, 0.02, 0.3), 0.45, 0.07);
      break;
    }
    case 'one_on_one':
      if (rng.chance(clamp(0.12 + diff * 0.1 - (sk(['dribbling', 'pace']) - 0.6) * 0.15, 0.04, 0.3))) { outcome = 'lost_ball'; extra.carryTime = 2; break; }
      extra.sprintTime = 1.5;
      shoot(clamp(0.33 + (fin - 0.6) * 0.6 - diff * 0.14, 0.15, 0.6), 0.55, 0.36);
      break;
    case 'counter':
    case 'open_play': {
      const r = rng.next();
      const dr = sk(['dribbling', 'pace', 'firstTouch']);
      const pShot = (setup.type === 'counter' ? 0.52 : 0.42) + (dr - 0.55) * 0.3;
      extra.carryTime = 2;
      extra.sprintTime = setup.type === 'counter' ? 2 : 0.5;
      if (r < pShot) {
        if (rng.chance(0.4)) stats.dribbles += 1;
        shoot(clamp((setup.type === 'counter' ? 0.24 : 0.17) + (fin - 0.6) * 0.5 - diff * 0.1, 0.05, 0.45), 0.5, setup.type === 'counter' ? 0.24 : 0.16);
      } else if (r < 0.74) {
        mateFinish(clamp(0.18 + (sk(['passing', 'vision']) - 0.55) * 0.3, 0.06, 0.4));
      } else if (r < 0.82) {
        stats.foulsWon += 1;
        if (rng.chance(0.22)) { outcome = 'penalty_won'; followUp = { type: 'penalty', spot: { x: HL - 11, y: 0 } }; }
        else { outcome = 'foul_won'; followUp = { type: 'free_kick', spot: { x: HL - rng.float(19, 28), y: rng.float(-12, 12) } }; }
      } else {
        outcome = rng.chance(0.3) ? 'offside' : 'lost_ball';
      }
      break;
    }
    case 'cross_receive': {
      const air = sk(['heading', 'jumping', 'positioning']);
      extra.headers = 1;
      if (rng.chance(clamp(0.55 + (air - 0.55) * 0.6 - diff * 0.1, 0.3, 0.85))) {
        shoot(clamp(0.22 + (air - 0.55) * 0.4 - diff * 0.08, 0.07, 0.45), 0.5, 0.2);
      } else outcome = rng.chance(0.8) ? 'lost_ball' : 'offside';
      break;
    }
    case 'wing_cross':
    case 'corner': {
      const del = sk(['curl', 'passing', setup.type === 'corner' ? 'vision' : 'dribbling']);
      stats.passes += 1;
      extra.curlKicks = 1;
      if (rng.chance(clamp(0.5 + (del - 0.55) * 0.8 - diff * 0.1, 0.25, 0.85))) {
        stats.passes -= 1;
        mateFinish(setup.type === 'corner' ? 0.12 : 0.18);
      } else outcome = 'lost_ball';
      break;
    }
    case 'build_up': {
      const n = rng.int(2, 4);
      const pc = clamp(0.82 + (sk(['passing', 'firstTouch', 'composure']) - 0.55) * 0.4 - diff * 0.1, 0.6, 0.97);
      let ok = 0;
      for (let i = 0; i < n; i++) if (rng.chance(pc)) ok++;
      stats.passes += n; stats.passesCompleted += ok;
      extra.controls = ok;
      if (ok < n) outcome = 'lost_ball';
      else if (rng.chance(0.15)) { stats.passes -= 1; stats.passesCompleted -= 1; mateFinish(0.3); }
      else outcome = 'pass_completed';
      break;
    }
    case 'defend': {
      const df = sk(['tackling', 'positioning', 'pace', 'strength']);
      extra.tackleAttempts = 1;
      if (rng.chance(clamp(0.56 + (df - 0.55) * 0.8 - diff * 0.2, 0.3, 0.86))) {
        const r = rng.next();
        if (r < 0.5) { outcome = 'tackle_won'; stats.tackles += 1; }
        else if (r < 0.8) { outcome = 'interception'; stats.interceptions += 1; }
        else { outcome = 'cleared'; extra.blocks = 1; }
      } else {
        const r = rng.next();
        if (r < 0.18) {
          outcome = 'foul_conceded'; stats.foulsConceded += 1;
          followUp = rng.chance(0.2)
            ? { type: 'penalty', spot: { x: -HL + 11, y: 0 } }
            : { type: 'free_kick', spot: { x: -HL + rng.float(19, 30), y: rng.float(-15, 15) } };
        } else if (r < 0.56) {
          outcome = 'conceded'; goalAgainst = true; error = true;
          scorerId = pickId(rng, setup.them.players, (p) => (p.role === 'GK' ? 0 : SCORER_W[p.role] ?? 1));
        } else outcome = 'tackle_lost';
      }
      break;
    }
    default: {
      const keys: AttrKey[] = setup.type === 'drill_passing' ? ['passing', 'vision', 'firstTouch']
        : setup.type === 'drill_free_kick' ? ['curl', 'shooting', 'composure'] : ['shooting', 'composure', 'firstTouch'];
      const attempts = clamp(Math.round(setup.drill?.attempts ?? 5), 1, 20);
      const base = setup.type === 'drill_passing' ? 52 : setup.type === 'drill_free_kick' ? 22 : 34;
      const score = clamp(Math.round(base + (sk(keys) - 0.55) * 80 - diff * 15 + rng.normal(0, 7)), 3, 92);
      return {
        type: setup.type, outcome: 'drill_complete', goalFor: false, goalAgainst: false, scorerId: null, assistId: null,
        stats, ratingDelta: 0, xp: drillXp(setup.type, attempts, score), followUp: null, highlight: false, replay: [],
        skipped: true, drillScore: score,
      };
    }
  }

  const penaltyConceded = outcome === 'foul_conceded' && followUp?.type === 'penalty';
  return {
    type: setup.type, outcome, goalFor, goalAgainst, scorerId, assistId, stats,
    ratingDelta: ratingDelta(outcome, {
      type: setup.type, difficulty: setup.difficulty, importance: setup.importance, xg, error, dribbles: stats.dribbles, penaltyConceded,
    }),
    xp: xpFrom(stats, extra, setup.type),
    followUp,
    highlight: goalFor || goalAgainst || outcome === 'woodwork',
    replay: [],
    skipped: true,
  };
}
