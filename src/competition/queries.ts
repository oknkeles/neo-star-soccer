/**
 * Read-only lookups over the season's competitions: fixtures by week / id, the user's
 * league and position, top scorers and season completion.
 */
import type { Competition, Fixture, GameState } from '../core/types';
import { compFormat } from './formats';
import { compsOfSeason, userClubId, userNationalTeamId } from './helpers';
import { sortedTable } from './tables';

/** Play order inside a week: midweek before weekend, then competition, then id. */
export function fixtureOrder(a: Fixture, b: Fixture): number {
  if (a.week !== b.week) return a.week - b.week;
  if (a.slot !== b.slot) return a.slot === 'midweek' ? -1 : 1;
  return a.compId.localeCompare(b.compId) || a.id.localeCompare(b.id);
}

export function findComp(state: GameState, compId: string): Competition | undefined {
  return state.competitions[compId];
}

export function findFixture(state: GameState, fixtureId: string): Fixture | null {
  // fixture ids are prefixed with their competition id
  for (const c of Object.values(state.competitions)) {
    if (!fixtureId.startsWith(`${c.id}-`)) continue;
    const f = c.fixtures.find((x) => x.id === fixtureId);
    if (f) return f;
  }
  for (const c of Object.values(state.competitions)) {
    const f = c.fixtures.find((x) => x.id === fixtureId);
    if (f) return f;
  }
  return null;
}

/** All unplayed fixtures of the current season scheduled in `week`. */
export function fixturesForWeek(state: GameState, week: number): Fixture[] {
  const out: Fixture[] = [];
  for (const c of Object.values(state.competitions)) {
    if (c.season !== state.season) continue;
    for (const f of c.fixtures) if (f.week === week && !f.played) out.push(f);
  }
  return out.sort(fixtureOrder);
}

/** This week's fixtures (played or not) of the user's club and, if called up, national team. */
export function userFixturesForWeek(state: GameState): Fixture[] {
  const club = userClubId(state);
  const nt = userNationalTeamId(state);
  if (!club && !nt) return [];
  const out: Fixture[] = [];
  for (const c of Object.values(state.competitions)) {
    if (c.season !== state.season) continue;
    if (!(club && c.teamIds.includes(club)) && !(nt && c.teamIds.includes(nt))) continue;
    for (const f of c.fixtures) {
      if (f.week !== state.week) continue;
      if (f.homeId === club || f.awayId === club || (nt && (f.homeId === nt || f.awayId === nt))) out.push(f);
    }
  }
  return out.sort(fixtureOrder);
}

/** League competition (current season) a club plays in. */
export function leagueOf(state: GameState, clubId: string): Competition | null {
  for (const c of compsOfSeason(state)) if (c.kind === 'league' && c.teamIds.includes(clubId)) return c;
  return null;
}

export function userLeague(state: GameState): Competition | null {
  const club = userClubId(state);
  return club ? leagueOf(state, club) : null;
}

export function leaguePosition(state: GameState, clubId: string): number | null {
  const lg = leagueOf(state, clubId);
  if (!lg) return null;
  const idx = sortedTable(lg).findIndex((r) => r.teamId === clubId);
  return idx >= 0 ? idx + 1 : null;
}

export function topScorers(state: GameState, compId: string, n: number): { playerId: string; goals: number; assists: number; teamId: string }[] {
  const comp = state.competitions[compId];
  if (!comp?.playerStats) return [];
  return Object.entries(comp.playerStats)
    .filter(([, s]) => s.goals > 0)
    .map(([playerId, s]) => ({ playerId, goals: s.goals, assists: s.assists, teamId: s.teamId, apps: s.apps }))
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.apps - b.apps || a.playerId.localeCompare(b.playerId))
    .slice(0, Math.max(0, n))
    .map(({ playerId, goals, assists, teamId }) => ({ playerId, goals, assists, teamId }));
}

/** A competition is finished when every fixture is played and any knockout has a winner. */
export function isCompFinished(comp: Competition): boolean {
  if (comp.stage === 'done') return true;
  if (!comp.fixtures.every((f) => f.played)) return false;
  return compFormat(comp) === null;
}

export function isSeasonComplete(state: GameState): boolean {
  const comps = compsOfSeason(state);
  if (!comps.length) return false;
  return comps.every(isCompFinished);
}
