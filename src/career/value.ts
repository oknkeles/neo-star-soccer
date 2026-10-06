/**
 * Market value and wage models.
 * Anchors: overall 70 ≈ €4M, 80 ≈ €21M, 88 ≈ €82M (prime age, mid-length contract).
 */
import type { Footballer, GameState } from '../core/types';
import { age as ageOf, clamp } from '../core/util';
import { overall } from '../core/ratings';
import { niceMoney, userPlayer } from './helpers';

function byOverall(ovr: number): number {
  if (ovr <= 88) return 4_000_000 * Math.exp(0.168 * (ovr - 70));
  return 4_000_000 * Math.exp(0.168 * 18) * Math.exp(0.11 * (ovr - 88));
}

/** How much of the remaining potential the market "prices in" at a given age. */
function potentialWeight(a: number): number {
  if (a <= 18) return 0.3;
  if (a <= 20) return 0.26;
  if (a <= 22) return 0.18;
  if (a <= 24) return 0.1;
  if (a <= 25) return 0.05;
  return 0;
}

function ageFactor(a: number): number {
  if (a <= 23) return 1.15;
  if (a <= 27) return 1.1;
  const table: Record<number, number> = { 28: 1.0, 29: 0.85, 30: 0.7, 31: 0.55, 32: 0.42, 33: 0.3, 34: 0.2 };
  return table[a] ?? 0.12;
}

/** Value with an explicit fame (0..100); AI players use international caps as a fame proxy. */
export function valueWithFame(p: Footballer, season: number, fame: number | null): number {
  const a = ageOf(p, season);
  const ovr = overall(p);
  const effOvr = ovr + Math.max(0, p.potential - ovr) * potentialWeight(a);
  let v = byOverall(effOvr) * ageFactor(a);
  v *= 0.85 + clamp(p.form, 0, 100) / 333;
  const yearsLeft = p.contract ? p.contract.endSeason - season : -1;
  v *= yearsLeft < 0 ? 0.5 : yearsLeft === 0 ? 0.6 : yearsLeft === 1 ? 0.85 : 1;
  v *= fame === null ? 1 + Math.min(0.2, p.intlCaps / 250) : 1 + clamp(fame, 0, 100) / 200;
  if (p.injury) v *= p.injury.severity === 3 ? 0.75 : p.injury.severity === 2 ? 0.92 : 1;
  return Math.max(10_000, niceMoney(v));
}

export function marketValue(p: Footballer, season: number): number {
  return valueWithFame(p, season, null);
}

/** The user's value including fame. */
export function userMarketValue(state: GameState): number {
  return valueWithFame(userPlayer(state), state.season, state.career.fame);
}

export function fairWage(state: GameState, p: Footballer, clubId: string): number {
  const club = state.world.clubs[clubId];
  const rep = club?.reputation ?? 50;
  const a = ageOf(p, state.season);
  let w = 600 * Math.exp(0.145 * (overall(p) - 50));
  w *= 0.4 + (rep / 100) * 0.9;
  if (a <= 19) w *= 0.6;
  else if (a <= 21) w *= 0.8;
  else if (a >= 31) w *= 0.9;
  if (p.isUser || p.id === state.career.playerId) w *= 1 + state.career.fame / 150;
  if (club && club.wageBudget > 0) w = Math.min(w, club.wageBudget * 0.18);
  return Math.max(400, niceMoney(w));
}
