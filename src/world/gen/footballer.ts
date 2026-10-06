import type { AttrKey, Attributes, Contract, Footballer, Position, SquadRole, StatLine, TraitId } from '../../core/types';
import type { Rng } from '../../core/rng';
import { ATTR_KEYS, POSITION_WEIGHTS, overallFor } from '../../core/ratings';
import { clamp } from '../../core/util';
import type { FootballerGenOptions } from '../types';
import { randomName } from './names';
import { randomAppearance } from './appearance';
import { emptyLine, niceMoney } from './shared';

type Off = Partial<Record<AttrKey, number>>;

/** Typical attribute offsets from the player's overall, per position. */
const BASE: Record<Position, Record<AttrKey, number>> = {
  ST: { shooting: 6, curl: -6, passing: -8, dribbling: -1, firstTouch: 1, heading: 0, tackling: -32, pace: 0, acceleration: 1, stamina: -6, strength: -2, jumping: -4, vision: -8, composure: 3, positioning: 6, goalkeeping: 0 },
  W: { shooting: -2, curl: 3, passing: -3, dribbling: 6, firstTouch: 1, heading: -20, tackling: -28, pace: 7, acceleration: 7, stamina: -2, strength: -12, jumping: -12, vision: -3, composure: -3, positioning: -2, goalkeeping: 0 },
  AM: { shooting: 1, curl: 3, passing: 6, dribbling: 5, firstTouch: 5, heading: -15, tackling: -20, pace: -2, acceleration: 0, stamina: -6, strength: -14, jumping: -14, vision: 7, composure: 2, positioning: 1, goalkeeping: 0 },
  CM: { shooting: -4, curl: -3, passing: 6, dribbling: 1, firstTouch: 3, heading: -8, tackling: 0, pace: -5, acceleration: -5, stamina: 5, strength: -2, jumping: -6, vision: 4, composure: 2, positioning: 0, goalkeeping: 0 },
  DM: { shooting: -12, curl: -10, passing: 3, dribbling: -8, firstTouch: -1, heading: 1, tackling: 8, pace: -6, acceleration: -8, stamina: 5, strength: 3, jumping: -2, vision: 0, composure: 2, positioning: 5, goalkeeping: 0 },
  FB: { shooting: -14, curl: -2, passing: 0, dribbling: 0, firstTouch: -3, heading: -8, tackling: 4, pace: 6, acceleration: 4, stamina: 6, strength: -6, jumping: -8, vision: -6, composure: -5, positioning: 2, goalkeeping: 0 },
  CB: { shooting: -26, curl: -22, passing: -5, dribbling: -16, firstTouch: -10, heading: 7, tackling: 8, pace: -2, acceleration: -8, stamina: -2, strength: 7, jumping: 5, vision: -10, composure: 1, positioning: 6, goalkeeping: 0 },
  GK: { shooting: -42, curl: -42, passing: -6, dribbling: -36, firstTouch: -26, heading: -26, tackling: -46, pace: -20, acceleration: -12, stamina: -10, strength: -4, jumping: 2, vision: -12, composure: 0, positioning: 3, goalkeeping: 8 },
};

interface Archetype { id: string; w: number; off: Off; trait?: TraitId; traitP?: number }

const ARCHETYPES: Record<Position, Archetype[]> = {
  ST: [
    { id: 'poacher', w: 30, off: { positioning: 5, composure: 4, shooting: 2, pace: -2, strength: -3 } },
    { id: 'target', w: 22, off: { heading: 12, strength: 10, jumping: 9, pace: -9, acceleration: -9, dribbling: -6, positioning: 2 }, trait: 'aerial_threat', traitP: 0.7 },
    { id: 'speed', w: 18, off: { pace: 9, acceleration: 9, dribbling: 5, strength: -8, heading: -8, composure: -3 }, trait: 'speedster', traitP: 0.7 },
    { id: 'complete', w: 30, off: {} },
  ],
  W: [
    { id: 'speed', w: 28, off: { pace: 8, acceleration: 8, dribbling: 2, passing: -4, vision: -3 }, trait: 'speedster', traitP: 0.7 },
    { id: 'trickster', w: 24, off: { dribbling: 9, firstTouch: 6, shooting: -3, stamina: -3 }, trait: 'trickster', traitP: 0.6 },
    { id: 'crosser', w: 20, off: { curl: 9, passing: 7, vision: 4, shooting: -5 } },
    { id: 'insideFwd', w: 22, off: { shooting: 7, composure: 4, curl: 5, passing: -4 }, trait: 'clinical', traitP: 0.4 },
    { id: 'workhorse', w: 10, off: { stamina: 8, tackling: 10, strength: 4, dribbling: -4 } },
  ],
  AM: [
    { id: 'playmaker', w: 32, off: { vision: 9, passing: 8, firstTouch: 3, shooting: -4, pace: -3 }, trait: 'playmaker', traitP: 0.6 },
    { id: 'shadow', w: 24, off: { shooting: 8, positioning: 6, composure: 3, vision: -3, passing: -3 }, trait: 'clinical', traitP: 0.4 },
    { id: 'dribbler', w: 24, off: { dribbling: 9, firstTouch: 4, pace: 4, passing: -3 }, trait: 'trickster', traitP: 0.5 },
    { id: 'allround', w: 20, off: {} },
  ],
  CM: [
    { id: 'boxToBox', w: 30, off: { stamina: 8, tackling: 6, shooting: 3, passing: -2 } },
    { id: 'playmaker', w: 28, off: { passing: 8, vision: 8, firstTouch: 4, tackling: -6, strength: -3 }, trait: 'playmaker', traitP: 0.6 },
    { id: 'destroyer', w: 24, off: { tackling: 9, strength: 7, stamina: 4, passing: -5, dribbling: -5, vision: -5 } },
    { id: 'allround', w: 18, off: {} },
  ],
  DM: [
    { id: 'destroyer', w: 40, off: { tackling: 8, strength: 6, heading: 4, passing: -6, vision: -6 } },
    { id: 'regista', w: 30, off: { passing: 9, vision: 9, firstTouch: 4, composure: 4, tackling: -6, strength: -5 }, trait: 'playmaker', traitP: 0.6 },
    { id: 'anchor', w: 30, off: {} },
  ],
  FB: [
    { id: 'attacking', w: 42, off: { pace: 4, dribbling: 7, curl: 8, passing: 4, tackling: -8, heading: -4, stamina: 3 } },
    { id: 'defensive', w: 38, off: { tackling: 8, strength: 6, heading: 5, positioning: 4, dribbling: -8, curl: -6 } },
    { id: 'allround', w: 20, off: {} },
  ],
  CB: [
    { id: 'stopper', w: 34, off: { tackling: 6, strength: 7, heading: 6, jumping: 4, passing: -6, pace: -4 } },
    { id: 'ballPlaying', w: 28, off: { passing: 10, vision: 8, composure: 5, firstTouch: 6, heading: -5, strength: -4 } },
    { id: 'pacy', w: 18, off: { pace: 10, acceleration: 9, tackling: 2, strength: -6 }, trait: 'speedster', traitP: 0.4 },
    { id: 'aerial', w: 20, off: { heading: 10, jumping: 9, strength: 6, pace: -8 }, trait: 'aerial_threat', traitP: 0.7 },
  ],
  GK: [
    { id: 'shotStopper', w: 44, off: { goalkeeping: 3, positioning: 3, passing: -6, pace: -5 } },
    { id: 'sweeper', w: 30, off: { passing: 12, vision: 10, pace: 8, acceleration: 6, firstTouch: 10, goalkeeping: -2, composure: 3 } },
    { id: 'commander', w: 26, off: { jumping: 8, strength: 8, positioning: 4, composure: 4, pace: -6 } },
  ],
};

/** Chance of being a free-kick specialist (high curl), by position. */
const WIZARD_P: Record<Position, number> = { GK: 0, CB: 0.01, FB: 0.04, DM: 0.03, CM: 0.06, AM: 0.11, W: 0.08, ST: 0.03 };

export const SHIRT_PREF: Record<Position, number[]> = {
  GK: [1, 13, 12, 25, 30, 40],
  CB: [4, 5, 15, 6, 3, 23, 26, 24, 31],
  FB: [2, 3, 22, 21, 16, 20, 29],
  DM: [6, 8, 5, 14, 16, 18],
  CM: [8, 14, 16, 18, 20, 21, 6],
  AM: [10, 17, 8, 21, 7, 11],
  W: [7, 11, 17, 19, 22, 14, 18, 27],
  ST: [9, 19, 11, 17, 18, 29, 21, 27, 32],
};

const LOWEST = 8;
const HIGHEST = 97;

function pickArchetype(rng: Rng, position: Position): Archetype {
  return rng.weighted(ARCHETYPES[position], (a) => a.w);
}

/** Shift the position-relevant attributes until the overall equals the target (±0). */
function calibrate(attrs: Attributes, position: Position, target: number, pinned: AttrKey[]): void {
  const w = POSITION_WEIGHTS[position];
  const keys = Object.keys(w) as AttrKey[];
  const others = ATTR_KEYS.filter((k) => !(k in w) && k !== 'goalkeeping');
  for (let i = 0; i < 14; i++) {
    const diff = target - overallFor(attrs, position);
    if (diff === 0) return;
    const step = Math.abs(diff) >= 2 ? Math.round(diff * 0.95) : diff;
    for (const k of keys) {
      if (pinned.includes(k)) continue;
      attrs[k] = clamp(attrs[k] + step, LOWEST, HIGHEST);
    }
    const side = Math.round(step * 0.4);
    if (side !== 0) for (const k of others) if (!pinned.includes(k)) attrs[k] = clamp(attrs[k] + side, LOWEST, HIGHEST);
  }
}

export interface AttrBuild { attrs: Attributes; traits: TraitId[]; archetype: string }

/** Coherent attributes for a position, calibrated to the target overall; includes specialists. */
export function buildAttributes(rng: Rng, position: Position, quality: number): AttrBuild {
  const arch = pickArchetype(rng, position);
  const base = BASE[position];
  const weighted = Object.keys(POSITION_WEIGHTS[position]) as AttrKey[];
  const attrs = {} as Attributes;
  const traits: TraitId[] = [];
  const pinned: AttrKey[] = [];

  for (const k of ATTR_KEYS) {
    if (k === 'goalkeeping' && position !== 'GK') { attrs[k] = rng.int(5, 15); continue; }
    attrs[k] = clamp(Math.round(quality + base[k] + (arch.off[k] ?? 0) + rng.normal(0, 3.4)), LOWEST, HIGHEST);
  }
  // a signature strength and a small weakness make every player feel distinct
  if (weighted.length > 3) {
    const up = rng.pick(weighted);
    const down = rng.pick(weighted);
    if (up !== 'goalkeeping') attrs[up] = clamp(attrs[up] + Math.round(rng.normal(5, 2)), LOWEST, HIGHEST);
    if (down !== up && down !== 'goalkeeping') attrs[down] = clamp(attrs[down] - Math.round(rng.normal(4, 2)), LOWEST, HIGHEST);
  }
  if (arch.trait && rng.chance(arch.traitP ?? 0)) traits.push(arch.trait);
  if (arch.trait === 'speedster' && traits.includes('speedster')) {
    attrs.pace = clamp(Math.max(attrs.pace, Math.min(quality + 13, 94)), LOWEST, HIGHEST);
    attrs.acceleration = clamp(Math.max(attrs.acceleration, Math.min(quality + 12, 93)), LOWEST, HIGHEST);
    pinned.push('pace', 'acceleration');
  }
  // free-kick wizard: a sweet left/right foot with huge curl
  if (rng.chance(WIZARD_P[position])) {
    attrs.curl = clamp(quality + rng.int(14, 24), 72, 96);
    attrs.shooting = clamp(attrs.shooting + 4, LOWEST, HIGHEST);
    attrs.passing = clamp(attrs.passing + 3, LOWEST, HIGHEST);
    pinned.push('curl');
    if (!traits.includes('set_piece_specialist')) traits.push('set_piece_specialist');
  }
  calibrate(attrs, position, clamp(Math.round(quality), 1, 99), pinned);
  return { attrs, traits, archetype: arch.id };
}

export function potentialFor(rng: Rng, age: number, quality: number): number {
  let gap: number;
  if (age <= 17) gap = rng.int(10, 28);
  else if (age === 18) gap = rng.int(8, 25);
  else if (age === 19) gap = rng.int(7, 22);
  else if (age === 20) gap = rng.int(5, 18);
  else if (age === 21) gap = rng.int(4, 15);
  else if (age === 22) gap = rng.int(2, 11);
  else if (age === 23) gap = rng.int(1, 8);
  else if (age <= 25) gap = rng.int(0, 5);
  else if (age <= 28) gap = rng.int(0, 2);
  else gap = 0;
  gap = Math.round(gap * clamp((95 - quality) / 45, 0.3, 1));
  let pot = quality + gap;
  if (age <= 21 && rng.chance(0.025)) pot = Math.max(pot, rng.int(88, 95)); // rare wonderkid
  return clamp(Math.round(pot), quality, 97);
}

/** Market value in euros from overall, potential, age and position. */
export function marketValueOf(ovr: number, potential: number, age: number, position: Position): number {
  const youthW = age <= 19 ? 0.5 : age <= 21 ? 0.4 : age <= 23 ? 0.25 : age <= 25 ? 0.1 : 0;
  const eff = ovr + Math.max(0, potential - ovr) * youthW;
  const ageF = age <= 19 ? 1 : age <= 23 ? 1.1 : age <= 28 ? 1 : age === 29 ? 0.85 : age === 30 ? 0.7 : age === 31 ? 0.55 : age === 32 ? 0.4 : age === 33 ? 0.28 : 0.18;
  const posF = position === 'GK' ? 0.8 : position === 'CB' ? 0.92 : position === 'ST' ? 1.12 : position === 'W' || position === 'AM' ? 1.05 : 1;
  return niceMoney(150_000 * Math.exp((eff - 50) * 0.1727) * ageF * posF);
}

/** Weekly wage for a quality level at an "average" club. */
export function weeklyWage(quality: number): number {
  return 2500 * Math.exp(0.112 * (clamp(quality, 30, 95) - 50));
}

export function roundWage(v: number): number {
  return v >= 20_000 ? Math.round(v / 1000) * 1000 : v >= 4_000 ? Math.round(v / 250) * 250 : Math.max(250, Math.round(v / 50) * 50);
}

export function newContract(
  rng: Rng, clubId: string, quality: number, age: number, season: number, payFactor: number, role: SquadRole,
  position: Position, value: number,
): Contract {
  const years = role === 'prospect' ? rng.int(2, 5)
    : age >= 33 ? rng.int(1, 2)
    : age >= 30 ? rng.int(1, 3)
    : role === 'rotation' ? rng.int(1, 4)
    : rng.int(2, 5);
  const startSeason = season - rng.int(0, years - 1);
  const wage = roundWage(weeklyWage(quality) * payFactor * rng.float(0.86, 1.16) * (role === 'prospect' ? 0.8 : 1));
  const attacker = position === 'ST' || position === 'W' || position === 'AM';
  return {
    clubId, wage, startSeason, endSeason: startSeason + years - 1,
    releaseClause: (role === 'star' || role === 'starter') && rng.chance(0.3) ? niceMoney(value * rng.float(1.6, 3.2)) : null,
    role,
    goalBonus: attacker ? Math.round((wage * rng.float(0.06, 0.3)) / 50) * 50 : 0,
    appearanceBonus: Math.round((wage * rng.float(0.04, 0.14)) / 50) * 50,
  };
}

const GOALS_PER_APP: Record<Position, number> = { ST: 0.38, W: 0.2, AM: 0.17, CM: 0.07, DM: 0.04, FB: 0.04, CB: 0.04, GK: 0 };
const ASSISTS_PER_APP: Record<Position, number> = { ST: 0.12, W: 0.2, AM: 0.2, CM: 0.11, DM: 0.05, FB: 0.11, CB: 0.03, GK: 0.01 };

/** A plausible career record so veterans do not start with a blank slate. */
function careerRecord(rng: Rng, age: number, position: Position, quality: number): StatLine {
  const line = emptyLine();
  const years = Math.max(0, age - 18);
  if (years === 0) return line;
  const perYear = rng.int(8, 14) + Math.max(0, (quality - 45) * 0.5);
  const apps = Math.round(years * perYear * rng.float(0.7, 1.15));
  line.apps = apps;
  line.starts = Math.round(apps * rng.float(0.65, 0.9));
  line.minutes = line.starts * 82 + (apps - line.starts) * 24;
  line.goals = Math.round(apps * GOALS_PER_APP[position] * rng.float(0.6, 1.3));
  line.assists = Math.round(apps * ASSISTS_PER_APP[position] * rng.float(0.6, 1.3));
  line.ratingSum = Math.round(apps * rng.float(6.2, 6.9) * 10) / 10;
  line.yellow = Math.round(apps * (position === 'CB' || position === 'DM' ? 0.17 : 0.1) * rng.float(0.5, 1.4));
  line.red = rng.chance(Math.min(0.9, apps / 120)) ? rng.int(0, 2) : 0;
  line.motm = Math.round(apps * 0.04 * rng.float(0.4, 1.6));
  line.cleanSheets = position === 'GK' ? Math.round(apps * 0.3) : 0;
  return line;
}

interface TraitCtx { position: Position; age: number; quality: number; attrs: Attributes }
const TRAIT_WEIGHTS: [TraitId, (c: TraitCtx) => number][] = [
  ['big_game', (c) => (c.quality >= 68 ? 2 : 0.4)],
  ['glass_bones', () => 1.1],
  ['leader', (c) => (c.age >= 26 && ['CB', 'DM', 'CM', 'GK', 'ST'].includes(c.position) ? 1.8 : 0.3)],
  ['showman', (c) => (['W', 'AM', 'ST'].includes(c.position) ? 1.5 : 0.4)],
  ['hothead', (c) => (['DM', 'CB', 'CM'].includes(c.position) ? 1.6 : 0.5)],
  ['iron_man', () => 1],
  ['clinical', (c) => (c.attrs.shooting >= 70 && c.attrs.composure >= 66 ? 2 : 0)],
  ['playmaker', (c) => (c.attrs.vision >= 70 && c.attrs.passing >= 70 ? 2 : 0)],
  ['speedster', (c) => (c.attrs.pace >= 82 && c.attrs.acceleration >= 80 ? 3 : 0)],
  ['fan_favourite', () => 0.8],
  ['media_darling', (c) => (c.quality >= 66 ? 1.2 : 0.3)],
  ['family_first', () => 0.9],
  ['party_animal', (c) => (c.age <= 27 ? 1 : 0.3)],
  ['workaholic', () => 1],
  ['loyal', (c) => (c.age >= 27 ? 1.4 : 0.3)],
  ['mercenary', () => 0.8],
  ['calm', () => 0.9],
  ['trickster', (c) => (c.attrs.dribbling >= 74 ? 2 : 0)],
  ['aerial_threat', (c) => (c.attrs.heading >= 74 && c.attrs.jumping >= 68 ? 2 : 0)],
  ['late_bloomer', (c) => (c.age >= 21 && c.age <= 25 ? 1.2 : 0)],
];

function rollTraits(rng: Rng, c: TraitCtx, have: TraitId[], potential: number): TraitId[] {
  const traits = [...have];
  if (c.age <= 21 && potential >= 88 && rng.chance(0.8) && !traits.includes('wonderkid')) traits.push('wonderkid');
  const r = rng.next();
  const extra = r < 0.1 ? 2 : r < 0.3 ? 1 : 0;
  for (let i = 0; i < extra; i++) {
    const t = rng.weighted(TRAIT_WEIGHTS, ([, f]) => f(c))[0];
    if (!traits.includes(t)) traits.push(t);
  }
  return traits.slice(0, 3);
}

/** Create one footballer with coherent attributes for the position. */
export function generateFootballer(rng: Rng, opts: FootballerGenOptions): Footballer {
  const { position, nation, age, season } = opts;
  const quality = clamp(Math.round(opts.quality), 1, 99);
  const name = randomName(rng, nation);
  const built = buildAttributes(rng, position, quality);
  const attrs = built.attrs;
  const ovr = overallFor(attrs, position);
  const potential = clamp(Math.round(opts.potential ?? potentialFor(rng, age, ovr)), ovr, 99);
  const traits = rollTraits(rng, { position, age, quality: ovr, attrs }, built.traits, potential);
  const leftBias = position === 'FB' ? 0.34 : position === 'W' ? 0.3 : position === 'GK' ? 0.12 : 0.22;
  const foot = rng.chance(leftBias) ? 'L' : 'R';
  const value = marketValueOf(ovr, potential, age, position);
  const prefs = SHIRT_PREF[position];
  const p: Footballer = {
    id: opts.id, firstName: name.first, lastName: name.last, nation, birthYear: season - age, position, foot,
    weakFoot: clamp(Math.round(rng.normal(2.7 + (ovr - 60) / 35, 0.9)), 1, 5),
    attrs, potential, clubId: opts.clubId,
    shirtNumber: position === 'GK' ? 1 : rng.pick(prefs),
    contract: null,
    form: 50, fitness: rng.int(86, 98), morale: rng.int(52, 68), injury: null, value,
    appearance: randomAppearance(rng, nation, position, age), traits,
    season: emptyLine(), career: careerRecord(rng, age, position, ovr), intlCaps: 0, intlGoals: 0,
  };
  if (nation === 'BRA' && rng.chance(0.15)) p.nickname = rng.chance(0.6) ? name.first : name.last;
  if (opts.clubId) {
    const role: SquadRole = age <= 20 ? 'prospect' : ovr >= 78 ? 'star' : ovr >= 66 ? 'starter' : 'rotation';
    p.contract = newContract(rng, opts.clubId, ovr, age, season, 1, role, position, value);
  }
  return p;
}
