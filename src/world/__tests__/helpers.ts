import { Rng } from '../../core/rng';
import type { World } from '../../core/types';
import { generateWorld } from '../api';

let cached: World | null = null;

/** One shared world for read-only assertions (generation is deterministic, seed 2026). */
export function sharedWorld(): World {
  if (!cached) cached = generateWorld(new Rng(2026), { startSeason: 2026, userNation: 'TUR' });
  return cached;
}
