/**
 * Movement / passing / crossing / difficulty metrics (feel-harness.ts). Prints FEEL-* lines with
 * every number; the assertions guard the tuned behaviour (deliberately loose: they catch a
 * regression, not a percent). The movement part always runs; the heavy play-tests (several CPU
 * minutes) only with FEEL=1 so the default suite stays quick (timing-based tests elsewhere):
 *   FEEL=1 npx vitest run src/match/engine/__tests__/feel.test.ts
 */
import { describe, expect, it } from 'vitest';
import { measureFeel } from './feel-harness';
import { humanRate } from './human';
import { measureSupport } from './support-harness';

const heavy = !!process.env.FEEL;
const out = (tag: string, v: unknown) => process.stdout.write(`\n${tag} ${JSON.stringify(v)}\n`);

type Num = Record<string, number>;

describe('feel harness', () => {
  it('movement: believable acceleration, braking, turning and body orientation', () => {
    const m = measureFeel({ parts: ['move'] }) as { move: { userEasy: Num; userNormal: Num; ai: Num; orient: Num } };
    out('FEEL-MOVE', m);
    const { ai, userEasy, userNormal, orient } = m.move;
    // full sprint after ~2 s for the AI; the user a little snappier, still not instant
    expect(ai.t90).toBeGreaterThan(1.4);
    expect(ai.t90).toBeLessThan(3);
    expect(userEasy.t90).toBeLessThan(ai.t90);
    expect(userNormal.t90).toBeGreaterThan(0.9);
    // no instant stops: a few metres to pull up from a sprint
    for (const r of [ai, userEasy, userNormal]) {
      expect(r.stopDist).toBeGreaterThan(2);
      expect(r.stopDist).toBeLessThan(5.5);
      // a 90° cut at full speed costs speed and takes time
      expect(r.turnRate).toBeLessThan(200);
      expect(r.turn80).toBeGreaterThan(0.4);
    }
    expect(orient.snaps).toBe(0);
    expect(orient.skate).toBeLessThan(0.05);
    expect(orient.footSlide).toBeLessThan(0.08);
    expect(orient.kickLagS).toBeLessThan(0.08);
  }, 60000);

  it.runIf(heavy)('passing: well weighted, receivable, preview = flight', () => {
    const m = measureFeel({ parts: ['pass'], seeds: 12 }) as { pass: Record<string, Record<string, Num>> };
    out('FEEL-PASS', m);
    for (const d of ['easy', 'normal']) {
      const p = m.pass[d];
      expect(p.userCalm.completion).toBeGreaterThanOrEqual(0.7);
      expect(p.userFast.completion).toBeGreaterThanOrEqual(0.7);
      expect(p.userCalm.hard).toBeLessThanOrEqual(0.12);
      expect(p.userCalm.previewErr).toBeLessThan(1);
      expect(p.matesToUser.completion).toBeGreaterThanOrEqual(0.7);
      // team-mates to each other: real lane checks, recycling under pressure, still going forward
      // (the first casual tuning had 0.55 / 0.74 going backwards)
      expect(p.mates.completion).toBeGreaterThanOrEqual(0.68);
      expect(p.mates.prog).toBeGreaterThan(0);
      // a bent drawn pass keeps its curl and is solved onto the man: no worse than a straight one
      expect(p.userBent.completion).toBeGreaterThanOrEqual(0.7);
      expect(p.userBent.previewErr).toBeLessThan(1);
    }
  }, 300000);

  it.runIf(heavy)('crossing: crosses reach the runners', () => {
    const m = measureFeel({ parts: ['cross'], seeds: 12 }) as { cross: Record<string, Record<string, Num>> };
    out('FEEL-CROSS', m);
    const e = m.cross.easy;
    const n = m.cross.normal;
    expect(e.recv_calm.reach).toBeGreaterThanOrEqual(0.45);
    expect(e.recv_calm.shot).toBeGreaterThanOrEqual(0.45);
    // crosses to the user on normal: he wins most of them now (0.32 in the first casual tuning)
    expect(n.recv_calm.reach).toBeGreaterThanOrEqual(0.5);
    expect(n.recv_calm.shot).toBeGreaterThanOrEqual(0.4);
    expect(n.wing_calmHigh.reach).toBeGreaterThanOrEqual(0.25);
  }, 300000);

  it.runIf(heavy)('difficulty: a notch harder, still fun', () => {
    const r: Record<string, { oneOnOne: number; openPlay: number; callOk?: number; stepMs?: number; oneOnOneOuts: unknown; openOuts: unknown }> = {};
    for (const [name, d] of [['easy', 0.3], ['normal', 0.5], ['hard', 0.8]] as const) {
      const oo = humanRate('one_on_one', d, { shootAt: 14, holdFor: 0.4 });
      const op = humanRate('open_play', d, { shootAt: 17, holdFor: 0.35 });
      const call = name === 'hard' ? null : measureSupport({ diffs: [d], seeds: 12, variants: ['call'] });
      r[name] = { oneOnOne: oo.goals, oneOnOneOuts: oo.outs, openPlay: op.goals, openOuts: op.outs, callOk: call?.callOk, stepMs: call?.stepMs };
    }
    out('FEEL-DIFF', r);
    // (the first casual tuning had easy one-on-ones at 100 % and easy open play near 60 %)
    expect(r.easy.oneOnOne).toBeGreaterThanOrEqual(0.6);
    expect(r.easy.oneOnOne).toBeLessThanOrEqual(0.92);
    expect(r.normal.oneOnOne).toBeGreaterThanOrEqual(0.4);
    expect(r.normal.oneOnOne).toBeLessThanOrEqual(0.75);
    expect(r.easy.openPlay).toBeLessThanOrEqual(0.55);
    expect(r.normal.openPlay).toBeLessThanOrEqual(0.4);
    expect(r.normal.openPlay).toBeGreaterThanOrEqual(0.12);
    expect(r.easy.callOk ?? 0).toBeGreaterThanOrEqual(0.55);
    expect(r.normal.callOk ?? 0).toBeGreaterThanOrEqual(0.45);
    // the engine stays cheap: well under 1 ms per 1/60 s frame with 22 players
    expect(r.normal.stepMs ?? 0).toBeLessThan(1);
  }, 300000);
});
