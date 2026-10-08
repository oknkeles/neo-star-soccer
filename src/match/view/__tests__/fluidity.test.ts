/**
 * Fluidity harness (deterministic frame clock): drives a moment like the 3D view does
 * (controls → engine.step(dt) → rendered positions → camera) and measures jitter.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { assistPass, createMoment, type MomentEngine } from '../../engine/api';
import { makeSetup } from '../../engine/__tests__/helpers';
import { createCameraRig, createFramingDirector, desiredFraming } from '../camera';
import type { MomentType, Vec3 } from '../../../core/types';

interface Sample { user: Vec3; ball: Vec3; cam: Vec3; ownerUser: boolean; dt: number }

/** Velocity change between consecutive frames (m/s), dt-normalised so dropped frames don't count. */
function jerk(xs: Sample[], key: 'user' | 'ball' | 'cam'): { mean: number; max: number } {
  let sum = 0; let max = 0; let n = 0;
  for (let i = 2; i < xs.length; i++) {
    const a = xs[i - 2][key]; const b = xs[i - 1][key]; const c = xs[i][key];
    const d1 = xs[i - 1].dt; const d2 = xs[i].dt;
    const j = Math.hypot((c.x - b.x) / d2 - (b.x - a.x) / d1, (c.y - b.y) / d2 - (b.y - a.y) / d1, (c.z - b.z) / d2 - (b.z - a.z) / d1);
    sum += j; n++; if (j > max) max = j;
  }
  return { mean: n ? sum / n : 0, max };
}

/** Drive like the view: dt per frame, rendered = pos + vel·lag, camera rig follows desiredFraming. */
function drive(e: MomentEngine, frames: number, dts: (i: number) => number, act: (e: MomentEngine, i: number) => void, overview?: (e: MomentEngine) => { x: number; y: number } | null): Sample[] {
  const cam = new THREE.PerspectiveCamera(52, 16 / 9, 0.3, 1500);
  const rig = createCameraRig(cam);
  const director = createFramingDirector();
  const out: Sample[] = [];
  const u0 = e.state.players.find((p) => p.isUser)!;
  rig.snap(desiredFraming({ mode: 'behind', user: u0.pos, ball: e.state.ball.pos, ballVel: e.state.ball.vel, aiming: false, followBall: false, aspect: 16 / 9 }));
  for (let i = 0; i < frames && !e.isFinished(); i++) {
    const dt = dts(i);
    act(e, i);
    e.step(dt);
    const s = e.state;
    const lag = Math.min(0.02, Math.max(0, e.lag ?? 0));
    const u = s.players.find((p) => p.isUser)!;
    const user = { x: u.pos.x + u.vel.x * lag, y: u.pos.y + u.vel.y * lag, z: 0 };
    const bv = s.ball.vel;
    const ball = { x: s.ball.pos.x + bv.x * lag, y: s.ball.pos.y + bv.y * lag, z: Math.max(0, s.ball.pos.z + bv.z * lag) };
    const sp = Math.hypot(bv.x, bv.y);
    const followBall = !s.ball.ownerId && (s.phase === 'flight' || sp > 14) && s.ball.lastTouchSide === 'us';
    const ov = overview?.(e) ?? null;
    rig.update(dt, director.frame(dt, { mode: 'behind', user, ball, ballVel: bv, aiming: false, followBall: followBall && !ov, aspect: 16 / 9, overview: ov }), ov ? 2.4 : 3);
    out.push({ user, ball, cam: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, ownerUser: s.ball.ownerId === u.id, dt });
  }
  return out;
}

const DT60 = () => 1 / 60;
/** A realistic rAF clock: 59.94 Hz with a dropped frame every ~2 s. */
const DTREAL = (i: number) => (i % 120 === 77 ? 2 / 59.94 : 1 / 59.94);

function dribbleRun(type: MomentType, dts: (i: number) => number) {
  const e = createMoment(makeSetup(type, { seed: 3, difficulty: 0.3 }));
  const s = drive(e, 60 * 4, dts, (en) => en.input({ kind: 'moveDir', dir: { x: 1, y: 0 } }));
  const win = s.slice(70, 200).filter((x) => x.ownerUser);
  let rel = 0; let rel2 = 0;
  for (const x of win) { const d = Math.hypot(x.ball.x - x.user.x, x.ball.y - x.user.y); rel += d; rel2 += d * d; }
  const n = win.length || 1;
  return {
    frames: win.length,
    user: jerk(win, 'user'), ball: jerk(win, 'ball'), cam: jerk(win, 'cam'),
    ballLeadStd: Math.sqrt(Math.max(0, rel2 / n - (rel / n) ** 2)),
  };
}

function passCam(dts: (i: number) => number) {
  const e = createMoment(makeSetup('open_play', { seed: 5, difficulty: 0.3 }));
  let passed = -1;
  const s = drive(e, 60 * 5, dts, (en, i) => {
    const u = en.state.players.find((p) => p.isUser)!;
    if (passed < 0 && en.state.ball.ownerId === u.id && i > 40) {
      const p = assistPass(en, { pref: { x: 0, y: 1 } });
      if (p) { en.input({ kind: 'kick', params: p }); passed = i; }
    }
  });
  const win = passed >= 0 ? s.slice(passed, passed + 150) : [];
  return { passedAt: passed, cam: jerk(win, 'cam'), ball: jerk(win.slice(3), 'ball') };
}

/** Run, stop, turn: how abruptly the user's player (and the camera) react. */
function stopTurn(dts: (i: number) => number) {
  const e = createMoment(makeSetup('open_play', { seed: 4, difficulty: 0.3 }));
  const s = drive(e, 60 * 4, dts, (en, i) => {
    const d = i < 90 ? { x: 1, y: 0 } : i < 130 ? { x: 0, y: 0 } : i < 190 ? { x: 0, y: 1 } : { x: -1, y: 0 };
    en.input({ kind: 'moveDir', dir: d });
  });
  return { user: jerk(s.slice(40), 'user'), cam: jerk(s.slice(40), 'cam') };
}

/** Calm aim: SPACE freezes, the camera eases to the overview and back (no cut). */
function aimCam(dts: (i: number) => number) {
  const e = createMoment(makeSetup('one_on_one', { seed: 3, difficulty: 0.3 }));
  let frozeAt = -1;
  let frozenFrames = 0;
  let still = true;
  let t0 = 0;
  const s = drive(e, 60 * 7, dts, (en, i) => {
    if (frozeAt < 0) {
      en.input({ kind: 'moveDir', dir: { x: 1, y: 0 } });
      if (i > 60 && en.canKick()) { en.input({ kind: 'aimStart', freeze: true }); frozeAt = i; t0 = en.state.time; }
    } else if (en.frozenForAim) {
      frozenFrames++;
      if (en.state.time !== t0) still = false;
      if (i - frozeAt > 150) en.input({ kind: 'aimCancel' });
    }
  }, (en) => (en.frozenForAim ? { x: en.state.ball.pos.x + 18, y: en.state.ball.pos.y + 5 } : null));
  const win = frozeAt >= 0 ? s.slice(Math.max(2, frozeAt - 10), frozeAt + 260) : [];
  let maxStep = 0;
  for (let i = 1; i < win.length; i++) {
    const a = win[i - 1].cam; const b = win[i].cam;
    maxStep = Math.max(maxStep, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return { frozeAt, frozenFrames, timeStill: still, cam: jerk(win, 'cam'), maxCamStepM: maxStep };
}

function aiFlips(): { flips: number; snaps: number; players: number; seconds: number } {
  const e = createMoment(makeSetup('open_play', { seed: 9, difficulty: 0.3 }));
  const hist = new Map<string, number[]>();
  let frames = 0;
  for (let i = 0; i < 60 * 12 && !e.isFinished(); i++) {
    e.step(1 / 60);
    frames++;
    for (const p of e.state.players) {
      if (p.isUser) continue;
      let h = hist.get(p.id);
      if (!h) { h = []; hist.set(p.id, h); }
      h.push(p.facing);
    }
  }
  // a flip: the facing swings by > 100° and back within 0.6 s (36 frames)
  let flips = 0;
  const ang = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
  for (const h of hist.values()) {
    for (let i = 0; i + 36 < h.length; i += 6) {
      let far = -1;
      for (let k = i + 1; k < i + 36; k++) if (ang(h[i], h[k]) > (100 * Math.PI) / 180) { far = k; break; }
      if (far > 0) {
        for (let k = far + 1; k <= i + 36; k++) if (ang(h[i], h[k]) < (30 * Math.PI) / 180) { flips++; i += 30; break; }
      }
    }
  }
  // a snap: the engine facing jumps > 25° in one 60 Hz frame (visible pop even through the rig smoothing)
  let snaps = 0;
  for (const h of hist.values()) for (let i = 1; i < h.length; i++) if (ang(h[i - 1], h[i]) > (25 * Math.PI) / 180) snaps++;
  return { flips, snaps, players: hist.size, seconds: frames / 60 };
}

describe('fluidity harness', () => {
  it('measures jitter', () => {
    const r = {
      dribble60: dribbleRun('one_on_one', DT60),
      dribbleReal: dribbleRun('one_on_one', DTREAL),
      pass60: passCam(DT60),
      passReal: passCam(DTREAL),
      stopTurn: stopTurn(DT60),
      ai: aiFlips(),
      aimCam: aimCam(DTREAL),
    };
    process.stdout.write("\nFLUIDITY " + JSON.stringify(r, (_k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)) + "\n");
    expect(r.dribble60.frames).toBeGreaterThan(30);
    // the frozen aim really stops time, and the camera eases (no hard cut: < 0.5 m per frame)
    expect(r.aimCam.frozeAt).toBeGreaterThan(0);
    expect(r.aimCam.timeStill).toBe(true);
    expect(r.aimCam.maxCamStepM).toBeLessThan(0.5);
    // no 1-frame facing flips of AI players
    expect(r.ai.snaps).toBe(0);
  });
});
