/**
 * Small private helpers shared by the career module: user lookup, calendar maths,
 * deterministic hashing, squad/formation analysis, localized text filling.
 */
import './strings';
import type {
  Club, Fixture, Footballer, Formation, GameState, Lang, Localized, NationalTeam, Position, TraitId,
} from '../core/types';
import { age as ageOf, clamp } from '../core/util';
import { overall } from '../core/ratings';

export const WEEKS_PER_SEASON = 52;
/** Last week with club fixtures; after it the season counts as finished. */
export const SEASON_END_WEEK = 44;

// ───────── user ─────────

export function userPlayer(state: GameState): Footballer {
  const p = state.world.players[state.career.playerId];
  if (!p) throw new Error(`career: user player ${state.career.playerId} missing from world`);
  return p;
}

export function userAge(state: GameState): number {
  return ageOf(userPlayer(state), state.season);
}

export function hasTrait(p: Pick<Footballer, 'traits'>, t: TraitId): boolean {
  return p.traits.includes(t);
}

// ───────── calendar ─────────

/** Linear week index (safe for differences across seasons). */
export const weekIndex = (season: number, week: number) => season * WEEKS_PER_SEASON + week;
export const nowIndex = (state: GameState) => weekIndex(state.season, state.week);

/** Convert an absolute `season*100+week` value to a linear week index. */
export function absToIndex(abs: number): number {
  return weekIndex(Math.floor(abs / 100), abs % 100);
}

/** `season*100+week` of the week `n` weeks after (season, week). */
export function absAfter(season: number, week: number, n: number): number {
  let s = season;
  let w = week + n;
  while (w >= WEEKS_PER_SEASON) { w -= WEEKS_PER_SEASON; s += 1; }
  return s * 100 + w;
}

/**
 * Transfer windows (tolerant ±1 week around the calendar's windows: winter ~21..25,
 * summer 45..51 + 0..3 of the next season).
 */
export function isTransferWindowWeek(week: number): boolean {
  return week <= 4 || (week >= 20 && week <= 26) || week >= SEASON_END_WEEK;
}

/** Stable id of the transfer window containing (season, week). */
export function windowKey(season: number, week: number): string {
  if (week <= 4) return `S${season - 1}`;
  if (week >= SEASON_END_WEEK) return `S${season}`;
  return `W${season}`;
}

/** The season a contract signed now would start in. */
export function contractStartSeason(state: GameState): number {
  return state.week >= SEASON_END_WEEK ? state.season + 1 : state.season;
}

/** Seasons left on the current contract (fractional, from now). */
export function seasonsLeft(state: GameState, p: Footballer): number {
  if (!p.contract) return 0;
  return p.contract.endSeason + 1 - (state.season + Math.min(state.week, SEASON_END_WEEK) / SEASON_END_WEEK);
}

// ───────── determinism ─────────

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pseudo-random number in [0,1) from a string. */
export const hash01 = (s: string) => hashStr(s) / 4294967296;

export const round1 = (v: number) => Math.round(v * 10) / 10;
export const round2 = (v: number) => Math.round(v * 100) / 100;

/** Round money to a "nice" figure. */
export function niceMoney(v: number): number {
  const a = Math.abs(v);
  const step = a >= 10_000_000 ? 100_000 : a >= 1_000_000 ? 50_000 : a >= 100_000 ? 5_000 : a >= 10_000 ? 500 : a >= 1_000 ? 50 : 10;
  return Math.round(v / step) * step;
}

// ───────── localized text ─────────

export function fill(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  let out = s;
  for (const k of Object.keys(params)) out = out.split(`{${k}}`).join(String(params[k]));
  return out;
}

export function loc(l: Localized, lang: Lang, params?: Record<string, string | number>): string {
  return fill(l[lang] ?? l.en, params);
}

// ───────── clubs, squads, formations ─────────

export function clubOf(state: GameState, id: string | null | undefined): Club | null {
  return id ? state.world.clubs[id] ?? null : null;
}

export function playersOf(state: GameState, ids: readonly string[]): Footballer[] {
  const out: Footballer[] = [];
  for (const id of ids) {
    const p = state.world.players[id];
    if (p && !p.retired) out.push(p);
  }
  return out;
}

/** Average overall of the club's best 14 players: "what level is this club?". */
export function clubLevel(state: GameState, clubId: string, excludeId?: string): number {
  const club = state.world.clubs[clubId];
  if (!club) return 50;
  const ovrs = playersOf(state, club.squad)
    .filter((p) => p.id !== excludeId)
    .map((p) => overall(p))
    .sort((a, b) => b - a)
    .slice(0, 14);
  if (!ovrs.length) return Math.round(35 + club.reputation * 0.5);
  return ovrs.reduce((a, b) => a + b, 0) / ovrs.length;
}

/** Starting slots per position for each formation. */
export const FORMATION_SLOTS: Record<Formation, Partial<Record<Position, number>>> = {
  '4-3-3': { GK: 1, CB: 2, FB: 2, DM: 1, CM: 2, W: 2, ST: 1 },
  '4-4-2': { GK: 1, CB: 2, FB: 2, CM: 2, W: 2, ST: 2 },
  '4-2-3-1': { GK: 1, CB: 2, FB: 2, DM: 2, AM: 1, W: 2, ST: 1 },
  '3-5-2': { GK: 1, CB: 3, FB: 2, DM: 1, CM: 2, ST: 2 },
  '5-3-2': { GK: 1, CB: 3, FB: 2, CM: 3, ST: 2 },
  '4-1-4-1': { GK: 1, CB: 2, FB: 2, DM: 1, CM: 2, W: 2, ST: 1 },
};

/** Where a player of a position plays when the formation has no slot for it. */
const ADAPT: Record<Position, Position[]> = {
  GK: [], CB: ['FB'], FB: ['CB', 'W'], DM: ['CM', 'CB'], CM: ['DM', 'AM'], AM: ['CM', 'W', 'ST'], W: ['AM', 'ST', 'FB'], ST: ['W', 'AM'],
};

export function slotTarget(formation: Formation, pos: Position): { target: Position; slots: number } {
  const table = FORMATION_SLOTS[formation] ?? FORMATION_SLOTS['4-3-3'];
  const direct = table[pos] ?? 0;
  if (direct > 0) return { target: pos, slots: direct };
  for (const alt of ADAPT[pos]) {
    const n = table[alt] ?? 0;
    if (n > 0) return { target: alt, slots: n };
  }
  return { target: pos, slots: 1 };
}

export function nationalTeamOfNation(state: GameState, nation: string): NationalTeam | null {
  for (const nt of Object.values(state.world.nationalTeams)) if (nt.nation === nation) return nt;
  return null;
}

/** Display name of a club or national team id. */
export function teamName(state: GameState, id: string): string {
  const club = state.world.clubs[id];
  if (club) return club.name;
  const nt = state.world.nationalTeams[id];
  if (nt) return nt.name[state.lang] ?? nt.name.en;
  return id;
}

export function findFixture(state: GameState, fixtureId: string): Fixture | null {
  for (const comp of Object.values(state.competitions)) {
    for (const f of comp.fixtures) if (f.id === fixtureId) return f;
  }
  return null;
}

/**
 * 0..1 "how big is this game": continental/international nights, finals, derbies,
 * glamour opponents.
 */
export function fixtureImportance(state: GameState, fixture: Fixture, userTeamId: string | null): number {
  const comp = state.competitions[fixture.compId];
  let imp = 0.45;
  if (comp?.kind === 'continental') imp = 0.8;
  if (comp?.kind === 'international') imp = 0.75;
  if (comp?.kind === 'cup') imp = 0.5;
  const rn = (fixture.roundName ?? '').toLowerCase();
  if (/final/.test(rn) && !/quarter|çeyrek|semi|yarı/.test(rn)) imp = Math.max(imp, 1);
  else if (/semi|yarı/.test(rn)) imp = Math.max(imp, 0.9);
  else if (/quarter|çeyrek/.test(rn)) imp = Math.max(imp, 0.75);
  if (userTeamId) {
    const opp = fixture.homeId === userTeamId ? fixture.awayId : fixture.homeId;
    const club = state.world.clubs[userTeamId];
    if (club?.derbyRivals.includes(opp)) imp = Math.max(imp, 0.9);
    const oppClub = state.world.clubs[opp];
    if (oppClub && club && oppClub.reputation >= 85 && oppClub.reputation > club.reputation + 5) imp = Math.max(imp, 0.7);
  }
  return clamp(imp, 0, 1);
}

export function isDerby(state: GameState, fixture: Fixture, userTeamId: string | null): boolean {
  if (!userTeamId) return false;
  const club = state.world.clubs[userTeamId];
  const opp = fixture.homeId === userTeamId ? fixture.awayId : fixture.homeId;
  return !!club?.derbyRivals.includes(opp);
}

/** Flag helpers (career keys are prefixed). */
export function getFlagNum(state: GameState, key: string, dflt = 0): number {
  const v = state.flags[key];
  return typeof v === 'number' ? v : dflt;
}
