/**
 * Side-spin of ordinary and bent kicks: every strike has a little natural spin from the kicking
 * foot (none to speak of on a soft side-foot pass, a visible drift on a driven / lofted ball), and
 * a pass struck with curl bends on its way yet is solved to finish where it was meant to.
 */
import { describe, expect, it } from 'vitest';
import type { Attributes } from '../../../core/types';
import { BR } from '../constants';
import { naturalSpin } from '../kick';
import { physEnv } from '../physics';
import { atDistance, curledPass, groundPass, launched, predictPath, solveLob } from '../solver';

const attrs: Attributes = {
  shooting: 70, curl: 70, passing: 70, dribbling: 60, firstTouch: 60, heading: 60, tackling: 40, pace: 70, acceleration: 70,
  stamina: 70, strength: 60, jumping: 60, vision: 60, composure: 60, positioning: 60, goalkeeping: 10,
};
const env = physEnv(undefined);
const spec = { kind: 'ground' as const, isShot: false, pressure: 0, difficulty: 0.5 };
const from = { x: 0, y: 0, z: BR };

describe('side-spin', () => {
  it('natural spin: tiny on a soft pass, more on a driven / lofted ball, by the kicking foot', () => {
    const R = { foot: 'R' as const, facing: 0 };
    const L = { foot: 'L' as const, facing: 0 };
    const soft = naturalSpin({ dir: { x: 1, y: 0 }, power: 0.25, loft: 0, curl: 0 }, R, spec);
    const long = naturalSpin({ dir: { x: 1, y: 0 }, power: 0.85, loft: 0.45, curl: 0 }, R, spec);
    expect(Math.abs(soft)).toBeLessThan(1);
    expect(long).toBeGreaterThan(4);
    expect(naturalSpin({ dir: { x: 1, y: 0 }, power: 0.85, loft: 0.45, curl: 0 }, L, spec)).toBeCloseTo(-long, 6);
    // across the body (a right-footer to his left) wraps the foot round it: more spin
    const across = naturalSpin({ dir: { x: 0, y: 1 }, power: 0.85, loft: 0.45, curl: 0 }, R, spec);
    expect(across).toBeGreaterThan(long);
    expect(naturalSpin({ dir: { x: 1, y: 0 }, power: 0.9, loft: 0, curl: 0 }, R, { kind: 'header' })).toBe(0);
  });

  it('ordinary passes still arrive: a long ball drifts but is solved onto its target', () => {
    const k = { attrs, foot: 'R' as const, weakFoot: 3, stamina: 1, facing: 0 };
    for (const d of [10, 25]) {
      const p = groundPass(env, k, from, { x: d, y: 0 }, 7);
      const q = atDistance(predictPath(launched(from, p, k, spec), env, 4, 4), d);
      expect(Math.abs(q!.y)).toBeLessThan(0.15);
    }
    const lob = solveLob(env, k, from, { x: 32, y: 0 }, 0.9, 0, 0.42);
    const path = predictPath(launched(from, lob, k, spec), env, 4, 4);
    expect(Math.abs(atDistance(path, 32)!.y)).toBeLessThan(0.3);
    // (and it visibly swings on the way: the right-footer's ball starts right and comes back left)
    expect(Math.min(...path.map((s) => s.y))).toBeLessThan(-0.1);
  });

  it('a bent pass swings round the line and finishes at the target, at a receivable pace', () => {
    const k = { attrs, foot: 'R' as const, weakFoot: 3, stamina: 1, facing: 0 };
    for (const c of [0.7, -0.7]) {
      const p = curledPass(env, k, from, { x: 22, y: 0 }, 7, c);
      expect(p.curl).toBeCloseTo(c, 6);
      const path = predictPath(launched(from, p, k, spec), env, 4, 4);
      const q = atDistance(path, 22)!;
      expect(Math.hypot(q.x - 22, q.y)).toBeLessThan(0.3);
      // bends left (+) → it travels on the right of the line first, and the other way round
      const side = Math.sign(c) * -1;
      const bulge = Math.max(...path.filter((s) => s.x < 22).map((s) => s.y * side));
      expect(bulge).toBeGreaterThan(0.25);
      expect(q.t).toBeLessThan(3);
    }
  });
});
