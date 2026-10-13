/**
 * Season goal distribution (heavy: SEASON=1 npx vitest run src/match/flow/__tests__/season.explore.test.ts).
 * Prints SEASON-* lines: the user's goals per season by position / difficulty, auto-resolved and played.
 */
import { it } from 'vitest';
import { runCareer, type PlayMode } from './season-harness';

const on = !!process.env.SEASON;
const out = (tag: string, v: unknown) => process.stdout.write(`\n${tag} ${JSON.stringify(v)}\n`);

it.runIf(on)('season goals', async () => {
  const modes = (process.env.SEASON_MODES ?? 'auto,bot').split(',') as PlayMode[];
  const pos = (process.env.SEASON_POS ?? 'ST').split(',') as ('ST' | 'W' | 'CM' | 'CB')[];
  const seasons = Number(process.env.SEASON_N ?? 3);
  const seeds = (process.env.SEASON_SEEDS ?? '5,17').split(',').map(Number);
  for (const position of pos) {
    for (const mode of modes) {
      for (const seed of seeds) {
        const rows = await runCareer({ position, seasons, mode, difficulty: (process.env.SEASON_DIFF as 'easy') ?? 'normal', seed });
        out(`SEASON-${position}-${mode}-s${seed}`, rows);
      }
    }
  }
}, 1_800_000);
