/**
 * Outfield AI for both teams: a coordinator (10 Hz) assigns chasers, pressers, markers,
 * receivers and runners; the ball carrier decides between shooting, passing, crossing
 * and dribbling. Everything is deterministic (engine Rng only).
 */
import type { KickParams, Vec2, Vec3 } from '../../core/types';
import { clamp } from '../../core/util';
import { BR, CALL_WINDOW, GW, HL, HW } from './constants';
import type { Engine } from './engine';
import { slotHome } from './formation';
import { baseXg, distToGoal, hyp, inBox, segDist } from './geom';
import type { Agent, KickRec, PathSample, Side, SupRole } from './internal';
import { atDistance, groundPass, launched, predictPath, solveLob, solveShot } from './solver';

// ───────────────────────── interception estimates ─────────────────────────

/** Earliest time `a` can meet the ball on its predicted path (Infinity = never). */
export function interceptFor(e: Engine, a: Agent, path: PathSample[], maxZ?: number): { t: number; p: Vec2; z: number } {
  const zMax = maxZ ?? (a.isGK ? 2.55 : Math.min(e.headReach(a), 2.3));
  const v = a.topSpeed * (0.82 + 0.18 * a.st.stamina);
  const px = a.st.pos.x;
  const py = a.st.pos.y;
  const r = a.reaction;
  for (let i = 1; i < path.length; i++) {
    const q = path[i];
    if (q.z > zMax) continue;
    if (Math.abs(q.x) > HL + 0.5 || Math.abs(q.y) > HW + 0.5) break;
    const d = Math.max(0, hyp(q.x - px, q.y - py) - 0.7);
    const need = r + d / v + (d > 2 ? 0.25 : 0.05);
    if (need <= q.t) return { t: q.t, p: { x: q.x, y: q.y }, z: q.z };
  }
  const last = path[path.length - 1];
  if (Math.abs(last.x) > HL + 0.5 || Math.abs(last.y) > HW + 0.5) return { t: Infinity, p: { x: last.x, y: last.y }, z: last.z };
  const d = hyp(last.x - px, last.y - py);
  return { t: Math.max(last.t, r + d / v + 0.25) + 0.5, p: { x: last.x, y: last.y }, z: last.z };
}

/**
 * An opponent standing in the ball's way touches it as it goes past: no reaction needed (the
 * interception estimate above is reaction-gated, which misses a presser right by the passer).
 */
export function bodyT(o: Agent, path: PathSample[], reach = 0.95): number {
  const ox = o.st.pos.x;
  const oy = o.st.pos.y;
  for (let i = 1; i < path.length; i++) {
    const q = path[i];
    if (q.t > 0.6) break;
    if (q.z > 1.2) continue;
    const dx = q.x - ox;
    const dy = q.y - oy;
    if (dx * dx + dy * dy < reach * reach) return q.t;
  }
  return Infinity;
}

/**
 * Noise-free ground pass from the ball to `at` for team-mate `m`: by how many seconds `m` beats
 * the quickest opponent to the ball (positive = the lane is open), using the same interception
 * model as the coordinator.
 */
export function passLane(e: Engine, carrier: Agent, m: Agent, at: Vec2, arrive = 7): { margin: number; tRecv: number; params: KickParams; path: PathSample[] } {
  const b = e.state.ball.pos;
  const k = e.kicker(carrier);
  const params = groundPass(e.env, k, b, at, arrive);
  const spec = e.kickSpec(carrier, params, 'ground', false);
  const path = predictPath(launched({ x: b.x, y: b.y, z: BR }, params, k, spec), e.env, 2.6, 4);
  const tRecv = interceptFor(e, m, path, 0.6).t;
  let tOpp = Infinity;
  for (const o of e.agents) {
    if (o.side === carrier.side || o.passive || o.stun > 0.4) continue;
    const t = Math.min(interceptFor(e, o, path, 0.6).t, bodyT(o, path));
    if (t < tOpp) tOpp = t;
  }
  return { margin: tOpp - tRecv, tRecv, params, path };
}

/** Is `m` onside for a pass from the ball right now (or in a position where offside can't apply)? */
export function onsideFor(e: Engine, carrier: Agent, m: Agent): boolean {
  const dir = carrier.dir;
  const u = m.st.pos.x * dir;
  return u <= 0 || u <= e.state.ball.pos.x * dir + 0.2 || u <= e.offsideX(carrier.side) * dir + 0.2;
}

/**
 * Team-mates of the carrier split into OPEN (8–30 m away, onside, the noise-free ground pass
 * to his feet reaches him before any opponent can step in) and covered ones.
 */
export function openMates(e: Engine, carrier: Agent, margin = 0.1): { open: Agent[]; covered: Agent[] } {
  const open: Agent[] = [];
  const covered: Agent[] = [];
  const b = e.state.ball.pos;
  for (const m of e.agents) {
    if (m.side !== carrier.side || m === carrier || m.isGK || m.passive) continue;
    const d = hyp(m.st.pos.x - b.x, m.st.pos.y - b.y);
    if (d < 8 || d > 30 || !onsideFor(e, carrier, m)) { covered.push(m); continue; }
    if (passLane(e, carrier, m, m.st.pos).margin > margin) open.push(m);
    else covered.push(m);
  }
  return { open, covered };
}

export interface LedPass {
  params: KickParams;
  /** Where the receiver meets it. */
  at: Vec2;
  /** Flight time to `at` (s). */
  t: number;
  /** Seconds the receiver is ahead of the quickest opponent (positive = safe). */
  margin: number;
  lofted: boolean;
}

/**
 * Noise-free pass that meets a moving team-mate in stride: the lead is proportional to his speed
 * (the user: the way he is steering) and solved against the real flight time; `feet` plays it to
 * where he stands. Lofted only on request (over a blocked lane).
 */
/** Distance covered in `t` s from speed `v0` accelerating at `acc` up to `vmax`. */
function runDist(t: number, v0: number, vmax: number, acc: number): number {
  if (v0 >= vmax) return vmax * t;
  const t1 = (vmax - v0) / acc;
  return t <= t1 ? v0 * t + 0.5 * acc * t * t : v0 * t1 + 0.5 * acc * t1 * t1 + vmax * (t - t1);
}

/** Time to cover `d` m from speed `v0` accelerating at `acc` up to `vmax`. */
function runTime(d: number, v0: number, vmax: number, acc: number): number {
  if (v0 >= vmax) return d / vmax;
  const d1 = (vmax * vmax - v0 * v0) / (2 * acc);
  if (d <= d1) return (-v0 + Math.sqrt(v0 * v0 + 2 * acc * d)) / acc;
  return (vmax - v0) / acc + (d - d1) / vmax;
}

export function ledPass(e: Engine, a: Agent, m: Agent, opts: { feet?: boolean; maxLead?: number; lofted?: boolean; quick?: boolean } = {}): LedPass {
  const b = e.state.ball.pos;
  const from = { x: b.x, y: b.y };
  const k = e.kicker(a);
  let ux = 0;
  let uy = 0;
  // his run: current speed along it, the speed he is heading for and how fast he gets there
  let v0 = hyp(m.st.vel.x, m.st.vel.y);
  let vmax = v0;
  let acc = 1;
  if (v0 > 0.8) { ux = m.st.vel.x / v0; uy = m.st.vel.y / v0; }
  const cd = m.isUser ? e.ctl.dir : null;
  if (cd && m.urgency > 0.5) {
    // the user keeps running the way he is steering, up to his running speed
    const cl = hyp(cd.x, cd.y) || 1;
    ux = cd.x / cl; uy = cd.y / cl;
    v0 = Math.max(0, m.st.vel.x * ux + m.st.vel.y * uy);
    vmax = m.topSpeed * m.urgency * (0.78 + 0.22 * m.st.stamina);
    acc = m.accel * (1.55 + 0.6 * e.ease);
  }
  let sp = Math.max(v0, vmax);
  if (opts.feet || sp < 0.8) { ux = 0; uy = 0; sp = 0; v0 = 0; vmax = 0; }
  const lead = (t: number) => (sp > 0 ? runDist(t, v0, vmax, acc) : 0);
  const maxLead = opts.maxLead ?? 9;
  const lofted = !!opts.lofted;
  const d0 = hyp(m.st.pos.x - from.x, m.st.pos.y - from.y);
  // firmer to a runner, softer to feet: always controllable on arrival
  const base = clamp(5.6 + d0 * 0.08 + sp * 0.12, 6, 9.5);
  const solve = (at: Vec2, arrive: number): { params: KickParams; path: PathSample[]; t: number } => {
    const d = hyp(at.x - from.x, at.y - from.y);
    const params = lofted
      ? solveLob(e.env, k, { x: b.x, y: b.y, z: b.z }, at, 0.9, 0, 0.42, LOB_LOFT)
      : groundPass(e.env, k, b, at, arrive);
    const spec = e.kickSpec(a, params, 'ground', false);
    const path = predictPath(launched({ x: b.x, y: b.y, z: lofted ? b.z : BR }, params, k, spec), e.env, lofted ? 3.5 : clamp(d / 6 + 0.8, 1.2, 3), 4);
    const q = atDistance(path, d);
    return { params, path, t: q ? q.t : path[path.length - 1].t + 0.5 };
  };
  const place = (lead: number, lat: number): Vec2 => ({
    x: clamp(m.st.pos.x + ux * lead - uy * lat, -HL + 1.5, HL - 2),
    y: clamp(m.st.pos.y + uy * lead + ux * lat, -HW + 1.2, HW - 1.2),
  });
  const judge = (at: Vec2, sol: { params: KickParams; path: PathSample[]; t: number }): LedPass => {
    let tOpp = Infinity;
    for (const o of e.agents) {
      if (o.side === a.side || o.passive || o.stun > 0.4) continue;
      const r = Math.min(interceptFor(e, o, sol.path, lofted ? undefined : 0.6).t, bodyT(o, sol.path));
      if (r < tOpp) tOpp = r;
    }
    // a runner gets it where his run first catches the ball (a ball that beats him runs away);
    // a standing player can also step in to meet it
    let tRecv = Infinity;
    if (sp > 0) {
      for (let i = 1; i < sol.path.length; i++) {
        const q = sol.path[i];
        if (q.z > (lofted ? 1.6 : 1.0)) continue;
        const dx = q.x - m.st.pos.x;
        const dy = q.y - m.st.pos.y;
        const d = hyp(dx, dy);
        if (d > 1.5 && (dx * ux + dy * uy) / d < 0.5) continue;
        if (runTime(Math.max(0, d - 0.7), v0, vmax, acc) <= q.t + 0.05) { tRecv = q.t; break; }
      }
    } else tRecv = Math.min(sol.t, interceptFor(e, m, sol.path, lofted ? undefined : 0.6).t);
    return { params: sol.params, at, t: sol.t, margin: tOpp - tRecv, lofted };
  };
  // the arrival time and the lead depend on each other: a few fixed-point steps (one for a lob)
  let t = lofted ? d0 / 14 + 0.9 : d0 / 12 + 0.15;
  let at: Vec2 = { x: m.st.pos.x, y: m.st.pos.y };
  let sol = { params: { dir: { x: 1, y: 0 }, power: 0.5, loft: 0, curl: 0 } as KickParams, path: [] as PathSample[], t };
  for (let it = 0; it < 3; it++) {
    at = place(Math.min(maxLead, lead(t + 0.1)), 0);
    sol = solve(at, base);
    if (Math.abs(sol.t - t) < 0.05 || sp === 0 || lofted) { t = sol.t; break; }
    t = sol.t;
  }
  let best = judge(at, sol);
  if (lofted || opts.quick || best.margin > 0.35) return best;
  // a firmer ball (less time for defenders), a shorter / longer lead, or just off his line
  const fast = Math.min(base + 2.5, 11.5);
  const tf = t * 0.82;
  const alts: [number, number, number][] = sp > 0
    ? [[1, 0, fast], [0.75, 0, fast], [1.25, 0, fast], [0.45, 0, base], [1, 2.5, fast], [1, -2.5, fast]]
    : [[0, 0, fast], [0, 1.5, base], [0, -1.5, base]];
  for (const [lf, lat, arr] of alts) {
    const p = place(Math.min(maxLead * 1.2, lead(tf + 0.1) * lf), lat);
    const r = judge(p, solve(p, arr));
    // prefer the plain ball into his stride unless the alternative is clearly safer
    if (r.margin > best.margin + 0.08 + Math.abs(1 - lf) * 0.4 + Math.abs(lat) * 0.02) best = r;
  }
  return best;
}

/**
 * Lane margin (s) the AI accepts for a ball to the user. Opponents react later and cut out fewer
 * passes meant for him on easy / normal (see the chaser rule and interactions), so the AI may be bolder.
 */
const PASS_THR = (e: Engine): number => -0.1 - 0.3 * e.ease;

/** One launch angle for the quick lob solve (the full search is too slow per decision). */
const LOB_LOFT = [0.42] as const;

/**
 * Give-and-go / call for the ball: the team-mate on the ball plays it to the user — first touch
 * into his stride when he runs, to feet when he stops — or waits a beat (≤ 0.6 s) for the lane to
 * open. Never a hopeless ball straight into a defender. Returns what it did.
 */
function playToUser(e: Engine, a: Agent): 'passed' | 'wait' | 'no' {
  const s = e.state;
  const u = e.user;
  if (u.side !== a.side || u.passive || u.stun > 0 || a.isGK) return 'no';
  const calling = s.time < e.ctl.callUntil;
  const callAt = e.ctl.callUntil - CALL_WINDOW;
  const fromUser = a.receivedFrom === u.i && a.carryT < 2.6;
  const sp = hyp(u.st.vel.x, u.st.vel.y);
  const fwd = u.st.vel.x * a.dir;
  const steering = !!e.ctl.dir;
  // a one-two is on when he passed and set off (forward / into space)
  const running = sp > 2.2 && fwd > -0.3 * sp && steering;
  if (!calling && !(fromUser && running)) return 'no';
  const b = s.ball.pos;
  const dist = hyp(u.st.pos.x - b.x, u.st.pos.y - b.y);
  if (dist < 3.5 || dist > 42) return 'no';
  const waited = calling ? s.time - callAt : a.carryT;
  const canWait = waited < 0.6 && e.pressureOn(a) < 0.85;
  if (!onsideFor(e, a, u)) return canWait ? 'wait' : 'no';
  const feet = !steering;
  const lp = ledPass(e, a, u, { feet, maxLead: calling && e.ctl.callThrough ? 13 : 9 });
  // easy / normal: opponents are slower to cut out passes to the user (see interactions)
  const thr = PASS_THR(e);
  let pick: LedPass | null = lp.margin > thr ? lp : null;
  // over a blocked lane: a lofted ball (an expensive solve, so only once waiting is over)
  if (!pick && dist > 13 && (!canWait || waited > 0.45)) {
    const lob = ledPass(e, a, u, { feet, maxLead: 9, lofted: true });
    if (lob.margin > thr + 0.1) pick = lob;
  }
  if (pick) {
    e.execKick(a, pick.params, { target: u.i, isShot: false });
    return 'passed';
  }
  // the lane is shut: hold it a beat if he is about to come free, else keep the ball
  return canWait && lp.margin > thr - 0.8 ? 'wait' : 'no';
}

// ───────────────────────── coordinator ─────────────────────────

export function aiUpdate(e: Engine): void {
  const s = e.state;
  const owner = e.owner;
  const k = e.lastKick;
  const loose = !owner;
  const chaser: Record<Side, Agent | null> = { us: null, them: null };
  if (loose) {
    const path = e.ballPath();
    const best: Record<Side, number> = { us: Infinity, them: Infinity };
    for (const a of e.agents) {
      a.eit = Infinity;
      a.eitPoint = null;
      if (a.passive || (a.wall && e.frozen) || a.stun > 0.5) continue;
      const r = interceptFor(e, a, path);
      a.eit = r.t;
      a.eitPoint = r.p;
      if (!a.isGK && !a.isUser && r.t < best[a.side]) { best[a.side] = r.t; chaser[a.side] = a; }
    }
    // the user is his side's chaser when he is clearly first: AI teammates leave it to him
    const u = e.user;
    if (u.eit < best.us - 0.15 && u.eit < 2.5) chaser.us = null;
    // a team-mate's pass meant for the user is his (team-mates don't nick it off him)
    if (e.passForUser() && Number.isFinite(u.eit) && u.eit < 4 && !u.passive && u.stun <= 0) chaser.us = null;
    // Casual assist: on easy/normal an opponent only goes for the user's pass when he would
    // clearly beat the intended receiver to it, so sensible passes are rarely cut out.
    const them = chaser.them;
    // (and, a little less, team-mates' passes played to the user)
    const byUser = !!k && !!e.agents[k.by]?.isUser;
    if (them && k && !k.isShot && !k.completed && k.side === 'us' && (byUser || k.target === u.i) && e.ease > 0 && s.time - k.t < 4) {
      const recv = k.target >= 0 ? e.agents[k.target] : null;
      const recvT = recv ? recv.eit : best.us;
      if (Number.isFinite(recvT) && them.eit > recvT - (byUser ? 0.8 : 0.5) * e.ease) chaser.them = null;
    }
  }
  const passIn = loose && k && !k.isShot && !k.completed && k.target >= 0 && s.time - k.t < 4 ? k : null;
  const pressers = loose ? null : assignPressers(e);
  const marks = assignMarks(e, pressers);
  // the user's team: everyone re-shapes around the (next) ball carrier
  const focus = supportFocus(e, passIn);
  const plan = focus ? planSupport(e, focus.c, focus.p) : null;

  for (const a of e.agents) {
    if (a.isGK || a.isUser || a.passive) continue;
    if (a.wall) {
      if (e.frozen) continue;
      if (a.jump <= 0 && a.animLock <= 0) { a.wall = false; a.st.inWall = false; }
      else continue;
    }
    if (a === owner) continue;
    if (loose) {
      if (passIn && passIn.side === a.side && passIn.target === a.i && a.eitPoint && a.eit < 6) {
        goTo(a, a.eitPoint, 1, 'receive');
      } else if (chaser[a.side] === a && a.eitPoint) {
        // only chase what can be reached; otherwise hold the shape
        const contest = a.eit < 4;
        if (contest) goTo(a, a.eitPoint, 1, 'chase');
        else defendOffBall(e, a, null, marks);
      } else if (k && k.cross && k.side === a.side && s.time - k.t < 3.5) {
        attackCross(e, a);
      } else if ((passIn && passIn.side === a.side) || (!passIn && s.ball.lastTouchSide === a.side)) {
        attackOffBall(e, a, plan);
      } else {
        defendOffBall(e, a, null, marks);
      }
    } else if (owner && owner.side === a.side) {
      attackOffBall(e, a, plan);
    } else {
      defendOffBall(e, a, pressers, marks);
    }
  }
}

function goTo(a: Agent, p: Vec2, urgency: number, duty: Agent['duty']): void {
  a.target = { x: p.x, y: p.y };
  a.urgency = urgency;
  a.duty = duty;
}

/** Closest defenders (by time) to the ball carrier for each defending side. */
function assignPressers(e: Engine): Agent[] {
  const c = e.owner;
  if (!c) return [];
  const out: Agent[] = [];
  const cand: { a: Agent; tt: number }[] = [];
  for (const a of e.agents) {
    if (a.side === c.side || a.isGK || a.passive || a.wall) continue;
    const d = hyp(a.st.pos.x - c.st.pos.x, a.st.pos.y - c.st.pos.y);
    cand.push({ a, tt: a.reaction + d / a.topSpeed });
  }
  cand.sort((p, q) => p.tt - q.tt);
  // in a defend moment our AI leaves the first duel to the user when he is close
  const userDefends = e.attackSide === 'them' && c.side === 'them';
  for (const x of cand) {
    if (out.length >= 2) break;
    if (x.a.isUser) { out.push(x.a); continue; }
    if (userDefends && x.a.side === 'us') {
      const du = hyp(e.user.st.pos.x - c.st.pos.x, e.user.st.pos.y - c.st.pos.y);
      if (du < 7 && out.length === 0) continue;
    }
    const style = (x.a.side === 'us' ? e.setup.us.style : e.setup.them.style);
    if (out.length === 1) {
      const deep = distToGoal(c.st.pos, c.dir) < 30;
      if (!(style === 'pressing' || deep) || x.tt > 1.6) break;
    }
    out.push(x.a);
  }
  return out;
}

/** Greedy man-marking of the most dangerous attackers. */
function assignMarks(e: Engine, pressers: Agent[] | null): Map<number, Agent> {
  const marks = new Map<number, Agent>();
  const owner = e.owner;
  const attSide: Side | null = owner ? owner.side : e.state.ball.lastTouchSide;
  if (!attSide) return marks;
  const attackers = e.agents.filter((a) => a.side === attSide && !a.isGK && !a.passive && a !== owner);
  const defenders = e.agents.filter((a) => a.side !== attSide && !a.isGK && !a.passive && !a.wall && !a.isUser && !(pressers?.includes(a)));
  const dir = attSide === 'us' ? 1 : -1;
  attackers.sort((p, q) => distToGoal(p.st.pos, dir) - distToGoal(q.st.pos, dir));
  const free = new Set(defenders);
  for (const t of attackers) {
    if (distToGoal(t.st.pos, dir) > 45) break;
    let best: Agent | null = null;
    let bd = Infinity;
    for (const d of free) {
      const dd = hyp(d.st.pos.x - t.st.pos.x, d.st.pos.y - t.st.pos.y);
      if (dd < bd) { bd = dd; best = d; }
    }
    if (!best || bd > 22) continue;
    free.delete(best);
    marks.set(best.i, t);
  }
  return marks;
}

function homeOf(e: Engine, a: Agent, inPossession: boolean): Vec2 {
  const b = e.state.ball.pos;
  const style = a.side === 'us' ? e.setup.us.style : e.setup.them.style;
  return slotHome(a.slot, { dir: a.dir, inPossession, ball: { x: b.x, y: b.y }, style });
}

const isForward = (a: Agent) => a.slot.role === 'ST' || a.slot.role === 'W' || a.slot.role === 'AM';

function attackOffBall(e: Engine, a: Agent, plan: Map<number, SupPlan> | null): void {
  const sp = plan?.get(a.i);
  if (sp) {
    a.target = { x: clamp(sp.x, -HL + 2, HL - 1), y: clamp(sp.y, -HW + 1.5, HW - 1.5) };
    a.urgency = sp.urg;
    a.duty = sp.duty;
    return;
  }
  const s = e.state;
  const dir = a.dir;
  const owner = e.owner;
  const ball = s.ball.pos;
  const home = homeOf(e, a, true);
  let tx = home.x;
  let ty = home.y;
  let urg = 0.62;
  const line = e.offsideX(a.side) * dir;
  if (a.runT > 0 && a.runTarget) {
    tx = a.runTarget.x;
    ty = a.runTarget.y;
    urg = 0.97;
    a.duty = 'run';
  } else {
    a.duty = 'support';
    // forwards time runs in behind when the carrier can play them in
    if (owner && owner.side === a.side && isForward(a) && !owner.isGK) {
      const u = a.st.pos.x * dir;
      const ownerU = owner.st.pos.x * dir;
      if (u < line - 0.4 && ownerU > -25 && line < HL - 12 && e.rng.chance(0.035 + (owner.isUser ? 0.035 * e.ease : 0))) {
        a.runT = 2.4;
        a.runTarget = { x: dir * Math.min(line + 10, HL - 8), y: clamp(a.st.pos.y * 0.75 + e.rng.float(-4, 4), -22, 22) };
      }
    }
    // casual play: midfielders / full-backs show for the user's pass (an angled option either side)
    if (owner && owner.isUser && e.ease > 0 && !isForward(a) && a.slot.role !== 'CB') {
      const side = Math.sign(a.st.pos.y - owner.st.pos.y) || (a.i % 2 ? 1 : -1);
      const sx = owner.st.pos.x + dir * (a.slot.role === 'FB' ? -3 : 6);
      const sy = owner.st.pos.y + side * (a.slot.role === 'FB' ? 14 : 10);
      const w = 0.65 * e.ease;
      tx += (sx - tx) * w;
      ty += (sy - ty) * w;
      urg = Math.max(urg, 0.7);
    }
    // stay onside
    if (tx * dir > line - 0.6) tx = dir * (line - 0.6);
    // forwards push up when we are in the final third
    if (isForward(a) && ball.x * dir > 15) {
      tx = dir * Math.min(Math.max(tx * dir, ball.x * dir + 4), line - 0.6);
      urg = 0.75;
    }
    // don't crowd the carrier
    if (owner && owner !== a) {
      const dx = tx - owner.st.pos.x;
      const dy = ty - owner.st.pos.y;
      const d = hyp(dx, dy);
      if (d < 7) { tx = owner.st.pos.x + (dx / (d || 1)) * 7; ty = owner.st.pos.y + (dy / (d || 1)) * 7; }
    }
    // find a pocket of space away from the nearest marker
    const near = e.nearestOpp(a, { x: tx, y: ty });
    if (near.o && near.d < 3.2) {
      const sy = Math.sign(ty - near.o.st.pos.y) || (a.i % 2 ? 1 : -1);
      ty += sy * (3.2 - near.d) * 1.2;
    }
  }
  a.target = { x: clamp(tx, -HL + 2, HL - 1), y: clamp(ty, -HW + 1.5, HW - 1.5) };
  a.urgency = urg;
}

// ───────────────────────── off-ball support (the user's team) ─────────────────────────

interface SupPlan { x: number; y: number; urg: number; duty: Agent['duty'] }

/** Seconds between re-evaluations of a supporter's spot (hysteresis keeps him from twitching). */
const SUP_EVERY = 0.3;
/** Minimum distance between supporters' spots (and to the ball / the user). */
const SPACE = 10;

/** Whom the user's team plays around: the carrier, or the receiver of a pass in flight (at his reception point). */
function supportFocus(e: Engine, passIn: KickRec | null): { c: Agent; p: Vec2 } | null {
  const side = e.user.side;
  const o = e.owner;
  if (o) return o.side === side ? { c: o, p: { x: o.st.pos.x, y: o.st.pos.y } } : null;
  if (passIn && passIn.side === side) {
    const r = e.agents[passIn.target];
    if (r && r.side === side && !r.passive) {
      const p = r.eitPoint && r.eit < 6 ? r.eitPoint : r.st.pos;
      return { c: r, p: { x: p.x, y: p.y } };
    }
  }
  return null;
}

/** Is the carrier ready to play a forward runner in (on the ball, facing up, not hounded)? */
function passerReady(e: Engine, c: Agent): boolean {
  if (e.owner !== c || c.isGK) return false;
  if (e.pressureOn(c) > 0.7) return false;
  if (c.isUser) {
    const v = c.st.vel;
    const sp = hyp(v.x, v.y);
    return sp < 1 || v.x * c.dir > -0.2 * sp;
  }
  return Math.cos(c.st.facing) * c.dir > -0.2;
}

/**
 * Support around the ball carrier: two short options at an angle either side (10–18 m), a deeper
 * safe option, forwards on the shoulder of the last defender timing runs (held / curved to stay
 * onside), the near full-back overlapping, everyone else in shape — each spot nudged out of the
 * opponents' passing shadows and away from team-mates, re-evaluated every ~0.3 s with hysteresis.
 */
function planSupport(e: Engine, c: Agent, p: Vec2): Map<number, SupPlan> {
  const s = e.state;
  const dir = c.dir;
  const side = c.side;
  const line = e.offsideX(side) * dir;
  const pu = p.x * dir;
  const out = new Map<number, SupPlan>();
  const mates: Agent[] = [];
  for (const m of e.agents) if (m.side === side && m !== c && !m.isGK && !m.isUser && !m.passive && !m.wall) mates.push(m);
  if (!mates.length) return out;
  const sy = Math.sign(p.y) || 1;
  // positional roles by slot (midfielders: short options and the one behind; wingers: width or
  // runs; full-backs: width / overlap / the switch; centre-backs: rest defence), each on his own
  // flank, so the shape stays stable while the spots themselves move with the ball
  const roleOf = new Map<Agent, { r: SupRole; off: Vec2 | null }>();
  // flank of each wide man: of a pair (two wingers / two full-backs) the one further to +y takes
  // the +y side, so nobody runs across the pitch (or through the ball carrier) to reach his wing
  const flank = new Map<Agent, number>();
  for (const role of ['W', 'FB'] as const) {
    const g = mates.filter((m) => m.slot.role === role).sort((x, y) => x.st.pos.y - y.st.pos.y);
    if (g.length === 1) flank.set(g[0], Math.sign((0.5 - g[0].slot.x) * dir) || Math.sign(g[0].st.pos.y - p.y) || 1);
    else g.forEach((m, k) => flank.set(m, k === 0 ? -1 : k === g.length - 1 ? 1 : Math.sign(m.st.pos.y - p.y) || 1));
  }
  const laneOf = (m: Agent) => flank.get(m) ?? (Math.sign(m.st.pos.y - p.y) || (m.i % 2 ? 1 : -1));
  const keep = (m: Agent, r: SupRole) => (m.sup && m.sup.c === c.i && m.sup.role === r ? 5 : 0);
  const onPitch = (ox: number, oy: number) => Math.abs(p.y + oy) < HW - 2 && Math.abs(p.x + ox) < HL - 2;
  const short = (sg: number): Vec2 => ({ x: dir * 7, y: sg * 11.5 });
  // midfielders: the angled short option either side, then one behind the ball
  const mids = mates.filter((m) => m.slot.role === 'CM' || m.slot.role === 'DM' || m.slot.role === 'AM');
  for (const sg of [1, -1]) {
    const off = short(sg);
    if (!onPitch(off.x, off.y)) continue;
    let best: Agent | null = null;
    let bc = Infinity;
    for (const m of mids) {
      if (roleOf.has(m)) continue;
      const cost = hyp(p.x + off.x - m.st.pos.x, p.y + off.y - m.st.pos.y) + (laneOf(m) === -sg ? 8 : 0) - keep(m, sg > 0 ? 'shortA' : 'shortB') + (m.runT > 0 ? 10 : 0);
      if (cost < bc) { bc = cost; best = m; }
    }
    if (best) roleOf.set(best, { r: sg > 0 ? 'shortA' : 'shortB', off });
  }
  const ready = passerReady(e, c);
  let running = 0;
  for (const m of mates) if (m.runT > 0) running++;
  // a forward times a run in behind only when the passer can play it (and stays onside until then)
  const tryRun = (m: Agent, chance: number, ty: number): boolean => {
    if (m.runT > 0 || !ready || running >= 2 || line >= HL - 10 || line - pu >= 36 || pu <= -32 || !e.rng.chance(chance)) return false;
    m.runT = 2.6;
    m.runTarget = { x: dir * Math.min(line + 10, HL - 8), y: clamp(m.st.pos.y * 0.7 + (ty - m.st.pos.y) * 0.3, -22, 22) };
    running++;
    return true;
  };
  const runChance = 0.05 + (c.isUser ? 0.06 * (0.5 + e.ease) : 0.02);
  const deepOff = { x: -dir * 12, y: -sy * 4 };
  const wantDeep = pu > -HL + 19;
  let deepTaken = false;
  for (const m of mids.sort((x, y) => hyp(x.st.pos.x - p.x, x.st.pos.y - p.y) - hyp(y.st.pos.x - p.x, y.st.pos.y - p.y))) {
    if (roleOf.has(m)) continue;
    if (wantDeep && !deepTaken && m.slot.role !== 'AM') { roleOf.set(m, { r: 'deep', off: deepOff }); deepTaken = true; }
    else roleOf.set(m, { r: 'shape', off: null });
  }
  for (const m of mates) {
    if (roleOf.has(m)) continue;
    const role = m.slot.role;
    const sg = laneOf(m);
    if (role === 'ST') { roleOf.set(m, { r: 'run', off: null }); continue; }
    if (role === 'W') {
      // the winger attacks the space behind the full-back now and then (inside-to-out runs)
      if (m.runT > 0 || tryRun(m, runChance * 0.6, sg * clamp(Math.abs(p.y) + 6, 10, 22))) { roleOf.set(m, { r: 'run', off: null }); continue; }
      // his wing: the in-possession shape, ahead of the ball, down the line when the ball is out there
      const onWing = Math.sign(p.y) === sg && Math.abs(p.y) > 18;
      const home = homeOf(e, m, true);
      const wu = Math.min(Math.max(home.x * dir, pu + (onWing ? 12 : 4)), line - 1.5);
      let wy = sg * (onWing ? HW - 3.5 : clamp(Math.abs(home.y), 16, HW - 5));
      // keep a clear lane between him and the short option on his side
      if (!onWing && (wy - p.y) * sg < 17) wy = clamp(p.y + sg * 17, -HW + 3, HW - 3);
      roleOf.set(m, { r: sg > 0 ? 'wideB' : 'wideA', off: { x: wu * dir - p.x, y: wy - p.y } });
      continue;
    }
    if (role === 'FB') {
      const ballSide = Math.sign(p.y) === sg && Math.abs(p.y) > 6;
      const r: SupRole = sg > 0 ? 'squareA' : 'squareB';
      if (c.isUser && ballSide && pu > -12 && Math.abs(p.y) > 14 && Math.abs(p.y) < HW - 6 && pu < HL - 14) roleOf.set(m, { r: 'overlap', off: null });
      else if (pu < 0) {
        // building from the back: the full-backs give width
        const off = { x: dir * (ballSide ? 3 : -1), y: sg * (HW - 5) - p.y };
        roleOf.set(m, { r, off });
      } else if (ballSide && onPitch(-dir * 3, sg * 13)) roleOf.set(m, { r, off: { x: -dir * 3, y: sg * 13 } });
      else if (!ballSide) {
        // far side: tucked in a little, the switch of play
        const yy = clamp(p.y + sg * 18, -HW + 4, HW - 4);
        roleOf.set(m, { r, off: { x: -dir * 8, y: yy - p.y } });
      } else roleOf.set(m, { r: 'shape', off: null });
      continue;
    }
    if (role === 'CB' && wantDeep && !deepTaken && pu < 0) { roleOf.set(m, { r: 'deep', off: deepOff }); deepTaken = true; continue; }
    if (role === 'CB' && pu < -12) {
      // building from the back: the other centre-back splits wide for the square ball
      const sg2 = Math.sign(m.st.pos.y - p.y) || (m.i % 2 ? 1 : -1);
      const yy = clamp(p.y + sg2 * 14, -HW + 6, HW - 6);
      roleOf.set(m, { r: sg2 > 0 ? 'squareA' : 'squareB', off: { x: -dir * 2, y: yy - p.y } });
      continue;
    }
    roleOf.set(m, { r: 'shape', off: null });
  }
  // taken spots (spacing): the ball, the user, then each plan as it is made
  const taken: Vec2[] = [p];
  const uu = e.user;
  // the user (where he is and where his run takes him) is kept clear too
  const userPts: Vec2[] = !c.isUser && !uu.passive && uu.side === side
    ? [{ x: uu.st.pos.x, y: uu.st.pos.y }, { x: uu.st.pos.x + uu.st.vel.x * 0.9, y: uu.st.pos.y + uu.st.vel.y * 0.9 }]
    : [];
  taken.push(...userPts);
  const order: SupRole[] = ['shortA', 'shortB', 'squareA', 'squareB', 'deep', 'wideA', 'wideB', 'run', 'overlap', 'shape'];
  const list = [...roleOf.entries()].sort((x, y) => order.indexOf(x[1].r) - order.indexOf(y[1].r));
  for (const [m, { r, off }] of list) {
    let nominal: Vec2;
    let dMin = 9;
    let dMax = 19;
    let laneW = 1;
    let urg = 0.7;
    let duty: Agent['duty'] = 'support';
    if (r === 'run') {
      const home = homeOf(e, m, true);
      const ty = m.slot.role === 'ST' ? clamp(p.y * 0.35, -9, 9) : (Math.sign(home.y) || (m.i % 2 ? 1 : -1)) * clamp(Math.abs(home.y), 14, HW - 6);
      // the striker on the shoulder of the last defender, wide men a step off it in their channel
      const tu = Math.min(line - (m.slot.role === 'ST' ? 1.5 : 3), Math.max(home.x * dir, pu + 5), pu + (m.slot.role === 'ST' ? 20 : 30));
      tryRun(m, runChance, ty);
      if (m.runT > 0 && m.runTarget) {
        let tx = m.runTarget.x;
        let ty2 = m.runTarget.y;
        let u = 0.97;
        // the ball has not been played yet: curve along the line instead of straying offside
        if (e.owner === c && tx * dir > line - 0.5) {
          const ahead = m.st.pos.x * dir > line - 1.6;
          tx = dir * (line - 0.5);
          if (ahead) { ty2 = m.runTarget.y; u = 0.85; }
        }
        out.set(m.i, { x: tx, y: ty2, urg: u, duty: 'run' });
        taken.push({ x: tx, y: ty2 });
        continue;
      }
      nominal = { x: dir * tu, y: ty };
      dMin = 6; dMax = 40; laneW = 0.5; urg = 0.75;
    } else if (r === 'overlap') {
      const ay = Math.abs(p.y);
      nominal = { x: p.x + dir * 11, y: sy * Math.min(HW - 2.5, ay + 8.5) };
      dMin = 7; dMax = 22; laneW = 0.8; urg = 0.88; duty = 'run';
    } else if (r === 'shape') {
      nominal = homeOf(e, m, true);
      dMin = 6; dMax = 60; laneW = 0.35; urg = 0.62;
      duty = 'shape';
    } else {
      nominal = { x: p.x + (off?.x ?? 0), y: p.y + (off?.y ?? 0) };
      if (r === 'deep') { dMin = 8; dMax = 16; }
      if (r === 'wideA' || r === 'wideB') { dMin = 10; dMax = 34; laneW = 0.8; }
      if (r === 'squareA' || r === 'squareB') { dMin = 9; dMax = 30; }
      urg = 0.72;
    }
    // re-use the spot until the next re-evaluation (relative to the ball, so it moves with it)
    const mem = m.sup;
    const same = !!mem && mem.c === c.i && mem.role === r;
    let spot: Vec2;
    if (same && mem && s.time < mem.t) spot = { x: p.x + mem.off.x, y: p.y + mem.off.y };
    else {
      spot = bestSpot(e, c, m, p, nominal, same && mem ? { x: p.x + mem.off.x, y: p.y + mem.off.y } : null, taken, dMin, dMax, laneW, line);
      m.sup = { role: r, off: { x: spot.x - p.x, y: spot.y - p.y }, t: s.time + SUP_EVERY + 0.02 * (m.i % 5), c: c.i };
    }
    if (spot.x * dir > line - 0.6) spot.x = dir * (line - 0.6);
    spot.x = clamp(spot.x, -HL + 3, HL - 2);
    spot.y = clamp(spot.y, -HW + 1.5, HW - 1.5);
    const far = hyp(spot.x - m.st.pos.x, spot.y - m.st.pos.y);
    out.set(m.i, { x: spot.x, y: spot.y, urg: far > 9 ? Math.max(urg, 0.86) : far > 4 ? Math.max(urg, 0.74) : urg, duty });
    taken.push(spot);
  }
  // spacing pass: no two supporters (or a supporter and the ball / the user) within SPACE m
  const fixed: Vec2[] = [p, ...userPts];
  const plans = list.map(([m]) => out.get(m.i)).filter((q): q is SupPlan => !!q && q.duty !== 'run');
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < plans.length; i++) {
      const q = plans[i];
      const others = fixed.concat(plans.slice(0, i));
      for (const o of others) {
        const dx = q.x - o.x;
        const dy = q.y - o.y;
        const d = hyp(dx, dy);
        if (d >= SPACE) continue;
        const ux = d > 0.01 ? dx / d : (i % 2 ? 1 : -1) * 0.7;
        const uy = d > 0.01 ? dy / d : 0.7;
        q.x = clamp(q.x + ux * (SPACE - d), -HL + 3, HL - 2);
        q.y = clamp(q.y + uy * (SPACE - d), -HW + 1.5, HW - 1.5);
      }
      if (q.x * dir > line - 0.6) q.x = dir * (line - 0.6);
    }
  }
  return out;
}

/** Best spot near `nominal`: open lane from the ball, space, spacing to team-mates, onside, short travel. */
function bestSpot(e: Engine, c: Agent, m: Agent, p: Vec2, nominal: Vec2, current: Vec2 | null, taken: Vec2[], dMin: number, dMax: number, laneW: number, line: number): Vec2 {
  const dir = c.dir;
  let best = nominal;
  let bestV = -Infinity;
  const n = OFFSETS.length + (current ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const cand = i < OFFSETS.length
      ? { x: clamp(nominal.x + OFFSETS[i][0], -HL + 3, HL - 2), y: clamp(nominal.y + OFFSETS[i][1], -HW + 1.5, HW - 1.5) }
      : (current as Vec2);
    const dx = cand.x - p.x;
    const dy = cand.y - p.y;
    const d = hyp(dx, dy);
    let v = 0;
    if (d < dMin) v -= (dMin - d) * 0.3;
    if (d > dMax) v -= (d - dMax) * 0.15;
    if (laneW > 0 && d > 3) v -= laneRisk(e, c, p, cand, d > 20 ? 16 : 13) * 1.5 * laneW;
    v += Math.min(6, e.nearestOpp(m, cand).d) * 0.25;
    for (const q of taken) {
      const dd = hyp(cand.x - q.x, cand.y - q.y);
      if (dd < 10) v -= (10 - dd) * 0.2;
    }
    v += dx * dir * 0.012;
    v -= hyp(cand.x - m.st.pos.x, cand.y - m.st.pos.y) * 0.02;
    if (cand.x * dir > line - 0.5) v -= 1.5;
    if (i >= OFFSETS.length) v += 0.3;
    if (v > bestV) { bestV = v; best = cand; }
  }
  return { x: best.x, y: best.y };
}

const OFFSETS: [number, number][] = [[0, 0], [3.5, 0], [-3.5, 0], [0, 3.5], [0, -3.5], [2.5, 2.5], [2.5, -2.5], [-2.5, 2.5], [-2.5, -2.5], [6, 0], [-6, 0], [0, 6], [0, -6]];

/** A lofted ball into the box from our side: the best-placed attackers attack it. */
function attackCross(e: Engine, a: Agent): void {
  const mates = e.agents
    .filter((m) => m.side === a.side && !m.isGK && !m.isUser && !m.passive && m.eitPoint && m.eit < 4)
    .sort((p, q) => p.eit - q.eit);
  const rank = mates.indexOf(a);
  if (rank >= 0 && rank < 2 && a.eitPoint) {
    goTo(a, a.eitPoint, 1, 'attackBall');
    return;
  }
  // otherwise fill the posts / edge of the box
  const dir = a.dir;
  const spots = [{ x: dir * (HL - 4), y: 2.5 }, { x: dir * (HL - 5), y: -2.5 }, { x: dir * (HL - 15), y: 0 }];
  const sp = spots[a.i % spots.length];
  goTo(a, sp, 0.85, 'support');
}

function defendOffBall(e: Engine, a: Agent, pressers: Agent[] | null, marks: Map<number, Agent>): void {
  const s = e.state;
  const c = e.owner;
  const ownGoal = { x: -a.dir * HL, y: 0 };
  if (c && pressers && pressers.includes(a)) {
    const gx = ownGoal.x - c.st.pos.x;
    const gy = ownGoal.y - c.st.pos.y;
    const gl = hyp(gx, gy) || 1;
    const d = hyp(c.st.pos.x - a.st.pos.x, c.st.pos.y - a.st.pos.y);
    const close = pressers[0] === a ? 0.9 : 3.5;
    const target = { x: c.st.pos.x + (gx / gl) * close, y: c.st.pos.y + (gy / gl) * close };
    const diff = clamp(e.setup.difficulty, 0, 1);
    // casual play: opponents close the user down more slowly
    const soft = c.isUser ? 0.3 : 0.16;
    let urg = a.side === 'them' ? (0.8 + 0.2 * diff) * (1 - soft * e.ease) : 0.9;
    if (d > 8) urg = a.side === 'them' ? 1 - (c.isUser ? 0.22 : 0.12) * e.ease : 1;
    goTo(a, target, urg, 'press');
    // tackle attempts
    const bd = hyp(s.ball.pos.x - a.st.pos.x, s.ball.pos.y - a.st.pos.y);
    if (pressers[0] === a && bd < 1.3 && a.cool <= 0 && a.stun <= 0 && e.state.phase !== 'outcome') {
      let rate = 0.12 + 0.18 * (a.a.tackling / 99);
      if (a.side === 'them') rate *= (0.75 + 0.6 * diff) * (1 - 0.5 * e.ease) * (c.isUser ? 1 - 0.5 * e.ease : 1);
      if (a.side === 'us' && e.attackSide === 'them') rate *= 0.45;
      if (c.isGK) rate = 0;
      if (e.rng.chance(rate)) e.tryTackle(a, e.rng.chance(0.12));
    }
    return;
  }
  const home = homeOf(e, a, false);
  const m = marks.get(a.i);
  let tx = home.x;
  let ty = home.y;
  let urg = 0.7;
  a.duty = 'shape';
  if (m) {
    const gx = ownGoal.x - m.st.pos.x;
    const gy = ownGoal.y - m.st.pos.y;
    const gl = hyp(gx, gy) || 1;
    const danger = distToGoal(m.st.pos, m.dir) < 25;
    const off = danger ? 1.2 : 2.2;
    const mx = m.st.pos.x + (gx / gl) * off;
    const my = m.st.pos.y + (gy / gl) * off;
    const w = danger ? 0.85 : 0.6;
    tx = mx * w + home.x * (1 - w);
    ty = my * w + home.y * (1 - w);
    urg = danger ? 0.9 : 0.75;
    a.duty = 'mark';
  }
  // block the shooting lane when the carrier is in range
  if (c && distToGoal(c.st.pos, c.dir) < 26) {
    const { d, s: along } = segDist(a.st.pos.x, a.st.pos.y, c.st.pos.x, c.st.pos.y, ownGoal.x, 0);
    if (d < 4 && along > 0.08 && along < 0.7) {
      const lx = c.st.pos.x + (ownGoal.x - c.st.pos.x) * Math.max(0.15, along);
      const ly = c.st.pos.y + (0 - c.st.pos.y) * Math.max(0.15, along);
      tx = lx; ty = ly; urg = 0.95; a.duty = 'cover';
    }
  }
  a.target = { x: clamp(tx, -HL + 0.5, HL - 0.5), y: clamp(ty, -HW + 1, HW - 1) };
  a.urgency = urg;
}

// ───────────────────────── ball carrier ─────────────────────────

export interface PassOption {
  to: Agent;
  at: Vec2;
  value: number;
  lofted: boolean;
  dist: number;
  risk: number;
  /** The receiver would be offside (only ever offered for the user). */
  offside: boolean;
}

/** Lane risk: how many opponents can step into the pass before it passes them. */
export function laneRisk(e: Engine, a: Agent, from: Vec2, to: Vec2, ballSpeed = 13): number {
  const d = hyp(to.x - from.x, to.y - from.y) || 1;
  let risk = 0;
  for (const o of e.agents) {
    if (o.side === a.side || o.passive) continue;
    const r = segDist(o.st.pos.x, o.st.pos.y, from.x, from.y, to.x, to.y);
    if (r.s < 0.02) continue;
    const tBall = (r.s * d) / ballSpeed;
    const reach = o.isGK ? 1.6 : 0.9;
    const tOpp = o.reaction * 0.7 + Math.max(0, r.d - reach) / (o.topSpeed * 0.85);
    if (tOpp < tBall + 0.05) risk += 1 + clamp(tBall - tOpp, 0, 1);
  }
  return risk;
}

export function passOptions(e: Engine, a: Agent): PassOption[] {
  const s = e.state;
  const from = { x: s.ball.pos.x, y: s.ball.pos.y };
  const dir = a.dir;
  const line = e.offsideX(a.side) * dir;
  const out: PassOption[] = [];
  const trust = clamp(e.setup.teammateTrust, 0, 100) / 100;
  for (const m of e.agents) {
    if (m.side !== a.side || m === a || m.passive || m.stun > 0) continue;
    if (m.isGK && from.x * dir > -25) continue;
    const userCall = m.isUser && s.time < e.ctl.callUntil;
    // lead the receiver into his run (the user a little more: he is moving to meet it)
    const lead0 = m.isUser ? clamp(0.3 + hyp(m.st.pos.x - from.x, m.st.pos.y - from.y) / 24, 0.4, 1.1) : 0.45;
    let at: Vec2 = { x: m.st.pos.x + m.st.vel.x * lead0, y: m.st.pos.y + m.st.vel.y * lead0 };
    if (m.runT > 0 || (userCall && e.ctl.callThrough)) {
      const sp = hyp(m.st.vel.x, m.st.vel.y);
      const lead = userCall && e.ctl.callThrough ? clamp(5 + sp * 0.5, 6, 9) : Math.min(8, sp * 0.9);
      const ux = sp > 0.5 ? m.st.vel.x / sp : dir;
      const uy = sp > 0.5 ? m.st.vel.y / sp : 0;
      at = { x: m.st.pos.x + ux * lead, y: m.st.pos.y + uy * lead };
    }
    at = { x: clamp(at.x, -HL + 1, HL - 1.5), y: clamp(at.y, -HW + 1, HW - 1) };
    const dist = hyp(at.x - from.x, at.y - from.y);
    if (dist < (m.isUser ? 3.5 : 4.5) || dist > 42) continue;
    // AI rarely plays a team-mate offside
    const offside = m.st.pos.x * dir > line + 0.2 && m.st.pos.x * dir > from.x * dir && m.st.pos.x * dir > 0;
    if (offside && !m.isUser) continue;
    const risk = laneRisk(e, a, from, at, dist > 20 ? 16 : 13);
    const space = clamp(e.nearestOpp(m, at).d, 0, 8);
    const progress = (at.x - from.x) * dir;
    let value = progress * 0.045 + space * 0.1 - risk * 0.9 + baseXg(at, dir) * 2.5 - (dist > 30 ? 0.2 : 0);
    if (m.isUser) {
      value += 0.15 + trust * 0.5;
      if (userCall) value += 1.1;
      if (a.receivedFrom === m.i && s.time - a.carryT >= 0 && a.carryT < 2.2 && (m.st.vel.x * dir) > 1.5) value += 0.9; // give-and-go
      if (e.attackSide === 'us' && e.log.lastTouchT < 0) value += 0.5;
      if (offside) value -= 1.5;
    }
    let lofted = false;
    if (risk > 0.9 && dist > 14) {
      const lr = laneRisk(e, a, from, at, 40) * 0.35;
      const lv = value + (risk - lr) * 0.9 - 0.25;
      if (lv > value) { value = lv; lofted = true; }
    }
    out.push({ to: m, at, value, lofted, dist, risk, offside });
  }
  out.sort((p, q) => q.value - p.value);
  return out;
}

/** Noise-free kick parameters for a pass option. */
export function passParams(e: Engine, a: Agent, opt: PassOption): KickParams {
  const b = e.state.ball.pos;
  const k = e.kicker(a);
  if (opt.lofted) return solveLob(e.env, k, { x: b.x, y: b.y, z: b.z }, opt.at, 0.9, 0, 0.42);
  const arrive = clamp(5 + opt.dist * 0.12, 6, 10);
  return groundPass(e.env, k, b, opt.at, arrive);
}

/** Pick a shot target away from the keeper and solve it noise-free. */
export function shotParams(e: Engine, a: Agent, opts: { power?: number; curl?: number; zLow?: number; zHigh?: number; kind?: 'ground' | 'volley' | 'header' } = {}): KickParams {
  const b = e.state.ball.pos;
  const dir = a.dir;
  const gk = dir === 1 ? e.gkThem : e.gkUs;
  const ky = gk ? gk.st.pos.y : 0;
  const side = Math.abs(ky - (GW - 0.55)) > Math.abs(ky + (GW - 0.55)) ? 1 : -1;
  const pick = e.rng.chance(0.75) ? side : -side;
  const ty = pick * (GW - 0.5 - 0.3 * e.rng.next());
  const tz = (opts.zLow ?? 0.3) + ((opts.zHigh ?? 1.8) - (opts.zLow ?? 0.3)) * e.rng.next();
  const d = distToGoal({ x: b.x, y: b.y }, dir);
  const power = opts.power ?? clamp(0.68 + d * 0.006, 0.6, 0.9);
  const curl = opts.curl ?? (d > 17 ? 0.35 * Math.sign(ty - b.y || 1) * dir : 0);
  const kind = opts.kind ?? 'ground';
  const spec = e.kickSpec(a, { dir: { x: dir, y: 0 }, power, loft: 0.05, curl }, kind, true);
  const sol = solveShot(e.env, e.kicker(a), spec, { x: b.x, y: b.y, z: b.z }, dir * HL, ty, tz, power, curl, kind === 'header' ? 0.3 : 0.06);
  return sol.params;
}

export function carrierThink(e: Engine, a: Agent): void {
  const s = e.state;
  a.think = 0.18 + 0.1 * e.rng.next();
  const dir = a.dir;
  const pos = a.st.pos;
  const b = s.ball.pos;
  const pressure = e.pressureOn(a);
  const dGoal = distToGoal(pos, dir);
  const vision = clamp(a.a.vision, 1, 99) / 99;
  // the user's team-mates play with him (one-twos, calls) and look after the ball
  const mine = a.side === e.user.side;

  if (mine) {
    const r = playToUser(e, a);
    if (r === 'passed') return;
    if (r === 'wait') { shield(e, a); a.think = 0.08; return; }
  }
  const settle = a.carryT < 0.28 && pressure < 0.6 && dGoal > 14;

  // ── shoot? ──
  let shootV = -Infinity;
  if (dGoal < 30 && pos.x * dir < HL - 0.5) {
    let xg = baseXg(pos, dir);
    let blockers = 0;
    for (const o of e.agents) {
      if (o.side === a.side || o.isGK || o.passive) continue;
      const r = segDist(o.st.pos.x, o.st.pos.y, pos.x, pos.y, dir * HL, 0);
      if (r.s > 0.02 && r.s < 0.95 && r.d < 0.8 + 2 * r.s) blockers++;
    }
    xg *= Math.pow(0.7, blockers) * (1 - 0.35 * pressure);
    shootV = xg * 6 - 0.35 + (dGoal < 12 ? 0.3 : 0);
    if (a.side === 'them') shootV += 0.2 * (e.setup.difficulty - 0.5);
    // only from good positions (a hopeful punt just gives the ball away)
    if (mine && xg < 0.06 && dGoal > 12) shootV = -Infinity;
  }
  // ── pass / cross ──
  const opts = settle ? [] : passOptions(e, a);
  let best: PassOption | null = opts[0] ?? null;
  let led: LedPass | null = null;
  if (mine && opts.length) {
    // check the real lane of the best few before committing: no passes into traps
    best = null;
    for (let i = 0; i < Math.min(4, opts.length); i++) {
      const o = opts[i];
      if (o.offside) continue;
      if (o.lofted) { if (o.risk < 2.2) { best = o; break; } continue; }
      const feet = hyp(o.to.st.vel.x, o.to.st.vel.y) < 1.2 || (o.to.isUser && !e.ctl.dir);
      const lp = ledPass(e, a, o.to, { feet, maxLead: o.to.runT > 0 || o.to.isUser ? 9 : 4, quick: !o.to.isUser });
      if (lp.margin > (o.to.isUser ? PASS_THR(e) : 0.05)) { best = o; led = lp; break; }
    }
  }
  let passV = best ? best.value : -Infinity;
  // ── cross from wide areas ──
  let crossTarget: Agent | null = null;
  let crossAt: Vec2 | null = null;
  if (!settle && Math.abs(pos.y) > 15 && pos.x * dir > 28) {
    let bestT = Infinity;
    for (const m of e.agents) {
      if (m.side !== a.side || m === a || m.isGK || m.passive) continue;
      // the user attacking the box counts too (where he is running to)
      const lead = m.isUser ? 0.9 : 0.3;
      const fx = m.st.pos.x + m.st.vel.x * lead;
      const fy = m.st.pos.y + m.st.vel.y * lead;
      const f = { x: clamp(fx, -HL + 2, HL - 3), y: clamp(fy, -18, 18) };
      if (!inBox(m.isUser ? f : m.st.pos, dir)) continue;
      const near = e.nearestOpp(m, f).d;
      const score = -near + Math.abs(f.y) * 0.1 - (m.isUser ? 1.2 + e.ease : 0);
      if (score < bestT) { bestT = score; crossTarget = m; crossAt = { x: f.x + dir * 1.5, y: f.y * 0.85 }; }
    }
  }
  let crossV = crossTarget ? 0.55 + (pos.x * dir > 38 ? 0.25 : 0) : -Infinity;
  if (mine && crossTarget?.isUser) crossV += 0.35;
  // ── dribble ──
  let ahead = 30;
  for (const o of e.agents) {
    if (o.side === a.side || o.passive) continue;
    const rx = (o.st.pos.x - pos.x) * dir;
    const ry = o.st.pos.y - pos.y;
    if (rx > 0 && Math.abs(ry) < rx * 0.8 + 1.5) ahead = Math.min(ahead, hyp(rx, ry));
  }
  let dribV = 0.15 + clamp(ahead, 0, 15) * 0.04 - pressure * 0.55 + (a.a.dribbling / 99) * 0.2;
  const lane = mine ? dribbleLane(e, a) : null;
  if (lane) dribV = 0.15 + clamp(lane.space, 0, 10) * 0.05 - pressure * 0.45 + (a.a.dribbling / 99) * 0.2 + lane.prog * 0.15;

  const noise = () => e.rng.normal(0, 0.12 * (1.2 - vision));
  const choices: [string, number][] = [
    ['shoot', shootV + noise()], ['pass', passV + noise()], ['cross', crossV + noise()], ['dribble', dribV + noise()],
  ];
  if (settle) choices.length = 0;
  let pick = 'dribble';
  let pv = dribV;
  for (const [n, v] of choices) if (v > pv) { pv = v; pick = n; }

  if (pick === 'shoot') {
    const p = shotParams(e, a);
    e.execKick(a, p, { isShot: true });
    return;
  }
  if (pick === 'pass' && best) {
    const p = led ? led.params : passParams(e, a, best);
    e.execKick(a, p, { target: best.to.i, isShot: false });
    return;
  }
  if (pick === 'cross' && crossTarget) {
    const at = crossAt ?? { x: crossTarget.st.pos.x + dir * 1.5, y: crossTarget.st.pos.y * 0.8 };
    const curl = 0.4 * Math.sign(pos.y) * dir * -1;
    const p = solveLob(e.env, e.kicker(a), { x: b.x, y: b.y, z: b.z }, at, 1.6, curl, 0.42);
    e.execKick(a, p, { target: crossTarget.i, isShot: false, cross: true });
    return;
  }
  if (lane) {
    // into the space (or shield it when there is none)
    if (lane.space < 2.2 && pressure > 0.45 && !settle) { shield(e, a); a.think = 0.12; return; }
    a.target = { x: clamp(pos.x + lane.h.x * 7, -HL + 1, HL - 1), y: clamp(pos.y + lane.h.y * 7, -HW + 1.5, HW - 1.5) };
    if (dGoal < 18) { a.target = { x: dir * (HL - 6), y: pos.y * 0.5 }; }
    a.urgency = lane.space > 7 && pressure < 0.3 ? 1 : settle ? 0.7 : 0.82;
    a.duty = 'carry';
    return;
  }
  // dribble toward goal, away from the nearest opponent
  const near = e.nearestOpp(a);
  let tx = pos.x + dir * 7;
  let ty = pos.y * 0.88;
  if (near.o && near.d < 5) {
    const sy = Math.sign(pos.y - near.o.st.pos.y) || (e.rng.chance(0.5) ? 1 : -1);
    ty += sy * (5 - near.d) * 1.3;
  }
  if (dGoal < 18) { tx = dir * (HL - 6); ty = pos.y * 0.5; }
  a.target = { x: clamp(tx, -HL + 1, HL - 1), y: clamp(ty, -HW + 1.5, HW - 1.5) };
  a.urgency = ahead > 8 && pressure < 0.3 ? 1 : 0.82;
  a.duty = 'carry';
}

const DRIB_ANG = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4];

/** The most open heading to carry the ball into (space along it, progress toward goal). */
function dribbleLane(e: Engine, a: Agent): { h: Vec2; space: number; prog: number } {
  const pos = a.st.pos;
  const dir = a.dir;
  // aim the forward heading at the goal once in the final third
  const base = pos.x * dir > 20 ? Math.atan2(-pos.y, dir * HL - pos.x) : dir > 0 ? 0 : Math.PI;
  let best: { h: Vec2; space: number; prog: number } = { h: { x: dir, y: 0 }, space: 0, prog: 0 };
  let bestV = -Infinity;
  for (const da of DRIB_ANG) {
    const ang = base + da;
    const h = { x: Math.cos(ang), y: Math.sin(ang) };
    const ex = pos.x + h.x * 6;
    const ey = pos.y + h.y * 6;
    if (Math.abs(ey) > HW - 1.5 || Math.abs(ex) > HL - 1) continue;
    let space = 10;
    for (const o of e.agents) {
      if (o.side === a.side || o.passive) continue;
      const r = segDist(o.st.pos.x, o.st.pos.y, pos.x, pos.y, ex, ey);
      if (r.s <= 0.05 && r.d > 2) continue;
      space = Math.min(space, r.d + r.s * 1.5);
    }
    const prog = h.x * dir;
    const v = Math.min(space, 8) * 0.3 + prog * 0.9;
    if (v > bestV) { bestV = v; best = { h, space, prog }; }
  }
  return best;
}

/** Protect the ball: slow down and turn the body away from the nearest opponent. */
function shield(e: Engine, a: Agent): void {
  const near = e.nearestOpp(a);
  const pos = a.st.pos;
  let ax = -a.dir * 0.3;
  let ay = 0;
  if (near.o) {
    const dx = pos.x - near.o.st.pos.x;
    const dy = pos.y - near.o.st.pos.y;
    const l = hyp(dx, dy) || 1;
    ax = dx / l; ay = dy / l;
  }
  a.target = { x: clamp(pos.x + ax * 1.6, -HL + 1, HL - 1), y: clamp(pos.y + ay * 1.6, -HW + 1.5, HW - 1.5) };
  a.urgency = 0.42;
  a.duty = 'hold';
}

// ───────────────────────── aerial balls ─────────────────────────

/** AI meets an aerial ball with the head: goal attempt, clearance or knock-down. */
export function aiHeader(e: Engine, a: Agent): void {
  const s = e.state;
  const b = s.ball.pos;
  const dir = a.dir;
  // contested: a weaker header may simply miss it
  const skill = clamp((a.a.heading * 0.6 + a.a.jumping * 0.4) / 99, 0.05, 1);
  if (e.rng.chance(0.28 * (1 - skill))) { a.cool = 0.45; return; }
  const dGoal = distToGoal({ x: b.x, y: b.y }, dir);
  const ownGoalD = distToGoal({ x: b.x, y: b.y }, (-dir) as 1 | -1);
  if (dGoal < 16 && b.x * dir > 0) {
    const p = shotParams(e, a, { power: 0.85, zLow: 0.2, zHigh: 1.3, kind: 'header', curl: 0 });
    e.execKick(a, p, { kind: 'header', isShot: true });
    return;
  }
  if (ownGoalD < 30) {
    const p: KickParams = { dir: unitV(dir, clamp(b.y * 0.04, -0.6, 0.6)), power: 0.95, loft: 0.75, curl: 0 };
    e.execKick(a, p, { kind: 'header', isShot: false });
    return;
  }
  // knock it down toward the nearest team-mate
  let to: Vec3 | null = null;
  let bd = Infinity;
  for (const m of e.agents) {
    if (m.side !== a.side || m === a || m.isGK || m.passive) continue;
    const d = hyp(m.st.pos.x - b.x, m.st.pos.y - b.y);
    if (d > 3 && d < 18 && d < bd) { bd = d; to = { x: m.st.pos.x, y: m.st.pos.y, z: BR }; }
  }
  const dx = to ? to.x - b.x : dir;
  const dy = to ? to.y - b.y : 0;
  const l = hyp(dx, dy) || 1;
  e.execKick(a, { dir: { x: dx / l, y: dy / l }, power: clamp(0.25 + bd * 0.03, 0.3, 0.8), loft: 0.4, curl: 0 }, { kind: 'header', isShot: false, target: to ? -1 : -1 });
}

function unitV(x: number, y: number): Vec2 {
  const l = hyp(x, y) || 1;
  return { x: x / l, y: y / l };
}
