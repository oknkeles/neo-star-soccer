/** Public team-sheet builder (api.buildTeamSheet): the best XI with a light, deterministic rotation. */
import type { GameState, TeamSheet, UserMatchRole } from '../core/types';
import { buildSheetWith } from './teams';

/**
 * Pick XI + bench for a team (best available by formation, skipping injured; small rotation).
 * `userRole` forces the user into the XI ('starter'), the bench ('bench') or out ('none').
 */
export function buildTeamSheet(state: GameState, teamId: string, userRole?: UserMatchRole): TeamSheet {
  return buildSheetWith(state, teamId, userRole, { rotation: 0.6, noiseKey: `${state.season}-${state.week}` });
}
