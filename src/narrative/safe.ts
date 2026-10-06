/**
 * Defensive bridges to other modules. The narrator must never crash the game, so every
 * cross-module call goes through `safe` with a local fallback computed straight from state.
 */
import type { Club, CountryCode, Footballer, GameState, Lang, Manager, Position } from '../core/types';
import { overall } from '../core/ratings';
import * as world from '../world/api';
import * as competition from '../competition/api';

export function safe<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

export function userOf(state: GameState): Footballer | null {
  return state.world?.players?.[state.career?.playerId] ?? null;
}

export function clubOf(state: GameState, id: string | null | undefined): Club | null {
  if (!id) return null;
  return state.world?.clubs?.[id] ?? null;
}

export function managerOf(state: GameState, club: Club | null): Manager | null {
  if (!club) return null;
  return state.world?.managers?.[club.managerId] ?? null;
}

export function ovr(p: Footballer): number {
  return safe(() => overall(p), 50);
}

const NATION_NAMES: Record<string, [string, string]> = {
  TUR: ['Türkiye', 'Türkiye'], ENG: ['İngiltere', 'England'], ESP: ['İspanya', 'Spain'], ITA: ['İtalya', 'Italy'],
  GER: ['Almanya', 'Germany'], FRA: ['Fransa', 'France'], POR: ['Portekiz', 'Portugal'], NED: ['Hollanda', 'Netherlands'],
  BRA: ['Brezilya', 'Brazil'], ARG: ['Arjantin', 'Argentina'], URU: ['Uruguay', 'Uruguay'], COL: ['Kolombiya', 'Colombia'],
  NGA: ['Nijerya', 'Nigeria'], SEN: ['Senegal', 'Senegal'], CIV: ['Fildişi Sahili', 'Ivory Coast'], GHA: ['Gana', 'Ghana'],
  MAR: ['Fas', 'Morocco'], EGY: ['Mısır', 'Egypt'], ALG: ['Cezayir', 'Algeria'], CMR: ['Kamerun', 'Cameroon'],
  JPN: ['Japonya', 'Japan'], KOR: ['Güney Kore', 'South Korea'], USA: ['ABD', 'USA'], MEX: ['Meksika', 'Mexico'],
  CRO: ['Hırvatistan', 'Croatia'], SRB: ['Sırbistan', 'Serbia'], POL: ['Polonya', 'Poland'], BEL: ['Belçika', 'Belgium'],
  SUI: ['İsviçre', 'Switzerland'], AUT: ['Avusturya', 'Austria'], DEN: ['Danimarka', 'Denmark'], SWE: ['İsveç', 'Sweden'],
  NOR: ['Norveç', 'Norway'], SCO: ['İskoçya', 'Scotland'], UKR: ['Ukrayna', 'Ukraine'], CZE: ['Çekya', 'Czechia'],
  GRE: ['Yunanistan', 'Greece'],
};

export function nationName(code: string, lang: Lang): string {
  const fromWorld = safe(() => world.getNation(code).name[lang], '');
  if (fromWorld) return fromWorld;
  const local = NATION_NAMES[code];
  return local ? local[lang === 'tr' ? 0 : 1] : code;
}

const POS_NAMES: Record<Position, [string, string]> = {
  GK: ['kaleci', 'goalkeeper'], CB: ['stoper', 'centre-back'], FB: ['bek', 'full-back'], DM: ['ön libero', 'defensive midfielder'],
  CM: ['orta saha', 'central midfielder'], AM: ['on numara', 'playmaker'], W: ['kanat oyuncusu', 'winger'], ST: ['santrfor', 'striker'],
};

/** Lower-case, in-sentence position noun in the requested language (independent of UI language). */
export function positionNoun(pos: Position, lang: Lang): string {
  return POS_NAMES[pos]?.[lang === 'tr' ? 0 : 1] ?? pos;
}

export function leagueNameOf(state: GameState, club: Club | null): string {
  if (!club) return '';
  const l = state.world?.leagues?.find((x) => x.country === club.country && x.tier === club.tier);
  return l?.name ?? '';
}

/** League position computed directly from the stored table when the competition module can't answer. */
export function leaguePos(state: GameState, clubId: string | null): number | null {
  if (!clubId) return null;
  const viaApi = safe<number | null | undefined>(() => competition.leaguePosition(state, clubId), undefined);
  if (viaApi !== undefined) return viaApi;
  const table = leagueTableOf(state, clubId);
  if (!table) return null;
  const i = table.findIndex((r) => r.teamId === clubId);
  return i >= 0 ? i + 1 : null;
}

export function leagueTableOf(state: GameState, clubId: string) {
  for (const c of Object.values(state.competitions ?? {})) {
    if (c.kind !== 'league' || c.season !== state.season) continue;
    const rows = c.tables?.main;
    if (!rows || !rows.some((r) => r.teamId === clubId)) continue;
    return [...rows].sort((a, b) =>
      b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
  }
  return null;
}

export function countryOfLeagueName(name: string): CountryCode | null {
  const fromList = safe(() => world.LEAGUES.find((l) => l.name === name)?.country ?? null, null);
  return fromList ?? null;
}

/** Club or national team display name. */
export function teamName(state: GameState, teamId: string): string {
  const c = state.world?.clubs?.[teamId];
  if (c) return c.name;
  const nt = state.world?.nationalTeams?.[teamId];
  if (nt) return nt.name[state.lang] ?? nt.name.en;
  return safe(() => competition.teamInfo(state, teamId).name, teamId);
}

export function teamRep(state: GameState, teamId: string): number {
  return state.world?.clubs?.[teamId]?.reputation ?? state.world?.nationalTeams?.[teamId]?.reputation ?? 50;
}

export function playerName(p: Footballer | null | undefined): string {
  if (!p) return '';
  return p.nickname ? p.nickname : `${p.firstName} ${p.lastName}`;
}

/** Reverse lookup: localized nation name → 3-letter code (null when unknown). */
export function nationCodeFromName(name: string): string | null {
  const n = (name ?? '').trim().toLocaleLowerCase('en-GB');
  if (!n) return null;
  for (const [code, [tr, en]] of Object.entries(NATION_NAMES)) {
    if (tr.toLocaleLowerCase('tr-TR') === name.trim().toLocaleLowerCase('tr-TR') || en.toLocaleLowerCase('en-GB') === n) return code;
  }
  return null;
}

// ───────── world peek ─────────
// Narrator methods receive only a NarrativeContext, which has no club directory. buildNarrativeContext
// remembers a reference to the current clubs so lines can name the *other* party (the club making an offer).

let clubDirectory: GameState['world']['clubs'] | null = null;

export function rememberWorld(state: GameState): void {
  clubDirectory = state.world?.clubs ?? null;
}

export function clubById(id: string): Club | null {
  return clubDirectory?.[id] ?? null;
}
