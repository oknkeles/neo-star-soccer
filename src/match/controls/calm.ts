/**
 * "Sakin" (calm) controls: the game stops while the user sets his kick. Shared by the 3D and 2D
 * views through Controls. Two ways to aim while frozen:
 *  - draw: press near the ball and drag. The stroke's initial direction = kick direction, its
 *    length = power, its sideways bend = curl (KickParams convention: + = bends left);
 *  - keys: A / D rotate, W / S power, Q / E curl, Z loft (Yerden / Yarım / Havadan).
 * The noise-free analysis (full path, landing, pass / shot, interceptors, gentle pass assist)
 * comes from engine/aim.ts.
 */
import type { KickParams, Vec2 } from '../../core/types';
import { AIM_LOFTS, analyzeAim, loftIndex, type AimAnalysis } from '../engine/aim';
import type { MomentEngine } from '../engine/api';

/** Drawn length (m, chord from the ball) for 100 % power. */
export const FULL_DRAW = 34;
/** Angle (rad) between the stroke's initial direction and its chord for full curl. */
export const FULL_BEND = 0.42;
/** Shorter strokes are ignored (a click, not a drawing). */
export const MIN_DRAW = 1.5;
/** Bend below this angle (rad) counts as straight (hand jitter). */
const BEND_DEAD = 0.05;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export interface DrawnKick {
  /** Unit kick direction (the stroke's initial direction). */
  dir: Vec2;
  /** 0..1 from the chord length (FULL_DRAW = 1). */
  power: number;
  /** -1..1, + = the stroke bends left of its initial direction. */
  curl: number;
  /** Where the stroke ends (pitch frame). */
  end: Vec2;
  /** Chord length (m). */
  length: number;
}

/**
 * A stroke drawn from the ball (pitch frame) → kick parameters (without loft).
 * `pts` are the pointer samples in order; the ball is the implicit first point.
 */
export function drawnToKick(ball: Vec2, pts: readonly Vec2[]): DrawnKick | null {
  if (!pts.length) return null;
  const end = pts[pts.length - 1];
  const cx = end.x - ball.x;
  const cy = end.y - ball.y;
  const L = Math.hypot(cx, cy);
  if (!(L >= MIN_DRAW)) return null;
  // initial direction: the first sample past ~22 % of the chord (1.2 .. 4 m) from the ball
  const near = clamp(L * 0.22, 1.2, 4);
  let dx = cx / L;
  let dy = cy / L;
  for (const p of pts) {
    const px = p.x - ball.x;
    const py = p.y - ball.y;
    const l = Math.hypot(px, py);
    if (l >= near) { dx = px / l; dy = py / l; break; }
  }
  // signed angle from the initial direction to the chord: chord to the left = the ball bends left (+)
  const ang = Math.atan2(dx * cy - dy * cx, dx * cx + dy * cy);
  const bend = Math.abs(ang) < BEND_DEAD ? 0 : ang - Math.sign(ang) * BEND_DEAD;
  return {
    dir: { x: dx, y: dy },
    power: clamp(L / FULL_DRAW, 0.05, 1),
    curl: clamp(bend / (FULL_BEND - BEND_DEAD), -1, 1),
    end: { x: end.x, y: end.y },
    length: L,
  };
}

export type AimSrc = 'key' | 'mouse' | 'touch';

/** The frozen aim being set (one per SPACE press). */
export class CalmAim {
  angle = 0;
  power = 0.55;
  curl = 0;
  loft = 0;
  /** Pointer samples of the stroke being / last drawn (pitch frame), null = keyboard aim. */
  stroke: Vec2[] | null = null;
  drawing = false;
  src: AimSrc = 'key';
  /** The user overrode the pass assist (keyboard power / curl after a snap). */
  manual = false;
  /** The user picked the loft himself (Z / wheel / toggle). */
  private loftTouched = false;
  /** Bumped whenever the analysis changes (views rebuild the path only then). */
  version = 0;
  private analysisCache: AimAnalysis | null = null;
  private dirty = true;

  constructor(private engine: MomentEngine, seed: KickParams, readonly intent: 'shot' | 'pass' | 'setPiece') {
    this.seed(seed);
  }

  seed(p: KickParams): void {
    this.angle = Math.atan2(p.dir.y, p.dir.x);
    this.power = clamp(p.power, 0.05, 1);
    this.curl = clamp(p.curl, -1, 1);
    this.loft = clamp(p.loft, 0, 1);
    this.dirty = true;
  }

  private ball(): Vec2 { const b = this.engine.state.ball.pos; return { x: b.x, y: b.y }; }

  /** The kick as set (before the pass assist). */
  raw(): KickParams {
    return { dir: { x: Math.cos(this.angle), y: Math.sin(this.angle) }, power: this.power, loft: this.loft, curl: this.curl };
  }

  get loftIdx(): number { return loftIndex(this.loft); }

  /** Make the visible (possibly snapped) kick the raw one before a manual change. */
  private adoptShown(): void {
    const a = this.analysisCache;
    if (!a || !a.snapped) return;
    this.seed(a.params);
  }

  rotate(da: number): void {
    if (!da) return;
    this.adoptShown();
    this.angle += da;
    this.stroke = null;
    this.dirty = true;
  }

  addPower(dp: number): void {
    if (!dp) return;
    this.adoptShown();
    if (this.analysisCache?.snapped) this.manual = true;
    this.power = clamp(this.power + dp, 0.05, 1);
    this.stroke = null;
    this.dirty = true;
  }

  addCurl(dc: number): void {
    if (!dc) return;
    this.adoptShown();
    this.curl = clamp(this.curl + dc, -1, 1);
    this.dirty = true;
  }

  setLoft(i: number): void {
    this.loftTouched = true;
    const k = clamp(Math.round(i), 0, AIM_LOFTS.length - 1);
    if (k === this.loftIdx && Math.abs(this.loft - AIM_LOFTS[k]) < 1e-6) return;
    this.loft = AIM_LOFTS[k];
    this.dirty = true;
  }

  cycleLoft(step = 1): void {
    const n = AIM_LOFTS.length;
    this.setLoft((((this.loftIdx + step) % n) + n) % n);
  }

  /** Pointer pressed (pitch frame). */
  begin(p: Vec2, src: AimSrc): void {
    this.drawing = true;
    this.src = src;
    this.manual = false;
    // a drawn line is a ground ball unless the user picked a height (set pieces keep their cross)
    if (!this.loftTouched && this.intent !== 'setPiece' && this.loftIdx > 0) this.loft = 0;
    this.stroke = [{ x: p.x, y: p.y }];
    this.applyStroke();
  }

  extend(p: Vec2): void {
    if (!this.drawing || !this.stroke) return;
    const last = this.stroke[this.stroke.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 0.25) return;
    this.stroke.push({ x: p.x, y: p.y });
    if (this.stroke.length > 400) this.stroke.splice(1, 1);
    this.applyStroke();
  }

  /** Pointer released: whether the stroke is a real drawing (long enough to kick). */
  end(): boolean {
    if (!this.drawing) return false;
    this.drawing = false;
    return !!this.stroke && !!drawnToKick(this.ball(), this.stroke);
  }

  private applyStroke(): void {
    const k = this.stroke ? drawnToKick(this.ball(), this.stroke) : null;
    if (!k) return;
    this.angle = Math.atan2(k.dir.y, k.dir.x);
    this.power = k.power;
    this.curl = k.curl;
    this.dirty = true;
  }

  /** Where the stroke ends (the pass assist looks for a team-mate there). */
  drawnEnd(): Vec2 | null {
    const s = this.stroke;
    if (!s || !s.length) return null;
    return drawnToKick(this.ball(), s)?.end ?? null;
  }

  /** Noise-free analysis of the current aim (recomputed only after a change). */
  analysis(): AimAnalysis {
    if (this.dirty || !this.analysisCache) {
      this.dirty = false;
      this.analysisCache = analyzeAim(this.engine, this.raw(), { drawnEnd: this.drawnEnd(), assist: !this.manual, maxTime: 4 });
      this.version++;
    }
    return this.analysisCache;
  }

  /** What to kick. */
  params(): KickParams { return this.analysis().params; }
}
