/**
 * WORLD module — static data (nations, leagues, fictional clubs, name pools) and
 * procedural world generation. Owner: world agent. Other modules import ONLY from here.
 *
 * All club names are FICTIONAL (real cities, invented clubs) — never real club names.
 *
 * Layout: data/ (hand-written seeds) · leagues.ts · nations.ts · strings.ts (i18n 'world') ·
 * gen/ (names, appearance, footballers, managers, squads, world, youth, start clubs).
 */
import type {
  Appearance, Club, CountryCode, Footballer, LeagueDef, Manager, NationCode, NationalTeam, PlayablePosition,
  Position, TacticalStyle, World,
} from '../core/types';
import type { Rng } from '../core/rng';
import { t } from '../core/i18n';
import './strings';
import { randomAppearance as appearanceFor } from './gen/appearance';
import { generateFootballer as footballerFor, marketValueOf, weeklyWage } from './gen/footballer';
import { generateManager as managerFor } from './gen/manager';
import { randomName as nameFor } from './gen/names';
import { generateYouthIntake as youthFor } from './gen/youth';
import { generateWorld as worldFor, externalClubLabel, refreshNationalTeams as refreshTeams } from './gen/worldgen';
import { nationalTeamOf as nationalTeamFor, pickStartingClubs as startingClubsFor, positionName as positionNameFor } from './gen/start';
import type { FootballerGenOptions, NationDef, WorldGenOptions } from './types';

export type { FootballerGenOptions, NationDef, WorldGenOptions } from './types';
export { LEAGUES, COUNTRIES, getLeague } from './leagues';
export { NATIONS, getNation, findNation } from './nations';
export { marketValueOf, weeklyWage, externalClubLabel };

/**
 * Build the whole world: every league's clubs (with kits, stadiums, budgets, styles,
 * formations, derbies), full squads (24 players per club with a sensible position
 * distribution and quality matching club reputation and league strength), managers
 * (+ free managers), national teams (squads built from the world's players of that nation
 * plus generated "abroad" players registered in `externalClubs`). Club ids are stable
 * strings like 'ENG-1-03'. The user's player is NOT created here.
 * Deterministic for a given rng state and fast (< 300 ms).
 */
export function generateWorld(rng: Rng, opts: WorldGenOptions): World {
  return worldFor(rng, opts);
}

/**
 * Re-select every national squad from the current world (call after season-end retirements):
 * the nation's best players per position, topped up with generated "abroad" players
 * (registered in `world.externalClubs`) so each squad stays at 23.
 */
export function refreshNationalTeams(rng: Rng, world: World, season: number): void {
  refreshTeams(rng, world, season);
}

/** Culturally appropriate random name for a nation. */
export function randomName(rng: Rng, nation: NationCode): { first: string; last: string } {
  return nameFor(rng, nation);
}

/** Create one footballer with coherent attributes for the position (overall within ±1 of `quality`). */
export function generateFootballer(rng: Rng, opts: FootballerGenOptions): Footballer {
  return footballerFor(rng, opts);
}

/** Nation-appropriate look; pass `position` / `age` to get a matching height (optional). */
export function randomAppearance(rng: Rng, nation: NationCode, position?: Position, age?: number): Appearance {
  return appearanceFor(rng, nation, position, age);
}

/** `opts.style` biases the tactical philosophy (e.g. the club's style); `opts.youthHint` anchors `trustsYouth`. */
export function generateManager(
  rng: Rng, id: string, nation: NationCode, season: number, reputation: number,
  opts?: { style?: TacticalStyle; youthHint?: number; clubId?: string | null },
): Manager {
  return managerFor(rng, id, nation, season, reputation, opts);
}

/** Academy graduates (2–4 players aged 16–18) for a club at season start. ids via `makeId`. */
export function generateYouthIntake(rng: Rng, world: World, club: Club, season: number, makeId: () => string): Footballer[] {
  return youthFor(rng, world, club, season, makeId);
}

/**
 * Three trial clubs for a new career: modest clubs (mostly tier 2, maybe a weak tier 1)
 * — at least one in the user's nation league when the nation has one in the game.
 */
export function pickStartingClubs(world: World, rng: Rng, userNation: NationCode): string[] {
  return startingClubsFor(world, rng, userNation);
}

/** The national team of a nation (if it exists in the world). */
export function nationalTeamOf(world: World, nation: NationCode): NationalTeam | null {
  return nationalTeamFor(world, nation);
}

/** Localized position names: long ('Forvet', 'Striker') or short ('FV', 'ST'). */
export function positionName(pos: Position | PlayablePosition, short?: boolean): string {
  return positionNameFor(pos, short);
}

/** Localized tactical style name, e.g. 'Kontra Atak'. */
export function styleName(style: TacticalStyle): string {
  return t(`world.style.${style}`);
}

/** Localized manager temperament name. */
export function temperamentName(temperament: Manager['temperament']): string {
  return t(`world.temper.${temperament}`);
}

export type { CountryCode, LeagueDef };
