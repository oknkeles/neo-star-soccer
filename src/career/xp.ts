/**
 * Experience → attribute points. 100 effective xp = +1 attribute point.
 * Effective xp = raw xp × age curve × distance-to-potential × trait affinity.
 * The overall rating can never exceed the hidden potential.
 */
import type { AttrKey, Footballer, GameState } from '../core/types';
import { age as ageOf, clamp } from '../core/util';
import { overallFor } from '../core/ratings';
import type { ProgressNote } from './model';
import { hasTrait, round2, userPlayer } from './helpers';
import { traitAttrMult } from './traits';

/** Growth speed by age (16–21 fast, 22–26 normal, 27–30 slow, 31+ minimal) with trait twists. */
export function ageGrowthMultiplier(age: number, p: Pick<Footballer, 'traits'>): number {
  let m: number;
  if (age <= 21) m = 1.5;
  else if (age <= 26) m = 1.0;
  else if (age <= 30) m = 0.55;
  else m = 0.25;
  if (hasTrait(p, 'wonderkid') && age <= 21) m *= 1.25;
  if (hasTrait(p, 'late_bloomer')) {
    if (age <= 21) m *= 0.8;
    else if (age >= 23 && age <= 29) m *= 1.45;
  }
  return m;
}

/** Growth slows as the overall approaches the hidden potential. */
export function potentialGapMultiplier(overallNow: number, potential: number): number {
  return clamp(0.25 + (potential - overallNow) / 16, 0.12, 1.3);
}

/** Individual attribute ceiling derived from potential. */
export function attrCap(p: Pick<Footballer, 'potential'>): number {
  return Math.min(99, p.potential + 10);
}

function canRaise(p: Footballer, attr: AttrKey): boolean {
  if (p.attrs[attr] >= attrCap(p)) return false;
  const before = overallFor(p.attrs, p.position);
  p.attrs[attr] += 1;
  const after = overallFor(p.attrs, p.position);
  p.attrs[attr] -= 1;
  return after <= Math.max(p.potential, before);
}

/** Effective multiplier that `applyXp` would use right now for an attribute (for UI previews). */
export function xpMultiplier(state: GameState, attr: AttrKey): number {
  const p = userPlayer(state);
  return ageGrowthMultiplier(ageOf(p, state.season), p) * potentialGapMultiplier(overallFor(p.attrs, p.position), p.potential) * traitAttrMult(p, attr);
}

export function applyXp(state: GameState, xp: Partial<Record<AttrKey, number>>): ProgressNote[] {
  const p = userPlayer(state);
  const store = state.career.xp;
  const ageMult = ageGrowthMultiplier(ageOf(p, state.season), p);
  const gained: Partial<Record<AttrKey, number>> = {};

  for (const key of Object.keys(xp) as AttrKey[]) {
    const raw = xp[key];
    if (raw === undefined || !Number.isFinite(raw) || raw === 0) continue;
    if (key === 'goalkeeping' || !(key in p.attrs)) continue; // outfield career
    let pool = store[key] ?? 0;
    if (raw < 0) {
      store[key] = round2(Math.max(0, pool + raw));
      continue;
    }
    const mult = ageMult * potentialGapMultiplier(overallFor(p.attrs, p.position), p.potential) * traitAttrMult(p, key);
    pool += raw * mult;
    while (pool >= 100) {
      if (!canRaise(p, key)) { pool = 99.9; break; }
      p.attrs[key] += 1;
      pool -= 100;
      gained[key] = (gained[key] ?? 0) + 1;
    }
    store[key] = round2(pool);
  }
  return (Object.keys(gained) as AttrKey[]).map((attr) => ({ attr, delta: gained[attr] ?? 0 }));
}

/** Merge progress notes (summing deltas per attribute). */
export function mergeNotes(...lists: ProgressNote[][]): ProgressNote[] {
  const m = new Map<AttrKey, number>();
  for (const l of lists) for (const n of l) m.set(n.attr, (m.get(n.attr) ?? 0) + n.delta);
  return [...m.entries()].filter(([, d]) => d !== 0).map(([attr, delta]) => ({ attr, delta }));
}
