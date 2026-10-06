/**
 * Small shared helpers for the competition module: hashing, deterministic sub-RNGs,
 * localization shortcuts, user lookups, nation/continent data with safe fallbacks.
 */
import type { Club, Competition, Footballer, GameState, NationalTeam, TableRow } from '../core/types';
import { Rng } from '../core/rng';
import { t } from '../core/i18n';
import { getNation } from '../world/api';
import './strings';

/** FNV-1a 32-bit hash of a string. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic Rng derived from the save seed + some labels (for functions without an rng param). */
export function derivedRng(state: Pick<GameState, 'seed'>, ...parts: (string | number)[]): Rng {
  return new Rng(hashStr(`${state.seed}|${parts.join('|')}`));
}

/** Deterministic noise in [-1, 1] for a label. */
export function hashNoise(...parts: (string | number)[]): number {
  return (hashStr(parts.join('|')) / 4294967295) * 2 - 1;
}

/** Localized string from the 'comp' namespace in the save's narrative language. */
export function ct(state: Pick<GameState, 'lang'>, key: string, params?: Record<string, string | number>): string {
  return t(`comp.${key}`, params, state.lang ?? 'tr');
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function emptyRow(teamId: string): TableRow {
  return { teamId, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, form: [] };
}

export const isNationalId = (id: string) => id.startsWith('NT-');

export function userFootballer(state: GameState): Footballer | null {
  return state.world.players[state.career?.playerId] ?? null;
}

export function userId(state: GameState): string | null {
  return state.career?.playerId ?? null;
}

export function userClubId(state: GameState): string | null {
  const u = userFootballer(state);
  return u && !u.retired ? u.clubId : null;
}

/** The user's national team id, only while called up. */
export function userNationalTeamId(state: GameState): string | null {
  if (!state.career?.calledUp) return null;
  const u = userFootballer(state);
  return state.career.nationalTeamId ?? (u ? `NT-${u.nation}` : null);
}

export function isUserTeam(state: GameState, teamId: string): boolean {
  return teamId === userClubId(state) || teamId === userNationalTeamId(state);
}

export function shortPlayerName(p: Footballer | undefined): string {
  if (!p) return '?';
  return p.nickname || p.lastName || p.firstName;
}

export function fullPlayerName(p: Footballer | undefined): string {
  if (!p) return '?';
  return p.nickname ? p.nickname : `${p.firstName} ${p.lastName}`;
}

export function teamName(state: GameState, teamId: string): string {
  const club: Club | undefined = state.world.clubs[teamId];
  if (club) return club.name;
  const nt: NationalTeam | undefined = state.world.nationalTeams[teamId];
  if (nt) return nt.name[state.lang] ?? nt.name.en;
  return teamId;
}

export function teamShort(state: GameState, teamId: string): string {
  const club = state.world.clubs[teamId];
  if (club) return club.shortName;
  const nt = state.world.nationalTeams[teamId];
  if (nt) return nt.nation;
  return teamId.slice(0, 3).toUpperCase();
}

export function teamReputation(state: GameState, teamId: string): number {
  return state.world.clubs[teamId]?.reputation ?? state.world.nationalTeams[teamId]?.reputation ?? 50;
}

// ───────── nations & continents ─────────

export type Continent = 'EU' | 'SA' | 'AF' | 'AS' | 'NA' | 'OC';

const CONTINENT_FALLBACK: Record<string, Continent> = {};
(
  [
    ['EU', 'ENG ESP ITA GER FRA POR NED TUR BEL SUI AUT DEN SWE NOR SCO WAL IRL NIR CRO SRB POL UKR CZE GRE RUS HUN ROU SVK SVN BIH ALB MKD ISL FIN BUL GEO MNE'],
    ['SA', 'BRA ARG URU COL CHI PER ECU PAR VEN BOL'],
    ['AF', 'NGA SEN CIV GHA MAR EGY ALG CMR TUN MLI RSA BFA COD GUI'],
    ['AS', 'JPN KOR AUS IRN KSA QAT CHN UZB IRQ UAE JOR'],
    ['NA', 'USA MEX CAN CRC JAM PAN HON'],
    ['OC', 'NZL'],
  ] as [Continent, string][]
).forEach(([c, codes]) => codes.split(' ').forEach((code) => { CONTINENT_FALLBACK[code] = c; }));

const continentCache = new Map<string, Continent>();

export function continentOf(nation: string): Continent {
  const cached = continentCache.get(nation);
  if (cached) return cached;
  let c: Continent = CONTINENT_FALLBACK[nation] ?? 'EU';
  try {
    const def = getNation(nation);
    if (def?.continent) c = def.continent;
  } catch {
    /* world data not available (tests / stub) → fallback table */
  }
  continentCache.set(nation, c);
  return c;
}

/** Localized nation name: national team name if present, else world data, else the code. */
export function nationName(state: GameState, code: string): string {
  const nt = state.world.nationalTeams[`NT-${code}`];
  if (nt) return nt.name[state.lang] ?? nt.name.en;
  try {
    const def = getNation(code);
    if (def) return def.name[state.lang] ?? def.name.en;
  } catch {
    /* fallback */
  }
  return code;
}

export function compsOfSeason(state: GameState, season = state.season): Competition[] {
  return Object.values(state.competitions).filter((c) => c.season === season);
}

/** Largest power of two ≤ n (n ≥ 1). */
export function floorPow2(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}
