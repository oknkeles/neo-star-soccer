/**
 * Fixture scheduling: circle-method round robins and spreading matchdays over the calendar.
 */
import { CC_GROUP_WEEKS, CUP_WEEKS, INTL_BREAK_WEEKS, LAST_CLUB_WEEK, CC_KO_WEEKS } from './calendar';

export type Pair = [home: string, away: string];
const BYE = '__bye__';

/**
 * Single round robin (circle method). Home/away alternates for almost every team between
 * consecutive rounds; with an odd team count one team rests each round.
 */
export function singleRoundRobin(teams: readonly string[]): Pair[][] {
  const list = teams.slice();
  if (list.length % 2 === 1) list.push(BYE);
  const n = list.length;
  if (n < 2) return [];
  const fixed = list[n - 1];
  let rot = list.slice(0, n - 1);
  const rounds: Pair[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: Pair[] = [];
    const a = rot[0];
    pairs.push(r % 2 === 0 ? [a, fixed] : [fixed, a]);
    for (let i = 1; i < n / 2; i++) {
      const up = rot[i];
      const down = rot[n - 1 - i];
      pairs.push(i % 2 === 1 ? [up, down] : [down, up]);
    }
    rounds.push(pairs.filter(([h, w]) => h !== BYE && w !== BYE));
    rot = [rot[n - 2], ...rot.slice(0, n - 2)];
  }
  return rounds;
}

/** Double round robin: the second half mirrors the first with venues swapped. */
export function doubleRoundRobin(teams: readonly string[]): Pair[][] {
  const first = singleRoundRobin(teams);
  const second = first.map((round) => round.map(([h, a]) => [a, h] as Pair));
  return [...first, ...second];
}

/** Pick `count` items spread evenly over `items` (keeps first and last). */
export function spreadPick<T>(items: readonly T[], count: number): T[] {
  if (count <= 0) return [];
  if (count >= items.length) return items.slice();
  if (count === 1) return [items[items.length - 1]];
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(items[Math.round((i * (items.length - 1)) / (count - 1))]);
  return out;
}

export interface Slot { week: number; slot: 'weekend' | 'midweek' }

/** Countries with a traditional winter pause (weeks skipped first when a league has spare weekends). */
const WINTER_BREAK: Record<string, number[]> = { GER: [21, 22, 20], NED: [21, 22], TUR: [22, 21] };

/**
 * League matchday slots between weeks 1..44: weekends outside international breaks;
 * spare weekends are dropped (winter break first), and midweeks free of cup/Champions Cup
 * football are used only if a league needs more than the available weekends.
 */
export function leagueSlots(matchdays: number, country: string): Slot[] {
  const weekends: number[] = [];
  for (let w = 1; w <= LAST_CLUB_WEEK; w++) if (!INTL_BREAK_WEEKS.includes(w)) weekends.push(w);
  if (matchdays <= weekends.length) {
    let pool = weekends.slice();
    let spare = pool.length - matchdays;
    for (const w of WINTER_BREAK[country] ?? []) {
      if (spare <= 0) break;
      if (pool.includes(w)) { pool = pool.filter((x) => x !== w); spare--; }
    }
    return spreadPick(pool, matchdays).map((week) => ({ week, slot: 'weekend' as const }));
  }
  const busy = new Set<number>([...INTL_BREAK_WEEKS, ...CUP_WEEKS, ...CC_GROUP_WEEKS, ...CC_KO_WEEKS]);
  const midweeks: number[] = [];
  for (let w = 2; w <= LAST_CLUB_WEEK - 1; w++) if (!busy.has(w)) midweeks.push(w);
  const extra = spreadPick(midweeks, matchdays - weekends.length);
  const slots: Slot[] = [
    ...weekends.map((week) => ({ week, slot: 'weekend' as const })),
    ...extra.map((week) => ({ week, slot: 'midweek' as const })),
  ];
  return slots.sort((a, b) => a.week - b.week || (a.slot === 'midweek' ? -1 : 1)).slice(0, matchdays);
}
