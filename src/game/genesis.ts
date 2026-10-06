/**
 * New-career building blocks: the user's footballer, a rival, a hometown and the career
 * genesis (backstory, family, agent) — every piece seeded so each run is different.
 */
import type {
  CareerGenesis, Club, Footballer, GameState, NationCode, Person, PlayablePosition, Position, Relationships, TraitId, World,
} from '../core/types';
import type { GenesisInput, Narrator } from '../core/narrative-types';
import type { Rng } from '../core/rng';
import { positionGroup } from '../core/ratings';
import { age, clamp, nextId } from '../core/util';
import { t } from '../core/i18n';
import * as worldApi from '../world/api';
import * as career from '../career/api';
import type { NewCareerOptions } from './api';

export const START_SEASON = 2026;
export const USER_ID = 'USER';

/** Theme words handed to the narrator so no two backstories feel the same. */
export const SEED_FLAVORS = [
  'redemption', 'prodigy', 'outsider', 'street_footballer', 'family_legacy', 'immigrant_dream', 'underdog',
  'second_chance', 'small_town_hero', 'rebel', 'late_spark', 'promise_to_grandfather', 'scholar', 'showman',
  'quiet_genius', 'storm_chaser',
] as const;

export const ALL_TRAITS: TraitId[] = [
  'big_game', 'glass_bones', 'late_bloomer', 'wonderkid', 'leader', 'showman', 'hothead', 'iron_man',
  'set_piece_specialist', 'clinical', 'playmaker', 'speedster', 'fan_favourite', 'media_darling', 'family_first',
  'party_animal', 'workaholic', 'loyal', 'mercenary', 'calm', 'trickster', 'aerial_threat',
];

/** Traits that the narrative keeps half-secret — the "surprise" trait comes from these first. */
const HIDDEN_ISH: TraitId[] = [
  'big_game', 'glass_bones', 'late_bloomer', 'wonderkid', 'iron_man', 'hothead', 'clinical', 'calm',
  'trickster', 'aerial_threat', 'party_animal', 'leader', 'workaholic', 'set_piece_specialist',
];

const CONFLICTS: [TraitId, TraitId][] = [
  ['wonderkid', 'late_bloomer'], ['glass_bones', 'iron_man'], ['hothead', 'calm'], ['loyal', 'mercenary'],
  ['workaholic', 'party_animal'],
];

export function conflicts(a: TraitId, b: TraitId): boolean {
  return a === b || CONFLICTS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** The chosen trait + one random (mostly hidden-ish) compatible trait. */
export function rollTraits(rng: Rng, chosen: TraitId): TraitId[] {
  const pool = (rng.chance(0.75) ? HIDDEN_ISH : ALL_TRAITS).filter((x) => !conflicts(chosen, x));
  const extra = pool.length ? rng.pick(pool) : null;
  return extra ? [chosen, extra] : [chosen];
}

const BASE_QUALITY: Record<PlayablePosition, number> = { ST: 55, W: 55, AM: 55, CM: 54, FB: 54, CB: 54 };

/** Starting overall (52–58) and hidden potential (70–95, most 76–88), adjusted by traits. */
export function rollTalent(rng: Rng, position: PlayablePosition, traits: TraitId[]): { quality: number; potential: number } {
  let quality = BASE_QUALITY[position] + rng.int(-3, 3);
  let potential: number;
  if (rng.chance(0.07)) potential = rng.int(89, 95);          // generational
  else if (rng.chance(0.06)) potential = rng.int(70, 75);     // journeyman
  else potential = Math.round(rng.normal(82, 3.6));
  if (traits.includes('wonderkid')) { potential += rng.int(3, 6); quality += 2; potential = Math.max(potential, 84); }
  if (traits.includes('late_bloomer')) { potential += rng.int(1, 4); quality -= 2; potential = Math.max(potential, 78); }
  return { quality: clamp(quality, 52, 58), potential: clamp(potential, 70, 95) };
}

export function createUserFootballer(rng: Rng, world: World, opts: NewCareerOptions, season: number): Footballer {
  const traits = rollTraits(rng, opts.trait);
  const { quality, potential } = rollTalent(rng, opts.position, traits);
  const p = worldApi.generateFootballer(rng, {
    id: USER_ID, nation: opts.nation, position: opts.position, age: 17, season, quality, potential, clubId: null,
  });
  const nickname = opts.nickname?.trim();
  Object.assign(p, {
    id: USER_ID,
    firstName: opts.firstName.trim() || p.firstName,
    lastName: opts.lastName.trim() || p.lastName,
    nation: opts.nation,
    position: opts.position,
    foot: opts.foot,
    appearance: { ...opts.appearance },
    birthYear: season - 17,
    potential,
    traits,
    isUser: true,
    clubId: null,
    contract: null,
    injury: null,
    shirtNumber: 0,
    form: 55,
    fitness: 92,
    morale: 70,
    retired: false,
  } satisfies Partial<Footballer>);
  if (nickname) p.nickname = nickname.slice(0, 24); else delete p.nickname;
  try { p.value = career.marketValue(p, season); } catch { /* keep generated value */ }
  world.players[p.id] = p;
  return p;
}

const clubLeagueStrength = (world: World, club: Club) =>
  world.leagues.find((l) => l.country === club.country && l.tier === club.tier)?.strength ?? 50;

/**
 * Rival: 16–19, same position group, high potential, at a club in one of the strongest
 * leagues (never one of the user's trial clubs). Generated if the world has nobody fitting.
 */
export function chooseRival(rng: Rng, state: GameState, userPos: Position, exclude: string[]): Footballer {
  const { world, season } = state;
  const group = positionGroup(userPos);
  const clubs = Object.values(world.clubs).filter((c) => !exclude.includes(c.id));
  const strongLeagues = world.leagues.filter((l) => l.tier === 1).sort((a, b) => b.strength - a.strength).slice(0, 5);
  const topLeagueClubs = clubs.filter((c) => strongLeagues.some((l) => l.country === c.country && l.tier === c.tier));
  const strong = clubs.filter((c) => c.tier === 1).sort((a, b) => clubLeagueStrength(world, b) - clubLeagueStrength(world, a));
  const playersOf = (cs: Club[]) => cs.flatMap((c) => c.squad.map((id) => world.players[id]).filter((p): p is Footballer => !!p && !p.isUser && !p.retired));
  const fits = (p: Footballer, lo: number, hi: number, sameGroup: boolean) => {
    const a = age(p, season);
    return a >= lo && a <= hi && p.position !== 'GK' && (!sameGroup || positionGroup(p.position) === group);
  };
  let pool = playersOf(topLeagueClubs).filter((p) => fits(p, 16, 19, true));
  if (!pool.length) pool = playersOf(strong).filter((p) => fits(p, 16, 21, true));
  if (!pool.length) pool = playersOf(clubs).filter((p) => fits(p, 16, 21, false));

  let rival: Footballer;
  if (pool.length) {
    pool.sort((a, b) => b.potential - a.potential);
    const top = pool.slice(0, 6);
    rival = rng.weighted(top, (p) => p.potential - 60);
  } else {
    const host = strong[0] ?? clubs[0];
    rival = worldApi.generateFootballer(rng, {
      id: nextId(state, 'RIV'), nation: host?.country ?? 'ENG', position: userPos, age: rng.int(17, 18), season,
      quality: rng.int(58, 63), potential: rng.int(85, 92), clubId: host?.id ?? null,
    });
    world.players[rival.id] = rival;
    if (host) host.squad.push(rival.id);
  }
  // A rival should be a genuine threat.
  if (rival.potential < 82) rival.potential = rng.int(82, 90);
  return rival;
}

/** Hometown: a city of the nation (cities with a club are favoured); hometownClubId if one plays there. */
export function chooseHometown(rng: Rng, world: World, nation: NationCode): { city: string; clubId: string | null } {
  let cities: string[] = [];
  let league: string | undefined;
  try {
    const def = worldApi.getNation(nation);
    cities = def.cities ?? [];
    league = def.league;
  } catch { /* unknown nation */ }
  const clubsIn = (city: string) => Object.values(world.clubs)
    .filter((c) => c.city === city && (!league || c.country === league))
    .sort((a, b) => a.tier - b.tier || b.reputation - a.reputation);
  if (!cities.length) {
    const local = Object.values(world.clubs).filter((c) => c.country === league);
    cities = [...new Set(local.map((c) => c.city))];
  }
  if (!cities.length) return { city: t('game.genesis.unknownTown'), clubId: null };
  const city = rng.weighted(cities, (c) => (clubsIn(c).length ? 3 : 1));
  return { city, clubId: clubsIn(city)[0]?.id ?? null };
}

export function clubInCity(world: World, city: string): string | null {
  const c = Object.values(world.clubs).filter((x) => x.city === city).sort((a, b) => a.tier - b.tier || b.reputation - a.reputation)[0];
  return c?.id ?? null;
}

export function startingRelationships(traits: TraitId[]): Relationships {
  const r: Relationships = { manager: 50, teammates: 50, fans: 30, media: 35, family: 75, partner: 0, agent: 60, sponsors: 15 };
  if (traits.includes('family_first')) r.family = 88;
  if (traits.includes('media_darling')) r.media = 48;
  if (traits.includes('fan_favourite')) r.fans = 42;
  if (traits.includes('leader')) r.teammates = 56;
  if (traits.includes('hothead')) r.media = 28;
  return r;
}

type NarratorGenesis = Awaited<ReturnType<Narrator['genesis']>>;

/** Hard-coded last resort when no narrator responds. */
export function fallbackGenesis(rng: Rng, input: GenesisInput): NarratorGenesis {
  const nm = () => {
    try { return worldApi.randomName(rng, input.nation); } catch { return { first: t('game.genesis.parentName'), last: input.lastName }; }
  };
  const father = nm();
  const agent = nm();
  return {
    hometown: input.hometownHint,
    backstory: t('game.genesis.backstory', { first: input.firstName, town: input.hometownHint, pos: input.positionName }),
    motto: t('game.genesis.motto'),
    dream: t('game.genesis.dream'),
    theme: input.seedFlavor,
    destinyHint: t('game.genesis.destiny'),
    family: [{ name: `${father.first} ${input.lastName}`, role: 'father', personality: t('game.genesis.fatherPersonality'), bio: t('game.genesis.fatherBio') }],
    agent: { name: `${agent.first} ${agent.last}`, personality: t('game.genesis.agentPersonality'), bio: t('game.genesis.agentBio') },
    rivalBlurb: t('game.genesis.rivalBlurb', { rival: input.rivalName, club: input.rivalClub }),
    mentorBlurb: '',
    ai: false,
  };
}

/** Narrator output → CareerGenesis with Person ids (goals filled later). */
export function buildGenesis(
  state: GameState, rng: Rng, g: NarratorGenesis, hometown: { city: string; clubId: string | null }, fallbackSurname: string,
): CareerGenesis {
  const str = (v: unknown, fb: string) => (typeof v === 'string' && v.trim() ? v.trim() : fb);
  const familyRaw = Array.isArray(g.family) ? g.family.slice(0, 4) : [];
  const family: Person[] = familyRaw
    .filter((f) => f && typeof f.name === 'string')
    .map((f) => ({
      id: nextId(state, 'PER'),
      name: f.name.trim(),
      role: f.role === 'mother' || f.role === 'sibling' ? f.role : 'father',
      personality: str(f.personality, ''),
      bio: str(f.bio, ''),
      relationship: rng.int(62, 88),
    }));
  if (!family.length) {
    family.push({
      id: nextId(state, 'PER'), name: `${t('game.genesis.parentName')} ${fallbackSurname}`, role: 'father',
      personality: t('game.genesis.fatherPersonality'), bio: t('game.genesis.fatherBio'), relationship: 78,
    });
  }
  const agent: Person = {
    id: nextId(state, 'PER'),
    name: str(g.agent?.name, t('game.genesis.agentFallbackName')),
    role: 'agent',
    personality: str(g.agent?.personality, t('game.genesis.agentPersonality')),
    bio: str(g.agent?.bio, t('game.genesis.agentBio')),
    relationship: rng.int(55, 72),
  };
  const town = str(g.hometown, hometown.city);
  return {
    hometown: town,
    hometownClubId: town === hometown.city ? hometown.clubId : clubInCity(state.world, town),
    backstory: str(g.backstory, ''),
    motto: str(g.motto, t('game.genesis.motto')),
    dream: str(g.dream, t('game.genesis.dream')),
    theme: str(g.theme, ''),
    destinyHint: str(g.destinyHint, t('game.genesis.destiny')),
    family,
    agent,
    rivalBlurb: str(g.rivalBlurb, ''),
    mentorBlurb: str(g.mentorBlurb, ''),
    goals: [],
    ai: !!g.ai,
  };
}

export function isGenesis(v: NarratorGenesis | null | undefined): boolean {
  return !!v && typeof v.backstory === 'string' && !!v.agent && typeof v.agent.name === 'string';
}
