/**
 * Season creation: leagues, domestic cups, the Champions Cup, international breaks and
 * the summer tournament.
 */
import type { Club, Competition, CountryCode, Fixture, GameState, LeagueDef, NationalTeam } from '../core/types';
import type { Rng } from '../core/rng';
import {
  CC_GROUP_WEEKS, INTL_BREAK_WEEKS, TOURNAMENT_GROUP_SLOTS, tournamentOf,
} from './calendar';
import { compFormat, stageForTeams } from './formats';
import { continentOf, ct, emptyRow, floorPow2, pad2, userClubId, userFootballer, userNationalTeamId } from './helpers';
import { drawCupRound, koFixtures } from './knockout';
import { doubleRoundRobin, leagueSlots, singleRoundRobin, type Pair } from './schedule';
import { sortedTable } from './tables';

const GROUP_LETTERS = 'ABCDEFGHIJKLMNOP';

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return name.slice(0, 4).toUpperCase();
  return words.map((w) => w[0]).join('').toLocaleUpperCase('tr').slice(0, 4);
}

export function clubsOf(state: GameState, country: CountryCode, tier: 1 | 2): Club[] {
  return Object.values(state.world.clubs)
    .filter((c) => c.country === country && c.tier === tier)
    .sort((a, b) => a.id.localeCompare(b.id));
}

const byRep = (a: { reputation: number; id: string }, b: { reputation: number; id: string }) => b.reputation - a.reputation || a.id.localeCompare(b.id);

/** Prize pools scale with the participants' budgets, so they fit whatever money scale the world uses. */
function budgetPool(state: GameState, teamIds: readonly string[], share: number): number {
  let total = 0;
  for (const id of teamIds) total += Math.max(0, state.world.clubs[id]?.budget ?? 0);
  return Math.round((total * share) / 10_000) * 10_000;
}

function baseComp(partial: Pick<Competition, 'id' | 'kind' | 'name' | 'shortName' | 'season' | 'teamIds'> & Partial<Competition>): Competition {
  return { fixtures: [], tables: {}, stage: 'league', winnerId: null, prizeMoney: 0, playerStats: {}, ...partial };
}

// ───────── leagues ─────────

function createLeague(state: GameState, lg: LeagueDef, rng: Rng): Competition | null {
  const season = state.season;
  const teamIds = clubsOf(state, lg.country, lg.tier).map((c) => c.id);
  if (teamIds.length < 2) return null;
  const rounds = doubleRoundRobin(rng.shuffle(teamIds.slice()));
  const slots = leagueSlots(rounds.length, lg.country);
  const id = `${lg.id}-${season}`;
  const fixtures: Fixture[] = [];
  rounds.forEach((pairs, r) => {
    const s = slots[r] ?? { week: 44, slot: 'midweek' as const };
    pairs.forEach(([homeId, awayId], i) => {
      fixtures.push({
        id: `${id}-MD${pad2(r + 1)}-${pad2(i + 1)}`, compId: id, season, week: s.week, slot: s.slot,
        round: r + 1, roundName: ct(state, 'matchday', { n: r + 1 }), homeId, awayId, played: false,
      });
    });
  });
  return baseComp({
    id, kind: 'league', name: lg.name, shortName: initials(lg.name), country: lg.country, tier: lg.tier, season, teamIds,
    fixtures, tables: { main: teamIds.map(emptyRow) }, stage: 'league',
    prizeMoney: budgetPool(state, teamIds, lg.tier === 1 ? 0.3 : 0.2),
  });
}

// ───────── domestic cups ─────────

function cupName(state: GameState, country: CountryCode): string {
  const key = `cup.${country}`;
  const name = ct(state, key);
  return name === `comp.${key}` ? ct(state, 'cup.other', { country }) : name;
}

function createCup(state: GameState, country: CountryCode, rng: Rng): Competition | null {
  const season = state.season;
  const pool = [...clubsOf(state, country, 1).sort(byRep), ...clubsOf(state, country, 2).sort(byRep)];
  if (pool.length < 2) return null;
  const size = Math.min(32, floorPow2(pool.length));
  const teams = pool.slice(0, size).map((c) => c.id);
  const name = cupName(state, country);
  const comp = baseComp({
    id: `CUP-${country}-${season}`, kind: 'cup', name, shortName: initials(name), country, season, teamIds: teams,
    stage: stageForTeams(size), prizeMoney: budgetPool(state, teams, 0.05),
  });
  const format = compFormat(comp)!;
  comp.fixtures = koFixtures(state, comp, format, 1, drawCupRound(state, teams, rng));
  return comp;
}

// ───────── group draw (Champions Cup & tournaments) ─────────

/**
 * Pot-based group draw: `teams` sorted strongest first, G groups of 4. Keeps teams with the same
 * conflict key apart (country / continent) when possible; `allowance` lets e.g. Europe have two.
 */
function drawGroups(teams: string[], G: number, rng: Rng, key: (id: string) => string, allowance: (k: string) => number = () => 1): string[][] {
  for (let attempt = 0; attempt < 40; attempt++) {
    const groups: string[][] = Array.from({ length: G }, () => []);
    let ok = true;
    for (let p = 0; p < 4; p++) {
      const pot = rng.shuffle(teams.slice(p * G, (p + 1) * G));
      for (const id of pot) {
        const open = groups.map((g, i) => i).filter((i) => groups[i].length === p);
        const k = key(id);
        const fits = open.filter((i) => groups[i].filter((x) => key(x) === k).length < allowance(k));
        const choice = fits.length ? rng.pick(fits) : rng.pick(open);
        if (!fits.length) ok = false;
        groups[choice].push(id);
      }
    }
    if (ok || attempt === 39) return groups;
  }
  return [];
}

function groupFixtures(state: GameState, comp: Competition, groups: string[][], rounds: (teams: string[]) => Pair[][], slotOf: (r: number) => { week: number; slot: 'weekend' | 'midweek' }, neutral: boolean): Fixture[] {
  const fixtures: Fixture[] = [];
  groups.forEach((teams, gi) => {
    const letter = GROUP_LETTERS[gi];
    comp.tables[letter] = teams.map(emptyRow);
    rounds(teams).forEach((pairs, r) => {
      const s = slotOf(r);
      pairs.forEach(([homeId, awayId], i) => {
        const f: Fixture = {
          id: `${comp.id}-G${letter}-MD${r + 1}-${i + 1}`, compId: comp.id, season: comp.season, week: s.week, slot: s.slot,
          round: r + 1, roundName: ct(state, 'groupMd', { g: letter, n: r + 1 }), homeId, awayId, played: false,
        };
        if (neutral) f.neutral = true;
        fixtures.push(f);
      });
    });
  });
  return fixtures.sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
}

// ───────── Champions Cup ─────────

/** Final ranking of a tier-1 league last season (table) or, in the first season, by reputation. */
function leagueRanking(state: GameState, lg: LeagueDef): string[] {
  const prev = state.competitions[`${lg.id}-${state.season - 1}`];
  if (prev && prev.kind === 'league') {
    const order = sortedTable(prev).map((r) => r.teamId).filter((id) => !!state.world.clubs[id]);
    if (order.length) return order;
  }
  return clubsOf(state, lg.country, 1).sort(byRep).map((c) => c.id);
}

export function championsCupEntrants(state: GameState): string[] {
  const tier1 = state.world.leagues.filter((l) => l.tier === 1).sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
  const rankings = tier1.map((lg) => ({ lg, order: leagueRanking(state, lg) }));
  const qualified: string[] = [];
  // the holders defend their title
  const holder = state.competitions[`CC-${state.season - 1}`]?.winnerId;
  if (holder && state.world.clubs[holder]?.tier === 1) qualified.push(holder);
  const maxSpots = Math.max(0, ...tier1.map((l) => l.continentalSpots));
  for (let pos = 0; pos < maxSpots; pos++) {
    for (const { lg, order } of rankings) {
      const id = order[pos];
      if (pos < lg.continentalSpots && id && !qualified.includes(id)) qualified.push(id);
    }
  }
  const rest = Object.values(state.world.clubs)
    .filter((c) => c.tier === 1 && !qualified.includes(c.id))
    .sort(byRep)
    .map((c) => c.id);
  return [...qualified, ...rest];
}

function createChampionsCup(state: GameState, rng: Rng): Competition | null {
  const all = championsCupEntrants(state);
  if (all.length < 4) return null;
  const G = Math.min(8, floorPow2(Math.floor(all.length / 4)));
  const champions = new Set(state.world.leagues.filter((l) => l.tier === 1).map((l) => leagueRanking(state, l)[0]));
  const coef = (id: string) => (state.world.clubs[id]?.reputation ?? 50) + (champions.has(id) ? 6 : 0);
  const teams = all.slice(0, G * 4).sort((a, b) => coef(b) - coef(a) || a.localeCompare(b));
  const season = state.season;
  const comp = baseComp({
    id: `CC-${season}`, kind: 'continental', name: ct(state, 'cc'), shortName: ct(state, 'ccShort'), season, teamIds: teams,
    stage: 'group', prizeMoney: budgetPool(state, teams, 0.25),
  });
  const groups = drawGroups(teams, G, rng, (id) => state.world.clubs[id]?.country ?? id);
  comp.fixtures = groupFixtures(state, comp, groups, doubleRoundRobin, (r) => ({ week: CC_GROUP_WEEKS[r] ?? 26, slot: 'midweek' }), false);
  return comp;
}

// ───────── international breaks ─────────

function pairNations(nts: NationalTeam[], rng: Rng, qualifiers: boolean, avoid: Set<string>): { pair: Pair; qualifier: boolean }[] {
  const out: { pair: Pair; qualifier: boolean }[] = [];
  const leftovers: string[] = [];
  const keyOf = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pairUp = (ids: string[], qualifier: boolean) => {
    rng.shuffle(ids);
    // break repeats of the previous matchday by swapping partners
    for (let i = 0; i + 3 < ids.length; i += 2) {
      if (avoid.has(keyOf(ids[i], ids[i + 1]))) [ids[i + 1], ids[i + 3]] = [ids[i + 3], ids[i + 1]];
    }
    for (let i = 0; i + 1 < ids.length; i += 2) {
      out.push({ pair: rng.chance(0.5) ? [ids[i], ids[i + 1]] : [ids[i + 1], ids[i]], qualifier });
    }
    if (ids.length % 2 === 1) leftovers.push(ids[ids.length - 1]);
  };
  if (qualifiers) {
    const byContinent = new Map<string, string[]>();
    for (const nt of nts) {
      const c = continentOf(nt.nation);
      byContinent.set(c, [...(byContinent.get(c) ?? []), nt.id]);
    }
    for (const c of [...byContinent.keys()].sort()) pairUp(byContinent.get(c)!, true);
    const rest = leftovers.splice(0);
    pairUp(rest, false);
  } else {
    pairUp(nts.map((n) => n.id), false);
  }
  return out;
}

function createInternationals(state: GameState, rng: Rng): Competition | null {
  const nts = Object.values(state.world.nationalTeams).sort((a, b) => a.id.localeCompare(b.id));
  if (nts.length < 2) return null;
  const season = state.season;
  const id = `INT-${season}`;
  const thisSummer = tournamentOf(season);
  const fixtures: Fixture[] = [];
  INTL_BREAK_WEEKS.forEach((week, b) => {
    // qualifiers for this summer's tournament before winter; otherwise for the next one
    const qualKind = thisSummer ? (week < 20 ? thisSummer : null) : tournamentOf(season + 1);
    let previous = new Set<string>();
    const played = new Set<string>();
    for (const md of [1, 2] as const) {
      const slot = md === 1 ? 'midweek' : 'weekend';
      const pairs = pairNations(nts, rng, qualKind !== null, previous);
      previous = new Set(pairs.map(({ pair: [h, a] }) => (h < a ? `${h}|${a}` : `${a}|${h}`)));
      let i = 0;
      for (const { pair: [homeId, awayId], qualifier } of pairs) {
        // some nations play only once — but never none at all in a break
        if (md === 2 && !qualifier && rng.chance(0.25) && played.has(homeId) && played.has(awayId)) continue;
        i++;
        if (md === 1) { played.add(homeId); played.add(awayId); }
        fixtures.push({
          id: `${id}-B${b + 1}-M${md}-${qualifier ? 'Q' : 'F'}-${pad2(i)}`, compId: id, season, week, slot,
          round: b * 2 + md, roundName: qualifier && qualKind ? ct(state, `qual.${qualKind}`) : ct(state, 'friendly'),
          homeId, awayId, played: false,
        });
      }
    }
  });
  return baseComp({
    id, kind: 'international', name: ct(state, 'intl'), shortName: ct(state, 'intlShort'), season,
    teamIds: nts.map((n) => n.id), fixtures, stage: 'friendlies',
  });
}

// ───────── summer tournament ─────────

function createTournament(state: GameState, rng: Rng): Competition | null {
  const kind = tournamentOf(state.season);
  if (!kind) return null;
  const nts = Object.values(state.world.nationalTeams).sort((a, b) => a.id.localeCompare(b.id));
  const year = state.season + 1;
  let teams: NationalTeam[];
  if (kind === 'WC') {
    // qualification luck: reputation plus a little noise
    const G = Math.min(8, floorPow2(Math.floor(nts.length / 4)));
    if (nts.length < 4) return null;
    const home = userFootballer(state)?.nation;
    teams = nts
      .map((nt) => ({ nt, score: nt.reputation + rng.normal(0, 5) + (nt.nation === home ? 8 : 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, G * 4)
      .map((x) => x.nt);
  } else {
    if (nts.length < 4) return null;
    const userNation = userFootballer(state)?.nation ?? 'TUR';
    const continent = continentOf(userNation);
    const same = nts.filter((n) => continentOf(n.nation) === continent).sort(byRep);
    let target = same.length >= 12 ? 16 : 8;
    while (target > nts.length) target /= 2;
    if (target < 4) return null;
    const guests = nts.filter((n) => continentOf(n.nation) !== continent).sort(byRep);
    teams = [...same.slice(0, target), ...guests].slice(0, target);
  }
  const G = teams.length / 4;
  const sorted = teams.slice().sort(byRep).map((n) => n.id);
  const id = `${kind}-${year}`;
  const comp = baseComp({
    id, kind: 'international', name: ct(state, kind === 'WC' ? 'wc' : 'cont', { year }),
    shortName: ct(state, kind === 'WC' ? 'wcShort' : 'contShort'), season: state.season, teamIds: sorted,
    stage: 'group', prizeMoney: kind === 'WC' ? 440_000_000 : 330_000_000,
  });
  const continentKey = (ntId: string) => continentOf(state.world.nationalTeams[ntId]?.nation ?? ntId);
  const groups = drawGroups(sorted, G, rng, continentKey, (k) => (kind === 'WC' && k === 'EU' ? 2 : kind === 'WC' ? 1 : 4));
  comp.fixtures = groupFixtures(state, comp, groups, singleRoundRobin, (r) => TOURNAMENT_GROUP_SLOTS[r] ?? TOURNAMENT_GROUP_SLOTS[2], true);
  return comp;
}

// ───────── entry point ─────────

/** Mark fixtures of the user's club / called-up national team (hint for UIs; refreshed weekly). */
export function markUserFixtures(state: GameState, comps: Record<string, Competition> = state.competitions): void {
  const club = userClubId(state);
  const nt = userNationalTeamId(state);
  for (const c of Object.values(comps)) {
    for (const f of c.fixtures) {
      const involved = (!!club && (f.homeId === club || f.awayId === club)) || (!!nt && (f.homeId === nt || f.awayId === nt));
      if (involved) f.userInvolved = true;
      else if (f.userInvolved) delete f.userInvolved;
    }
  }
}

export function createSeasonCompetitions(state: GameState, rng: Rng): Record<string, Competition> {
  const comps: Record<string, Competition> = {};
  const add = (c: Competition | null) => { if (c) comps[c.id] = c; };
  const leagues = state.world.leagues.slice().sort((a, b) => a.id.localeCompare(b.id));
  for (const lg of leagues) add(createLeague(state, lg, rng));
  const countries = [...new Set(leagues.map((l) => l.country))];
  for (const country of countries) add(createCup(state, country, rng));
  add(createChampionsCup(state, rng));
  add(createInternationals(state, rng));
  add(createTournament(state, rng));
  markUserFixtures(state, comps);
  return comps;
}
