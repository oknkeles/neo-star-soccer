/**
 * Player locomotion: a speed + heading model instead of free vector steering, so running looks
 * and plays like football — a Hill-type acceleration curve (quick to a jog, full sprint after
 * ~2 s), real braking distances, a turning radius that grows with speed (a sharp cut needs the
 * speed taken off first; small heading changes are smooth and keep the momentum), slower
 * side-steps and back-pedalling than running forward, and a body orientation that is smoothed
 * separately from the velocity (critically damped, no snaps). Pure math, shared by the engine
 * and the AI's run-time predictions.
 */
import type { Vec2 } from '../../core/types';
import { clamp } from '../../core/util';

export interface LocoParams {
  /** Top speed for this tick (pace, fatigue, urgency already applied to the wanted speed). */
  vtop: number;
  /** Initial acceleration from a standstill (m/s²). */
  a0: number;
  /** Maximum braking deceleration (m/s²). */
  brake: number;
  /** Lateral grip (m/s²): turn rate ≤ grip / speed. */
  grip: number;
  /** Speed fraction kept running sideways / backwards relative to the body. */
  side: number;
  back: number;
}

/** Below this speed the direction is free (a plant-and-go from a near standstill). */
export const V_FREE = 1.2;
/** Turn-rate cap at low speed (rad/s). */
const OMEGA0 = 9;

/** Stride (one full gait cycle, two steps) in metres at a running speed — shared with the 3D poses. */
export function strideLen(speed: number): number {
  return 1.1 + Math.min(1.4, Math.max(0, speed) * 0.17);
}

export function angDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Speed fraction allowed when moving at `phi` (rad) away from the way the body faces. */
export function bodyCap(phi: number, p: Pick<LocoParams, 'side' | 'back'>): number {
  const f = Math.abs(phi);
  if (f < 0.7) return 1;
  if (f < Math.PI / 2) return 1 + (p.side - 1) * ((f - 0.7) / (Math.PI / 2 - 0.7));
  return p.side + (p.back - p.side) * ((f - Math.PI / 2) / (Math.PI / 2));
}

/** Share of the wanted speed that can be carried into a turn of `th` (rad): a sharp cut slows him. */
export function turnKeep(th: number): number {
  const t = Math.abs(th);
  return t < 0.25 ? 1 : clamp(0.5 + 0.5 * Math.cos(t), 0, 1);
}

/**
 * Advance a velocity one step toward the wanted velocity `want` (m/s) for a body facing `facing`.
 * Mutates `vel`.
 */
export function locoStep(vel: Vec2, want: Vec2, facing: number, p: LocoParams, dt: number): void {
  const sp = Math.hypot(vel.x, vel.y);
  const ws = Math.hypot(want.x, want.y);
  const wh = ws > 0.05 ? Math.atan2(want.y, want.x) : 0;
  // side-steps / back-pedalling are slower than running the way he faces
  const cap = ws > 0.05 ? p.vtop * bodyCap(angDiff(facing, wh), p) : 0;
  const target = Math.min(ws, cap);
  if (sp < V_FREE) {
    // near a standstill: plant and go in any direction
    const tx = ws > 0.05 ? (want.x / ws) * target : 0;
    const ty = ws > 0.05 ? (want.y / ws) * target : 0;
    let ax = tx - vel.x;
    let ay = ty - vel.y;
    const am = Math.hypot(ax, ay);
    const braking = ax * vel.x + ay * vel.y < 0;
    const lim = (braking ? p.brake : p.a0) * dt;
    if (am > lim) { ax *= lim / am; ay *= lim / am; }
    vel.x += ax;
    vel.y += ay;
    return;
  }
  const h = Math.atan2(vel.y, vel.x);
  const th = ws > 0.05 ? angDiff(h, wh) : 0;
  const goal = ws > 0.05 ? target * turnKeep(th) : 0;
  // heading: the turn rate is limited by grip (radius grows with speed)
  const om = Math.min(OMEGA0, p.grip / sp);
  const nh = h + clamp(th, -om * dt, om * dt);
  // speed: Hill-type acceleration (strong at first, fading toward top speed); smooth braking
  let ns: number;
  if (goal > sp) ns = Math.min(goal, sp + p.a0 * Math.max(0.08, 1 - sp / (p.vtop * 1.04 + 0.01)) * dt);
  else ns = Math.max(goal, sp - Math.min(p.brake, 1.5 + (sp - goal) * 7) * dt);
  vel.x = Math.cos(nh) * ns;
  vel.y = Math.sin(nh) * ns;
}

/**
 * Body orientation: a critically damped turn toward `want` (rad) with a capped turn speed.
 * Returns the new angular velocity; mutates nothing.
 */
export function faceStep(facing: number, turnV: number, want: number, k: number, maxRate: number, dt: number): { facing: number; turnV: number } {
  const err = angDiff(facing, want);
  let w = turnV + (k * err - 2 * Math.sqrt(k) * turnV) * dt;
  w = clamp(w, -maxRate, maxRate);
  return { facing: facing + w * dt, turnV: w };
}

/**
 * Distance covered in `t` s starting at `v0` toward top speed `vmax` with the Hill-type curve
 * (used by the AI to time passes into a run).
 */
export function runDistance(t: number, v0: number, vmax: number, a0: number): number {
  if (vmax <= 0.05) return 0;
  const V = vmax * 1.04;
  const tau = V / Math.max(0.5, a0);
  const v = Math.min(v0, V * 0.999);
  // v(t) = V − (V − v0)·e^(−t/τ)  (capped at vmax)
  let d = V * t - (V - v) * tau * (1 - Math.exp(-t / tau));
  const tCap = v >= vmax ? 0 : -tau * Math.log((V - vmax) / (V - v));
  if (t > tCap) d = (V * tCap - (V - v) * tau * (1 - Math.exp(-tCap / tau))) + vmax * (t - tCap);
  return Math.max(0, d);
}

/** Time to cover `d` m (inverse of runDistance, a few Newton steps). */
export function runTimeFor(d: number, v0: number, vmax: number, a0: number): number {
  if (d <= 0) return 0;
  if (vmax <= 0.05) return Infinity;
  let t = d / Math.max(0.5, Math.max(v0, vmax * 0.7));
  for (let i = 0; i < 6; i++) {
    const f = runDistance(t, v0, vmax, a0) - d;
    const V = vmax * 1.04;
    const tau = V / Math.max(0.5, a0);
    const v = Math.min(vmax, V - (V - Math.min(v0, V * 0.999)) * Math.exp(-t / tau));
    t = Math.max(0, t - f / Math.max(0.3, v));
  }
  return t;
}
