import type { Position } from '../../core/types';
import type { Rng } from '../../core/rng';
import { clamp, round1 } from '../../core/util';

export type Result = 'W' | 'D' | 'L';

export interface RatingInput {
  pos: Position;
  minutes: number;
  goals: number;
  assists: number;
  saves: number;
  yellow: number;
  red: boolean;
  ownGoals: number;
  missedPens: number;
  chancesMissed: number;
  teamGoals: number;
  oppGoals: number;
  result: Result;
  /** Player overall minus team average overall. */
  qualityEdge: number;
}

const isDef = (p: Position) => p === 'CB' || p === 'FB';

/** Plausible rating for an AI player from what happened to him in the match. */
export function aiRating(r: RatingInput, rng: Rng): number {
  let v = 6.35 + rng.normal(0, 0.42) + clamp(r.qualityEdge, -15, 15) * 0.02;
  v += r.result === 'W' ? 0.35 : r.result === 'L' ? -0.35 : 0;
  for (let i = 0; i < r.goals; i++) v += i === 0 ? 0.95 : 0.7;
  v += r.assists * 0.6;
  v -= r.ownGoals * 0.9 + r.missedPens * 0.7 + r.chancesMissed * 0.15;
  v -= r.yellow * 0.15 + (r.red ? 1.3 : 0);
  if (r.pos === 'GK') {
    v += r.saves * 0.18;
    if (r.oppGoals === 0 && r.minutes >= 60) v += 0.6;
    v -= Math.max(0, r.oppGoals - 1) * 0.3;
  } else if (isDef(r.pos) || r.pos === 'DM') {
    if (r.oppGoals === 0 && r.minutes >= 60) v += isDef(r.pos) ? 0.45 : 0.25;
    if (r.oppGoals >= 3) v -= 0.35;
  }
  // short cameos stay close to neutral
  if (r.minutes < 25) v = 6.4 + (v - 6.4) * 0.5;
  return round1(clamp(v, 3, 10));
}

/**
 * Final user rating: the live rating (6.0 + moment deltas) plus a small presence bonus,
 * team result and clean-sheet modifiers. Clamped to 3.0–10.0.
 */
export function finalUserRating(live: number, r: { pos: Position; minutes: number; result: Result; oppGoals: number; red: boolean }): number {
  const share = clamp(r.minutes / 90, 0, 1);
  let v = live + share * 0.2;
  v += (r.result === 'W' ? 0.3 : r.result === 'L' ? -0.3 : 0) * share;
  if (r.minutes >= 60 && r.oppGoals === 0) v += isDef(r.pos) || r.pos === 'GK' ? 0.4 : r.pos === 'DM' || r.pos === 'CM' ? 0.15 : 0;
  if ((isDef(r.pos) || r.pos === 'DM') && r.oppGoals >= 3) v -= 0.3;
  if (r.red) v -= 0.8;
  return round1(clamp(v, 3, 10));
}
