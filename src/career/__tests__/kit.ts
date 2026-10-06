/** Shared fixtures for the career tests (not a test file itself). */
import { makeTestFootballer, makeTestState, type TestStateOptions } from '../../core/testing';
import { Rng } from '../../core/rng';
import { overall } from '../../core/ratings';
import type { Competition, Fixture, GameState, MatchSummary, Position, UserMatchStats } from '../../core/types';
import { userPlayer } from '../helpers';

export function stateWith(opts: TestStateOptions = {}, mutate?: (s: GameState) => void): GameState {
  const s = makeTestState(opts);
  mutate?.(s);
  return s;
}

/** Add (or extend) a league competition with one fixture for the user's club. */
export function addFixture(state: GameState, f: Partial<Fixture> & { id: string }): Fixture {
  const club = userPlayer(state).clubId as string;
  const compId = f.compId ?? `ENG-1-${state.season}`;
  let comp = state.competitions[compId];
  if (!comp) {
    comp = {
      id: compId, kind: 'league', name: 'Test Division', shortName: 'TD', country: 'ENG', tier: 1, season: state.season,
      teamIds: Object.keys(state.world.clubs), fixtures: [], tables: {}, stage: 'league', winnerId: null, prizeMoney: 0,
    } as Competition;
    state.competitions[compId] = comp;
  }
  const other = Object.keys(state.world.clubs).find((id) => id !== club) as string;
  const fixture: Fixture = {
    compId, season: state.season, week: state.week, slot: 'weekend', round: 1, homeId: club, awayId: other, played: false, ...f,
  };
  comp.fixtures.push(fixture);
  return fixture;
}

const baseStats = (minutes: number): UserMatchStats => ({
  minutes, goals: 0, assists: 0, shots: 2, shotsOnTarget: 1, passes: 30, passesCompleted: 25, keyPasses: 1,
  dribbles: 2, tackles: 2, interceptions: 1, foulsWon: 1, foulsConceded: 1, moments: 5,
});

export function summaryFor(
  state: GameState, fixtureId: string,
  o: { rating?: number; goals?: number; assists?: number; minutes?: number; gf?: number; ga?: number; motm?: boolean; xp?: MatchSummary['user'] extends infer U ? (U extends { xp: infer X } ? X : never) : never } = {},
): MatchSummary {
  const me = userPlayer(state);
  const minutes = o.minutes ?? 90;
  const stats = { ...baseStats(minutes), goals: o.goals ?? 0, assists: o.assists ?? 0 };
  return {
    fixtureId, homeGoals: o.gf ?? 1, awayGoals: o.ga ?? 0, events: [], possession: 50, shots: { home: 8, away: 6 }, xg: { home: 1, away: 1 },
    ratings: { [me.id]: o.rating ?? 6.8 }, motmId: o.motm ? me.id : null,
    user: { rating: o.rating ?? 6.8, stats, xp: o.xp ?? { shooting: 3, passing: 2, composure: 1 }, highlights: 1 },
    minutes: { [me.id]: minutes },
  };
}

export const ovr = (s: GameState) => overall(userPlayer(s));

export function setUser(state: GameState, patch: Partial<ReturnType<typeof userPlayer>>): void {
  Object.assign(userPlayer(state), patch);
}

export function makeRng(seed = 1): Rng { return new Rng(seed); }

export const POS_ALL: Position[] = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];

/** Give the world a Turkish national team with a 23-man squad of the given quality. */
export function addNationalTeam(state: GameState, quality: number, nation = 'TUR'): string {
  const rng = new Rng(99);
  const squad: string[] = [];
  const shape: Position[] = ['GK', 'GK', 'GK', 'CB', 'CB', 'CB', 'CB', 'FB', 'FB', 'FB', 'DM', 'CM', 'CM', 'CM', 'AM', 'AM', 'W', 'W', 'W', 'ST', 'ST', 'ST', 'ST'];
  shape.forEach((pos, i) => {
    const id = `NTP-${nation}-${i}`;
    const f = makeTestFootballer(id, pos, quality + rng.int(-3, 3), null, rng, state.season);
    f.nation = nation;
    state.world.players[id] = f;
    squad.push(id);
  });
  const id = `NT-${nation}`;
  state.world.nationalTeams[id] = {
    id, nation, name: { tr: 'Türkiye', en: 'Turkey' }, kit: { primary: '#c8102e', secondary: '#fff', style: 'plain' },
    reputation: quality, squad, managerName: 'Test Coach',
  };
  return id;
}

/** Move the user (squad lists + contract) to another club of the test world. */
export function moveUser(state: GameState, clubId: string): void {
  const p = userPlayer(state);
  if (p.clubId) {
    const old = state.world.clubs[p.clubId];
    old.squad = old.squad.filter((id) => id !== p.id);
  }
  state.world.clubs[clubId].squad.push(p.id);
  p.clubId = clubId;
  if (p.contract) p.contract.clubId = clubId;
}
