/**
 * Pure input math for the "Falso Çizgisi" kick gesture (no DOM, no three.js) so it can be
 * unit-tested. Screen points are CSS pixels with y pointing DOWN; every computation converts
 * them to a math frame (y up). Any camera that looks down at the pitch preserves orientation
 * between that math frame and the pitch frame, so "left on screen" is "left of travel" on the pitch.
 */
import type { KickParams, MomentType, Vec2, Vec3 } from '../../core/types';

export interface GesturePoint { x: number; y: number }

export interface GestureOptions {
  /** Chord length in px that maps to full power. */
  fullPowerPx: number;
  /** Shorter gestures are ignored (treated as a tap / cancel). Default 18 px. */
  minPx?: number;
  /** Loft from the slider, 0..1. */
  loft: number;
  /** Screen point → pitch ground point. Default: screen math frame (x right, y up). */
  toGround?: (p: Vec2) => Vec2 | null;
  /** Bulge (fraction of the chord length) that maps to full curl. Default 0.2. */
  curlAtDeviation?: number;
  /** Bulges below this fraction are treated as a straight line. Default 0.035. */
  curlDeadZone?: number;
  /**
   * Launch direction is rotated toward the bulge by this angle at |curl| = 1, so a curled
   * ball starts along the drawn path and bends back toward its end (rad). Default 0.16.
   */
  aimCompensation?: number;
}

export interface GestureAnalysis {
  /** Chord length in px. */
  length: number;
  /** Normalised chord direction in the screen math frame (y up). */
  screenDir: Vec2;
  /** Signed max perpendicular deviation / chord length; + = bulge to the LEFT of the chord. */
  bulge: number;
  power: number;
  curl: number;
}

const EPS = 1e-9;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampS = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);

/** Screen (y down) → math frame (y up) relative vector. */
function rel(a: GesturePoint, b: GesturePoint): Vec2 {
  return { x: b.x - a.x, y: -(b.y - a.y) };
}

export function rotate(v: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

function normalize(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  return l > EPS ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
}

/** Power / curl analysis of a drawn path (screen px). Null when degenerate. */
export function analyzeGesture(points: readonly GesturePoint[], opts: Pick<GestureOptions, 'fullPowerPx' | 'minPx' | 'curlAtDeviation' | 'curlDeadZone'>): GestureAnalysis | null {
  if (points.length < 2) return null;
  const minPx = opts.minPx ?? 18;
  const start = points[0];
  const end = points[points.length - 1];
  const chord = rel(start, end);
  const length = Math.hypot(chord.x, chord.y);
  if (!Number.isFinite(length) || length < minPx) return null;
  const dir = { x: chord.x / length, y: chord.y / length };

  // Signed maximum perpendicular deviation (positive = left of the chord).
  let dev = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const r = rel(start, points[i]);
    const d = dir.x * r.y - dir.y * r.x;
    if (Math.abs(d) > Math.abs(dev)) dev = d;
  }
  const bulge = dev / length;

  const k = Math.max(0.02, opts.curlAtDeviation ?? 0.2);
  const dz = Math.min(k * 0.9, Math.max(0, opts.curlDeadZone ?? 0.035));
  const mag = clamp01((Math.abs(bulge) - dz) / (k - dz));
  // A path bulging RIGHT of its chord turns left while it is drawn → the ball bends left → curl > 0.
  const curl = mag === 0 ? 0 : -Math.sign(bulge) * mag;

  const full = Math.max(minPx + 1, opts.fullPowerPx);
  const power = clamp01((length - minPx) / (full - minPx));
  return { length, screenDir: dir, bulge, power: Math.max(0.04, power), curl };
}

/**
 * Converts a drawn path into KickParams. Direction comes from the ground projection of the
 * start of the chord (perspective keeps straight ground lines straight on screen, so a short
 * step along the chord gives the exact ground direction and never crosses the horizon).
 */
export function gestureToKick(points: readonly GesturePoint[], opts: GestureOptions): KickParams | null {
  const a = analyzeGesture(points, opts);
  if (!a) return null;
  const start = points[0];
  let dir: Vec2 | null = null;
  if (opts.toGround) {
    const step = Math.min(24, a.length * 0.5);
    const p0 = opts.toGround({ x: start.x, y: start.y });
    const p1 = opts.toGround({ x: start.x + a.screenDir.x * step, y: start.y - a.screenDir.y * step });
    if (p0 && p1) {
      const d = normalize({ x: p1.x - p0.x, y: p1.y - p0.y });
      if (d.x !== 0 || d.y !== 0) dir = d;
    }
  }
  if (!dir) dir = a.screenDir;
  const comp = opts.aimCompensation ?? 0.16;
  dir = normalize(rotate(dir, -a.curl * comp));
  return { dir, power: a.power, loft: clamp01(opts.loft), curl: a.curl };
}

/**
 * Aftertouch from a swipe made shortly after the kick. The component of the swipe that is
 * perpendicular to the kick's on-screen direction becomes spin (+ = swipe to the left = bend left).
 */
export function swipeToAftertouch(kickScreenDir: Vec2, swipe: { dx: number; dy: number }, dtMs: number, viewportPx: number, windowMs = 400): number {
  if (!(dtMs >= 0) || dtMs > windowMs) return 0;
  const s = { x: swipe.dx, y: -swipe.dy };
  const len = Math.hypot(s.x, s.y);
  if (len < Math.max(16, viewportPx * 0.03)) return 0;
  const d = normalize(kickScreenDir);
  if (d.x === 0 && d.y === 0) return 0;
  const perp = d.x * s.y - d.y * s.x;
  // Mostly-parallel swipes are not aftertouch.
  if (Math.abs(perp) < len * 0.5) return 0;
  return clampS(perp / Math.max(60, viewportPx * 0.22));
}

/** Seconds of predicted ball path shown for a vision attribute (1..99). */
export function previewSeconds(vision: number): number {
  const v = clamp01((vision - 20) / 75);
  return 0.45 + 2.05 * v;
}

/** Keep the part of a predicted path (sampled every `sampleDt` s) the player can "see". */
export function truncatePath(path: readonly Vec3[], seconds: number, sampleDt = 1 / 30): Vec3[] {
  if (path.length === 0) return [];
  const n = Math.max(2, Math.min(path.length, Math.round(seconds / sampleDt) + 1));
  return path.slice(0, n);
}

export interface LoftContext {
  type: MomentType;
  ball: Vec2;
  /** Attack direction sign (+1 = toward +x goal). */
  attackSign?: number;
}

/** A sensible default loft for the situation (the slider still overrides it). */
export function defaultLoft(ctx: LoftContext): number {
  const goalX = 52.5 * (ctx.attackSign ?? 1);
  const dx = Math.abs(goalX - ctx.ball.x);
  const dist = Math.hypot(dx, ctx.ball.y);
  switch (ctx.type) {
    case 'penalty': return 0.06;
    case 'corner': return 0.55;
    case 'free_kick':
    case 'drill_free_kick':
      return dist < 30 ? 0.3 : 0.38;
    default: break;
  }
  if (dx < 16 && Math.abs(ctx.ball.y) > 20) return 0.5;   // cross from the byline area
  if (dist < 18) return 0.08;                               // inside the box: keep it low
  if (dist > 38) return 0.24;                               // long ball
  return 0.13;
}

/** Signed perpendicular distance of a point from segment a→b (screen px, + = left in math frame). */
export function pointSide(a: GesturePoint, b: GesturePoint, p: GesturePoint): number {
  const ab = rel(a, b);
  const ap = rel(a, p);
  const l = Math.hypot(ab.x, ab.y);
  if (l < EPS) return 0;
  return (ab.x * ap.y - ab.y * ap.x) / l;
}

/** Thin out a drawn path so it keeps at most `max` points (always keeps the endpoints). */
export function simplifyPath<T extends GesturePoint>(points: readonly T[], max = 64): T[] {
  if (points.length <= max) return points.slice();
  const out: T[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

/** Does a tap count as a double tap of the previous one? */
export function isDoubleTap(prev: { x: number; y: number; time: number } | null, cur: { x: number; y: number; time: number }, maxMs = 320, maxPx = 60): boolean {
  if (!prev) return false;
  return cur.time - prev.time <= maxMs && Math.hypot(cur.x - prev.x, cur.y - prev.y) <= maxPx;
}
