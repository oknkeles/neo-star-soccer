/**
 * Test fixtures that do NOT depend on any module implementation, so every module can
 * unit-test against a small but valid GameState while other modules are still being built.
 *
 *   const state = makeTestState();            // 1 league (ENG-1, 6 clubs × 18 players), user = ST at club 0
 *   const state = makeTestState({ clubs: 4 });
 */
import { Rng } from './rng';
import type {
  Attributes, Club, Competition, Footballer, GameState, LeagueDef, Manager, Position, StatLine, World,
} from './types';
import { ATTR_KEYS } from './ratings';

export const emptyStats = (): StatLine => ({
  apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, ratingSum: 0, motm: 0, yellow: 0, red: 0, cleanSheets: 0,
});

export function makeAttrs(base: number, rng: Rng, position: Position): Attributes {
  const a = {} as Attributes;
  for (const k of ATTR_KEYS) a[k] = Math.max(15, Math.min(95, Math.round(base + rng.normal(0, 6))));
  a.goalkeeping = position === 'GK' ? Math.min(95, base + 8) : 10 + rng.int(0, 8);
  if (position === 'GK') { a.shooting = 20; a.dribbling = 25; }
  return a;
}

const SQUAD_SHAPE: Position[] = ['GK', 'GK', 'CB', 'CB', 'CB', 'FB', 'FB', 'DM', 'CM', 'CM', 'CM', 'AM', 'W', 'W', 'W', 'ST', 'ST', 'ST'];

export function makeTestFootballer(id: string, position: Position, quality: number, clubId: string | null, rng: Rng, season = 2026): Footballer {
  return {
    id, firstName: `First${id}`, lastName: `Last${id}`, nation: 'ENG', birthYear: season - rng.int(18, 33),
    position, foot: rng.chance(0.25) ? 'L' : 'R', weakFoot: rng.int(1, 4), attrs: makeAttrs(quality, rng, position),
    potential: Math.min(99, quality + rng.int(0, 15)), clubId, shirtNumber: rng.int(2, 40), contract: clubId
      ? { clubId, wage: quality * 300, startSeason: season, endSeason: season + 2, releaseClause: null, role: 'rotation', goalBonus: 0, appearanceBonus: 0 }
      : null,
    form: 50, fitness: 90, morale: 60, injury: null, value: quality * 100_000,
    appearance: { skin: rng.int(0, 5), hairStyle: rng.int(0, 7), hairColor: '#2b1d14', beard: rng.int(0, 3), boots: '#ffffff', height: rng.int(170, 192) },
    traits: [], season: emptyStats(), career: emptyStats(), intlCaps: 0, intlGoals: 0,
  };
}

export interface TestStateOptions { clubs?: number; seed?: number; userPosition?: Position; season?: number }

export function makeTestState(opts: TestStateOptions = {}): GameState {
  const nClubs = opts.clubs ?? 6;
  const season = opts.season ?? 2026;
  const rng = new Rng(opts.seed ?? 7);
  const league: LeagueDef = { id: 'ENG-1', country: 'ENG', tier: 1, name: 'Test Division', teams: nClubs, promote: 0, relegate: 0, continentalSpots: 2, strength: 70 };
  const clubs: Record<string, Club> = {};
  const players: Record<string, Footballer> = {};
  const managers: Record<string, Manager> = {};
  for (let c = 0; c < nClubs; c++) {
    const id = `ENG-1-${String(c).padStart(2, '0')}`;
    const rep = 55 + c * 5;
    const mid = `M-${c}`;
    managers[mid] = { id: mid, firstName: 'Coach', lastName: `No${c}`, nation: 'ENG', birthYear: 1975, style: 'balanced', temperament: 'calm', trustsYouth: 50, reputation: rep, clubId: id };
    const squad: string[] = [];
    SQUAD_SHAPE.forEach((pos, i) => {
      const pid = `P-${c}-${i}`;
      players[pid] = makeTestFootballer(pid, pos, rep - 5 + rng.int(-4, 4), id, rng, season);
      squad.push(pid);
    });
    clubs[id] = {
      id, name: `Test City ${c}`, shortName: `TC${c}`, nickname: 'Testers', city: `City${c}`, country: 'ENG', tier: 1, founded: 1900,
      kit: { primary: '#c8102e', secondary: '#ffffff', style: 'plain' }, awayKit: { primary: '#ffffff', secondary: '#111111', style: 'plain' },
      reputation: rep, budget: rep * 1_000_000, wageBudget: rep * 10_000, stadium: { name: `Arena ${c}`, capacity: 30000 + c * 5000 },
      facilities: rep, youth: 50, style: 'balanced', formation: '4-3-3', managerId: mid, squad, derbyRivals: [],
    };
  }
  const userClub = clubs['ENG-1-00'];
  const user = makeTestFootballer('USER', opts.userPosition ?? 'ST', 58, userClub.id, rng, season);
  Object.assign(user, { firstName: 'Deniz', lastName: 'Yıldız', nation: 'TUR', birthYear: season - 17, isUser: true, potential: 86 });
  players[user.id] = user;
  userClub.squad.push(user.id);

  const world: World = { leagues: [league], clubs, players, managers, nationalTeams: {}, externalClubs: {} };
  const competitions: Record<string, Competition> = {};

  return {
    schema: 1, id: 'test-career', createdAt: 0, savedAt: 0, seed: opts.seed ?? 7, rng: rng.state(), lang: 'tr',
    season, week: 0, world, competitions,
    career: {
      playerId: user.id, money: 5000, fame: 5, followers: 1200, energy: 90,
      relationships: { manager: 50, teammates: 50, fans: 40, media: 40, family: 70, partner: 0, agent: 60, sponsors: 20 },
      people: [{ id: 'PER-agent', name: 'Kemal Usta', role: 'agent', personality: 'shrewd, loyal', bio: 'Veteran agent.', relationship: 60 }],
      partnerId: null, rivalId: 'P-1-15', mentorId: 'P-0-8', inventory: [], sponsors: [], xp: {}, trainingFocus: 'balanced',
      actionsLeft: 3, trophies: [], awards: [], history: [], matches: [],
      genesis: {
        hometown: 'İzmir', hometownClubId: null, backstory: 'Test backstory.', motto: 'Never stop.', dream: 'Win everything.',
        theme: 'prodigy', destinyHint: 'Something stirs.', family: [], agent: { id: 'PER-agent', name: 'Kemal Usta', role: 'agent', personality: 'shrewd', bio: '', relationship: 60 },
        rivalBlurb: '', mentorBlurb: '', goals: [], ai: false,
      },
      setPieces: { freeKicks: false, penalties: false, corners: false }, transferListed: false,
      nationalTeamId: null, calledUp: false, retired: false, hallOfFame: 0,
    },
    inbox: [], news: [], social: [], events: [], offers: [], negotiation: null, storylines: [], seasons: [], flags: {}, idCounter: 1,
  };
}
