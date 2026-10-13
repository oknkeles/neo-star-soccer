/** "Press any key to begin", the start grace and the action bar (the user's stamina). */
import { describe, expect, it } from 'vitest';
import { createMoment } from '../api';
import type { Engine } from '../engine';
import { HL } from '../constants';
import { makeSetup } from './helpers';

const eng = (type: Parameters<typeof makeSetup>[0], o: Parameters<typeof makeSetup>[1] = {}) => createMoment(makeSetup(type, o)) as unknown as Engine;

describe('start hold', () => {
  it('nothing moves until the player starts; any real key starts it', () => {
    const e = eng('open_play', { seed: 3 });
    expect(e.state.awaitingStart).toBe(true);
    const pos = e.state.players.map((p) => ({ ...p.pos }));
    for (let i = 0; i < 120; i++) e.step(1 / 60);
    expect(e.state.time).toBe(0);
    expect(e.state.players.every((p, i) => p.pos.x === pos[i].x && p.pos.y === pos[i].y)).toBe(true);
    // releasing a key / a zero stick does not start it
    e.input({ kind: 'moveDir', dir: { x: 0, y: 0 } });
    e.input({ kind: 'sprint', on: false });
    e.input({ kind: 'aimCancel' });
    e.step(0.1);
    expect(e.state.awaitingStart).toBe(true);
    e.input({ kind: 'moveDir', dir: { x: 1, y: 0 } });
    expect(e.state.awaitingStart).toBe(false);
    for (let i = 0; i < 60; i++) e.step(1 / 60);
    expect(e.state.time).toBeGreaterThan(0.9);
    expect(e.state.phase).not.toBe('intro');
  });

  it('set pieces and drills keep their own frozen-aim start', () => {
    for (const t of ['free_kick', 'penalty', 'corner', 'drill_finishing'] as const) {
      const e = eng(t, { seed: 2 });
      expect(e.state.awaitingStart ?? false).toBe(false);
    }
    const s = eng('build_up', { seed: 2 });
    s.input({ kind: 'start' });
    expect(s.state.awaitingStart).toBe(false);
  });

  it('opponents cannot take the ball off the user during the start grace', () => {
    for (const [d, g] of [[0.3, 0.8], [0.5, 0.5], [0.8, 0.3]] as const) {
      const e = eng('open_play', { seed: 4, difficulty: d });
      e.input({ kind: 'start' });
      expect(e.graceUntil).toBeCloseTo(e.introEnd + g, 2);
    }
    const e = eng('build_up', { seed: 5, difficulty: 0.8 });
    e.input({ kind: 'start' });
    while (e.state.phase === 'intro') e.step(1 / 60);
    const opp = e.agents.find((a) => a.side === 'them' && !a.isGK)!;
    opp.st.pos = { x: e.state.ball.pos.x + 0.5, y: e.state.ball.pos.y };
    for (let k = 0; k < 20; k++) { opp.cool = 0; opp.stun = 0; e.tryTackle(opp, false); }
    expect(e.owner).toBe(e.user);
  });
});

describe('action bar', () => {
  it('sprint-dribbling empties it in ~30–40 m; a pass refills it', () => {
    const e = eng('build_up', { seed: 6, difficulty: 0.5, oppBase: 1 });
    e.input({ kind: 'start' });
    // nobody to stop him: run 60 m with the ball
    for (const a of e.agents) if (a.side === 'them' && !a.isGK) { a.passive = true; a.st.pos = { x: a.st.pos.x, y: 33 }; }
    e.input({ kind: 'moveDir', dir: { x: 1, y: 0 } });
    e.input({ kind: 'sprint', on: true });
    const x0 = e.user.st.pos.x;
    let emptyAt = -1;
    let at20 = -1;
    for (let i = 0; i < 60 * 12 && e.owner === e.user && e.user.st.pos.x < HL - 20; i++) {
      e.step(1 / 60);
      const run = e.user.st.pos.x - x0;
      if (at20 < 0 && run >= 20) at20 = e.user.st.stamina;
      if (emptyAt < 0 && e.user.st.stamina < 0.12) emptyAt = run;
    }
    expect(at20).toBeGreaterThan(0.4);
    expect(emptyAt).toBeGreaterThan(26);
    expect(emptyAt).toBeLessThan(45);
    expect(e.longCarry).toBeGreaterThan(0.5);
  });
});
