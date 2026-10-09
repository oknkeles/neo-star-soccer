/**
 * Ball-flight prediction and kick solvers. Everything here uses the exact same integrator
 * as the live simulation, so the predicted line, the AI's aim and reality agree.
 */
import type { BallState, KickParams, Vec2, Vec3 } from '../../core/types';
import { clamp } from '../../core/util';
import { BR, DRAG, DT, HL, HW } from './constants';
import { computeLaunch, kickSpeed, maxSpeed, type Kicker, type KickSpec } from './kick';
import { integrateBall, newAux, newReport, resetReport, type BallAux, type PhysEnv } from './physics';
import type { PathSample } from './internal';
import { hyp } from './geom';

export function freshBall(p: Vec3): BallState {
  return {
    pos: { x: p.x, y: p.y, z: p.z },
    vel: { x: 0, y: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    ownerId: null, lastTouchId: null, lastTouchSide: null,
  };
}

/** Ball state right after a noise-free kick from `from`. */
export function launched(from: Vec3, p: KickParams, k: Kicker, spec: KickSpec): BallState {
  const L = computeLaunch(p, k, spec, null);
  const b = freshBall(from);
  b.vel.x = L.vx; b.vel.y = L.vy; b.vel.z = L.vz;
  b.spin.x = L.wx; b.spin.y = L.wy; b.spin.z = L.wz;
  return b;
}

function copyBall(b: BallState): BallState {
  return {
    pos: { ...b.pos }, vel: { ...b.vel }, spin: { ...b.spin },
    ownerId: null, lastTouchId: b.lastTouchId, lastTouchSide: b.lastTouchSide,
  };
}

/**
 * Sampled flight of a free ball (every `every` sub-steps) until it rests, leaves the
 * pitch area, settles in a goal, or `maxT`. `spinScale` lets keepers mis-read curl.
 */
export function predictPath(b0: BallState, env: PhysEnv, maxT = 2.5, every = 4, spinScale = 1, aux0?: BallAux): PathSample[] {
  const b = copyBall(b0);
  if (spinScale !== 1) { b.spin.x *= spinScale; b.spin.y *= spinScale; b.spin.z *= spinScale; }
  const aux: BallAux = aux0 ? { ...aux0 } : newAux();
  const rep = newReport();
  const out: PathSample[] = [{ t: 0, x: b.pos.x, y: b.pos.y, z: b.pos.z }];
  let t = 0;
  let k = 0;
  let inGoalFor = 0;
  while (t < maxT) {
    resetReport(rep);
    integrateBall(b, aux, env, DT, rep);
    t += DT;
    k++;
    if (k % every === 0) out.push({ t, x: b.pos.x, y: b.pos.y, z: b.pos.z });
    const v = b.vel;
    if (b.pos.z <= BR + 1e-3 && Math.abs(v.z) < 1e-3 && v.x * v.x + v.y * v.y < 0.04) break;
    if (Math.abs(b.pos.x) > HL + 3 || Math.abs(b.pos.y) > HW + 2) break;
    if (aux.inGoal !== 0 && ++inGoalFor > 24) break;
  }
  const last = out[out.length - 1];
  if (last.t < t) out.push({ t, x: b.pos.x, y: b.pos.y, z: b.pos.z });
  return out;
}

/** Interpolated crossing of the plane x = planeX (approached from either side). */
export function crossPlane(path: PathSample[], planeX: number): PathSample | null {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if ((a.x - planeX) * (b.x - planeX) <= 0 && a.x !== b.x) {
      const s = (planeX - a.x) / (b.x - a.x);
      return { t: a.t + (b.t - a.t) * s, x: planeX, y: a.y + (b.y - a.y) * s, z: a.z + (b.z - a.z) * s };
    }
  }
  return null;
}

/** Point along the path at horizontal distance `d` from the start (interpolated). */
export function atDistance(path: PathSample[], d: number): PathSample | null {
  const s = path[0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const da = hyp(a.x - s.x, a.y - s.y);
    const db = hyp(b.x - s.x, b.y - s.y);
    if (db >= d && db > da) {
      const f = (d - da) / (db - da);
      return { t: a.t + (b.t - a.t) * f, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
    }
  }
  return null;
}

/** Power (0..1) that produces launch `speed` for this kicker / kick type. */
export function powerForSpeed(k: Kicker, spec: Pick<KickSpec, 'kind' | 'isShot'>, speed: number, curl = 0): number {
  const vmax = maxSpeed(k.attrs, spec);
  const vmin = spec.kind === 'header' ? 4 : 6;
  const raw = speed / (1 - 0.1 * Math.abs(clamp(curl, -1, 1)));
  return clamp((raw - vmin) / (vmax - vmin), 0, 1);
}

/**
 * Launch speed for a ground pass that still travels at `arrive` m/s after `d` metres
 * (rolling friction + quadratic drag, closed form).
 */
export function groundPassSpeed(env: PhysEnv, d: number, arrive: number): number {
  const k = DRAG;
  const r = env.rollDecel / k;
  return Math.sqrt(Math.max(0, (arrive * arrive + r) * Math.exp(2 * k * d) - r)) * 1.04;
}

/** Ground pass parameters from `from` to `to`, arriving at about `arrive` m/s. */
export function groundPass(env: PhysEnv, k: Kicker, from: Vec2, to: Vec2, arrive = 7): KickParams {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = hyp(dx, dy);
  const sp = groundPassSpeed(env, d, arrive);
  const spec = { kind: 'ground' as const, isShot: false };
  return { dir: { x: dx / (d || 1), y: dy / (d || 1) }, power: powerForSpeed(k, spec, Math.min(sp, kickSpeed(k.attrs, { dir: { x: 1, y: 0 }, power: 1, loft: 0, curl: 0 }, spec))), loft: 0, curl: 0 };
}

function rot(v: Vec2, a: number): Vec2 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/**
 * Aim a shot so that the noise-free ball crosses the goal line plane x = goalX at (y, z).
 * Power and curl are given; direction and loft are solved iteratively.
 */
export function solveShot(
  env: PhysEnv, k: Kicker, spec: KickSpec, from: Vec3, goalX: number, ty: number, tz: number, power: number, curl: number, loft0 = 0.06,
): { params: KickParams; hit: PathSample | null } {
  let dir = { x: goalX - from.x, y: ty - from.y };
  const d0 = hyp(dir.x, dir.y) || 1;
  dir = { x: dir.x / d0, y: dir.y / d0 };
  let loft = loft0;
  let params: KickParams = { dir, power, loft, curl };
  let hit: PathSample | null = null;
  for (let it = 0; it < 7; it++) {
    params = { dir, power, loft, curl };
    const path = predictPath(launched(from, params, k, spec), env, 3, 2);
    hit = crossPlane(path, goalX);
    if (!hit) {
      // fell short: lift it a little
      loft = clamp(loft + 0.08, 0, 1);
      continue;
    }
    const ey = hit.y - ty;
    const ez = hit.z - tz;
    if (Math.abs(ey) < 0.04 && Math.abs(ez) < 0.06) break;
    const sgn = goalX > from.x ? 1 : -1;
    dir = rot(dir, -sgn * Math.atan2(ey, d0) * 0.95);
    loft = clamp(loft - Math.atan2(ez, d0) / 0.8, 0, 1);
  }
  return { params: { dir, power, loft, curl }, hit };
}

const LOFTS = [0.32, 0.42, 0.52, 0.64] as const;

/**
 * Lofted delivery (cross / chip / long ball): the ball comes down through height `zAt`
 * at the target point. Tries a few launch lofts and returns the most natural solution.
 */
export function solveLob(
  env: PhysEnv, k: Kicker, from: Vec3, to: Vec2, zAt: number, curl = 0, prefLoft = 0.45, lofts: readonly number[] = LOFTS,
): KickParams {
  const spec: KickSpec = { kind: 'ground', isShot: false, pressure: 0, difficulty: 0.5 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = hyp(dx, dy) || 1;
  let dir = { x: dx / d, y: dy / d };
  let best: KickParams | null = null;
  let bestScore = Infinity;
  for (const loft of lofts) {
    let lo = 0.05;
    let hi = 1;
    let p = 0.5;
    let ok = false;
    for (let it = 0; it < 12; it++) {
      p = (lo + hi) / 2;
      const path = predictPath(launched(from, { dir, power: p, loft, curl }, k, spec), env, 3.5, 2);
      // horizontal distance where the ball descends through zAt
      let reach = 0;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        if (b.z < a.z && a.z >= zAt && b.z <= zAt) { reach = hyp(b.x - from.x, b.y - from.y); break; }
      }
      if (!reach) reach = hyp(path[path.length - 1].x - from.x, path[path.length - 1].y - from.y) * 0.9;
      if (reach < d) lo = p; else hi = p;
      if (Math.abs(reach - d) < 0.3) { ok = true; break; }
    }
    const score = Math.abs(loft - prefLoft) + (ok ? 0 : 1) + (p > 0.97 ? 1 : 0);
    if (score < bestScore) { bestScore = score; best = { dir, power: p, loft, curl }; }
  }
  const sol = best ?? { dir, power: 0.7, loft: prefLoft, curl };
  // lateral correction (curl, wind)
  for (let it = 0; it < 3 && (curl !== 0 || env.windX !== 0 || env.windY !== 0); it++) {
    const path = predictPath(launched(from, { ...sol, dir }, k, spec), env, 3.5, 2);
    const at = atDistance(path, d);
    if (!at) break;
    const ang = Math.atan2(at.y - from.y, at.x - from.x) - Math.atan2(dy, dx);
    dir = rot(dir, -ang);
  }
  return { ...sol, dir };
}
