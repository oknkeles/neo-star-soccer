/**
 * Knockout rounds: fixture creation, draws, progression from groups and from round to round.
 * Each round is drawn only when the previous one has finished, so the bracket is always real.
 */
import type { Competition, Fixture, GameState } from '../core/types';
import type { Rng } from '../core/rng';
import { compFormat, fixtureLoser, fixtureWinner, koStageKey, type CompFormat } from './formats';
import { ct, derivedRng, pad2 } from './helpers';
import { sortedTable } from './tables';
import type { Pair } from './schedule';

export function koFixtures(state: GameState, comp: Competition, format: CompFormat, k: number, pairs: Pair[], minWeek = 0): Fixture[] {
  const stage = koStageKey(format, k);
  const planned = format.koWeeks[k - 1] ?? 51;
  const week = Math.min(51, Math.max(planned, minWeek));
  const isFinal = k === format.koWeeks.length;
  return pairs.map(([homeId, awayId], i) => {
    const f: Fixture = {
      id: `${comp.id}-${stage}-${pad2(i + 1)}`,
      compId: comp.id,
      season: comp.season,
      week,
      slot: format.koSlot,
      round: format.groupRounds + k,
      roundName: ct(state, `r.${stage}`),
      homeId,
      awayId,
      played: false,
    };
    if (format.neutralAll || (isFinal && format.neutralFinal)) f.neutral = true;
    return f;
  });
}

/** Cup ties: the lower-tier club hosts (romance of the cup), otherwise the first drawn. */
export function cupPair(state: GameState, a: string, b: string): Pair {
  const ta = state.world.clubs[a]?.tier ?? 1;
  const tb = state.world.clubs[b]?.tier ?? 1;
  return tb > ta ? [b, a] : [a, b];
}

/** Random cup draw of an even list of teams. */
export function drawCupRound(state: GameState, teams: string[], rng: Rng): Pair[] {
  const order = rng.shuffle(teams.slice());
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < order.length; i += 2) pairs.push(cupPair(state, order[i], order[i + 1]));
  return pairs;
}

const countryOf = (state: GameState, id: string) => state.world.clubs[id]?.country ?? state.world.nationalTeams[id]?.nation ?? id;

/**
 * First knockout round after a group stage. Tournaments use a fixed bracket (A1–B2, C1–D2 …);
 * the Champions Cup draws group winners against runners-up of another group (and country if possible).
 */
export function pairsFromGroups(state: GameState, comp: Competition, rng: Rng): Pair[] {
  const groups = Object.keys(comp.tables).sort();
  const winners: string[] = [];
  const runners: string[] = [];
  for (const g of groups) {
    const t = sortedTable(comp, g);
    if (t[0]) winners.push(t[0].teamId);
    if (t[1]) runners.push(t[1].teamId);
  }
  const G = Math.min(winners.length, runners.length);
  if (G === 1) return [[winners[0], runners[0]]];
  if (comp.kind !== 'continental') {
    const first: Pair[] = [];
    const second: Pair[] = [];
    for (let i = 0; i + 1 < G; i += 2) {
      first.push([winners[i], runners[i + 1]]);
      second.push([winners[i + 1], runners[i]]);
    }
    return [...first, ...second];
  }
  const groupOf = new Map<string, number>();
  winners.forEach((id, i) => groupOf.set(id, i));
  runners.forEach((id, i) => groupOf.set(id, i));
  const valid = (order: string[], strictCountry: boolean) =>
    order.every((r, i) => groupOf.get(r) !== groupOf.get(winners[i]) && (!strictCountry || countryOf(state, r) !== countryOf(state, winners[i])));
  let order = runners.slice(0, G);
  let found = false;
  for (const strict of [true, false]) {
    for (let attempt = 0; attempt < 300 && !found; attempt++) {
      rng.shuffle(order);
      if (valid(order, strict)) found = true;
    }
    if (found) break;
  }
  if (!found) order = runners.slice(1, G).concat(runners[0]);
  return winners.slice(0, G).map((w, i) => [w, order[i]] as Pair);
}

/** Called after every applied result: closes group stages and draws the next knockout round. */
export function advanceKnockout(state: GameState, comp: Competition, onFinished?: (comp: Competition) => void): void {
  const format = compFormat(comp);
  if (!format || comp.stage === 'done') return;
  const rng = derivedRng(state, comp.id, comp.fixtures.length);
  const minWeek = state.week + 1;

  if (format.groupRounds > 0 && comp.stage === 'group') {
    const groupFx = comp.fixtures.filter((f) => f.round <= format.groupRounds);
    if (!groupFx.every((f) => f.played)) return;
    const pairs = pairsFromGroups(state, comp, rng);
    comp.fixtures.push(...koFixtures(state, comp, format, 1, pairs, minWeek));
    comp.stage = koStageKey(format, 1);
    return;
  }

  let maxRound = 0;
  for (const f of comp.fixtures) if (f.round > maxRound) maxRound = f.round;
  const k = maxRound - format.groupRounds;
  if (k < 1) return;
  const roundFx = comp.fixtures.filter((f) => f.round === maxRound);
  if (!roundFx.every((f) => f.played)) return;

  if (k >= format.koWeeks.length || roundFx.length === 1) {
    comp.winnerId = fixtureWinner(roundFx[0]) ?? roundFx[0].homeId;
    comp.stage = 'done';
    onFinished?.(comp);
    return;
  }
  const winners = roundFx.map((f) => fixtureWinner(f) ?? f.homeId);
  let pairs: Pair[];
  if (comp.kind === 'cup') {
    pairs = drawCupRound(state, winners, rng);
  } else {
    pairs = [];
    for (let i = 0; i + 1 < winners.length; i += 2) {
      pairs.push(rng.chance(0.5) ? [winners[i], winners[i + 1]] : [winners[i + 1], winners[i]]);
    }
  }
  comp.fixtures.push(...koFixtures(state, comp, format, k + 1, pairs, minWeek));
  comp.stage = koStageKey(format, k + 1);
}

/** Team ids eliminated in each knockout stage (for awards/team success). */
export function knockoutReach(comp: Competition): Record<string, number> {
  // 0 = out in groups / first round … higher = went further; winner gets the max + 1
  const format = compFormat(comp);
  const reach: Record<string, number> = {};
  if (!format) return reach;
  for (const id of comp.teamIds) reach[id] = 0;
  for (const f of comp.fixtures) {
    if (f.round <= format.groupRounds || !f.played) continue;
    const k = f.round - format.groupRounds;
    const w = fixtureWinner(f);
    const l = fixtureLoser(f);
    if (l) reach[l] = Math.max(reach[l] ?? 0, k);
    if (w) reach[w] = Math.max(reach[w] ?? 0, k + (k === format.koWeeks.length ? 1 : 0));
  }
  return reach;
}
