/**
 * MATCH FLOW — macro level of a user match (NSS-style): the 90 minutes are simulated
 * minute by minute on team strengths; at certain minutes a real-time MOMENT involving the
 * user is generated (frequency by position, role, form, teammate trust; set pieces if the
 * user is the designated taker). Moment results feed back into the score, the user's
 * stats and the live match rating. Bench players may come on (~55–80'), starters may be
 * subbed off when tired / poor. Knockouts: extra time + penalty shootout (user takes a
 * penalty moment if on the pitch). Owner: match-flow agent (also owns the match & drill screens).
 *
 * Implementation lives in ./live.ts (LiveMatch), ./moments.ts (moment mix, setups,
 * fallback resolution, drills), ./ratings.ts and ./commentary.ts.
 */
import type { GameState, MomentSetup, MomentType } from '../../core/types';
import { buildDrillSetup } from './moments';

export { LiveMatch } from './live';
export type { TickResult, MomentKind, Period, Side, TeamLiveStats } from './live';
export {
  DRILL_TYPES, MOMENT_MIX, TIME_LIMIT, fallbackResolve, safeAutoResolve, momentWeights, chooseMomentType,
  colourDistance, resolveKitClash,
} from './moments';
export type { DrillType, MatchMomentType } from './moments';
export { FORMATION_SLOTS, assignSlots } from './formation';
export type { Slot, AssignedSlot } from './formation';
export { fallbackCommentary } from './commentary';
export type { CommentaryFn, CommentaryData } from './commentary';

/** Setup for a training drill (free kicks, finishing, passing) using the engine. */
export function drillSetup(state: GameState, type: Extract<MomentType, `drill_${string}`>, seed: number): MomentSetup {
  return buildDrillSetup(state, type, seed);
}
