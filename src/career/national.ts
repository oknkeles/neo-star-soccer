/**
 * National team call-ups: your overall against the quality of the national squad,
 * plus fame, form and a few traits. A call-up adds you to the national squad list.
 */
import type { GameState } from '../core/types';
import type { Rng } from '../core/rng';
import { age as ageOf, clamp } from '../core/util';
import { overall, positionGroup } from '../core/ratings';
import { hasTrait, nationalTeamOfNation, playersOf, userPlayer } from './helpers';

const KEEP_SQUAD_SIZE = 26;

/** How many players of a position group a national squad realistically carries. */
const GROUP_DEPTH = { GK: 3, DEF: 7, MID: 7, ATT: 6 } as const;

/** The overall you must roughly match to be in the conversation for a place. */
export function callupThreshold(state: GameState, ntId: string): number {
  const user = userPlayer(state);
  const nt = state.world.nationalTeams[ntId];
  if (!nt) return 70;
  const g = positionGroup(user.position);
  const pool = playersOf(state, nt.squad)
    .filter((p) => p.id !== user.id && !p.retired && positionGroup(p.position) === g)
    .map((p) => overall(p))
    .sort((a, b) => b - a);
  const depth = GROUP_DEPTH[g];
  if (pool.length >= 3) return pool[Math.min(depth, pool.length) - 1] ?? pool[pool.length - 1];
  return 40 + nt.reputation * 0.4; // thin squad data: fall back on the nation's standing
}

/** Probability (0..1) that the user is picked right now. */
export function callupChance(state: GameState): number {
  const c = state.career;
  const user = userPlayer(state);
  const nt = nationalTeamOfNation(state, user.nation);
  if (!nt || c.retired || user.retired) return 0;
  const a = ageOf(user, state.season);
  if (a < 17) return 0;
  const edge = overall(user) - callupThreshold(state, nt.id);
  let score = edge + (user.form - 50) / 12 + c.fame / 18;
  if (hasTrait(user, 'big_game')) score += 1;
  if (hasTrait(user, 'wonderkid') && a <= 21) score += 1.5;
  if (a <= 21 && user.potential >= 85) score += 1;
  if (c.relationships.media >= 70) score += 0.5;
  if (c.calledUp) score += 1.5; // managers like continuity
  if (!user.clubId) score -= 2;
  if (user.injury && user.injury.weeksLeft > 2) return 0;
  return clamp(0.5 + score * 0.11, 0.02, 0.97);
}

export function nationalCallup(state: GameState, rng: Rng): boolean {
  const c = state.career;
  const user = userPlayer(state);
  const nt = nationalTeamOfNation(state, user.nation);
  if (!nt) {
    c.calledUp = false;
    return false;
  }
  const called = rng.chance(callupChance(state));
  c.calledUp = called;
  if (called) {
    c.nationalTeamId = nt.id;
    if (!nt.squad.includes(user.id)) {
      nt.squad.push(user.id);
      trimSquad(state, nt.id, user.id);
    }
  } else {
    nt.squad = nt.squad.filter((id) => id !== user.id);
  }
  return called;
}

/** Keep the national squad from growing when the user joins: the weakest same-line player makes way. */
function trimSquad(state: GameState, ntId: string, userId: string): void {
  const nt = state.world.nationalTeams[ntId];
  if (!nt || nt.squad.length <= KEEP_SQUAD_SIZE) return;
  const g = positionGroup(userPlayer(state).position);
  const weakest = playersOf(state, nt.squad)
    .filter((p) => p.id !== userId && positionGroup(p.position) === g)
    .sort((a, b) => overall(a) - overall(b))[0];
  if (weakest) nt.squad = nt.squad.filter((id) => id !== weakest.id);
}
