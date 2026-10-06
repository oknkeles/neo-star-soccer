import type { Appearance, NationCode, Position } from '../../core/types';
import type { Rng } from '../../core/rng';
import { findNation } from '../nations';

type Skin6 = [number, number, number, number, number, number];

/** Skin palette weights (0 lightest … 5 darkest) per nation; continent defaults below. */
const SKIN_BY_NATION: Record<string, Skin6> = {
  TUR: [10, 36, 38, 13, 3, 0], ENG: [52, 24, 8, 6, 6, 4], FRA: [38, 22, 12, 9, 10, 9], NED: [58, 20, 7, 5, 6, 4],
  POR: [34, 42, 14, 5, 3, 2], BEL: [60, 18, 7, 5, 5, 5], GER: [62, 24, 7, 3, 3, 1], SUI: [60, 24, 8, 4, 3, 1],
  ESP: [28, 46, 20, 4, 1, 1], ITA: [26, 46, 24, 3, 1, 0], GRE: [20, 50, 26, 4, 0, 0], BRA: [10, 22, 28, 20, 12, 8],
  ARG: [28, 40, 24, 6, 2, 0], URU: [26, 38, 24, 8, 4, 0], CHI: [24, 40, 28, 6, 2, 0], COL: [8, 22, 38, 22, 8, 2],
  ECU: [4, 18, 46, 24, 7, 1], PAR: [8, 34, 44, 12, 2, 0], MEX: [6, 20, 42, 24, 7, 1], USA: [22, 24, 16, 14, 14, 10],
  CAN: [38, 28, 12, 8, 8, 6], AUS: [42, 34, 14, 6, 3, 1], MAR: [2, 12, 40, 34, 10, 2], ALG: [2, 14, 42, 32, 9, 1],
  TUN: [2, 14, 42, 32, 9, 1], EGY: [1, 8, 32, 38, 17, 4], JPN: [20, 50, 26, 4, 0, 0], KOR: [24, 52, 20, 4, 0, 0],
  SRB: [40, 42, 15, 3, 0, 0], CRO: [46, 40, 12, 2, 0, 0], SVN: [52, 36, 10, 2, 0, 0],
};
const SKIN_BY_CONTINENT: Record<string, Skin6> = {
  EU: [38, 38, 18, 4, 1, 1], SA: [14, 30, 30, 16, 8, 2], NA: [10, 24, 36, 18, 9, 3],
  AF: [0, 0, 3, 18, 39, 40], AS: [18, 46, 28, 6, 2, 0], OC: [38, 34, 16, 7, 4, 1],
};

/** Nations where blond / ginger hair is common. */
const FAIR_HAIR = new Set(['ENG', 'SCO', 'WAL', 'IRL', 'NED', 'GER', 'DEN', 'SWE', 'NOR', 'BEL', 'POL', 'CZE', 'UKR', 'AUT', 'SUI', 'SVN']);
/** Nations with a higher share of full beards. */
const BEARDED = new Set(['TUR', 'MAR', 'ALG', 'TUN', 'EGY', 'SRB', 'CRO', 'GRE', 'URU', 'ARG', 'ITA']);

/** Nation height modifier in cm. */
const HEIGHT_MOD: Record<string, number> = {
  NED: 3, DEN: 2, NOR: 2, SWE: 2, SRB: 3, CRO: 2, POL: 1, CZE: 2, GER: 1, BEL: 1, SUI: 0, AUT: 1, SVN: 1, SEN: 2, NGA: 1,
  MLI: 1, CIV: 0, GHA: 0, MAR: -1, ALG: -1, TUN: -1, EGY: -1, TUR: 0, GRE: 0, ESP: -1, ITA: -1, POR: -1, FRA: 0,
  JPN: -5, KOR: -4, MEX: -4, COL: -2, ECU: -4, PAR: -2, ARG: -2, URU: -1, CHI: -3, BRA: -1, USA: 0, CAN: 0, AUS: 0,
  ENG: 0, SCO: 1, WAL: 0, IRL: 1, UKR: 1,
};

const HEIGHT_BY_POSITION: Record<Position, [number, number]> = {
  GK: [189, 4.5], CB: [186, 4.5], ST: [183, 5.5], DM: [181, 5], CM: [179, 5], AM: [177, 5], W: [176, 5], FB: [177, 4.5],
};

const HAIR = {
  black: '#15110e', darkBrown: '#2b1d14', brown: '#4a3020', lightBrown: '#7a5230', blond: '#c9a45c',
  ginger: '#a8481f', grey: '#9a9a9a',
};
const DYED = ['#e8dcaa', '#f1f1f1', '#9c1c1c', '#2d7be0'];
const BOOTS = ['#ffffff', '#ffffff', '#111111', '#111111', '#ff3d00', '#00c2ff', '#ffd400', '#7cff4a', '#ff4fa3', '#8a5cff', '#c0c0c0', '#ff9500', '#00e0a4'];
const SKIN_INDEX = [0, 1, 2, 3, 4, 5];
const STYLE_INDEX = [1, 2, 3, 4, 5, 6, 7];
const BEARD_INDEX = [1, 2, 3];

function pickHair(rng: Rng, skin: number, fair: boolean, age: number): string {
  if (age >= 34 && rng.chance(0.3)) return HAIR.grey;
  if (age < 28 && rng.chance(0.03)) return rng.pick(DYED);
  let w: [string, number][];
  if (skin >= 4) w = [[HAIR.black, 82], [HAIR.darkBrown, 18]];
  else if (skin === 3) w = [[HAIR.black, 55], [HAIR.darkBrown, 33], [HAIR.brown, 12]];
  else if (skin === 2) w = [[HAIR.black, 32], [HAIR.darkBrown, 34], [HAIR.brown, 22], [HAIR.lightBrown, 8], [HAIR.blond, 2], [HAIR.ginger, 2]];
  else if (fair) w = [[HAIR.black, 8], [HAIR.darkBrown, 22], [HAIR.brown, 24], [HAIR.lightBrown, 18], [HAIR.blond, 22], [HAIR.ginger, 6]];
  else w = [[HAIR.black, 22], [HAIR.darkBrown, 36], [HAIR.brown, 24], [HAIR.lightBrown, 10], [HAIR.blond, 6], [HAIR.ginger, 2]];
  return rng.weighted(w, (x) => x[1])[0];
}

export function pickSkin(rng: Rng, nation: NationCode): number {
  const nat = findNation(nation);
  const w = SKIN_BY_NATION[nation] ?? SKIN_BY_CONTINENT[nat?.continent ?? 'EU'] ?? SKIN_BY_CONTINENT.EU;
  return rng.weighted(SKIN_INDEX, (i) => w[i]);
}

/** Look of a player by nation (skin, hair, beard, boots) and — when known — position and age (height). */
export function randomAppearance(rng: Rng, nation: NationCode, position?: Position, age = 25): Appearance {
  const skin = pickSkin(rng, nation);
  const fair = FAIR_HAIR.has(nation);
  const bald = rng.chance(age >= 31 ? 0.14 : age >= 26 ? 0.07 : 0.025);
  const hairStyle = bald ? 0 : rng.weighted(STYLE_INDEX, (s) => (s <= 3 ? 3 : 2));
  const beardP = (BEARDED.has(nation) ? 0.55 : 0.34) * (age < 20 ? 0.25 : age < 23 ? 0.7 : 1);
  const beard = rng.chance(beardP) ? rng.weighted(BEARD_INDEX, (b) => (b === 1 ? 5 : b === 2 ? 3 : 1.5)) : 0;
  const [mu, sd] = position ? HEIGHT_BY_POSITION[position] : [180, 7];
  const height = Math.round(Math.min(204, Math.max(162, rng.normal(mu + (HEIGHT_MOD[nation] ?? 0) - (age < 19 ? 3 : 0), sd))));
  return { skin, hairStyle, hairColor: pickHair(rng, skin, fair, age), beard, boots: rng.pick(BOOTS), height };
}
