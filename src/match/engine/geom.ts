/** Small geometry helpers and the expected-goals model shared by AI, outcome and autoResolve. */
import type { Vec2 } from '../../core/types';
import { clamp } from '../../core/util';
import { GW, HL, PITCH } from './constants';

export const hyp = (x: number, y: number) => Math.sqrt(x * x + y * y);
export const dist = (a: Vec2, b: Vec2) => hyp(a.x - b.x, a.y - b.y);

/** Distance from point p to segment ab, and the segment parameter of the closest point. */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; s: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let s = l2 > 1e-12 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  return { d: hyp(px - (ax + dx * s), py - (ay + dy * s)), s };
}

/** Angle (rad) subtended by the goal mouth at point p, attacking toward `dir`. */
export function goalAngle(p: Vec2, dir: 1 | -1): number {
  const gx = dir * HL;
  const a1 = Math.atan2(GW - p.y, (gx - p.x) * dir);
  const a2 = Math.atan2(-GW - p.y, (gx - p.x) * dir);
  return Math.abs(a1 - a2);
}

export function distToGoal(p: Vec2, dir: 1 | -1): number {
  return hyp(dir * HL - p.x, p.y);
}

/** Inside the penalty area that `dir` attacks. */
export function inBox(p: Vec2, dir: 1 | -1): boolean {
  return p.x * dir > HL - PITCH.penaltyBoxDepth && Math.abs(p.y) < PITCH.penaltyBoxHalfWidth;
}

/** Base xG for an unopposed shot with the feet (before pressure / blockers / keeper). */
export function baseXg(p: Vec2, dir: 1 | -1, header = false): number {
  const d = distToGoal(p, dir);
  if (p.x * dir > HL) return 0;
  const th = goalAngle(p, dir);
  const z = 2.6 - 4.6 * th + 0.05 * d;
  let xg = 1 / (1 + Math.exp(z));
  if (header) xg *= 0.55;
  return clamp(xg, 0.005, 0.95);
}

/** Wrap an angle to (−π, π]. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

export function rotate(v: Vec2, ang: number): Vec2 {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function unit(x: number, y: number): Vec2 {
  const l = hyp(x, y);
  return l > 1e-9 ? { x: x / l, y: y / l } : { x: 1, y: 0 };
}
