/**
 * Facts: a defensive, read-only snapshot of the career that event conditions, storyline
 * triggers and text slots work from. Building it never throws, whatever state it gets.
 */
import type {
  CountryCode, Fixture, GameState, Lang, ManagerTemperament, Position, Relationships, SquadRole, TraitId,
} from '../core/types';
import { positionGroup, type PositionGroup } from '../core/ratings';
import * as competition from '../competition/api';
import { clubOf, leagueNameOf, leaguePos, managerOf, nationName, ovr, playerName, positionNoun, safe, userOf } from './safe';
import { MUSLIM_NATIONS, cultureOf, firstName as poolFirst, lastName as poolLast, type Culture } from './names';
import { rngFrom, type Slots } from './grammar';

export type Phase = 'preseason' | 'season' | 'summer';

export interface Facts {
  lang: Lang;
  season: number;
  week: number;
  abs: number;
  // player
  name: string;
  first: string;
  last: string;
  age: number;
  nation: string;
  nationName: string;
  culture: Culture;
  turkish: boolean;
  muslim: boolean;
  position: Position;
  posGroup: PositionGroup;
  posNoun: string;
  overall: number;
  potential: number;
  fame: number;
  followers: number;
  money: number;
  wage: number;
  value: number;
  form: number;
  morale: number;
  energy: number;
  injured: boolean;
  injuryWeeks: number;
  traits: TraitId[];
  rel: Relationships;
  // club
  clubId: string | null;
  clubName: string;
  clubShort: string;
  clubNick: string;
  clubCity: string;
  clubCountry: CountryCode | null;
  clubTier: 0 | 1 | 2;
  clubRep: number;
  clubRepRank: number;       // 1 = biggest club of its league
  stadium: string;
  leagueName: string;
  leaguePos: number | null;
  leagueSize: number;
  abroad: boolean;
  managerName: string;
  managerTemp: ManagerTemperament | '';
  role: SquadRole | null;
  contractEnd: number | null;
  onLoan: boolean;
  // people
  partnerName: string | null;
  agentName: string;
  fatherName: string | null;
  motherName: string | null;
  siblingName: string | null;
  rivalId: string;
  rivalName: string;
  rivalClub: string;
  rivalClubId: string | null;
  rivalGoals: number;
  rivalOverall: number;
  mentorName: string | null;
  mentorAge: number;
  mentorAtClub: boolean;
  teammate: string;
  youngster: string | null;
  youngsterId: string | null;
  hometown: string;
  hometownClubId: string | null;
  // calendar
  phase: Phase;
  transferWindow: boolean;
  intlBreak: boolean;
  tournament: boolean;
  hasFixture: boolean;
  nextOpp: string | null;
  nextOppId: string | null;
  derbyWeek: boolean;
  ramadan: boolean;
  bayram: 'ramazan' | 'kurban' | null;
  newYear: boolean;
  // numbers
  seasonApps: number;
  seasonGoals: number;
  seasonAssists: number;
  avgRating: number;
  careerGoals: number;
  careerApps: number;
  caps: number;
  trophies: number;
  lastResult: 'W' | 'D' | 'L' | null;
  lastRating: number | null;
  lastGoals: number;
  winStreak: number;
  loseStreak: number;
  calledUp: boolean;
  transferListed: boolean;
  items: number;
  sponsors: number;
  // misc
  flags: Record<string, string | number | boolean>;
  stories: Record<string, number>;   // active storyline kind → stage
  npc: (key: NpcKey) => string;
  has: (t: TraitId) => boolean;
  flag: (k: string) => string | number | boolean | undefined;
  weeksSince: (k: string) => number; // weeks since abs-week stored in a flag (Infinity if never)
}

export type NpcKey = 'firstCoach' | 'friend' | 'physio' | 'kitman' | 'journalist' | 'barber' | 'grandma';

// ───────── calendar helpers ─────────

const DAY = 86_400_000;
/** Saturday of the first weekend of August in the season's start year = week 0. */
export function weekDate(season: number, week: number): number {
  const aug1 = Date.UTC(season, 7, 1);
  const dow = new Date(aug1).getUTCDay();
  const toSat = (6 - dow + 7) % 7;
  return aug1 + (toSat + week * 7) * DAY;
}

const RAMADAN_REF = Date.UTC(2027, 1, 8);  // approx. start of Ramadan 1448 AH
const LUNAR_YEAR = 354.367 * DAY;

/** Approximate Ramadan / Eid timing for the week (used only for flavour events). */
export function islamicCalendar(season: number, week: number): { ramadan: boolean; bayram: 'ramazan' | 'kurban' | null } {
  const d = weekDate(season, week);
  const n = Math.round((d - RAMADAN_REF) / LUNAR_YEAR);
  let ramadan = false;
  let bayram: 'ramazan' | 'kurban' | null = null;
  for (const k of [n - 1, n, n + 1]) {
    const start = RAMADAN_REF + k * LUNAR_YEAR;
    const fitr = start + 29.5 * DAY;
    const adha = start + 98 * DAY;
    if (d >= start && d < fitr - 3 * DAY) ramadan = true;
    if (Math.abs(d - fitr) <= 3.5 * DAY) bayram = 'ramazan';
    if (Math.abs(d - adha) <= 3.5 * DAY) bayram = 'kurban';
  }
  return { ramadan, bayram };
}

const INTL_BREAKS = [5, 10, 15, 30, 35];
function fallbackWeekInfo(week: number) {
  return {
    phase: (week <= 2 ? 'preseason' : week <= 44 ? 'season' : 'summer') as Phase,
    transferWindow: week <= 3 || (week >= 21 && week <= 25) || week >= 45,
    internationalBreak: INTL_BREAKS.includes(week),
    tournament: false,
  };
}

function weekFixtures(state: GameState, clubId: string | null): Fixture[] {
  if (!clubId) return [];
  const out: Fixture[] = [];
  for (const c of Object.values(state.competitions ?? {})) {
    for (const fx of c.fixtures ?? []) {
      if (fx.week === state.week && fx.season === state.season && (fx.homeId === clubId || fx.awayId === clubId)) out.push(fx);
    }
  }
  return out;
}

// ───────── persistent invented NPCs ─────────

const NPC_GENDER: Record<NpcKey, 'm' | 'f'> = {
  firstCoach: 'm', friend: 'm', physio: 'f', kitman: 'm', journalist: 'f', barber: 'm', grandma: 'f',
};

/** Invented supporting characters, stable for a whole career (derived from the save seed). */
export function npcName(state: GameState, key: NpcKey, culture: Culture): string {
  const flagKey = `narr.npc.${key}`;
  const stored = state.flags?.[flagKey];
  if (typeof stored === 'string' && stored) return stored;
  const r = rngFrom(state.seed, key);
  const elder = key === 'firstCoach' || key === 'kitman' || key === 'grandma';
  const first = poolFirst(r, culture, NPC_GENDER[key], elder);
  const name = key === 'grandma' ? first : `${first} ${poolLast(r, culture)}`;
  if (state.flags) state.flags[flagKey] = name;
  return name;
}

// ───────── build ─────────

const EMPTY_REL: Relationships = { manager: 50, teammates: 50, fans: 50, media: 50, family: 50, partner: 0, agent: 50, sponsors: 50 };

export function buildFacts(state: GameState): Facts {
  const lang: Lang = state.lang === 'en' ? 'en' : 'tr';
  const season = state.season ?? 2026;
  const week = state.week ?? 0;
  const p = userOf(state);
  const career = state.career;
  const club = clubOf(state, p?.clubId ?? null);
  const mgr = managerOf(state, club);
  const players = state.world?.players ?? {};
  const people = career?.people ?? [];
  const nation = p?.nation ?? 'TUR';
  const culture = cultureOf(nation);

  const rival = career?.rivalId ? players[career.rivalId] : undefined;
  const rivalClub = clubOf(state, rival?.clubId ?? null);
  const mentor = career?.mentorId ? players[career.mentorId] : undefined;

  // teammates (deterministic per week)
  const squad = (club?.squad ?? []).filter((id) => id !== p?.id).map((id) => players[id]).filter(Boolean);
  const r = rngFrom(state.seed, season, week, 'facts');
  const mate = squad.length ? squad[Math.floor(r.next() * squad.length)] : null;
  const youngsters = squad.filter((x) => season - x.birthYear <= 19).sort((a, b) => b.potential - a.potential);
  const kid = youngsters[0] ?? null;

  const info = safe(() => {
    const wi = competition.weekInfo(season, week);
    return { phase: wi.phase as Phase, transferWindow: wi.transferWindow, internationalBreak: wi.internationalBreak, tournament: wi.tournament };
  }, fallbackWeekInfo(week));

  const fixtures = weekFixtures(state, club?.id ?? null);
  const fx = fixtures[0] ?? null;
  const oppId = fx ? (fx.homeId === club?.id ? fx.awayId : fx.homeId) : null;
  const opp = oppId ? state.world?.clubs?.[oppId] : undefined;
  const derby = !!(club && fixtures.some((f) => club.derbyRivals?.includes(f.homeId === club.id ? f.awayId : f.homeId)));

  const isl = safe(() => islamicCalendar(season, week), { ramadan: false, bayram: null });

  const leagueClubs = club ? Object.values(state.world?.clubs ?? {}).filter((c) => c.country === club.country && c.tier === club.tier) : [];
  const repRank = club ? 1 + leagueClubs.filter((c) => c.reputation > club.reputation).length : 0;

  const matches = career?.matches ?? [];
  const last = matches[matches.length - 1];
  let winStreak = 0;
  let loseStreak = 0;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    if (m.goalsFor > m.goalsAgainst && loseStreak === 0) winStreak++;
    else if (m.goalsFor < m.goalsAgainst && winStreak === 0) loseStreak++;
    else break;
  }

  const stories: Record<string, number> = {};
  for (const s of state.storylines ?? []) if (s.active) stories[s.kind] = s.stage;

  const flags = state.flags ?? {};
  const abs = season * 52 + week; // linear week index, so "weeks since" stays honest across seasons
  const personName = (role: string) => people.find((x) => x.role === role)?.name ?? null;
  const partner = career?.partnerId ? people.find((x) => x.id === career.partnerId)?.name ?? null : null;
  const traits = p?.traits ?? [];

  const f: Facts = {
    lang, season, week, abs,
    name: playerName(p) || 'Deniz Yıldız',
    first: p?.nickname ?? p?.firstName ?? 'Deniz',
    last: p?.lastName ?? 'Yıldız',
    age: p ? season - p.birthYear : 17,
    nation,
    nationName: nationName(nation, lang),
    culture,
    turkish: nation === 'TUR',
    muslim: MUSLIM_NATIONS.has(nation),
    position: p?.position ?? 'ST',
    posGroup: positionGroup(p?.position ?? 'ST'),
    posNoun: positionNoun(p?.position ?? 'ST', lang),
    overall: p ? ovr(p) : 50,
    potential: p?.potential ?? 75,
    fame: career?.fame ?? 0,
    followers: career?.followers ?? 0,
    money: career?.money ?? 0,
    wage: p?.contract?.wage ?? 0,
    value: p?.value ?? 0,
    form: p?.form ?? 50,
    morale: p?.morale ?? 50,
    energy: career?.energy ?? 80,
    injured: !!p?.injury,
    injuryWeeks: p?.injury?.weeksLeft ?? 0,
    traits,
    rel: { ...EMPTY_REL, ...(career?.relationships ?? {}) },
    clubId: club?.id ?? null,
    clubName: club?.name ?? '',
    clubShort: club?.shortName ?? '',
    clubNick: club?.nickname ?? '',
    clubCity: club?.city ?? '',
    clubCountry: club?.country ?? null,
    clubTier: club ? club.tier : 0,
    clubRep: club?.reputation ?? 0,
    clubRepRank: repRank,
    stadium: club?.stadium?.name ?? '',
    leagueName: leagueNameOf(state, club),
    leaguePos: leaguePos(state, club?.id ?? null),
    leagueSize: leagueClubs.length,
    abroad: !!club && club.country !== nation,
    managerName: mgr ? `${mgr.firstName} ${mgr.lastName}` : '',
    managerTemp: mgr?.temperament ?? '',
    role: p?.contract?.role ?? null,
    contractEnd: p?.contract?.endSeason ?? null,
    onLoan: !!p?.contract?.loan,
    partnerName: partner,
    agentName: personName('agent') ?? career?.genesis?.agent?.name ?? '',
    fatherName: personName('father'),
    motherName: personName('mother'),
    siblingName: personName('sibling'),
    rivalId: career?.rivalId ?? '',
    rivalName: playerName(rival) || '',
    rivalClub: rivalClub?.name ?? (rival ? state.world?.externalClubs?.[rival.id] ?? '' : ''),
    rivalClubId: rivalClub?.id ?? null,
    rivalGoals: rival?.season?.goals ?? 0,
    rivalOverall: rival ? ovr(rival) : 0,
    mentorName: mentor ? playerName(mentor) : null,
    mentorAge: mentor ? season - mentor.birthYear : 0,
    mentorAtClub: !!(mentor && club && mentor.clubId === club.id),
    teammate: mate ? playerName(mate) : '',
    youngster: kid ? playerName(kid) : null,
    youngsterId: kid?.id ?? null,
    hometown: career?.genesis?.hometown ?? '',
    hometownClubId: career?.genesis?.hometownClubId ?? null,
    phase: info.phase,
    transferWindow: info.transferWindow,
    intlBreak: info.internationalBreak,
    tournament: info.tournament,
    hasFixture: fixtures.length > 0,
    nextOpp: opp?.name ?? null,
    nextOppId: oppId,
    derbyWeek: derby,
    ramadan: isl.ramadan,
    bayram: isl.bayram,
    newYear: week === 21 || week === 22,
    seasonApps: p?.season?.apps ?? 0,
    seasonGoals: p?.season?.goals ?? 0,
    seasonAssists: p?.season?.assists ?? 0,
    avgRating: p && p.season?.apps ? p.season.ratingSum / p.season.apps : 0,
    careerGoals: p?.career?.goals ?? 0,
    careerApps: p?.career?.apps ?? 0,
    caps: p?.intlCaps ?? 0,
    trophies: career?.trophies?.length ?? 0,
    lastResult: last ? (last.goalsFor > last.goalsAgainst ? 'W' : last.goalsFor < last.goalsAgainst ? 'L' : 'D') : null,
    lastRating: last?.rating ?? null,
    lastGoals: last?.goals ?? 0,
    winStreak,
    loseStreak,
    calledUp: !!career?.calledUp,
    transferListed: !!career?.transferListed,
    items: career?.inventory?.length ?? 0,
    sponsors: career?.sponsors?.length ?? 0,
    flags,
    stories,
    npc: (key) => npcName(state, key, culture),
    has: (t) => traits.includes(t),
    flag: (k) => flags[k],
    weeksSince: (k) => {
      const v = flags[k];
      return typeof v === 'number' ? abs - v : Infinity;
    },
  };
  return f;
}

/** Wealth-scaled amount: at least `min`, otherwise `weeks` of wages, rounded to a tidy figure. */
export function cash(f: Facts, min: number, weeks = 1): number {
  const v = Math.max(min, f.wage * weeks);
  const mag = Math.pow(10, Math.max(2, Math.floor(Math.log10(v)) - 1));
  return Math.round(v / mag) * mag;
}

/** Common text slots derived from facts. Event-specific slots are merged on top. */
export function baseSlots(f: Facts): Slots {
  const tr = f.lang === 'tr';
  return {
    player: f.name,
    first: f.first,
    last: f.last,
    nation: f.nationName,
    pos: f.posNoun,
    club: f.clubName || (tr ? 'kulübün' : 'your club'),
    clubNick: f.clubNick || f.clubName,
    city: f.clubCity || f.hometown,
    stadium: f.stadium,
    league: f.leagueName,
    manager: f.managerName || (tr ? 'hocan' : 'the gaffer'),
    rival: f.rivalName || (tr ? 'ezeli rakibin' : 'your old rival'),
    rivalClub: f.rivalClub || (tr ? 'rakip kulüp' : 'his club'),
    mentor: f.mentorName ?? (tr ? 'takımın kaptanı' : 'the captain'),
    partner: f.partnerName ?? '',
    agent: f.agentName || (tr ? 'menajerin' : 'your agent'),
    father: f.fatherName ?? (tr ? 'baban' : 'your dad'),
    mother: f.motherName ?? (tr ? 'annen' : 'your mum'),
    sibling: f.siblingName ?? (tr ? 'kardeşin' : 'your brother'),
    teammate: f.teammate || (tr ? 'bir takım arkadaşın' : 'a teammate'),
    youngster: f.youngster ?? (tr ? 'altyapıdan gelen çocuk' : 'the academy kid'),
    hometown: f.hometown || (tr ? 'memleket' : 'home'),
    opp: f.nextOpp ?? (tr ? 'rakip' : 'the opposition'),
    goals: f.seasonGoals,
    age: f.age,
    coach: f.npc('firstCoach'),
    friend: f.npc('friend'),
    physio: f.npc('physio'),
    kitman: f.npc('kitman'),
    journo: f.npc('journalist'),
    grandma: f.npc('grandma'),
  };
}
