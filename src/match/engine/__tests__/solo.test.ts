/**
 * The action bar against solo runs (solo-harness.ts): dribbling from deep to goal alone should be
 * very hard, passing and moving should still create goals. Heavy: FEEL=1.
 */
import { describe, expect, it } from 'vitest';
import { soloRate } from './solo-harness';

const heavy = !!process.env.FEEL;
const out = (tag: string, v: unknown) => process.stdout.write(`\n${tag} ${JSON.stringify(v)}\n`);

describe('solo runs', () => {
  it.runIf(heavy)('a long solo dribble rarely ends in a goal; pass-and-move still scores', () => {
    const r: Record<string, unknown> = {};
    let solo = 0;
    let pm = 0;
    let longGoals = 0;
    for (const [name, d] of [['easy', 0.3], ['normal', 0.5]] as const) {
      for (const type of ['build_up', 'counter', 'open_play'] as const) {
        const s = soloRate(type, d, 'solo');
        const p = soloRate(type, d, 'passmove');
        r[`${name}_${type}`] = { solo: s, passmove: p };
        if (name === 'normal') { solo += s.goals; pm += p.goals; longGoals += s.longSoloGoals; }
      }
    }
    out('FEEL-SOLO', r);
    expect(solo / 3).toBeLessThanOrEqual(0.12);
    expect(longGoals).toBeLessThanOrEqual(6);
    expect(pm / 3).toBeGreaterThanOrEqual(solo / 3);
  }, 600000);
});
