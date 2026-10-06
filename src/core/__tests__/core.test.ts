import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { overallFor } from '../ratings';
import { registerStrings, t } from '../i18n';

describe('Rng', () => {
  it('is deterministic and resumable from state', () => {
    const a = new Rng(42);
    const seq1 = [a.next(), a.next(), a.next()];
    const b = new Rng(42);
    expect([b.next(), b.next(), b.next()]).toEqual(seq1);
    const s = a.state();
    const c = new Rng(s);
    expect(c.next()).toBe(a.next());
  });
  it('int stays in range', () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});

describe('ratings', () => {
  it('overall is within 1..99', () => {
    const attrs = { shooting: 80, curl: 70, passing: 60, dribbling: 75, firstTouch: 70, heading: 60, tackling: 30, pace: 85, acceleration: 80, stamina: 70, strength: 60, jumping: 60, vision: 65, composure: 70, positioning: 78, goalkeeping: 10 };
    const o = overallFor(attrs, 'ST');
    expect(o).toBeGreaterThan(60);
    expect(o).toBeLessThan(90);
  });
});

describe('i18n', () => {
  it('formats params', () => {
    registerStrings('test', { tr: { goals: '{n} gol' }, en: { goals: '{n} goals' } });
    expect(t('test.goals', { n: 3 })).toBe('3 gol');
    expect(t('test.goals', { n: 3 }, 'en')).toBe('3 goals');
  });
});
