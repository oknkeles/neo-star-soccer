/**
 * Kick model: KickParams + kicker attributes → launch velocity and spin.
 * Without an Rng it is noise-free (used by predictKick and the solvers).
 */
import type { Attributes, Foot, KickParams } from '../../core/types';
import type { Rng } from '../../core/rng';
import { clamp } from '../../core/util';
import { SPIN_MAX } from './constants';

export type KickKind = 'ground' | 'volley' | 'header';

export interface Kicker {
  attrs: Attributes;
  foot: Foot;
  weakFoot: number;
  /** 0..1 */
  stamina: number;
}

export interface KickSpec {
  kind: KickKind;
  isShot: boolean;
  /** 0..1, from the nearest opponent (or the occasion for penalties). */
  pressure: number;
  /** 0..1 setup.difficulty (only matters for noise). */
  difficulty: number;
  /** Extra noise multiplier (one-touch, awkward body shape …). */
  extraNoise?: number;
}

export interface Launch {
  vx: number; vy: number; vz: number;
  wx: number; wy: number; wz: number;
  speed: number;
}

/** Max side-spin for a curl attribute (rad/s at |curl| = 1). */
export function maxSpin(curlAttr: number): number {
  const c = clamp(curlAttr, 1, 99) / 99;
  return SPIN_MAX * (0.1 + 0.9 * Math.pow(c, 1.7));
}

/** Natural curl direction: a right-footer bends it left (+), a left-footer right (−). */
export function naturalCurlSign(foot: Foot): 1 | -1 {
  return foot === 'L' ? -1 : 1;
}

/** Spin multiplier when curling against the natural foot (outside of the boot / weak foot). */
export function curlFootFactor(k: Pick<Kicker, 'foot' | 'weakFoot'>, curl: number): number {
  if (curl * naturalCurlSign(k.foot) >= 0) return 1;
  return 0.55 + 0.09 * clamp(k.weakFoot, 1, 5);
}

/** Maximum launch speed (m/s) for the kick type. */
export function maxSpeed(a: Attributes, spec: Pick<KickSpec, 'kind' | 'isShot'>): number {
  if (spec.kind === 'header') return 9 + 9 * (clamp(a.heading, 1, 99) / 99) + 2 * (a.strength / 99);
  const attr = spec.isShot ? a.shooting : Math.max(a.passing, a.shooting * 0.85);
  const base = spec.isShot ? 24 + 12 * (attr / 99) : 22 + 9 * (attr / 99);
  return spec.kind === 'volley' ? base * 0.95 : base;
}

export function kickSpeed(a: Attributes, p: KickParams, spec: Pick<KickSpec, 'kind' | 'isShot'>): number {
  const vmax = maxSpeed(a, spec);
  const vmin = spec.kind === 'header' ? 4 : 6;
  return (vmin + (vmax - vmin) * clamp(p.power, 0, 1)) * (1 - 0.1 * Math.abs(clamp(p.curl, -1, 1)));
}

/** Launch elevation (radians). */
export function launchAngle(loft: number, kind: KickKind): number {
  const l = clamp(loft, 0, 1);
  const deg = kind === 'header' ? -7 + 32 * l : kind === 'volley' ? 1 + 40 * l : 2 + 48 * Math.pow(l, 1.1);
  return (deg * Math.PI) / 180;
}

/** Execution noise in degrees (1 σ of direction) — exposed for AI/aim UIs. */
export function directionSigmaDeg(k: Kicker, p: KickParams, spec: KickSpec): number {
  const a = k.attrs;
  const skill = spec.kind === 'header' ? a.heading : spec.isShot ? a.shooting : a.passing;
  const s = clamp(skill, 1, 99) / 99;
  const base = 0.6 + 4.0 * Math.pow(1 - s, 1.1);
  return base * noiseMul(k, p, spec);
}

function noiseMul(k: Kicker, p: KickParams, spec: KickSpec): number {
  const a = k.attrs;
  const comp = clamp(a.composure, 1, 99) / 99;
  const pressure = clamp(spec.pressure, 0, 1);
  const fatigue = 1 - clamp(k.stamina, 0, 1);
  let m = (1 + pressure * 1.3 * (1 - comp)) * (1 + fatigue * 0.5) * (1 + 0.25 * (clamp(spec.difficulty, 0, 1) - 0.5));
  m *= 1 + 0.6 * p.power * p.power;
  if (spec.kind === 'volley') m *= 1.45;
  if (spec.kind === 'header') m *= 1.25;
  if (Math.abs(p.curl) > 0.3 && curlFootFactor(k, p.curl) < 1) m *= 1 + (5 - clamp(k.weakFoot, 1, 5)) * 0.07;
  if (spec.extraNoise) m *= spec.extraNoise;
  return m;
}

/**
 * Compute the launch. `rng` = null → deterministic (prediction). The same code path is
 * used with noise for real kicks so predictions only differ by the execution error.
 */
export function computeLaunch(p: KickParams, k: Kicker, spec: KickSpec, rng: Rng | null): Launch {
  const a = k.attrs;
  const dl = Math.hypot(p.dir.x, p.dir.y);
  let theta = dl > 1e-9 ? Math.atan2(p.dir.y, p.dir.x) : 0;
  let speed = kickSpeed(a, p, spec);
  let phi = launchAngle(p.loft, spec.kind);
  const curl = spec.kind === 'header' ? 0 : clamp(p.curl, -1, 1) * (spec.kind === 'volley' ? 0.6 : 1);
  const spinCap = maxSpin(a.curl) * curlFootFactor(k, curl);
  let wz = curl * spinCap;

  if (rng) {
    const mul = noiseMul(k, p, spec);
    const skill = spec.kind === 'header' ? a.heading : spec.isShot ? a.shooting : a.passing;
    const s = clamp(skill, 1, 99) / 99;
    const sigDir = ((0.6 + 4.0 * Math.pow(1 - s, 1.1)) * mul * Math.PI) / 180;
    theta += rng.normal(0, sigDir);
    speed *= 1 + rng.normal(0, (0.025 + 0.05 * (1 - s)) * Math.sqrt(mul));
    phi += (rng.normal(0, (0.4 + 1.6 * (1 - s)) * mul) * Math.PI) / 180;
    const c = clamp(a.curl, 1, 99) / 99;
    wz += rng.normal(0, (1.5 + 6 * (1 - c)) * Math.sqrt(mul)) * (Math.abs(curl) > 0.05 ? 1 : 0.4);
  }
  speed = Math.max(1, speed);

  const ch = Math.cos(phi);
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  // backspin on lofted balls (ω along −(ẑ × d)), a touch of topspin on driven shots
  let back = 0;
  if (spec.kind === 'ground') {
    if (p.loft > 0.12) back = -(p.loft - 0.08) * 16;
    else if (spec.isShot && p.power > 0.7) back = 4;
  }
  return {
    vx: speed * ch * dx,
    vy: speed * ch * dy,
    vz: speed * Math.sin(phi),
    wx: -dy * back,
    wy: dx * back,
    wz,
    speed,
  };
}
