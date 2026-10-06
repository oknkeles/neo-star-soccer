import type { AttrKey, Attributes, Footballer, Position } from './types';

/** Attribute weights per position for the overall rating (each row sums to 1). */
export const POSITION_WEIGHTS: Record<Position, Partial<Record<AttrKey, number>>> = {
  GK: { goalkeeping: 0.62, positioning: 0.12, composure: 0.08, jumping: 0.06, passing: 0.05, strength: 0.04, acceleration: 0.03 },
  CB: { tackling: 0.22, positioning: 0.18, heading: 0.13, strength: 0.12, jumping: 0.08, pace: 0.07, composure: 0.07, passing: 0.06, acceleration: 0.04, stamina: 0.03 },
  FB: { tackling: 0.16, pace: 0.15, stamina: 0.12, passing: 0.11, positioning: 0.11, acceleration: 0.1, dribbling: 0.08, curl: 0.06, strength: 0.05, vision: 0.06 },
  DM: { tackling: 0.18, passing: 0.16, positioning: 0.14, stamina: 0.11, strength: 0.1, vision: 0.1, composure: 0.08, firstTouch: 0.07, heading: 0.06 },
  CM: { passing: 0.2, vision: 0.15, firstTouch: 0.12, stamina: 0.11, dribbling: 0.1, composure: 0.09, tackling: 0.08, shooting: 0.07, positioning: 0.08 },
  AM: { passing: 0.17, vision: 0.17, dribbling: 0.15, firstTouch: 0.12, shooting: 0.12, curl: 0.09, composure: 0.08, acceleration: 0.05, positioning: 0.05 },
  W: { pace: 0.17, dribbling: 0.17, acceleration: 0.13, curl: 0.1, passing: 0.1, shooting: 0.1, firstTouch: 0.08, vision: 0.07, stamina: 0.08 },
  ST: { shooting: 0.24, positioning: 0.16, composure: 0.12, firstTouch: 0.1, heading: 0.09, pace: 0.09, dribbling: 0.08, strength: 0.06, acceleration: 0.06 },
};

export const ATTR_KEYS: AttrKey[] = [
  'shooting', 'curl', 'passing', 'dribbling', 'firstTouch', 'heading', 'tackling',
  'pace', 'acceleration', 'stamina', 'strength', 'jumping',
  'vision', 'composure', 'positioning', 'goalkeeping',
];

export const ATTR_GROUPS: Record<'technical' | 'physical' | 'mental' | 'goalkeeping', AttrKey[]> = {
  technical: ['shooting', 'curl', 'passing', 'dribbling', 'firstTouch', 'heading', 'tackling'],
  physical: ['pace', 'acceleration', 'stamina', 'strength', 'jumping'],
  mental: ['vision', 'composure', 'positioning'],
  goalkeeping: ['goalkeeping'],
};

/** Overall rating (1..99) of a set of attributes when playing a position. */
export function overallFor(attrs: Attributes, position: Position): number {
  const w = POSITION_WEIGHTS[position];
  let total = 0;
  let wsum = 0;
  for (const k of Object.keys(w) as AttrKey[]) {
    const weight = w[k] ?? 0;
    total += attrs[k] * weight;
    wsum += weight;
  }
  return Math.max(1, Math.min(99, Math.round(total / (wsum || 1))));
}

export function overall(p: Pick<Footballer, 'attrs' | 'position'>): number {
  return overallFor(p.attrs, p.position);
}

/** Coarse group used for squad selection and formations. */
export type PositionGroup = 'GK' | 'DEF' | 'MID' | 'ATT';
export function positionGroup(pos: Position): PositionGroup {
  switch (pos) {
    case 'GK': return 'GK';
    case 'CB': case 'FB': return 'DEF';
    case 'DM': case 'CM': case 'AM': return 'MID';
    default: return 'ATT';
  }
}

/** Star rating 0.5..5 used in UI for quick reading. */
export function stars(ovr: number): number {
  return Math.max(0.5, Math.min(5, Math.round(((ovr - 40) / 12) * 2) / 2));
}
