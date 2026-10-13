/**
 * Crossing: who attacks the box and where (near post / far post / penalty spot runs, loaded
 * outside the box and timed to arrive with the ball), which delivery reaches a runner before
 * the defenders and the keeper (whipped low, driven, floated to the far post, or a cut-back),
 * and the noise-free kick for it. Shared by the AI crossers, the calm aim and the F assist.
 */
import type { KickParams, Vec2 } from '../../core/types';
import { clamp } from '../../core/util';
import { HL, HW } from './constants';
import type { Engine } from './engine';
import { hyp } from './geom';
import type { Agent } from './internal';
import { runTimeFor } from './locomotion';
import { groundPass, launched, predictPath, solveLob } from './solver';
import { bodyT, interceptFor } from './ai';

export type CrossStyle = 'whip' | 'drive' | 'float' | 'cutback';
export type BoxRole = 'near' | 'far' | 'spot';

/** Wide in the final third (a crossing position) for an attack toward `dir`. */
export function inCrossZone(p: Vec2, dir: 1 | -1): boolean {
  const u = p.x * dir;
  return Math.abs(p.y) > 12.5 && u > HL - 36 && u < HL + 0.5;
}

/** A spot inside the penalty area (attack direction `dir`). */
export function inBoxArea(p: Vec2, dir: 1 | -1): boolean {
  const u = p.x * dir;
  return u > HL - 18.5 && u < HL + 0.5 && Math.abs(p.y) < 21;
}

/** Where each box run finishes (`side` = sign of the ball's y: the near post is on that side). */
export function roleSpot(role: BoxRole, dir: 1 | -1, side: number): Vec2 {
  if (role === 'near') return { x: dir * (HL - 5.5), y: side * 2.6 };
  if (role === 'far') return { x: dir * (HL - 6.5), y: -side * 4.2 };
  return { x: dir * (HL - 11.5), y: side * 0.8 };
}

/** Where each runner waits (outside the box, onside) before he attacks his zone. */
function loadSpot(role: BoxRole, dir: 1 | -1, side: number): Vec2 {
  if (role === 'near') return { x: dir * (HL - 9.5), y: side * 6.5 };
  if (role === 'far') return { x: dir * (HL - 9), y: -side * 7.5 };
  return { x: dir * (HL - 14.5), y: side * 1 };
}

/** Box runs per engine, kept for one carrier / one cross (stable roles, no swapping every update). */
const plans = new WeakMap<Engine, { key: string; runs: Map<number, BoxRole> }>();

export function boxPlan(e: Engine, key: string, side: Agent['side'], crosser: Agent | null, ball: Vec2): Map<number, BoxRole> {
  const c = plans.get(e);
  if (c && c.key === key) return c.runs;
  const runs = boxRunners(e, side, crosser, ball);
  plans.set(e, { key, runs });
  return runs;
}

const ROLE_PRI: Record<string, number> = { ST: 0, W: 1, AM: 2, CM: 3, DM: 5, FB: 6, CB: 9, GK: 99 };

/** Up to three attackers of `side` (not the crosser, not the user) with a box run each. */
export function boxRunners(e: Engine, side: Agent['side'], crosser: Agent | null, ball: Vec2): Map<number, BoxRole> {
  const out = new Map<number, BoxRole>();
  const dir: 1 | -1 = side === 'us' ? 1 : -1;
  const sy = Math.sign(ball.y) || 1;
  const cands = e.agents.filter((m) => m.side === side && !m.isGK && !m.passive && !m.isUser && m !== crosser && m.stun <= 0 && (ROLE_PRI[m.slot.role] ?? 9) < 9);
  // the user in the box takes one run himself (his team-mates fill the others)
  const u = e.user;
  const userIn = u.side === side && u !== crosser && inBoxArea(u.st.pos, dir);
  const n = userIn ? 2 : 3;
  const score = (m: Agent) => (ROLE_PRI[m.slot.role] ?? 9) * 4 + hyp(m.st.pos.x - dir * (HL - 10), m.st.pos.y) * 0.35;
  cands.sort((p, q) => score(p) - score(q));
  const pool = cands.slice(0, n);
  const roles: BoxRole[] = ['near', 'far', 'spot'];
  if (userIn) {
    // he takes the zone he is closest to
    let bestR: BoxRole = 'near';
    let bd = Infinity;
    for (const r of roles) {
      const p = roleSpot(r, dir, sy);
      const d = hyp(u.st.pos.x - p.x, u.st.pos.y - p.y);
      if (d < bd) { bd = d; bestR = r; }
    }
    roles.splice(roles.indexOf(bestR), 1);
  }
  // greedy: each role to the nearest free runner
  for (const r of roles) {
    const p = roleSpot(r, dir, sy);
    let best: Agent | null = null;
    let bd = Infinity;
    for (const m of pool) {
      if (out.has(m.i)) continue;
      const d = hyp(m.st.pos.x - p.x, m.st.pos.y - p.y);
      if (d < bd) { bd = d; best = m; }
    }
    if (best) out.set(best.i, r);
  }
  return out;
}

/** Before the cross: wait at the loading spot (onside), ready to attack the zone. */
export function loadRun(e: Engine, a: Agent, role: BoxRole, ball: Vec2): void {
  const dir = a.dir;
  const sy = Math.sign(ball.y) || 1;
  const p = loadSpot(role, dir, sy);
  const line = e.offsideX(a.side) * dir;
  const x = dir * Math.min(p.x * dir, line - 0.7);
  a.target = { x: clamp(x, -HL + 2, HL - 2), y: clamp(p.y, -HW + 2, HW - 2) };
  a.urgency = 0.72;
  a.duty = 'run';
}

/**
 * The cross is coming: attack the earliest point of the ball's flight in his zone that he can
 * reach, timed to arrive with the ball (still moving through it), else hold the zone.
 */
export function attackRun(e: Engine, a: Agent, role: BoxRole, crossFrom: Vec2): void {
  const dir = a.dir;
  const sy = Math.sign(crossFrom.y) || 1;
  const spot = roleSpot(role, dir, sy);
  const path = e.ballPath();
  const age = e.loosePath ? Math.max(0, e.state.time - e.loosePath.t) : 0;
  const top = Math.min(e.headReach(a), 2.25);
  const v = a.topSpeed * (0.82 + 0.18 * a.st.stamina);
  const v0 = Math.max(0, (a.st.vel.x * (spot.x - a.st.pos.x) + a.st.vel.y * (spot.y - a.st.pos.y)) / (hyp(spot.x - a.st.pos.x, spot.y - a.st.pos.y) || 1));
  for (let i = 1; i < path.length; i++) {
    const q = path[i];
    const qt = q.t - age;
    if (qt <= 0.1 || q.z > top || q.z < 0.05) continue;
    if (hyp(q.x - spot.x, q.y - spot.y) > (role === 'spot' ? 5 : 4.5)) continue;
    const d = hyp(q.x - a.st.pos.x, q.y - a.st.pos.y);
    if (0.1 + runTimeFor(Math.max(0, d - 0.6), v0, v, a.accel) > qt + 0.08) continue;
    // through the meeting point (arrive moving), at the pace that gets him there with the ball
    const ux = d > 0.3 ? (q.x - a.st.pos.x) / d : 0;
    const uy = d > 0.3 ? (q.y - a.st.pos.y) / d : 0;
    a.target = { x: q.x + ux * 1.2, y: q.y + uy * 1.2 };
    a.urgency = clamp(d / Math.max(0.25, qt) / v + 0.12, 0.6, 1);
    a.duty = 'attackBall';
    return;
  }
  // nothing in his zone: the ball anywhere he can get to first, else the zone itself
  if (a.eitPoint && a.eit < 3) {
    a.target = { x: a.eitPoint.x, y: a.eitPoint.y };
    a.urgency = 1;
    a.duty = 'attackBall';
    return;
  }
  a.target = { x: spot.x, y: spot.y };
  a.urgency = 0.9;
  a.duty = 'run';
}

const STYLE: Record<Exclude<CrossStyle, 'cutback'>, { zAt: number; lofts: number[]; pref: number; curl: number; speed: number; t0: number }> = {
  // low and hard, between keeper and defenders
  whip: { zAt: 0.9, lofts: [0.27, 0.32], pref: 0.28, curl: 0.5, speed: 19, t0: 0.3 },
  // head height, quick
  drive: { zAt: 1.6, lofts: [0.32, 0.38, 0.44], pref: 0.36, curl: 0.4, speed: 17, t0: 0.4 },
  // hanging up at the far post
  float: { zAt: 1.8, lofts: [0.48, 0.56], pref: 0.5, curl: 0.25, speed: 13.5, t0: 0.7 },
};

/** Rough flight time (s) of a delivery over `d` m (target selection only). */
const flightT = (style: CrossStyle, d: number) => (style === 'cutback' ? 0.15 + d / 13 : STYLE[style].t0 + d / STYLE[style].speed);

/** Noise-free kick for a cross of `style` from the ball to `to` (out-swinging: away from the keeper). */
export function crossParams(e: Engine, k: Agent, to: Vec2, style: CrossStyle): KickParams {
  const b = e.state.ball.pos;
  if (style === 'cutback') return groundPass(e.env, e.kicker(k), b, to, 8.5);
  const st = STYLE[style];
  const side = Math.sign(b.y) || 1;
  const curl = -st.curl * side * k.dir;
  return solveLob(e.env, e.kicker(k), { x: b.x, y: b.y, z: b.z }, to, st.zAt, curl, st.pref, st.lofts);
}

export interface CrossPlan { params: KickParams; to: Agent | null; at: Vec2; style: CrossStyle; margin: number }

/**
 * Pick the delivery: for each attacker (his box run's zone, or where he is heading) and style,
 * how much earlier he gets there than the quickest defender / the keeper. `pref` / `near` bias
 * it toward the user's choice (the drawn end, the F target); `style` forces the delivery.
 */
export function deliverCross(e: Engine, a: Agent, pref?: Agent | null, opts: { near?: Vec2 | null; style?: CrossStyle | null; prefer?: CrossStyle | null; plan?: boolean } = {}): CrossPlan {
  const b = e.state.ball.pos;
  const dir = a.dir;
  const sy = Math.sign(b.y) || 1;
  const byline = b.x * dir > HL - 11;
  const runners = boxRunners(e, a.side, a, b);
  const cands: { m: Agent; p: Vec2; role: BoxRole | null }[] = [];
  for (const m of e.agents) {
    if (m.side !== a.side || m === a || m.isGK || m.passive || m.stun > 0) continue;
    const role = runners.get(m.i) ?? null;
    if (role) cands.push({ m, p: roleSpot(role, dir, sy), role });
    const f = { x: m.st.pos.x + m.st.vel.x * 0.6, y: m.st.pos.y + m.st.vel.y * 0.6 };
    if (inBoxArea(f, dir) || (m.isUser && hyp(f.x - dir * (HL - 9), f.y) < 16)) {
      cands.push({ m, p: { x: clamp(f.x + dir * 1, -HL + 1, HL - 1), y: clamp(f.y, -20, 20) }, role: null });
      // the user: also the zones around him and the space beyond him (away from the crosser,
      // behind a marker standing ball-side) — he runs onto it
      if (m.isUser) {
        for (const r of ['near', 'far', 'spot'] as BoxRole[]) {
          const z = roleSpot(r, dir, sy);
          if (hyp(z.x - m.st.pos.x, z.y - m.st.pos.y) < 9) cands.push({ m, p: z, role: r });
        }
        for (const [ox, oy] of [[0, -1.8], [1, -3], [2, -1], [-1.5, -2.2]]) {
          cands.push({ m, p: { x: clamp(m.st.pos.x + dir * ox, -HL + 2, HL - 2), y: clamp(m.st.pos.y + sy * oy, -20, 20) }, role: null });
        }
      }
    }
  }
  if (opts.near) cands.push({ m: pref ?? a, p: { ...opts.near }, role: null });
  const styles: CrossStyle[] = opts.style ? [opts.style] : byline ? ['cutback', 'whip', 'drive', 'float'] : ['whip', 'drive', 'float'];
  const ranked: { m: Agent | null; p: Vec2; style: CrossStyle; v: number; margin: number; tm: number }[] = [];
  const gk = a.side === 'us' ? e.gkThem : e.gkUs;
  for (const c of cands) {
    const d = hyp(c.p.x - b.x, c.p.y - b.y);
    if (d < 6 || d > 45) continue;
    const mDist = c.m === a ? Infinity : hyp(c.p.x - c.m.st.pos.x, c.p.y - c.m.st.pos.y);
    const tm = c.m === a ? 0 : 0.15 + runTimeFor(Math.max(0, mDist - 0.7), hyp(c.m.st.vel.x, c.m.st.vel.y) * 0.5, c.m.topSpeed * (0.82 + 0.18 * c.m.st.stamina), c.m.accel);
    let tDef = Infinity;
    for (const o of e.agents) {
      if (o.side === a.side || o.isGK || o.passive || o.stun > 0.3) continue;
      const od = hyp(c.p.x - o.st.pos.x, c.p.y - o.st.pos.y);
      tDef = Math.min(tDef, o.reaction + Math.max(0, od - 1.0) / (o.topSpeed * 0.85));
    }
    for (const style of styles) {
      if (style === 'cutback' && (Math.abs(c.p.y) > 12 || c.p.x * dir > HL - 6 || c.p.x * dir > b.x * dir + 1)) continue;
      // (a whipped ball only over a short distance: from further it would need a full-power strike)
      if (style === 'whip' && (c.role === 'far' || d > 22)) continue;
      const tb = flightT(style, d);
      // the keeper comes for what drops in his area (floated balls give him time)
      let tGk = Infinity;
      if (gk && style !== 'cutback') {
        const u = (dir * HL - c.p.x) * dir;
        if (u < (style === 'float' ? 10 : 6.5) && Math.abs(c.p.y) < 10) {
          tGk = gk.reaction + Math.max(0, hyp(c.p.x - gk.st.pos.x, c.p.y - gk.st.pos.y) - 1.4) / (gk.topSpeed * 0.9);
        }
      }
      const tArr = Math.max(tm, tb);
      const margin = Math.min(tDef + (style === 'float' ? 0.15 : 0), tGk) - tArr;
      let v = margin;
      if (c.m === pref) v += 0.35;
      if (opts.near) v -= hyp(c.p.x - opts.near.x, c.p.y - opts.near.y) * 0.09;
      if (c.m.isUser) v += 0.25;
      if (style === 'whip') v += 0.05;
      if (style === opts.prefer) v += 0.15;
      // closer to goal, more central = a better chance
      v -= Math.abs(c.p.y) * 0.02 + Math.max(0, (dir * HL - c.p.x) * dir - 6) * 0.025;
      ranked.push({ m: c.m === a ? null : c.m, p: c.p, style, v, margin, tm });
    }
  }
  ranked.sort((p, q) => q.v - p.v);
  if (!ranked.length) {
    const p = opts.near ?? roleSpot('spot', dir, sy);
    ranked.push({ m: pref ?? null, p, style: opts.style ?? (byline ? 'cutback' : 'drive'), v: 0, margin: -1, tm: 0 });
  }
  let best = ranked[0];
  let params: KickParams | null = null;
  if (!opts.plan) {
    // the real flight of the best few: nobody may cut it out on the way (the first defender, the
    // keeper) before the runner gets there
    const k = e.kicker(a);
    let bestV = -Infinity;
    const seen = new Set<string>();
    // the two best, then the best of every other delivery
    const order: typeof ranked = [];
    const styleSeen = new Set<CrossStyle>();
    for (const c of ranked) {
      const key = `${Math.round(c.p.x)}|${Math.round(c.p.y)}|${c.style}`;
      if (seen.has(key)) continue;
      if (order.length < 2 || !styleSeen.has(c.style)) { seen.add(key); styleSeen.add(c.style); order.push(c); }
      if (order.length >= 6) break;
    }
    for (const c of order) {
      const at = { x: clamp(c.p.x, -HL + 1, HL - 1), y: clamp(c.p.y, -HW + 1, HW - 1) };
      const p = crossParams(e, a, at, c.style);
      const spec = e.kickSpec(a, p, 'ground', false);
      const path = predictPath(launched({ x: b.x, y: b.y, z: b.z }, p, k, spec), e.env, 3, 4);
      let tb = Infinity;
      let bd = Infinity;
      for (const q of path) { const dd = hyp(q.x - at.x, q.y - at.y); if (dd < bd) { bd = dd; tb = q.t; } }
      const tArr = Math.max(c.tm, tb);
      let lost = 0;
      for (const o of e.agents) {
        if (o.side === a.side || o.passive || o.stun > 0.3) continue;
        const r = Math.min(interceptFor(e, o, path, o.isGK ? 2.55 : Math.min(e.headReach(o), 2.3)).t, o.isGK ? Infinity : bodyT(o, path));
        if (r < tArr + (o.isGK ? -0.05 : 0.05)) lost = Math.max(lost, tArr - r + 0.2);
      }
      const v = c.v - (lost > 0 ? 1.5 + lost : 0);
      if (v > bestV) { bestV = v; best = c; params = p; }
      if (lost === 0) break;
    }
  }
  // where he meets it: the zone point, a step ahead of the runner's approach
  const at = { x: clamp(best.p.x, -HL + 1, HL - 1), y: clamp(best.p.y, -HW + 1, HW - 1) };
  return { params: params ?? (opts.plan ? { dir: { x: 1, y: 0 }, power: 0.5, loft: 0.3, curl: 0 } : crossParams(e, a, at, best.style)), to: best.m, at, style: best.style, margin: best.margin };
}
