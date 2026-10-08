/**
 * Calm-mode aiming ("Sakin": the game is stopped while the user draws his kick). Headless,
 * noise-free analysis of a kick for the aim UI — the full predicted path, the landing point,
 * what it means (pass to whom / shot / into space), opponents likely to cut it out — and the
 * gentle pass assist that snaps a pass drawn near a team-mate onto his run and solves the power
 * so the ball arrives at a receivable speed. Execution noise still applies to the real kick.
 */
import type { KickParams, Vec2, Vec3 } from '../../core/types';
import { clamp } from '../../core/util';
import type { MomentEngine } from './api';
import { GH, GW, HL, HW } from './constants';
import { Engine } from './engine';
import { hyp } from './geom';
import type { Agent } from './internal';
import { groundPass, solveLob } from './solver';

/** Discrete heights of the loft toggle (Yerden / Yarım / Havadan). */
export const AIM_LOFTS = [0, 0.3, 0.6] as const;

/** Nearest loft toggle index for a loft value. */
export function loftIndex(loft: number): number {
  return loft < 0.15 ? 0 : loft < 0.45 ? 1 : 2;
}

export interface AimOptions {
  /** Where a drawn line ends (pitch frame): the pass assist snaps to a team-mate's run near it. */
  drawnEnd?: Vec2 | null;
  /** Gentle pass assist on (default true). */
  assist?: boolean;
  /** Seconds of path to predict (default 4). */
  maxTime?: number;
}

export interface AimAnalysis {
  /** What will be kicked (after the pass assist). */
  params: KickParams;
  /** Full noise-free path from the ball (pitch frame, ~30 samples / s). */
  path: Vec3[];
  /** First bounce of a lofted ball, else where the ball stops / leaves the pitch. */
  landing: Vec3 | null;
  kind: 'shot' | 'pass' | 'free';
  /** A shot inside the frame of the goal. */
  onTarget: boolean;
  receiverId: string | null;
  receiverName: string | null;
  /** The pass assist adjusted direction / power onto the receiver's run. */
  snapped: boolean;
  /** Opponents likely to cut the ball out (earliest first, at most 3). */
  interceptIds: string[];
}

const asEngine = (m: MomentEngine): Engine | null => (m instanceof Engine ? m : null);

/** Where a team-mate will be when a ball sent now reaches him (his run, kept on the pitch). */
function leadPoint(e: Engine, m: Agent, lofted: boolean): Vec2 {
  const b = e.state.ball.pos;
  let at = { x: m.st.pos.x, y: m.st.pos.y };
  for (let k = 0; k < 2; k++) {
    const d = hyp(at.x - b.x, at.y - b.y);
    const t = lofted ? 0.35 + d / 15 : 0.2 + d / 11.5;
    const lead = Math.min(1, t) * 0.85;
    at = { x: m.st.pos.x + m.st.vel.x * t * lead, y: m.st.pos.y + m.st.vel.y * t * lead };
  }
  return { x: clamp(at.x, -HL + 0.8, HL - 0.8), y: clamp(at.y, -HW + 0.8, HW - 0.8) };
}

function snapParams(e: Engine, to: Vec2, loft: number): KickParams {
  const b = e.state.ball.pos;
  const from = { x: b.x, y: b.y, z: b.z };
  const k = e.kicker(e.user);
  const d = hyp(to.x - b.x, to.y - b.y);
  const li = loftIndex(loft);
  if (li === 0) return groundPass(e.env, k, from, to, clamp(5.5 + d * 0.08, 6, 9));
  // half: drops at his feet; high: chest / head height (crosses)
  return solveLob(e.env, k, from, to, li === 1 ? 0.5 : 1.4, 0, li === 1 ? 0.34 : 0.52);
}

let snapCache: { key: string; params: KickParams } | null = null;

/**
 * The pass assist: a team-mate whose run the kick is meant for, or null.
 * Drawn kicks: the drawn end point near his run. Key-aimed kicks: the noise-free path passing
 * close to him at a speed he can control.
 */
function pickReceiver(e: Engine, raw: KickParams, path: Vec3[], drawnEnd: Vec2 | null): { m: Agent; at: Vec2 } | null {
  const b = e.state.ball.pos;
  const lofted = raw.loft > 0.15;
  let best: { m: Agent; at: Vec2 } | null = null;
  let bestScore = Infinity;
  for (const m of e.agents) {
    if (m.side !== e.user.side || m === e.user || m.passive || m.stun > 0.3) continue;
    const at = leadPoint(e, m, lofted);
    const dist = hyp(at.x - b.x, at.y - b.y);
    if (dist < 3) continue;
    if (drawnEnd) {
      const dEnd = hyp(at.x - drawnEnd.x, at.y - drawnEnd.y);
      const tol = 3.2 + dist * 0.1;
      if (dEnd < tol && dEnd < bestScore) { bestScore = dEnd; best = { m, at }; }
      continue;
    }
    // closest approach of the path (where it can still be controlled)
    for (let i = 1; i < path.length; i++) {
      const p = path[i];
      if (p.z > 1.7) continue;
      const lat = hyp(p.x - at.x, p.y - at.y);
      const along = hyp(p.x - b.x, p.y - b.y);
      if (lat > 2.2 + along * 0.08) continue;
      const q = path[i - 1];
      const sp = hyp(p.x - q.x, p.y - q.y) * 30;
      if (sp > 18) break;
      if (lat < bestScore) { bestScore = lat; best = { m, at }; }
      break;
    }
  }
  return best;
}

/** Where a path crosses the goal line x = HL (y, z), or null. */
function goalCrossing(path: Vec3[]): { y: number; z: number } | null {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const c = path[i];
    if (a.x < HL && c.x >= HL) {
      const k = (HL - a.x) / ((c.x - a.x) || 1e-6);
      return { y: a.y + (c.y - a.y) * k, z: a.z + (c.z - a.z) * k };
    }
  }
  return null;
}

/** The time (s) a path sample is reached, given ~30 samples per second. */
const SAMPLE_DT = 1 / 30;

function interceptors(e: Engine, path: Vec3[], shot: boolean, until: number): string[] {
  const hits: { id: string; t: number }[] = [];
  for (const o of e.agents) {
    if (o.side === e.user.side || o.passive) continue;
    if (shot && o.isGK) continue;
    const reachZ = o.isGK ? 2.4 : 1.9;
    const speed = o.topSpeed;
    for (let i = 2; i < path.length && i * SAMPLE_DT <= until; i++) {
      const p = path[i];
      if (p.z > reachZ) continue;
      const t = i * SAMPLE_DT;
      // a little generous: a warning that is sometimes too careful beats a pass cut out unannounced
      const d = hyp(p.x - o.st.pos.x, p.y - o.st.pos.y) - (o.isGK ? 1.3 : 1.1);
      if (d <= 0 || d <= speed * Math.max(0, t + 0.15 - o.reaction)) { hits.push({ id: o.id, t }); break; }
    }
  }
  hits.sort((a, b) => a.t - b.t);
  return hits.slice(0, 3).map((h) => h.id);
}

/** Time for a team-mate to meet the path (first sample he can reach), or Infinity. */
function meetTime(e: Engine, m: Agent, path: Vec3[]): number {
  for (let i = 2; i < path.length; i++) {
    const p = path[i];
    if (p.z > 1.9) continue;
    const t = i * SAMPLE_DT;
    const d = hyp(p.x - m.st.pos.x, p.y - m.st.pos.y) - 1;
    if (d <= m.topSpeed * 0.9 * Math.max(0, t - 0.15)) return t;
  }
  return Infinity;
}

/** Noise-free analysis of the user's kick for the calm aim UI (also applies the pass assist). */
export function analyzeAim(engine: MomentEngine, raw: KickParams, opts: AimOptions = {}): AimAnalysis {
  const maxTime = opts.maxTime ?? 4;
  const e = asEngine(engine);
  if (!e) {
    let path: Vec3[] = [];
    try { path = engine.predictKick(raw, maxTime); } catch { path = []; }
    return { params: raw, path, landing: path[path.length - 1] ?? null, kind: 'free', onTarget: false, receiverId: null, receiverName: null, snapped: false, interceptIds: [] };
  }
  let params = e.sanitize(raw);
  let path = e.predictKick(params, maxTime);
  const kind = e.owner === e.user ? 'ground' : e.reach(e.user).kind;
  let receiver: Agent | null = null;
  let snapped = false;
  const assist = (opts.assist ?? true) && kind !== 'header' && Math.abs(params.curl) <= 0.35 && e.setPiece !== 'penalty';
  const cross = goalCrossing(path);
  const atGoal = !!cross && Math.abs(cross.y) < GW + 2 && cross.z < GH + 1;
  if (assist && !(atGoal && !opts.drawnEnd)) {
    const pick = pickReceiver(e, params, path, opts.drawnEnd ?? null);
    if (pick) {
      const key = `${pick.m.i}|${loftIndex(params.loft)}|${Math.round(pick.at.x * 4)}|${Math.round(pick.at.y * 4)}|${e.touchSeq}|${Math.round(e.state.ball.pos.x * 20)}|${Math.round(e.state.ball.pos.y * 20)}`;
      const sp = snapCache && snapCache.key === key ? snapCache.params : snapParams(e, pick.at, params.loft);
      snapCache = { key, params: sp };
      params = e.sanitize(sp);
      path = e.predictKick(params, maxTime);
      receiver = pick.m;
      snapped = true;
    }
  }
  const hit = snapped ? null : goalCrossing(path);
  const shot = !snapped && !!hit && Math.abs(hit.y) < GW + 2 && hit.z < GH + 1;
  const onTarget = shot && !!hit && Math.abs(hit.y) < GW - 0.05 && hit.z < GH - 0.05;
  if (!shot && !receiver) {
    // a team-mate who meets the ball first (no assist): still a pass to him
    let bestT = Infinity;
    for (const m of e.agents) {
      if (m.side !== e.user.side || m === e.user || m.passive) continue;
      const t = meetTime(e, m, path);
      if (t < bestT) { bestT = t; receiver = m; }
    }
    if (bestT > 3.5) receiver = null;
  }
  const until = receiver ? Math.min(maxTime, meetTime(e, receiver, path) + 0.3) : maxTime;
  // landing: first bounce of a lofted ball, else the end of the path
  let landing: Vec3 | null = path[path.length - 1] ?? null;
  let peak = 0;
  for (let i = 1; i < path.length; i++) {
    peak = Math.max(peak, path[i].z);
    if (peak > 0.7 && path[i].z <= 0.2) { landing = path[i]; break; }
  }
  return {
    params,
    path,
    landing,
    kind: shot ? 'shot' : receiver ? 'pass' : 'free',
    onTarget,
    receiverId: receiver?.id ?? null,
    receiverName: receiver?.spec.name ?? null,
    snapped,
    interceptIds: interceptors(e, path, shot, until),
  };
}
