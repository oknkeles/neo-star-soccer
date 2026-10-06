/** Allocation-free copy of core `overallFor` for the hot paths (team selection and the match simulation). */
import type { AttrKey, Attributes, Position } from '../core/types';
import { POSITION_WEIGHTS } from '../core/ratings';

interface Table { keys: AttrKey[]; w: number[]; sum: number }

const TABLES = {} as Record<Position, Table>;
for (const pos of Object.keys(POSITION_WEIGHTS) as Position[]) {
  const entries = Object.entries(POSITION_WEIGHTS[pos]) as [AttrKey, number][];
  TABLES[pos] = { keys: entries.map(([k]) => k), w: entries.map(([, w]) => w), sum: entries.reduce((a, [, w]) => a + w, 0) || 1 };
}

export function fastOverall(attrs: Attributes, position: Position): number {
  const t = TABLES[position];
  let total = 0;
  for (let i = 0; i < t.keys.length; i++) total += attrs[t.keys[i]] * t.w[i];
  const v = Math.round(total / t.sum);
  return v < 1 ? 1 : v > 99 ? 99 : v;
}
