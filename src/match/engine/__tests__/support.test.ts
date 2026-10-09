/**
 * Team-mates around the user: support angles, one-twos, calls for the ball, receiving and
 * keeping the ball (scripted "human" over open_play / counter / build_up, easy + normal).
 * Full before → after numbers: see support-harness.ts (measureSupport with 25 seeds).
 */
import { describe, expect, it } from 'vitest';
import { coordinatorCost, measureSupport } from './support-harness';

describe('team-mates play with the user', () => {
  for (const [name, diff] of [['easy', 0.3], ['normal', 0.5]] as const) {
    it(`support, one-twos, calls and first touches (${name})`, () => {
      const m = measureSupport({ diffs: [diff], seeds: 12 });
      console.log(name, JSON.stringify(m));
      expect(m.openAvg).toBeGreaterThanOrEqual(3);
      expect(m.ggAtt).toBeGreaterThan(30);
      expect(m.ggOk).toBeGreaterThanOrEqual(0.5);
      expect(m.ggStride).toBeGreaterThanOrEqual(0.45);
      expect(m.callAtt).toBeGreaterThan(30);
      expect(m.callOk).toBeGreaterThanOrEqual(0.3);
      expect(m.callBehind).toBeLessThanOrEqual(0.3);
      expect(m.recvOk).toBeGreaterThanOrEqual(0.55);
      expect(m.ftErr).toBeLessThanOrEqual(12);
      expect(m.retKept).toBeGreaterThanOrEqual(0.65);
      expect(m.still).toBeLessThanOrEqual(0.12);
      expect(m.bunched).toBeLessThanOrEqual(0.15);
    }, 120000);
  }

  it('the coordinator stays cheap', () => {
    const us = coordinatorCost();
    console.log('coordinator µs / update', us);
    expect(us).toBeLessThan(1000);
  }, 60000);
});
