import { makeTestState } from '../../core/testing';
import type { Competition, GameState, Lang } from '../../core/types';
import { Rng } from '../../core/rng';
import { buildNarrativeContext } from '../api';

export function stateFor(lang: Lang = 'tr', opts: { seed?: number; week?: number; season?: number } = {}): GameState {
  const s = makeTestState({ seed: opts.seed ?? 7, season: opts.season });
  s.lang = lang;
  s.week = opts.week ?? 12;
  const user = s.world.players[s.career.playerId];
  user.season.apps = 8; user.season.goals = 4; user.season.assists = 2; user.season.ratingSum = 56;
  user.career.apps = 20; user.career.goals = 9;
  s.career.fame = 42; s.career.followers = 80_000;
  s.career.genesis.hometown = 'Ankara';
  s.career.matches = [
    { season: s.season, week: 10, opponent: 'Test City 2', goalsFor: 2, goalsAgainst: 1, goals: 1, assists: 0, rating: 7.8 } as never,
  ];
  return s;
}

export function withLeague(s: GameState): Competition {
  const ids = Object.keys(s.world.clubs);
  const comp: Competition = {
    id: 'ENG-1-2026', kind: 'league', name: 'Test Division', shortName: 'TD', country: 'ENG', tier: 1, season: s.season,
    teamIds: ids, stage: 'league', winnerId: null, prizeMoney: 0, fixtures: [],
    tables: { main: ids.map((id, i) => ({ teamId: id, played: 12, won: 9 - i, drawn: 1, lost: 2 + i, gf: 20 - i, ga: 10 + i, points: 28 - i * 3, form: ['W', 'W', 'W', 'W', 'W'] as ('W' | 'D' | 'L')[] })) },
  };
  s.competitions[comp.id] = comp;
  return comp;
}

export const ctxOf = (lang: Lang = 'tr', opts?: Parameters<typeof stateFor>[1]) => buildNarrativeContext(stateFor(lang, opts));
export const rngOf = (seed = 1) => new Rng(seed);
export const noHoles = (s: string) => !/[{}]|undefined|NaN|\[object/.test(s);
