import type { Club, CountryCode, Footballer, NationCode, Position, World } from '../../core/types';
import type { Rng } from '../../core/rng';
import { overallFor } from '../../core/ratings';
import { clamp } from '../../core/util';
import { t } from '../../core/i18n';
import type { NationDef, WorldGenOptions } from '../types';
import '../strings';
import { COUNTRIES, LEAGUES, getLeague } from '../leagues';
import { NATIONS, getNation } from '../nations';
import {
  CLUB_DATA, clubBudget, clubFacilities, clubYouth, fallbackSeeds, formationsFor, normalizeSeed, pickStyle, uniqueShort,
  type NormSeed,
} from './clubs';
import { generateFootballer } from './footballer';
import { generateManager } from './manager';
import { pickForeignNation } from './nationmix';
import { randomName } from './names';
import { buildSquad } from './squad';


const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Number of free-agent managers in the market. */
const FREE_MANAGERS = 15;

function buildCountry(rng: Rng, world: World, country: CountryCode, season: number, makePid: () => string): void {
  const data = CLUB_DATA[country];
  const shorts = new Set<string>();
  const names = new Set<string>();
  const byShort = new Map<string, string>();
  const built: { club: Club; seed: NormSeed }[] = [];

  for (const tier of [1, 2] as const) {
    const lg = getLeague(country, tier);
    const raw = (tier === 1 ? data.tier1 : data.tier2) ?? [];
    const seeds = raw.slice(0, lg.teams).map(normalizeSeed);
    for (const s of seeds) names.add(s.name);
    if (seeds.length < lg.teams) seeds.push(...fallbackSeeds(rng, country, tier, lg.teams - seeds.length, names));

    seeds.forEach((seed, i) => {
      const id = `${country}-${tier}-${String(i).padStart(2, '0')}`;
      const short = uniqueShort(seed.short, seed.name, shorts);
      if (!byShort.has(seed.short)) byShort.set(seed.short, id);
      const style = seed.style ?? pickStyle(rng, seed.rep);
      const club: Club = {
        id, name: seed.name, shortName: short, nickname: seed.nickname, city: seed.city, country, tier,
        founded: seed.founded, kit: seed.kit, awayKit: seed.away, reputation: Math.round(seed.rep),
        budget: clubBudget(rng, seed.rep, lg.strength), wageBudget: 0,
        stadium: { name: seed.stadium, capacity: seed.capacity },
        facilities: clubFacilities(rng, seed, lg.strength), youth: clubYouth(rng, seed, lg.strength),
        style, formation: seed.formation ?? rng.pick(formationsFor(style)),
        managerId: '', squad: [], derbyRivals: [],
      };
      world.clubs[id] = club;
      built.push({ club, seed });
    });
  }

  // derbies: listed rivals + same-city clubs, made mutual
  const link = (a: Club, bId: string) => {
    if (a.id !== bId && !a.derbyRivals.includes(bId)) a.derbyRivals.push(bId);
  };
  const cityKey = new Map<string, Club[]>();
  for (const { club } of built) {
    const k = norm(club.city);
    cityKey.set(k, [...(cityKey.get(k) ?? []), club]);
  }
  for (const { club, seed } of built) {
    for (const code of seed.derby) { const id = byShort.get(code); if (id) link(club, id); }
    for (const other of cityKey.get(norm(club.city)) ?? []) link(club, other.id);
  }
  for (const { club } of built) for (const id of [...club.derbyRivals]) link(world.clubs[id], club.id);

  // squads and managers
  for (const { club, seed } of built) {
    const lg = getLeague(country, club.tier);
    const squad = buildSquad(rng, { club, leagueStrength: lg.strength, foreignMul: seed.foreign, season, makeId: makePid });
    let bill = 0;
    for (const p of squad) {
      world.players[p.id] = p;
      club.squad.push(p.id);
      bill += p.contract?.wage ?? 0;
    }
    club.wageBudget = Math.round((bill * rng.float(1.08, 1.3)) / 1000) * 1000;
    const nation: NationCode = rng.chance(0.82) ? country : pickForeignNation(rng, country);
    const mid = `MW-${club.id}`;
    const rep = clamp(Math.round(club.reputation * 0.85 + 5 + rng.normal(0, 7)), 5, 98);
    world.managers[mid] = generateManager(rng, mid, nation, season, rep, { style: club.style, youthHint: club.youth, clubId: club.id });
    club.managerId = mid;
  }
}

// ───────────────────────── national teams ─────────────────────────

const NT_COMP: [Position, number, number][] = [
  ['GK', 3, 1], ['CB', 4, 2], ['FB', 4, 2], ['DM', 2, 1], ['CM', 3, 1], ['AM', 2, 1], ['W', 3, 2], ['ST', 2, 1],
];
const ABROAD_SUFFIX = ['Thunder', 'Stars', 'Lions', 'Eagles', 'Phoenix', 'Falcons', 'Titans', 'Royals', 'Mariners', 'Spartans', 'Dynamo', 'Sporting Club'];
const GOALS_PER_CAP: Record<Position, number> = { ST: 0.3, W: 0.12, AM: 0.1, CM: 0.05, DM: 0.02, FB: 0.02, CB: 0.03, GK: 0 };

/** Invented foreign club label for generated "abroad" players, e.g. "Hamburg Thunder (GER)". */
export function externalClubLabel(rng: Rng, nation: NationCode): string {
  const home = getNation(nation);
  const homeP = home.league ? 0.2 : home.reputation >= 80 ? 0.25 : 0.4;
  let code: NationCode = nation;
  if (!rng.chance(homeP)) {
    const leagues = LEAGUES.filter((l) => l.tier === 1);
    code = rng.weighted(leagues, (l) => l.strength * l.strength).country;
  }
  const n = getNation(code);
  const city = n.cities.length ? rng.pick(n.cities) : n.name.en;
  return `${city} ${rng.pick(ABROAD_SUFFIX)} (${code})`;
}

type Pool = { p: Footballer; o: number }[];

function poolsByNation(world: World): Map<NationCode, Pool> {
  const byNation = new Map<NationCode, Pool>();
  for (const p of Object.values(world.players)) {
    if (p.retired || p.isUser) continue;
    let list = byNation.get(p.nation);
    if (!list) byNation.set(p.nation, (list = []));
    list.push({ p, o: overallFor(p.attrs, p.position) });
  }
  return byNation;
}

/** 23-man squad: the nation's best players per position, topped up with generated "abroad" players. */
function pickSquad(rng: Rng, world: World, nat: NationDef, season: number, pool: Pool, freshCaps: boolean): string[] {
  const target = 36 + nat.reputation * 0.5;
  const squad: string[] = [];
  let abroadN = 0;
  while (world.players[`WA-${nat.code}-${abroadN + 1}`]) abroadN++;
  for (const [pos, count, starters] of NT_COMP) {
    const cands = pool.filter((x) => x.p.position === pos && season - x.p.birthYear <= 37).sort((a, b) => b.o - a.o);
    for (let i = 0; i < count; i++) {
      const slotQ = target - (i >= starters ? 5 : 0) - (pos === 'GK' ? 1 : 0) + rng.normal(0, 2.5);
      const cand = cands[i];
      let p: Footballer;
      if (cand && cand.o >= slotQ - 5) {
        p = cand.p;
      } else {
        const id = `WA-${nat.code}-${++abroadN}`;
        const age = clamp(Math.round(rng.normal(26.5, 3.4)), 19, 36);
        p = generateFootballer(rng, { id, nation: nat.code, position: pos, age, season, quality: clamp(Math.round(slotQ), 40, 91), clubId: null });
        world.players[id] = p;
        world.externalClubs[id] = externalClubLabel(rng, nat.code);
      }
      const age = season - p.birthYear;
      if (age >= 21 && (freshCaps || p.intlCaps === 0)) {
        p.intlCaps = clamp(Math.round((age - 20) * rng.float(1, 6) * (i < starters ? 1.4 : 0.6)), 0, 150);
        p.intlGoals = Math.round(p.intlCaps * GOALS_PER_CAP[pos] * rng.float(0.4, 1.1));
      }
      squad.push(p.id);
    }
  }
  return squad;
}

function buildNationalTeams(rng: Rng, world: World, season: number): void {
  const pools = poolsByNation(world);
  for (const nat of NATIONS) {
    const mgr = randomName(rng, nat.code);
    world.nationalTeams[`NT-${nat.code}`] = {
      id: `NT-${nat.code}`, nation: nat.code,
      name: { tr: t('world.nt.name', { nation: nat.name.tr }, 'tr'), en: t('world.nt.name', { nation: nat.name.en }, 'en') },
      kit: nat.kit, reputation: nat.reputation, squad: pickSquad(rng, world, nat, season, pools.get(nat.code) ?? [], true),
      managerName: `${mgr.first} ${mgr.last}`,
    };
  }
}

/**
 * Re-select the national squads from the current world (e.g. after retirements at season end):
 * best players per position, with "abroad" players added or reused to keep 23 per team.
 */
export function refreshNationalTeams(rng: Rng, world: World, season: number): void {
  const pools = poolsByNation(world);
  for (const nat of NATIONS) {
    const nt = world.nationalTeams[`NT-${nat.code}`];
    const squad = pickSquad(rng, world, nat, season, pools.get(nat.code) ?? [], false);
    if (nt) nt.squad = squad;
    else {
      const mgr = randomName(rng, nat.code);
      world.nationalTeams[`NT-${nat.code}`] = {
        id: `NT-${nat.code}`, nation: nat.code,
        name: { tr: t('world.nt.name', { nation: nat.name.tr }, 'tr'), en: t('world.nt.name', { nation: nat.name.en }, 'en') },
        kit: nat.kit, reputation: nat.reputation, squad, managerName: `${mgr.first} ${mgr.last}`,
      };
    }
  }
}

/**
 * Build the whole world: 16 leagues of clubs with squads and managers, free managers
 * and a national team for every nation. Deterministic for a given rng state.
 */
export function generateWorld(rng: Rng, opts: WorldGenOptions): World {
  const season = opts.startSeason;
  const world: World = {
    leagues: LEAGUES.map((l) => ({ ...l })), clubs: {}, players: {}, managers: {}, nationalTeams: {}, externalClubs: {},
  };
  let counter = 0;
  const makePid = () => `WP-${(++counter).toString(36)}`;

  for (const country of COUNTRIES) buildCountry(rng, world, country, season, makePid);

  for (let i = 0; i < FREE_MANAGERS; i++) {
    const id = `MW-FREE-${String(i).padStart(2, '0')}`;
    const nation = rng.chance(0.6) ? rng.pick(COUNTRIES) : pickForeignNation(rng, rng.pick(COUNTRIES));
    world.managers[id] = generateManager(rng, id, nation, season, rng.int(22, 74), { clubId: null });
  }

  buildNationalTeams(rng, world, season);
  return world;
}
