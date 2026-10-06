/**
 * Yearly evolution of AI footballers: growth toward potential (faster with minutes),
 * peak years, decline after 30 (physical first), retirements and market values.
 */
import type { AttrKey, Footballer, GameState } from '../core/types';
import type { Rng } from '../core/rng';
import { ATTR_GROUPS, ATTR_KEYS, POSITION_WEIGHTS, overall } from '../core/ratings';
import { age, clamp } from '../core/util';
import * as career from '../career/api';

const PHYSICAL = new Set<AttrKey>(ATTR_GROUPS.physical);
const MENTAL = new Set<AttrKey>(ATTR_GROUPS.mental);

/** Expected overall change for a season at a given age (before noise). */
function expectedChange(p: Footballer, a: number, ovr: number, minutesShare: number): number {
  const room = Math.max(0, p.potential - ovr);
  const late = p.traits.includes('late_bloomer');
  const prodigy = p.traits.includes('wonderkid');
  const play = 0.55 + 0.75 * clamp(minutesShare, 0, 1);
  if (a <= 23 || (late && a <= 26)) {
    const rate = late && a > 23 ? 0.2 : a <= 18 ? 0.27 : a <= 19 ? 0.26 : a <= 20 ? 0.24 : a <= 21 ? 0.21 : a <= 22 ? 0.17 : 0.13;
    return Math.min(9, room * rate * play * (prodigy ? 1.2 : 1));
  }
  if (a <= 28) return Math.min(3, room * 0.12 * play);
  if (a <= 30) return late ? 0.3 : -0.4;
  return -((a - 30) * 0.75 + 0.6);
}

/** Shift attributes so the overall moves by roughly `delta` (physical attributes go first when ageing). */
export function shiftAttributes(p: Footballer, delta: number, rng: Rng): void {
  const weights = POSITION_WEIGHTS[p.position];
  const decline = delta < 0;
  for (const k of ATTR_KEYS) {
    if (k === 'goalkeeping' && p.position !== 'GK') continue;
    let mult = weights[k] ? 1 : 0.45;
    if (decline) {
      if (PHYSICAL.has(k)) mult *= k === 'strength' ? 0.7 : 1.6;
      else if (MENTAL.has(k)) mult *= -0.25; // experience still counts
      else mult *= 0.7;
    } else if (p.position === 'GK' && (k === 'shooting' || k === 'dribbling')) {
      mult *= 0.2;
    }
    const change = delta * mult + rng.normal(0, Math.abs(delta) > 0.5 ? 0.6 : 0.3);
    p.attrs[k] = clamp(Math.round(p.attrs[k] + change), 1, 99);
  }
}

/** One season of development for an AI footballer. */
export function developPlayer(p: Footballer, rng: Rng, season: number, minutesShare: number): void {
  const a = age(p, season);
  const before = overall(p);
  let delta = expectedChange(p, a, before, minutesShare) + rng.normal(0, a <= 23 ? 1.1 : 0.8);
  if (delta > 0) delta = Math.min(delta, Math.max(0, p.potential - before) + 0.5);
  if (a >= 31) delta = Math.min(delta, 0);
  if (Math.abs(delta) < 0.25) return;
  shiftAttributes(p, delta, rng);
  // a player can surprise once in a while, nudging the ceiling
  if (a <= 22 && rng.chance(0.04)) p.potential = clamp(p.potential + rng.int(2, 5), 40, 99);
  if (a >= 24 && p.potential > overall(p) + 2) p.potential = clamp(Math.round(p.potential - rng.float(0.5, 2.5)), overall(p), 99);
}

/** Probability that an AI footballer hangs up his boots this summer. */
export function retirementChance(p: Footballer, season: number, freeAgent: boolean): number {
  const a = age(p, season);
  const ovr = overall(p);
  let chance = a >= 40 ? 1 : a >= 39 ? 0.8 : a >= 38 ? 0.65 : a >= 37 ? 0.5 : a >= 36 ? 0.36 : a >= 35 ? 0.22 : 0;
  if (a >= 33 && ovr < 58) chance += 0.15;
  if (freeAgent) chance += a >= 31 ? 0.35 : a >= 25 && ovr < 50 ? 0.5 : 0;
  return clamp(chance, 0, 1);
}

/** Market value: the career model when available, otherwise a compatible local estimate. */
export function valueOf(p: Footballer, season: number): number {
  try {
    const v = career.marketValue(p, season);
    if (Number.isFinite(v) && v > 0) return v;
  } catch {
    /* career module unavailable → local model */
  }
  const a = age(p, season);
  const ovr = overall(p);
  const ageF = a <= 23 ? 1.15 : a <= 27 ? 1.1 : a <= 28 ? 1 : a <= 30 ? 0.78 : a <= 32 ? 0.5 : 0.22;
  const potF = a <= 22 ? 1 + Math.max(0, p.potential - ovr) * 0.035 : 1;
  const yearsLeft = p.contract ? p.contract.endSeason - season : -1;
  const contractF = yearsLeft < 0 ? 0.5 : yearsLeft === 0 ? 0.6 : yearsLeft === 1 ? 0.85 : 1;
  const v = 4_000_000 * Math.exp(0.168 * (ovr - 70)) * ageF * potF * contractF;
  const step = v >= 10_000_000 ? 500_000 : v >= 1_000_000 ? 50_000 : 5_000;
  return Math.max(10_000, Math.round(v / step) * step);
}

/** Weekly wage an AI club pays a footballer. */
export function wageFor(state: GameState, p: Footballer, clubId: string): number {
  try {
    const w = career.fairWage(state, p, clubId);
    if (Number.isFinite(w) && w > 0) return Math.round(w);
  } catch {
    /* fall back */
  }
  const rep = state.world.clubs[clubId]?.reputation ?? 50;
  const w = 600 * Math.exp(0.145 * (overall(p) - 50)) * (0.4 + (rep / 100) * 0.9);
  return Math.max(300, Math.round(w / 50) * 50);
}
