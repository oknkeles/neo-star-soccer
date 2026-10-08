/**
 * Calm ("Sakin") controls: drawn path → KickParams, the gentle pass assist, freeze semantics
 * (engine time does not advance while aiming) and moment continuity after a completed pass.
 */
import { describe, expect, it } from 'vitest';
import { CalmAim, FULL_DRAW, drawnToKick } from '../calm';
import { analyzeAim } from '../../engine/aim';
import { assistInfo, createMoment, type MomentEngine } from '../../engine/api';
import { makeSetup } from '../../engine/__tests__/helpers';
import type { Vec2 } from '../../../core/types';

const user = (e: MomentEngine) => e.state.players.find((p) => p.isUser)!;

/** Run until the user has the ball (dribbling toward goal). */
function untilUserBall(e: MomentEngine, maxS = 6): boolean {
  for (let i = 0; i < maxS * 60; i++) {
    if (e.state.ball.ownerId === user(e).id && e.canKick()) return true;
    e.input({ kind: 'moveDir', dir: { x: 1, y: 0 } });
    e.step(1 / 60);
  }
  return false;
}

/** Stroke samples along a quadratic curve from the ball (every ~0.5 m). */
function stroke(from: Vec2, ctrl: Vec2, to: Vec2): Vec2[] {
  const pts: Vec2[] = [];
  for (let k = 1; k <= 40; k++) {
    const u = k / 40;
    pts.push({
      x: (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * ctrl.x + u * u * to.x,
      y: (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * ctrl.y + u * u * to.y,
    });
  }
  return pts;
}

describe('calm aim: drawn path → kick', () => {
  const ball = { x: 10, y: 5 };

  it('straight stroke: direction along it, length = power, no curl', () => {
    const k = drawnToKick(ball, stroke(ball, { x: 18.5, y: 5 }, { x: 27, y: 5 }))!;
    expect(k.dir.x).toBeCloseTo(1, 5);
    expect(k.dir.y).toBeCloseTo(0, 5);
    expect(k.power).toBeCloseTo(17 / FULL_DRAW, 5);
    expect(k.curl).toBe(0);
    expect(k.end).toEqual({ x: 27, y: 5 });
  });

  it('bending left (counter-clockwise) = + curl, initial direction kept', () => {
    // starts toward +x, ends up to the left (+y) of that line
    const k = drawnToKick(ball, stroke(ball, { x: 22, y: 5 }, { x: 28, y: 12 }))!;
    expect(k.curl).toBeGreaterThan(0.3);
    expect(Math.atan2(k.dir.y, k.dir.x)).toBeLessThan(Math.atan2(7, 18));
    const r = drawnToKick(ball, stroke(ball, { x: 22, y: 5 }, { x: 28, y: -2 }))!;
    expect(r.curl).toBeLessThan(-0.3);
    expect(r.curl).toBeCloseTo(-k.curl, 5);
  });

  it('power is clamped and tiny strokes are ignored', () => {
    expect(drawnToKick(ball, [{ x: 10.5, y: 5.2 }])).toBeNull();
    const far = drawnToKick(ball, [{ x: 10 + FULL_DRAW * 2, y: 5 }])!;
    expect(far.power).toBe(1);
    const steep = drawnToKick(ball, stroke(ball, { x: 30, y: 5 }, { x: 14, y: 30 }))!;
    expect(Math.abs(steep.curl)).toBeLessThanOrEqual(1);
  });
});

describe('calm aim: freeze semantics', () => {
  it('engine time does not advance while frozen; resumes after the kick', () => {
    const e = createMoment(makeSetup('one_on_one', { seed: 3, difficulty: 0.3 }));
    expect(untilUserBall(e)).toBe(true);
    for (let i = 0; i < 20; i++) e.step(1 / 60);
    const t0 = e.state.time;
    const left0 = assistInfo(e).timeLeft;
    const snap = JSON.stringify({ b: e.state.ball.pos, p: e.state.players.map((p) => p.pos) });
    e.input({ kind: 'aimStart', freeze: true });
    expect(e.frozenForAim).toBe(true);
    for (let i = 0; i < 120; i++) e.step(1 / 60); // 2 s of frames
    expect(e.state.time).toBe(t0);
    expect(assistInfo(e).timeLeft).toBe(left0);
    expect(JSON.stringify({ b: e.state.ball.pos, p: e.state.players.map((p) => p.pos) })).toBe(snap);
    // running keys while frozen do not move anybody either
    e.input({ kind: 'moveDir', dir: { x: 0, y: 1 } });
    e.step(0.5);
    expect(e.state.time).toBe(t0);
    // kick: time runs again
    const aim = new CalmAim(e, { dir: { x: 1, y: 0 }, power: 0.8, loft: 0.05, curl: 0 }, 'shot');
    e.input({ kind: 'kick', params: aim.params() });
    expect(e.frozenForAim).toBe(false);
    e.step(0.1);
    expect(e.state.time).toBeGreaterThan(t0);
  });

  it('cancel resumes without a kick; no freeze when the ball is out of reach', () => {
    const e = createMoment(makeSetup('one_on_one', { seed: 3, difficulty: 0.3 }));
    expect(untilUserBall(e)).toBe(true);
    e.input({ kind: 'aimStart', freeze: true });
    e.input({ kind: 'aimCancel' });
    expect(e.frozenForAim).toBe(false);
    const t0 = e.state.time;
    e.step(0.1);
    expect(e.state.time).toBeGreaterThan(t0);
    const d = createMoment(makeSetup('defend', { seed: 2 }));
    for (let i = 0; i < 90; i++) d.step(1 / 60);
    if (!d.canKick()) {
      d.input({ kind: 'aimStart', freeze: true });
      expect(d.frozenForAim).toBe(false);
    }
  });
});

describe('calm aim: pass assist and continuity', () => {
  /** An open_play moment with the user on the ball and his nearest open team-mate ahead. */
  function setupPass(seed: number) {
    const e = createMoment(makeSetup('open_play', { seed, difficulty: 0.3 }));
    if (!untilUserBall(e)) return null;
    e.input({ kind: 'moveDir', dir: { x: 0, y: 0 } });
    const u = user(e);
    const mates = e.state.players.filter((p) => p.side === 'us' && !p.isUser && p.role !== 'GK')
      .map((p) => ({ p, d: Math.hypot(p.pos.x - u.pos.x, p.pos.y - u.pos.y) }))
      .filter((m) => m.d > 8 && m.d < 26)
      .sort((a, b) => a.d - b.d);
    return mates.length ? { e, mate: mates[0].p } : null;
  }

  it('a stroke drawn near a team-mate snaps onto his run (receivable pace) and the pass arrives', () => {
    let tested = 0;
    for (const seed of [5, 6, 7, 8, 9, 11]) {
      const s = setupPass(seed);
      if (!s) continue;
      const { e, mate } = s;
      e.input({ kind: 'aimStart', freeze: true });
      const b = e.state.ball.pos;
      const aim = new CalmAim(e, { dir: { x: 1, y: 0 }, power: 0.5, loft: 0, curl: 0 }, 'pass');
      // drawn a little short of him and slightly off: the assist fixes direction and power
      const end = { x: b.x + (mate.pos.x - b.x) * 0.7 + 1, y: b.y + (mate.pos.y - b.y) * 0.7 + 1 };
      aim.begin({ x: b.x + (end.x - b.x) * 0.2, y: b.y + (end.y - b.y) * 0.2 }, 'mouse');
      for (let k = 2; k <= 10; k++) aim.extend({ x: b.x + (end.x - b.x) * k / 10, y: b.y + (end.y - b.y) * k / 10 });
      // a stroke that ends far from him is not a pass to him
      const a0 = analyzeAim(e, aim.raw(), { drawnEnd: { x: b.x - 30, y: b.y + 30 } });
      expect(a0.snapped).toBe(false);
      const near = Math.hypot(end.x - mate.pos.x, end.y - mate.pos.y);
      const a = aim.analysis();
      if (!a.snapped || near > 10) continue;
      tested++;
      expect(a.kind).toBe('pass');
      expect(a.receiverId).toBe(mate.id);
      expect(a.path.length).toBeGreaterThan(5);
      // the ball reaches his area at a controllable speed
      expect(aim.end()).toBe(true);
      e.input({ kind: 'kick', params: aim.params() });
      let received = false;
      for (let i = 0; i < 60 * 4 && !e.isFinished(); i++) {
        e.step(1 / 60);
        const o = e.state.ball.ownerId;
        if (o && o !== user(e).id) { received = e.state.players.find((p) => p.id === o)?.side === 'us'; break; }
      }
      expect(received).toBe(true);
      // continuity: the moment does not end because a pass was completed
      expect(e.isFinished()).toBe(false);
      for (let i = 0; i < 60 * 3 && !e.isFinished(); i++) {
        if (i === 30) e.input({ kind: 'callForBall', through: false });
        e.step(1 / 60);
      }
      if (e.isFinished()) expect(['stale', 'time', 'pass_completed']).not.toContain(e.state.outcome);
    }
    expect(tested).toBeGreaterThan(0);
  });

  it('a drawn shot at the goal mouth reads as a shot', () => {
    const e = createMoment(makeSetup('one_on_one', { seed: 3, difficulty: 0.3 }));
    expect(untilUserBall(e)).toBe(true);
    for (let i = 0; i < 40 && !e.isFinished(); i++) { e.input({ kind: 'moveDir', dir: { x: 1, y: 0 } }); e.step(1 / 60); }
    e.input({ kind: 'aimStart', freeze: true });
    const b = e.state.ball.pos;
    const aim = new CalmAim(e, { dir: { x: 1, y: 0 }, power: 0.5, loft: 0, curl: 0 }, 'shot');
    const goal = { x: 52.5 + 6, y: 1.8 };
    aim.begin({ x: b.x + (goal.x - b.x) * 0.25, y: b.y + (goal.y - b.y) * 0.25 }, 'mouse');
    aim.extend({ x: b.x + (goal.x - b.x) * 0.6, y: b.y + (goal.y - b.y) * 0.6 });
    aim.extend(goal);
    const a = aim.analysis();
    expect(a.kind).toBe('shot');
    expect(a.params.power).toBeGreaterThan(0.5);
  });

  it('keyboard aim: rotate / power / loft change the kick and bump the version', () => {
    const e = createMoment(makeSetup('one_on_one', { seed: 3, difficulty: 0.3 }));
    expect(untilUserBall(e)).toBe(true);
    e.input({ kind: 'aimStart', freeze: true });
    const aim = new CalmAim(e, { dir: { x: 1, y: 0 }, power: 0.5, loft: 0, curl: 0 }, 'shot');
    const v0 = (aim.analysis(), aim.version);
    aim.rotate(0.3);
    aim.addPower(0.2);
    aim.cycleLoft(1);
    const p = aim.raw();
    expect(Math.atan2(p.dir.y, p.dir.x)).toBeCloseTo(0.3, 5);
    expect(p.power).toBeCloseTo(0.7, 5);
    expect(aim.loftIdx).toBe(1);
    aim.analysis();
    expect(aim.version).toBe(v0 + 1);
    aim.analysis();
    expect(aim.version).toBe(v0 + 1);
  });
});
