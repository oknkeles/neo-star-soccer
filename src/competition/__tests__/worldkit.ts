/**
 * Synthetic multi-league world for competition tests (independent of the world module).
 * 8 countries × 2 tiers, ~24 players per club, national teams for a few dozen nations.
 */
import { Rng } from '../../core/rng';
import { makeTestFootballer, makeTestState } from '../../core/testing';
import type {
  Club, CountryCode, Footballer, GameState, LeagueDef, Manager, NationalTeam, Position,
} from '../../core/types';

const COUNTRIES: CountryCode[] = ['ENG', 'ESP', 'ITA', 'GER', 'FRA', 'POR', 'NED', 'TUR'];
const SQUAD: Position[] = [
  'GK', 'GK', 'CB', 'CB', 'CB', 'CB', 'FB', 'FB', 'FB', 'DM', 'DM', 'CM', 'CM', 'CM', 'AM', 'AM', 'W', 'W', 'W', 'ST', 'ST', 'ST', 'CM', 'CB',
];
const NATIONS = [
  'ENG', 'ESP', 'ITA', 'GER', 'FRA', 'POR', 'NED', 'TUR', 'BRA', 'ARG', 'URU', 'COL', 'NGA', 'SEN', 'GHA', 'MAR', 'EGY', 'JPN', 'KOR',
  'USA', 'MEX', 'CRO', 'SRB', 'POL', 'BEL', 'SUI', 'DEN', 'SWE', 'AUS', 'CIV', 'CHI', 'AUT',
];

export interface WorldKitOptions {
  seed?: number;
  /** Teams per tier-1 / tier-2 league. */
  top?: number;
  second?: number;
  season?: number;
  nations?: boolean;
}

/** A full world: user = ST at ENG-1-00, Turkish. */
export function makeWorldState(opts: WorldKitOptions = {}): GameState {
  const seed = opts.seed ?? 11;
  const season = opts.season ?? 2026;
  const nTop = opts.top ?? 18;
  const nSecond = opts.second ?? 16;
  const rng = new Rng(seed);
  const base = makeTestState({ clubs: 2, seed, season });
  const user = base.world.players[base.career.playerId];
  const state: GameState = { ...base, world: { leagues: [], clubs: {}, players: {}, managers: {}, nationalTeams: {}, externalClubs: {} } };
  const w = state.world;
  let pc = 0;
  for (const country of COUNTRIES) {
    for (const tier of [1, 2] as const) {
      const n = tier === 1 ? nTop : nSecond;
      const lg: LeagueDef = {
        id: `${country}-${tier}`, country, tier, name: `${country} Division ${tier}`, teams: n,
        promote: tier === 2 ? 3 : 0, relegate: tier === 1 ? 3 : 0, continentalSpots: tier === 1 ? (country === 'POR' || country === 'NED' || country === 'TUR' ? 2 : 4) : 0,
        strength: tier === 1 ? 60 + COUNTRIES.indexOf(country) * -2 + 20 : 45,
      };
      w.leagues.push(lg);
      for (let i = 0; i < n; i++) {
        const id = `${country}-${tier}-${String(i).padStart(2, '0')}`;
        const rep = Math.round((tier === 1 ? 88 - (i * 38) / n : 56 - (i * 26) / n) + rng.normal(0, 2));
        const mid = `M-${id}`;
        w.managers[mid] = { id: mid, firstName: 'Coach', lastName: id, nation: country, birthYear: 1975, style: 'balanced', temperament: 'calm', trustsYouth: 50, reputation: rep, clubId: id } as Manager;
        const squad: string[] = [];
        SQUAD.forEach((pos, k) => {
          const pid = `P${pc++}`;
          const p = makeTestFootballer(pid, pos, rep - 8 + rng.int(-4, 4) - (k > 18 ? 4 : 0), id, rng, season);
          p.nation = country;
          if (k < 2) p.shirtNumber = k === 0 ? 1 : 13;
          w.players[pid] = p;
          squad.push(pid);
        });
        const club: Club = {
          id, name: `${country} FC ${tier}-${i}`, shortName: `${country[0]}${tier}${i.toString(36).toUpperCase()}`, nickname: 'Testers', city: `City${i}`, country, tier, founded: 1900,
          kit: { primary: i % 2 ? '#c8102e' : '#0044aa', secondary: '#ffffff', style: 'plain' }, awayKit: { primary: '#ffffff', secondary: '#111111', style: 'plain' },
          reputation: rep, budget: rep * 400_000, wageBudget: rep * 10_000, stadium: { name: `Arena ${id}`, capacity: 15000 + rep * 600 },
          facilities: rep, youth: 50, style: 'balanced', formation: (['4-3-3', '4-4-2', '4-2-3-1', '3-5-2'] as const)[i % 4], managerId: mid, squad,
          derbyRivals: [],
        };
        w.clubs[id] = club;
      }
      // a couple of derbies per league
      const ids = Object.keys(w.clubs).filter((c) => w.clubs[c].country === country && w.clubs[c].tier === tier);
      for (let i = 0; i + 1 < ids.length; i += 6) { w.clubs[ids[i]].derbyRivals.push(ids[i + 1]); w.clubs[ids[i + 1]].derbyRivals.push(ids[i]); }
    }
  }
  // the user joins ENG-1-00 (first club)
  const userClub = w.clubs['ENG-1-00'];
  Object.assign(user, { clubId: userClub.id });
  user.contract = { clubId: userClub.id, wage: 5000, startSeason: season, endSeason: season + 2, releaseClause: null, role: 'prospect', goalBonus: 0, appearanceBonus: 0 };
  w.players[user.id] = user;
  userClub.squad.push(user.id);
  if (opts.nations !== false) {
    for (const nation of NATIONS) {
      const squad: string[] = [];
      const rep = 40 + ((nation.charCodeAt(0) * 7 + nation.charCodeAt(2) * 3) % 50);
      const pool = Object.values(w.players).filter((p) => p.nation === nation && !p.isUser).sort((a, b) => b.value - a.value).slice(0, 23);
      pool.forEach((p) => squad.push(p.id));
      while (squad.length < 23) {
        const pid = `X${pc++}`;
        const p: Footballer = makeTestFootballer(pid, SQUAD[squad.length % SQUAD.length], rep - 8 + rng.int(-4, 4), null, rng, season);
        p.nation = nation;
        w.players[pid] = p;
        w.externalClubs[pid] = 'Club Abroad';
        squad.push(pid);
      }
      const nt: NationalTeam = {
        id: `NT-${nation}`, nation, name: { tr: `${nation} Milli`, en: `${nation} National` },
        kit: { primary: '#aa1111', secondary: '#ffffff', style: 'plain' }, reputation: rep, squad, managerName: 'Mister X',
      };
      w.nationalTeams[nt.id] = nt;
    }
  }
  state.rng = rng.state();
  return state;
}

export const sumGoals = (state: GameState): number => {
  let g = 0;
  for (const c of Object.values(state.competitions)) for (const f of c.fixtures) if (f.played) g += (f.homeGoals ?? 0) + (f.awayGoals ?? 0);
  return g;
};
