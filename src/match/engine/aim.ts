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
import { atDistance, curledPass, groundPass, launched, predictPath, solveLob, speedAtDistance } from './solver';
import { interceptFor, ledPass } from './ai';
import { deliverCross, inBoxArea, inCrossZone, type CrossStyle } from './cross';
import { runTimeFor } from './locomotion';
import { runPath, runnerState } from './runs';

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
  /** The pass assist turned it into a cross (whipped / driven / floated / cut-back). */
  cross?: CrossStyle | null;
  /** The pass assist snapped it into a runner's path (a ball in behind / into his run). */
  through?: boolean;
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

interface Pick { m: Agent; at: Vec2; through: boolean }

/**
 * Through ball to `at` on a runner's line: the slowest ball (dies into the space) that still
 * gets there about when he does.
 */
export function throughParams(e: Engine, m: Agent, at: Vec2, curl = 0): KickParams {
  const b = e.state.ball.pos;
  const k = e.kicker(e.user);
  const d = hyp(at.x - b.x, at.y - b.y);
  const sp = hyp(m.st.vel.x, m.st.vel.y);
  const tr = 0.1 + runTimeFor(Math.max(0, hyp(at.x - m.st.pos.x, at.y - m.st.pos.y) - 0.7), sp, m.topSpeed * (0.82 + 0.18 * m.st.stamina), m.accel);
  let best: KickParams | null = null;
  let bestV = Infinity;
  const bent = Math.abs(curl) >= 0.08;
  for (const arrive of [3.5, 4.5, 5.5, 7, 9]) {
    const p = bent ? curledPass(e.env, k, b, at, arrive, curl) : groundPass(e.env, k, b, at, arrive);
    const spec = e.kickSpec(e.user, p, 'ground', false);
    const path = predictPath(launched({ x: b.x, y: b.y, z: b.z }, p, k, spec), e.env, clamp(d / 5 + 1, 1.5, 4.5), 4);
    const q = atDistance(path, d);
    const tb = q ? q.t : Infinity;
    // a touch early is fine (it rolls on into his path); late is not
    let v = Math.abs(tb - (tr - 0.2)) + (tb > tr + 0.25 ? 3 : 0);
    // ...and nobody in a red shirt (or the keeper coming off his line) gets there before him
    let tOpp = Infinity;
    for (const o of e.agents) {
      if (o.side === m.side || o.passive || o.stun > 0.4) continue;
      tOpp = Math.min(tOpp, interceptFor(e, o, path, 0.6).t);
    }
    if (tOpp < tr + 0.1) v += 1.5 + (tr + 0.1 - tOpp);
    if (v < bestV) { bestV = v; best = p; }
  }
  return best ?? groundPass(e.env, k, b, at, 5);
}

/** The bend kept from a drawn / Q-E curled pass (a straight-ish stroke stays a plain pass). */
export function passCurl(curl: number): number {
  return Math.abs(curl) < 0.08 ? 0 : Math.sign(curl) * Math.min(0.8, Math.abs(curl) * 0.85);
}

/**
 * A pass bent with side-spin onto the same point a straight pass would go to: the pass that
 * would be played (its target and pace) re-solved with the spin, so it swings round a man in the
 * lane and still finishes at his feet / in his stride.
 */
export function bentPass(e: Engine, plain: KickParams, at: Vec2, curl: number): KickParams {
  const b = e.state.ball.pos;
  const k = e.kicker(e.user);
  const spec = e.kickSpec(e.user, plain, 'ground', false);
  const d = hyp(at.x - b.x, at.y - b.y);
  // the plain ball's pace where it gets there
  const path = predictPath(launched({ x: b.x, y: b.y, z: b.z }, plain, k, spec), e.env, clamp(d / 5 + 1, 1.5, 4.5), 4);
  const arrive = clamp(speedAtDistance(path, d) ?? 6, 2.5, 12);
  return curledPass(e.env, k, b, at, arrive, curl);
}

function snapParams(e: Engine, pick: Pick, loft: number, curl = 0): KickParams {
  const b = e.state.ball.pos;
  const from = { x: b.x, y: b.y, z: b.z };
  const k = e.kicker(e.user);
  const li = loftIndex(loft);
  const c = passCurl(curl);
  if (li === 0) {
    if (pick.through) return throughParams(e, pick.m, pick.at, c);
    // into his stride (to feet when he stands), solved against the real flight time
    const sp = hyp(pick.m.st.vel.x, pick.m.st.vel.y);
    // (the full solve: a firmer ball or a shorter lead when the plain one could be cut out)
    const lp = ledPass(e, e.user, pick.m, { feet: sp < 1.2, maxLead: 7 });
    return c ? bentPass(e, lp.params, lp.at, c) : lp.params;
  }
  // half: drops at his feet; high: a long ball that comes down just in front of him (chest / thigh)
  return solveLob(e.env, k, from, pick.at, li === 1 ? 0.5 : 0.9, c, li === 1 ? 0.34 : 0.5);
}

let snapCache: { key: string; params: KickParams } | null = null;
let crossCache: { key: string; params: KickParams; to: Agent | null; style: CrossStyle } | null = null;

/**
 * The pass assist: a team-mate whose run the kick is meant for, or null.
 * Drawn kicks: the drawn end point near his run (beyond his stride = a through ball along his
 * run). Key-aimed kicks: the noise-free path passing close to him at a speed he can control.
 */
function pickReceiver(e: Engine, raw: KickParams, path: Vec3[], drawnEnd: Vec2 | null): Pick | null {
  const b = e.state.ball.pos;
  const lofted = raw.loft > 0.15;
  let best: Pick | null = null;
  let bestScore = Infinity;
  for (const m of e.agents) {
    if (m.side !== e.user.side || m === e.user || m.passive || m.stun > 0.3) continue;
    const at = leadPoint(e, m, lofted);
    const dist = hyp(at.x - b.x, at.y - b.y);
    if (dist < 3) continue;
    if (drawnEnd) {
      // (the stroke ends where his run takes him, or near where the user sees him now)
      let dEnd = Math.min(hyp(at.x - drawnEnd.x, at.y - drawnEnd.y), hyp(m.st.pos.x - drawnEnd.x, m.st.pos.y - drawnEnd.y) + 1);
      let pt = at;
      let through = false;
      // a runner in behind (or one on the shoulder about to go): the drawn end on / near his
      // projected run = the ball into his path, weighted so he runs onto it
      const rst = runnerState(m);
      const dirU = e.user.dir;
      // (one still waiting on the shoulder: only for a ball clearly in behind the line)
      if (rst && (rst === 'live' || drawnEnd.x * dirU > e.offsideX(e.user.side) * dirU + 1)) {
        const pts = runPath(e, m, 2.2, 0.1);
        let bi = -1;
        let bd = Infinity;
        for (let k = 2; k < pts.length; k++) {
          const dq = hyp(pts[k].x - drawnEnd.x, pts[k].y - drawnEnd.y);
          if (dq < bd) { bd = dq; bi = k; }
        }
        if (bi >= 2) {
          // (weighted so he runs onto it: on along his run to where a ball dying into the space
          // gets there no later than he does — never one he has to wait for)
          const late = (k: number) => 0.15 + hyp(pts[k].x - b.x, pts[k].y - b.y) / 14 > (k + 1) * 0.1 + 0.25;
          while (bi < pts.length - 1 && late(bi)) bi++;
          let q = pts[bi];
          // drawn on beyond the projection: further along the same line (up to ~18 m from him)
          if (bi === pts.length - 1) {
            const p0 = pts[bi - 1];
            const ux = q.x - p0.x;
            const uy = q.y - p0.y;
            const ul = hyp(ux, uy) || 1;
            const ext = clamp(((drawnEnd.x - q.x) * ux + (drawnEnd.y - q.y) * uy) / ul, 0, Math.max(0, 18 - hyp(q.x - m.st.pos.x, q.y - m.st.pos.y)));
            q = { x: q.x + (ux / ul) * ext, y: q.y + (uy / ul) * ext };
          }
          // (judged by how near the stroke ends to his run; the ball goes to the timed point)
          const dq = Math.min(bd, hyp(q.x - drawnEnd.x, q.y - drawnEnd.y));
          // (well ahead of where he is now: into his path, not to his feet)
          const ahead = hyp(q.x - m.st.pos.x, q.y - m.st.pos.y) > 3;
          q = { x: clamp(q.x, -HL + 1, HL - 1.5), y: clamp(q.y, -HW + 1, HW - 1) };
          if (ahead && (q.x - b.x) * dirU > 2 && dq + 1 < dEnd) { dEnd = dq + 1; pt = q; through = true; }
        }
      }
      const sp = hyp(m.st.vel.x, m.st.vel.y);
      if (!through && sp > 2.2 && !lofted) {
        const ux = m.st.vel.x / sp;
        const uy = m.st.vel.y / sp;
        const proj = (drawnEnd.x - m.st.pos.x) * ux + (drawnEnd.y - m.st.pos.y) * uy;
        const lead0 = (at.x - m.st.pos.x) * ux + (at.y - m.st.pos.y) * uy;
        if (proj > lead0 + 2.5) {
          const l = Math.min(proj, 16);
          const q = { x: clamp(m.st.pos.x + ux * l, -HL + 1, HL - 1.5), y: clamp(m.st.pos.y + uy * l, -HW + 1, HW - 1) };
          const dq = hyp(q.x - drawnEnd.x, q.y - drawnEnd.y);
          // (a clear through ball only — forward, into space: his feet / stride stay the default)
          if (dq + 1.5 < dEnd && (q.x - b.x) * e.user.dir > 2) { dEnd = dq + 1.5; pt = q; through = true; }
        }
      }
      const tol = 3.2 + dist * 0.1;
      // (a man already bursting in behind, played into his stride well ahead of him: that is a
      // ball into his run too)
      if (!through && rst === 'live' && hyp(pt.x - m.st.pos.x, pt.y - m.st.pos.y) > 3 && (pt.x - b.x) * dirU > 2) through = true;
      if (dEnd < tol && dEnd < bestScore) { bestScore = dEnd; best = { m, at: pt, through }; }
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
      if (lat < bestScore) { bestScore = lat; best = { m, at, through: false }; }
      break;
    }
  }
  return best;
}

/** Does the (key-aimed) path drop into the box (below head height)? Returns that point. */
function intoBox(path: Vec3[], dir: 1 | -1): Vec2 | null {
  for (let i = 1; i < path.length && i < 90; i++) {
    const p = path[i];
    if (p.z < 2.4 && inBoxArea(p, dir) && Math.abs(p.y) < 17 && p.x * dir < HL - 1) return { x: p.x, y: p.y };
  }
  return null;
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
  let through = false;
  let crossStyle: CrossStyle | null = null;
  const cross = goalCrossing(path);
  const atGoal = !!cross && Math.abs(cross.y) < GW + 2 && cross.z < GH + 1;
  // (a bent ball at goal is a curler, left alone; a bent pass keeps its bend — see snapParams)
  const assist = (opts.assist ?? true) && kind !== 'header' && (Math.abs(params.curl) <= 0.35 || !atGoal) && e.setPiece !== 'penalty';
  const drawn = opts.drawnEnd ?? null;
  const b = e.state.ball.pos;
  const dir = e.user.dir;
  // a ball into the box from a wide area: a proper cross to the best runner near it
  const boxAt = drawn ? (inBoxArea(drawn, dir) && drawn.x * dir < HL - 1.5 ? drawn : null) : atGoal ? null : intoBox(path, dir);
  if (assist && e.setPiece === null && boxAt && inCrossZone(b, dir)) {
    const li = loftIndex(params.loft);
    const pulled = (boxAt.x - b.x) * dir < -1 && Math.abs(boxAt.y) < 13 && b.x * dir > HL - 14;
    // (a plain drawn line: the assist picks the delivery that gets to a runner first)
    const style: CrossStyle | null = li === 2 ? 'float' : li === 1 ? 'drive' : pulled ? 'cutback' : null;
    const key = `x|${style}|${Math.round(boxAt.x)}|${Math.round(boxAt.y)}|${e.touchSeq}|${Math.round(b.x * 10)}|${Math.round(b.y * 10)}`;
    let sp: KickParams;
    let to: Agent | null = null;
    if (crossCache && crossCache.key === key) { sp = crossCache.params; to = crossCache.to; } else {
      const plan = deliverCross(e, e.user, null, { near: boxAt, style });
      sp = plan.params;
      to = plan.to;
      crossCache = { key, params: sp, to, style: plan.style };
    }
    params = e.sanitize(sp);
    path = e.predictKick(params, maxTime);
    receiver = to;
    snapped = true;
    crossStyle = crossCache?.style ?? style;
  } else if (assist && !(atGoal && !drawn)) {
    const pick = pickReceiver(e, params, path, drawn);
    if (pick) {
      const c = passCurl(params.curl);
      const key = `${pick.m.i}|${pick.through ? 't' : ''}|${loftIndex(params.loft)}|${Math.round(pick.at.x * 4)}|${Math.round(pick.at.y * 4)}|${e.touchSeq}|${Math.round(b.x * 20)}|${Math.round(b.y * 20)}|${Math.round(c * 20)}`;
      const sp = snapCache && snapCache.key === key ? snapCache.params : snapParams(e, pick, params.loft, c);
      snapCache = { key, params: sp };
      params = e.sanitize(sp);
      path = e.predictKick(params, maxTime);
      receiver = pick.m;
      snapped = true;
      through = pick.through;
    }
  }
  if (!snapped && drawn && !atGoal && (opts.assist ?? true) && kind !== 'header' && e.setPiece === null) {
    // a ball into space: the drawn end is where it gets to (rolling out slowly / landing there)
    const d = hyp(drawn.x - b.x, drawn.y - b.y);
    if (d > 3) {
      const k = e.kicker(e.user);
      const li = loftIndex(params.loft);
      const c = passCurl(params.curl);
      // (a bent ball into space still finishes where the stroke ends)
      const sp = li === 0 ? (c ? curledPass(e.env, k, b, drawn, 3.5, c) : groundPass(e.env, k, b, drawn, 3.5)) : solveLob(e.env, k, { x: b.x, y: b.y, z: b.z }, drawn, 0.3, params.curl, li === 1 ? 0.34 : 0.5);
      params = e.sanitize(li === 0 && !c ? { ...params, power: sp.power } : sp);
      path = e.predictKick(params, maxTime);
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
    cross: crossStyle,
    through,
  };
}
