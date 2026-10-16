/**
 * Before → after numbers of the runs-in-behind / through-ball / AI-skill work (runs-harness.ts)
 * and the difficulty side-effects. Several CPU minutes; only with MEASURE=1:
 *   MEASURE=1 npx vitest run src/match/engine/__tests__/runs.explore.test.ts
 */
import { describe, it } from 'vitest';
import { humanRate } from './human';
import { measureRuns, measureSkills } from './runs-harness';

const on = !!process.env.MEASURE;
const out = (tag: string, v: unknown) => process.stdout.write(`\n${tag} ${JSON.stringify(v)}\n`);

describe.runIf(on)('runs / through balls / AI skills (measure)', () => {
  it('runs harness', () => {
    for (const [n, d] of (process.env.DIFFS ? [['normal', 0.5]] : [['easy', 0.3], ['normal', 0.5], ['hard', 0.8]]) as [string, number][]) {
      const seeds = Number(process.env.SEEDS ?? 8);
      const variants = process.env.VARIANTS ? (process.env.VARIANTS.split(',') as ('R' | 'calm' | 'mates' | 'defend')[]) : undefined;
      out(`RUNS-${n}`, measureRuns({ diffs: [d], seeds, variants }));
      if (variants) continue;
      out(`SKILL-${n}`, measureSkills({ diffs: [d], seeds: seeds * 2 }));
    }
  }, 1800000);
  it('difficulty', () => {
    const r: Record<string, unknown> = {};
    for (const [name, d] of [['easy', 0.3], ['normal', 0.5], ['hard', 0.8]] as const) {
      const oo = humanRate('one_on_one', d, { shootAt: 14, holdFor: 0.4 });
      const op = humanRate('open_play', d, { shootAt: 17, holdFor: 0.35 });
      r[name] = { oneOnOne: oo.goals, openPlay: op.goals };
    }
    out('DIFF', r);
  }, 1800000);
});
