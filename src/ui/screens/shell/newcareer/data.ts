import type { Appearance, AttrKey, Foot, NationCode, PlayablePosition, TraitId } from '../../../../core/types';
import { Rng, freshSeed } from '../../../../core/rng';
import { randomAppearance } from '../../../../world/api';
import { TRAITS } from '../../../../career/api';
import { faceHeight } from '../../../components/Avatar';

export const POSITIONS: { id: PlayablePosition; icon: string; attrs: AttrKey[]; spot: [number, number] }[] = [
  { id: 'ST', icon: 'crosshair', attrs: ['shooting', 'positioning', 'composure'], spot: [50, 16] },
  { id: 'W', icon: 'wind', attrs: ['pace', 'dribbling', 'curl'], spot: [14, 30] },
  { id: 'AM', icon: 'sparkles', attrs: ['vision', 'passing', 'dribbling'], spot: [50, 38] },
  { id: 'CM', icon: 'brain', attrs: ['passing', 'stamina', 'vision'], spot: [50, 54] },
  { id: 'FB', icon: 'footprints', attrs: ['pace', 'stamina', 'tackling'], spot: [14, 72] },
  { id: 'CB', icon: 'shield', attrs: ['tackling', 'heading', 'strength'], spot: [50, 82] },
];

export const HAIR_COLORS = ['#15110e', '#2b1d14', '#4a2f1b', '#7a4a24', '#b07a3a', '#d8b36a', '#c0421e', '#8d8d8d', '#e9e4d8', '#3a1d5c'];
export const BOOT_COLORS = ['#ffffff', '#0b0b0b', '#b8ff3c', '#ff4f64', '#49c6ff', '#ffcb47', '#a98bff', '#ff8a3c'];

export interface Draft {
  first: string;
  last: string;
  nickname: string;
  nation: NationCode;
  position: PlayablePosition;
  foot: Foot;
  appearance: Appearance;
  trait: TraitId | null;
}

export const DEFAULT_APPEARANCE: Appearance = { skin: 2, hairStyle: 2, hairColor: '#2b1d14', beard: 0, boots: '#ffffff', height: faceHeight(0) };

/** A randomized look: world generator when available, otherwise a local roll. Face is always one of the six. */
export function rollAppearance(nation: NationCode): Appearance {
  const rng = new Rng(freshSeed());
  let base: Appearance;
  try {
    base = randomAppearance(rng, nation);
  } catch {
    base = {
      skin: rng.int(0, 5), hairStyle: rng.int(0, 7), hairColor: HAIR_COLORS[rng.int(0, HAIR_COLORS.length - 1)],
      beard: rng.chance(0.2) ? rng.int(1, 3) : 0, boots: BOOT_COLORS[rng.int(0, BOOT_COLORS.length - 1)], height: 0,
    };
  }
  return { ...base, beard: 0, height: faceHeight(rng.int(0, 5)) };
}

export function shuffled<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Six random positive traits to choose from. */
export function offeredTraits(): TraitId[] {
  const pool = TRAITS.filter((x) => x.positive);
  return shuffled(new Rng(freshSeed()), pool).slice(0, 6).map((x) => x.id);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
