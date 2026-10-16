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
import { atDistance, curledPass, groundPass, launched, predictPath, solveLob, solveShot } from './solver';
import { angDiff, runDistance, runTimeFor } from './locomotion';
import { attackRun, boxPlan, deliverCross, inCrossZone, loadRun, type BoxRole, type CrossPlan } from './cross';
import { timedRuns, type RunSpot } from './runs';

// ───────────────────────── interception estimates ─────────────────────────

/** Earliest time `a` can meet the ball on its predicted path (Infinity = never). */
export function interceptFor(e: Engine, a: Agent, path: PathSample[], maxZ?: number, momentum = false, sharp = false): { t: number; p: Vec2; z: number } {
  const zMax = maxZ ?? (a.isGK ? 2.55 : Math.min(e.headReach(a), 2.3));
  const v = a.topSpeed * (0.82 + 0.18 * a.st.stamina);
  const r = a.reaction;
  // (momentum: during his reaction he keeps going the way he was running — toward the ball he is
  // there sooner, a man running the other way has to stop and turn first)
  const px = a.st.pos.x + (momentum ? a.st.vel.x * r : 0);
  const py = a.st.pos.y + (momentum ? a.st.vel.y * r : 0);
  for (let i = 1; i < path.length; i++) {
    const q = path[i];
    if (q.z > zMax) continue;
    if (Math.abs(q.x) > HL + 0.5 || Math.abs(q.y) > HW + 0.5) break;
    const d = Math.max(0, hyp(q.x - px, q.y - py) - 0.7);
    // (sharp: a defender reading the pass — the coordinator sends him at once, so a passer must
    // not count on his full reaction time; but a man facing the other way has to turn first)
    const need = sharp
      ? r * 0.55 + d / v + (d > 2 ? 0.12 + 0.13 * (1 - (Math.cos(a.st.facing) * (q.x - px) + Math.sin(a.st.facing) * (q.y - py)) / (d + 0.7)) : 0.03)
      : r + d / v + (d > 2 ? 0.25 : 0.05);
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
  /** Ball position the pass was solved from. */
  from: Vec2;
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
/** Distance covered in `t` s from speed `v0` toward `vmax` (initial acceleration `acc`, Hill-type curve). */
const runDist = runDistance;
/** Time to cover `d` m from speed `v0` toward `vmax`. */
const runTime = runTimeFor;

export function ledPass(e: Engine, a: Agent, m: Agent, opts: { feet?: boolean; maxLead?: number; lofted?: boolean; quick?: boolean; runDir?: Vec2 | null } = {}): LedPass {
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
    acc = m.accel * (1.22 + 0.25 * e.ease);
  }
  if (opts.runDir) {
    // a run in behind: the way he is going to run (he sprints onto the ball)
    const rl = hyp(opts.runDir.x, opts.runDir.y) || 1;
    ux = opts.runDir.x / rl; uy = opts.runDir.y / rl;
    v0 = Math.max(0, m.st.vel.x * ux + m.st.vel.y * uy);
    vmax = m.topSpeed * (0.82 + 0.18 * m.st.stamina);
    acc = m.accel;
  }
  let sp = Math.max(v0, vmax);
  if ((opts.feet && !opts.runDir) || sp < 0.8) { ux = 0; uy = 0; sp = 0; v0 = 0; vmax = 0; }
  const lead = (t: number) => (sp > 0 ? runDist(t, v0, vmax, acc) : 0);
  const maxLead = opts.maxLead ?? 9;
  const lofted = !!opts.lofted;
  const d0 = hyp(m.st.pos.x - from.x, m.st.pos.y - from.y);
  // firmer to a runner, softer to feet: always controllable on arrival; a ball in behind is
  // weighted to be run onto (it slows into his path)
  const base = opts.runDir ? clamp(4.2 + d0 * 0.07, 4.8, 7.5) : clamp(5.6 + d0 * 0.08 + sp * 0.12, 6, 9.5);
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
  // (a lofted ball bounces on: it drops well inside the touchline / byline)
  const edgeX = lofted ? 6 : 2;
  const edgeY = lofted ? 5.5 : 1.2;
  const place = (lead: number, lat: number): Vec2 => ({
    x: clamp(m.st.pos.x + ux * lead - uy * lat, -HL + edgeX, HL - edgeX),
    y: clamp(m.st.pos.y + uy * lead + ux * lat, -HW + edgeY, HW - edgeY),
  });
  // team-mates' passes to each other are judged against a sharp read of every defender (they react
  // at once and must turn first) and with everyone's momentum; the user's passes and balls to him
  // keep the casual model (opponents are slower to cut those out on easy / normal)
  const real = !a.isUser && (!m.isUser || e.ease <= 0);
  const judge = (at: Vec2, sol: { params: KickParams; path: PathSample[]; t: number }): LedPass => {
    let tOpp = Infinity;
    for (const o of e.agents) {
      if (o.side === a.side || o.passive || o.stun > 0.4) continue;
      const r = Math.min(interceptFor(e, o, sol.path, lofted ? undefined : 0.6, real, real).t, bodyT(o, sol.path));
      if (r < tOpp) tOpp = r;
    }
    // a runner gets it where his run first catches the ball (a ball that beats him runs away);
    // a standing player can also step in to meet it
    let tRecv = Infinity;
    if (sp > 0) {
      for (let i = 1; i < sol.path.length; i++) {
        const q = sol.path[i];
        // (a ball that runs out of play before he gets to it is no pass)
        if (Math.abs(q.x) > HL - 0.3 || Math.abs(q.y) > HW - 0.3) break;
        if (q.z > (lofted ? 1.6 : 1.0)) continue;
        const dx = q.x - m.st.pos.x;
        const dy = q.y - m.st.pos.y;
        const d = hyp(dx, dy);
        if (d > 1.5 && (dx * ux + dy * uy) / d < 0.5) continue;
        if (runTime(Math.max(0, d - 0.7), v0, vmax, acc) <= q.t + 0.05) { tRecv = q.t; break; }
      }
    } else tRecv = Math.min(sol.t, interceptFor(e, m, sol.path, lofted && real ? 1.5 : lofted ? undefined : 0.6, real).t);
    return { params: sol.params, from, at, t: sol.t, margin: tOpp - tRecv, lofted };
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
  const fast = opts.runDir ? base + 1.2 : Math.min(base + 2.5, 11.5);
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
const PASS_THR = (e: Engine): number => -0.02 - 0.3 * e.ease;

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
  // (played in behind, clean through on goal: he goes himself — the user asked for nothing)
  if (!calling && clearThrough(e, a) && baseXg(u.st.pos, u.dir) < baseXg(a.st.pos, a.dir) + 0.15) return 'no';
  // (taken in his stride from the user's ball in behind: he drives on with it first — square /
  // cut it back once he has committed the defence, at once only to a user clearly better placed)
  const k = e.lastKick;
  const inBehind = !!k && k.through && k.user && k.target === a.i;
  if (!calling && inBehind && a.carryT < 0.9 && baseXg(u.st.pos, u.dir) < baseXg(a.st.pos, a.dir) + 0.12) return 'no';
  const b = s.ball.pos;
  const dist = hyp(u.st.pos.x - b.x, u.st.pos.y - b.y);
  if (dist < 3.5 || dist > 42) return 'no';
  const waited = calling ? s.time - callAt : a.carryT;
  // (≤ ~0.5 s: the wind-up of the pass adds its own beat)
  const canWait = waited < 0.4 && e.pressureOn(a) < 0.85;
  if (!onsideFor(e, a, u)) return canWait ? 'wait' : 'no';
  const feet = !steering;
  const lp = ledPass(e, a, u, { feet, maxLead: calling && e.ctl.callThrough ? 13 : 9 });
  // easy / normal: opponents are slower to cut out passes to the user (see interactions)
  const thr = PASS_THR(e);
  let pick: LedPass | null = lp.margin > thr ? lp : null;
  // over a blocked lane: a lofted ball (an expensive solve, so only once waiting is over)
  if (!pick && dist > 13 && (!canWait || waited > 0.45 || lp.margin < thr - 0.25)) {
    const lob = ledPass(e, a, u, { feet, maxLead: 9, lofted: true });
    if (lob.margin > thr + 0.1) pick = lob;
  }
  // a man standing in the lane: bent round him with the inside of the foot (passing skill)
  let bent: KickParams | null = null;
  if (!pick && dist > 9 && dist < 32) bent = bentAround(e, a, u, pick ?? lp, thr + 0.05);
  if (!pick && bent) {
    const bp = bent;
    e.windUp(a, 'pass', () => e.execKick(a, bp, { target: u.i, isShot: false }), 0);
    return 'passed';
  }
  if (pick) {
    // wind up and strike; the lead is re-solved at contact (he has kept running meanwhile)
    const lofted = pick.lofted;
    const first = pick;
    e.windUp(a, 'pass', () => {
      const again = lofted ? null : ledPass(e, a, u, { feet, maxLead: calling && e.ctl.callThrough ? 13 : 9, quick: true });
      const p = again && again.margin > thr - 0.15 ? again.params : reAim(e, first.params, first.from, first.at);
      e.execKick(a, p, { target: u.i, isShot: false });
    }, 0);
    return 'passed';
  }
  // the lane is shut: hold it a beat if he is about to come free, else keep the ball
  return canWait && lp.margin > thr - 0.8 ? 'wait' : 'no';
}

/**
 * The user's pass: the team-mate who gets to it first (earliest intercept with his momentum,
 * onside — the one it was aimed at keeps it when he is about as quick) is its receiver, and a ball
 * he has to run onto (in behind / into the space ahead of him) is a through ball he takes in stride.
 */
export function claimPass(e: Engine, rec: KickRec, intended = false): void {
  const path = e.ballPath();
  if (path.length < 2) return;
  let best: Agent | null = null;
  let bt = Infinity;
  let bp: Vec2 | null = null;
  for (const m of e.agents) {
    if (m.side !== rec.side || m.isUser || m.isGK || m.passive || m.stun > 0.3 || rec.offside.includes(m.i)) continue;
    const r = interceptFor(e, m, path, 1.2, true);
    if (r.t < bt) { bt = r.t; best = m; bp = r.p; }
  }
  if (!best || !bp || !Number.isFinite(bt)) return;
  const g = rec.target >= 0 ? e.agents[rec.target] : null;
  // (an ordinary pass keeps the man it was played to — only a ball in behind or one the user aimed
  // at a man is claimed here)
  if (!intended && !rec.through && !(bp.x * rec.dir > e.offsideX(rec.side) * rec.dir + 0.5)) return;
  if (g && g !== best && !g.isUser && g.side === rec.side && !rec.offside.includes(g.i)) {
    // (a man the user aimed it at — the calm pass assist — keeps it whenever he can get there)
    const r = interceptFor(e, g, path, 1.2, true);
    if (r.t < bt + 0.25 || (intended && Number.isFinite(r.t))) { best = g; bt = r.t; bp = r.p; }
  }
  if (g && g.isUser) return;
  rec.target = best.i;
  // a ball in behind (the user's R / a stroke snapped into a run, or one played beyond the line):
  // he takes it in his stride
  const dir = rec.dir;
  if (bp.x * dir > e.offsideX(rec.side) * dir + 0.5) rec.through = true;
  // a ball into his run is read as it is struck: off after it at once, in his stride (the
  // coordinator takes over at its next beat; a pass to feet is left to it — he sets himself)
  if (!rec.through) return;
  const sm = strideMeet(e, best);
  best.target = sm ? sm.p : { x: bp.x, y: bp.y };
  best.urgency = sm ? Math.max(sm.urg, 0.9) : 1;
  best.duty = 'receive';
}

/** Clean through: within ~32 m of goal and no outfield opponent between him and it (a cone toward goal). */
export function clearThrough(e: Engine, a: Agent): boolean {
  const pos = a.st.pos;
  const dir = a.dir;
  if (distToGoal(pos, dir) > 32) return false;
  const gx = dir * HL - pos.x;
  const gy = -pos.y;
  const gl = hyp(gx, gy) || 1;
  for (const o of e.agents) {
    if (o.side === a.side || o.isGK || o.passive) continue;
    const rx = o.st.pos.x - pos.x;
    const ry = o.st.pos.y - pos.y;
    const along = (rx * gx + ry * gy) / gl;
    if (along < -0.5 || along > gl) continue;
    const lat = Math.abs(rx * gy - ry * gx) / gl;
    if (lat < 1.4 + 0.3 * Math.max(0, along)) return false;
  }
  return true;
}

// ───────────────────────── coordinator ─────────────────────────

export function aiUpdate(e: Engine): void {
  const s = e.state;
  const owner = e.owner;
  const k = e.lastKick;
  const loose = !owner;
  const chaser: Record<Side, Agent | null> = { us: null, them: null };
  const best: Record<Side, number> = { us: Infinity, them: Infinity };
  if (loose) {
    const path = e.ballPath();
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
  if (passIn && !passIn.oppTouched) {
    // the pass is his: the team-mate it is meant for goes for it, nobody doubles up on him
    const r = e.agents[passIn.target];
    if (r && !r.isUser && !r.isGK && r.side === passIn.side && Number.isFinite(r.eit) && r.eit < 6 && r.stun <= 0) chaser[r.side] = r;
  }
  // crosses: box runs — loaded while a team-mate is wide in the final third, attacking the
  // flight once the cross is struck (near post, far post, penalty spot)
  let runs: Map<number, BoxRole> | null = null;
  let runPhase: 'load' | 'go' | 'attack' = 'load';
  let crossFrom: Vec2 = { x: s.ball.pos.x, y: s.ball.pos.y };
  if (owner && !owner.isGK && !e.frozen && inCrossZone(owner.st.pos, owner.dir)) {
    runs = boxPlan(e, `c${owner.i}`, owner.side, owner, owner.st.pos);
    runPhase = owner.windup || (owner.isUser && e.frozenForAim) ? 'go' : 'load';
  } else if (loose && k && k.cross && s.time - k.t < 3 && !k.oppTouched) {
    runs = boxPlan(e, `k${k.id}`, k.side, e.agents[k.by] ?? null, k.from);
    runPhase = 'attack';
    crossFrom = k.from;
  }
  const pressers = loose ? null : assignPressers(e);
  const marks = assignMarks(e, pressers);
  // the user's team: everyone re-shapes around the (next) ball carrier
  const focus = supportFocus(e, passIn);
  const plan = focus ? planSupport(e, focus.c, focus.p) : null;
  // the other side's runners time their runs off their own carrier
  let oppPlan: Map<number, RunSpot> | null = null;
  if (owner && !owner.isGK && owner.side !== e.user.side && !e.frozen) {
    const ms = e.agents.filter((m) => m.side === owner.side && m !== owner && !m.isGK && !m.passive && !m.wall);
    oppPlan = timedRuns(e, owner, owner.st.pos, ms);
  }

  for (const a of e.agents) {
    if (a.isGK || a.isUser || a.passive) continue;
    if (a.wall) {
      if (e.frozen) continue;
      if (a.jump <= 0 && a.animLock <= 0) { a.wall = false; a.st.inWall = false; }
      else continue;
    }
    if (a === owner) continue;
    const role = runs?.get(a.i);
    if (role) {
      if (runPhase === 'attack') attackRun(e, a, role, crossFrom);
      else if (runPhase === 'go') {
        const sy = Math.sign(crossFrom.y) || 1;
        const sp = role === 'near' ? { x: a.dir * (HL - 5.5), y: sy * 2.6 } : role === 'far' ? { x: a.dir * (HL - 6.5), y: -sy * 4.2 } : { x: a.dir * (HL - 11.5), y: sy * 0.8 };
        goTo(a, sp, 0.95, 'run');
      } else loadRun(e, a, role, crossFrom);
      continue;
    }
    if (loose) {
      // (a ball into his path, or one to a man already bursting in behind: met in his stride)
      const bursting = !!a.run && (a.run.phase === 'go' || a.run.phase === 'bend') && hyp(a.st.vel.x, a.st.vel.y) > 4;
      const inStride = !!passIn && passIn.target === a.i && (passIn.through || bursting);
      if (passIn && passIn.side === a.side && passIn.target === a.i && inStride) {
        // a ball in behind: he keeps sprinting and takes it in his stride
        const m = strideMeet(e, a, a.side === 'us' ? best.them : best.us);
        if (m) goTo(a, m.p, m.urg, 'receive');
        else if (a.eitPoint) goTo(a, a.eitPoint, 1, 'receive');
      } else if (passIn && passIn.side === a.side && passIn.target === a.i && a.eitPoint && a.eit < 6) {
        // the ball comes to him: step across onto its line and set himself (a firm pass met with a
        // charge is hard to control) — unless an opponent would nip in first: then attack it
        const oppT = a.side === 'us' ? best.them : best.us;
        const set = setOnLine(e, a, oppT);
        const drop = set ? null : dropPoint(e, a, oppT);
        if (set) goTo(a, set, 0.55, 'receive');
        else if (drop) goTo(a, drop.p, drop.urg, 'receive');
        else goTo(a, a.eitPoint, 1, 'receive');
      } else if (chaser[a.side] === a && a.eitPoint) {
        // only chase what can be reached; otherwise hold the shape
        const contest = a.eit < 4;
        if (contest) goTo(a, a.eitPoint, 1, 'chase');
        else defendOffBall(e, a, null, marks);
      } else if (k && k.cross && k.side === a.side && s.time - k.t < 3.5) {
        attackCross(e, a);
      } else if ((passIn && passIn.side === a.side) || (!passIn && s.ball.lastTouchSide === a.side)) {
        attackOffBall(e, a, a.side === e.user.side ? plan : oppPlan);
      } else {
        defendOffBall(e, a, null, marks);
      }
    } else if (owner && owner.side === a.side) {
      attackOffBall(e, a, a.side === e.user.side ? plan : oppPlan);
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
      // a long solo carry by the user: the nearest two converge on him (double team)
      const solo = c.isUser && e.longCarry > 0;
      if (!(style === 'pressing' || deep || solo) || x.tt > (solo ? 1.6 + 1.4 * e.longCarry : 1.6)) break;
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

function attackOffBall(e: Engine, a: Agent, plan: Map<number, SupPlan | RunSpot> | null): void {
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
  // runs in behind (the forwards on the last line, the third man from deep): timed by runs.ts
  const runs = timedRuns(e, c, p, mates);
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
      if (roleOf.has(m) || runs.get(m.i)?.duty === 'run') continue;
      const cost = hyp(p.x + off.x - m.st.pos.x, p.y + off.y - m.st.pos.y) + (laneOf(m) === -sg ? 8 : 0) - keep(m, sg > 0 ? 'shortA' : 'shortB') + (m.runT > 0 ? 10 : 0);
      if (cost < bc) { bc = cost; best = m; }
    }
    if (best) roleOf.set(best, { r: sg > 0 ? 'shortA' : 'shortB', off });
  }
  const deepOff = { x: -dir * 12, y: -sy * 4 };
  const wantDeep = pu > -HL + 19;
  let deepTaken = false;
  for (const m of mids.sort((x, y) => hyp(x.st.pos.x - p.x, x.st.pos.y - p.y) - hyp(y.st.pos.x - p.x, y.st.pos.y - p.y))) {
    if (roleOf.has(m)) continue;
    if (runs.get(m.i)?.duty === 'run') { roleOf.set(m, { r: 'run', off: null }); continue; }
    if (wantDeep && !deepTaken && m.slot.role !== 'AM') { roleOf.set(m, { r: 'deep', off: deepOff }); deepTaken = true; }
    else roleOf.set(m, { r: 'shape', off: null });
  }
  for (const m of mates) {
    if (roleOf.has(m)) continue;
    const role = m.slot.role;
    const sg = laneOf(m);
    if (role === 'ST') { roleOf.set(m, { r: 'run', off: null }); continue; }
    if (role === 'W') {
      // high on the last line, timing runs into the channels (runs.ts)
      if (runs.has(m.i)) { roleOf.set(m, { r: 'run', off: null }); continue; }
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
    const rs = runs.get(m.i);
    if (r === 'run' && rs) {
      // bursting / bending along the line / dropping back onside: his run, as timed
      out.set(m.i, { x: rs.x, y: rs.y, urg: rs.urg, duty: rs.duty });
      taken.push({ x: rs.x, y: rs.y });
      continue;
    }
    if (r === 'run') {
      const home = homeOf(e, m, true);
      const ty = m.slot.role === 'ST' ? clamp(p.y * 0.35, -9, 9) : (Math.sign(home.y) || (m.i % 2 ? 1 : -1)) * clamp(Math.abs(home.y), 14, HW - 6);
      // the striker on the shoulder of the last defender, wide men a step off it in their channel
      const tu = Math.min(line - (m.slot.role === 'ST' ? 1.5 : 3), Math.max(home.x * dir, pu + 5), pu + (m.slot.role === 'ST' ? 20 : 30));
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

/** Share of the way the covering defender steps toward the cover spot on hard (less on easy / normal). */
const COVER_W = 0.35;
/** The covering defender this update: the free (unpressing) defender nearest the space behind the first presser. */
const coverMemo = new WeakMap<Engine, { tick: number; a: Agent | null }>();
function coverFor(e: Engine, pressers: Agent[]): Agent | null {
  const m = coverMemo.get(e);
  if (m && m.tick === e.tickNo) return m.a;
  const c = e.owner;
  let best: Agent | null = null;
  if (c && pressers.length) {
    const ownGoalX = -pressers[0].dir * HL;
    const gx = ownGoalX - c.st.pos.x;
    const gy = -c.st.pos.y;
    const gl = hyp(gx, gy) || 1;
    const back = clamp(gl * 0.35, 5, 9);
    const px = c.st.pos.x + (gx / gl) * back;
    const py = c.st.pos.y + (gy / gl) * back;
    let bd = 14;
    for (const o of e.agents) {
      if (o.side === c.side || o.isGK || o.passive || o.wall || o.isUser || pressers.includes(o)) continue;
      const d = hyp(o.st.pos.x - px, o.st.pos.y - py);
      if (d < bd) { bd = d; best = o; }
    }
  }
  coverMemo.set(e, { tick: e.tickNo, a: best });
  return best;
}

function defendOffBall(e: Engine, a: Agent, pressers: Agent[] | null, marks: Map<number, Agent>): void {
  const s = e.state;
  a.run = null;
  const c = e.owner;
  const ownGoal = { x: -a.dir * HL, y: 0 };
  if (c && pressers && pressers.includes(a)) {
    const gx = ownGoal.x - c.st.pos.x;
    const gy = ownGoal.y - c.st.pos.y;
    const gl = hyp(gx, gy) || 1;
    const d = hyp(c.st.pos.x - a.st.pos.x, c.st.pos.y - a.st.pos.y);
    const solo = c.isUser && a.side !== c.side ? e.longCarry : 0;
    const first = pressers[0] === a;
    // sold by a feint: he leans the wrong way for a beat (no tackle meanwhile)
    if (a.sold && s.time < a.sold.until) { goTo(a, a.sold.lean, 0.9, 'press'); return; }
    a.sold = null;
    // the first man jockeys an AI carrier running at him: a step off, goal-side, showing him wide
    // (onto the outside) instead of diving in; tight when the carrier stands, turns away or shields
    const cv = c.st.vel;
    const csp = hyp(cv.x, cv.y);
    const rx = a.st.pos.x - c.st.pos.x;
    const ry = a.st.pos.y - c.st.pos.y;
    const rl = hyp(rx, ry) || 1;
    // (the carrier facing him with it under control, or running at him)
    const facingHim = (Math.cos(c.st.facing) * rx + Math.sin(c.st.facing) * ry) / rl > 0.5 && (csp > 1 || !!c.takeOn);
    // (against the user the pressing keeps its tuned casual model: the difficulty is set on it)
    const at = !c.isUser && (facingHim || (csp > 2.5 && (cv.x * gx + cv.y * gy) / (csp * gl) > 0.45));
    // (jockeying: he keeps the gap he has, giving ground as the carrier comes on, closing it slowly)
    const close = first ? (at ? clamp(d - 0.35, 1.5, 3) : 0.9) : 3.5 - 2.0 * solo;
    let target = { x: c.st.pos.x + (gx / gl) * close, y: c.st.pos.y + (gy / gl) * close };
    if (first && at && Math.abs(c.st.pos.y) > 5) target.y -= Math.sign(c.st.pos.y) * 0.6;
    if (!first && solo > 0) {
      const vl = hyp(c.st.vel.x, c.st.vel.y);
      if (vl > 1) target = { x: target.x + (c.st.vel.x / vl) * 2.2 * solo, y: target.y + (c.st.vel.y / vl) * 2.2 * solo };
    }
    const diff = clamp(e.setup.difficulty, 0, 1);
    // casual play: opponents close the user down more slowly (not once he goes on a long solo run)
    const soft = (c.isUser ? 0.07 : 0.06) * (1 - solo);
    let urg = a.side === 'them' ? (0.8 + 0.2 * diff) * (1 - soft * e.ease) : 0.9;
    if (d > 8) urg = a.side === 'them' ? 1 - (c.isUser ? 0.22 : 0.12) * e.ease * (1 - solo) : 1;
    // start grace: they don't fly into him in the first beat
    if (c.isUser && e.inGrace()) urg *= 0.6;

    goTo(a, target, urg, 'press');
    // tackle attempts (both men of a double team go for it)
    const bd = hyp(s.ball.pos.x - a.st.pos.x, s.ball.pos.y - a.st.pos.y);
    if ((first || solo > 0.3) && bd < 1.3 && a.cool <= 0 && a.stun <= 0 && e.state.phase !== 'outcome') {
      let rate = 0.12 + 0.18 * (a.a.tackling / 99);
      if (a.side === 'them') rate *= (0.75 + 0.6 * diff) * (1 - 0.25 * e.ease) * (c.isUser ? 1 - 0.25 * e.ease : 1);
      if (a.side === 'us' && e.attackSide === 'them') rate *= 0.45;
      // (he waits for the touch: in when the ball is pushed toward him / off the carrier's feet, or
      // the carrier has turned his back; not at a man with it under control)
      // (only a man goal-side of an AI carrier: a chaser from behind, or anyone on the user, as before)
      if (!c.isUser && (a.st.pos.x - c.st.pos.x) * c.dir > 0) {
        const off = hyp(s.ball.pos.x - c.st.pos.x, s.ball.pos.y - c.st.pos.y);
        const back = Math.cos(c.st.facing) * (a.st.pos.x - c.st.pos.x) + Math.sin(c.st.facing) * (a.st.pos.y - c.st.pos.y) < 0;
        rate *= off > 0.62 && bd < off ? 1.4 : back ? 1.15 : 0.8;
      }
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
  // cover: the nearest free defender holds the space behind the man pressing the carrier (on the
  // carrier's way to goal), so beating the first man does not mean a free run at the keeper
  // (half-way from his own job to the cover spot: he still keeps an eye on his man)
  if (c && a.side !== c.side && pressers && pressers.length && !pressers.includes(a) && distToGoal(c.st.pos, c.dir) < 32 && coverFor(e, pressers) === a) {
    const gx = ownGoal.x - c.st.pos.x;
    const gy = ownGoal.y - c.st.pos.y;
    const gl = hyp(gx, gy) || 1;
    const back = clamp(gl * 0.35, 5, 9);
    // (more of it the harder the setting: a casual game leaves a little more room)
    const w = COVER_W * (0.45 + 0.55 * (1 - e.ease / 0.82));
    tx = tx * (1 - w) + (c.st.pos.x + (gx / gl) * back) * w;
    ty = ty * (1 - w) + (c.st.pos.y + (gy / gl) * back) * w;
    urg = Math.max(urg, 0.85);
    a.duty = 'cover';
  }
  // the user on a long solo carry: the line drops off and covers (no space in behind)
  if (c && c.isUser && a.side !== c.side && e.longCarry > 0) {
    tx += c.dir * 5 * e.longCarry;
    ty = ty * (1 - 0.25 * e.longCarry) + c.st.pos.y * 0.25 * e.longCarry;
    urg = Math.max(urg, 0.85);
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
  const pr = e.pressureOn(a);
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
    // forward when he has time on the ball, recycle it when he is pressed; a switch to the far side
    // into space is worth something in itself
    const fw = progress > 0 ? 0.07 * (1 - 0.2 * pr) : 0.06 * (1 - 0.3 * pr);
    let value = progress * fw + space * (m.isUser ? 0.1 : 0.065) - risk * 0.9 + baseXg(at, dir) * 2.5 - (dist > 30 ? 0.2 : 0)
      + (Math.abs(at.y - from.y) > 18 && space > 6 && risk < 0.5 ? 0.15 : 0);
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

/**
 * The AI's finish (noise-free solve; execution noise comes with the kick): placement or power by
 * the situation — side-footed low into the far / open corner close in, driven from the edge of the
 * box, bent into the far corner from distance, a chip when the keeper rushes out at him, headers
 * down toward the corners. The corner: the side the keeper leaves open (usually the far post).
 */
export function shotParams(e: Engine, a: Agent, opts: { power?: number; curl?: number; zLow?: number; zHigh?: number; kind?: 'ground' | 'volley' | 'header' } = {}): KickParams {
  const b = e.state.ball.pos;
  const dir = a.dir;
  const gk = dir === 1 ? e.gkThem : e.gkUs;
  const kind = opts.kind ?? 'ground';
  const d = distToGoal({ x: b.x, y: b.y }, dir);
  const comp = clamp(a.a.composure, 1, 99) / 99;
  const ky = gk ? gk.st.pos.y : 0;
  const gkOff = gk ? HL - gk.st.pos.x * dir : 0;
  const k = e.kicker(a);
  // the keeper rushing out at him: a chip over him (composure)
  if (kind === 'ground' && gk && !gk.isUser && gkOff > 4 && d > 7 && d < 24 && b.z < 0.4) {
    const gd = hyp(gk.st.pos.x - b.x, gk.st.pos.y - b.y);
    const rushing = (gk.st.vel.x * (b.x - gk.st.pos.x) + gk.st.vel.y * (b.y - gk.st.pos.y)) / (gd || 1) > 1.5;
    if (gd < 10 && gd > 3 && (rushing || gkOff > 7) && e.rng.chance(0.3 + 0.5 * comp)) {
      const ty = clamp(ky * -0.4 + (e.rng.next() - 0.5) * 1.6, -(GW - 1), GW - 1);
      const power = clamp(0.3 + d * 0.014, 0.38, 0.78);
      const spec = e.kickSpec(a, { dir: { x: dir, y: 0 }, power, loft: 0.5, curl: 0 }, 'ground', true);
      return solveShot(e.env, k, spec, { x: b.x, y: b.y, z: b.z }, dir * HL, ty, 1.9, power, 0, 0.5).params;
    }
  }
  // the corner: more of the goal either side of the keeper; across him (the far post) when it is close
  const roomPlus = GW - 0.4 - ky;
  const roomMinus = ky + GW - 0.4;
  const far = -(Math.sign(b.y) || 1);
  let pick = roomPlus > roomMinus ? 1 : -1;
  if (Math.abs(roomPlus - roomMinus) < 0.9 && Math.abs(b.y) > 3) pick = far;
  if (!e.rng.chance(0.68 + 0.25 * comp)) pick = -pick;
  const ty = pick * (GW - 0.45 - 0.35 * e.rng.next());
  let zLo = opts.zLow ?? 0.3;
  let zHi = opts.zHigh ?? 1.8;
  let power = opts.power ?? clamp(0.68 + d * 0.006, 0.6, 0.9);
  let curl = opts.curl ?? (d > 17 ? 0.35 * Math.sign(ty - b.y || 1) * dir : 0);
  if (kind === 'header' && opts.zHigh === undefined) { zLo = 0.1; zHi = 0.6; }
  if (kind === 'ground' && opts.power === undefined) {
    if (d < 13) {
      // side-foot, low into the corner: placement over power (still firm enough to beat a dive)
      power = clamp(0.74 + d * 0.006, 0.74, 0.84);
      zLo = 0.15; zHi = 0.6;
      curl = 0.06 * Math.sign(ty - b.y || 1) * dir;
    } else if (d < 20) {
      power = clamp(0.74 + (d - 13) * 0.012, 0.74, 0.86);
      zLo = 0.25; zHi = 1.2;
      curl = 0.15 * Math.sign(ty - b.y || 1) * dir;
    } else {
      // from distance: whipped into the far corner
      power = clamp(0.84 + (d - 20) * 0.006, 0.84, 0.93);
      zLo = 0.5; zHi = 1.9;
      curl = 0.38 * Math.sign(ty - b.y || 1) * dir;
    }
  }
  const tz = zLo + (zHi - zLo) * e.rng.next();
  const spec = e.kickSpec(a, { dir: { x: dir, y: 0 }, power, loft: 0.05, curl }, kind, true);
  const sol = solveShot(e.env, k, spec, { x: b.x, y: b.y, z: b.z }, dir * HL, ty, tz, power, curl, kind === 'header' ? 0.3 : 0.06);
  return sol.params;
}

/**
 * A ball in behind: a forward on the shoulder of the last defender (onside now) whose run takes him
 * into the space behind the line, and a pass weighted to be run onto there before any defender or
 * the keeper — the real flight judged against every opponent. Null when there is none on.
 */
export function throughBall(e: Engine, a: Agent, thr: number): { lp: LedPass; to: Agent; value: number; runDir: Vec2 } | null {
  const dir = a.dir;
  const b = e.state.ball.pos;
  const line = e.offsideX(a.side) * dir;
  const bu = b.x * dir;
  // (space behind the line, the line ahead of the ball, the carrier facing up)
  if (line > HL - 9 || line < bu - 2 || Math.cos(a.st.facing) * dir < -0.3) return null;
  let best: { lp: LedPass; to: Agent; value: number; runDir: Vec2 } | null = null;
  const trust = clamp(e.setup.teammateTrust, 0, 100) / 100;
  for (const m of e.agents) {
    if (m.side !== a.side || m === a || m.isGK || m.passive || m.stun > 0 || m.wall) continue;
    const u = m.st.pos.x * dir;
    // (the user: when he is making a run forward himself — he is played in first)
    const userRun = m.isUser && !!e.ctl.dir && m.st.vel.x * dir > 3;
    if (m.isUser && !userRun) continue;
    const running = m.runT > 0 || m.duty === 'run' || userRun;
    // onside, on the shoulder of the last man (or just behind it, about to go) — a man already
    // bursting from deep can be found too: the ball is weighted into the space he is running into
    if (u > line + 0.1 || u < line - (running && m.st.vel.x * dir > 3.5 ? 12 : 5) || u < bu - 6) continue;
    if (!running && !isForward(m)) continue;
    const d0 = hyp(m.st.pos.x - b.x, m.st.pos.y - b.y);
    if (d0 < 6 || d0 > 38) continue;
    // the ball stays short of the keeper's area: room to run onto it before he comes
    const maxLead = clamp(HL - 7 - u, 3, 11);
    // his run: toward his run target / straight through his channel, or a diagonal either way
    const tg = !m.isUser && m.runT > 0 && m.runTarget ? m.runTarget : { x: dir * Math.min(line + 12, HL - 7), y: clamp(m.st.pos.y * 0.8, -20, 20) };
    const r0 = unitV(tg.x - m.st.pos.x, tg.y - m.st.pos.y);
    const base = r0.x * dir > 0.4 ? r0 : { x: dir, y: 0 };
    const inward = -Math.sign(m.st.pos.y) || 1;
    for (const [k, ang] of [[0, 0], [1, 0.5 * inward], [2, -0.4 * inward]] as const) {
      if (k > 0 && best && best.to === m) break;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const runDir = { x: base.x * ca - base.y * sa, y: base.x * sa + base.y * ca };
      if (runDir.x * dir < 0.45) continue;
      const lp = ledPass(e, a, m, { runDir, maxLead });
      const au = lp.at.x * dir;
      // in behind, short of the keeper's area, on the pitch, not a long chase, and his before anyone's
      if (au < line + 1.5 || au > HL - 5 || Math.abs(lp.at.y) > HW - 3 || lp.t > 2.4 || lp.margin < thr) continue;
      const value: number = 0.45 + (au - bu) * 0.04 + baseXg(lp.at, dir) * 3 + Math.min(lp.margin, 1) * 0.3 + (running ? 0.15 : 0) + (m.isUser ? 0.15 + trust * 0.5 : 0);
      if (!best || value > best.value) best = { lp, to: m, value, runDir };
    }
  }
  return best;
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
    if (r === 'wait') { openLane(e, a); a.think = 0.08; return; }
    // (the user is calling for it: look up again soon — the lane may open any moment)
    if (s.time < e.ctl.callUntil) a.think = 0.1;
  }
  // (in the middle of a shimmy: he finishes it before anything else)
  if (a.takeOn && s.time < a.takeOn.burst && takeOnStep(e, a, false)) return;
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
  let ledFeet = false;
  if (opts.length) {
    // check the real lane of the best few before committing (every opponent, also one standing in
    // the way): no passes into traps — both teams
    best = null;
    // (a safety margin: a team-mate's pass must beat the nearest defender to it comfortably)
    const thrMate = mine ? 0.38 : 0.3;
    let tries = 0;
    for (let i = 0; i < Math.min(6, opts.length) && tries < 8; i++) {
      const o = opts[i];
      if (o.offside) continue;
      // to feet unless he is on a committed run (a supporter drifting to his spot may turn away)
      const committed = o.to.runT > 0 || o.to.duty === 'run' || o.to.duty === 'attackBall';
      const feet = o.to.isUser ? !e.ctl.dir || hyp(o.to.st.vel.x, o.to.st.vel.y) < 1.2 : !committed || hyp(o.to.st.vel.x, o.to.st.vel.y) < 1.2;
      const thr = o.to.isUser ? PASS_THR(e) : thrMate;
      // the real flight against every opponent, on the ground and (over a blocked lane, from far
      // enough) in the air: a lofted ball still has to clear the man right in front of the passer
      // and drop to him before anyone else can get under it — and only to a man in space, well
      // inside the lines (it is harder to bring down)
      const canLoft = o.dist > 16 && o.risk <= 3 && Math.abs(o.at.y) < HW - 7 && e.nearestOpp(o.to, o.at).d > 6 && !blockedClose(e, a, o.at);
      // (on the ground whenever that is on: a lofted ball is harder to bring down)
      for (const air of [false, true]) {
        if (air && !canLoft) continue;
        tries++;
        const lp = air
          ? ledPass(e, a, o.to, { feet: feet || !(o.to.runT > 0), maxLead: o.to.runT > 0 ? 9 : 3, lofted: true })
          : ledPass(e, a, o.to, { feet, maxLead: o.to.runT > 0 || o.to.isUser ? 9 : 4, quick: !o.to.isUser });
        if (lp.margin > thr + (air ? 0.6 : 0)) { best = { ...o, lofted: air }; led = lp; ledFeet = air ? feet || !(o.to.runT > 0) : feet; break; }
      }
      if (best) break;
    }
  }
  let passV = best ? best.value : -Infinity;
  // ── a ball in behind for a runner (onside now, the space behind the line) ──
  const thru = !settle && pressure < 0.7 ? throughBall(e, a, 0.3) : null;
  const thruV = thru ? thru.value : -Infinity;
  // ── cross from wide areas (to a runner who beats his marker to it) ──
  let crossTarget: Agent | null = null;
  let crossPlan: CrossPlan | null = null;
  if (!settle && inCrossZone(pos, dir)) {
    crossPlan = deliverCross(e, a, null, { plan: true });
    crossTarget = crossPlan.to;
  }
  let crossV = crossPlan && crossTarget ? 0.45 + (pos.x * dir > 36 ? 0.25 : 0) + clamp(crossPlan.margin, -0.8, 0.6) * 0.8 : -Infinity;
  // (a hopeful ball into the box from deep is rarely on: the runners cannot get there with it)
  if (crossPlan && pos.x * dir < HL - 22) crossV -= 0.3 + (crossPlan.margin < 0 ? 0.4 : 0);
  // a defender right in front of him blocks any cross: beat him first
  if (crossPlan && blockedClose(e, a, crossPlan.at)) crossV -= 0.9;
  if (mine && crossTarget?.isUser) crossV += 0.35;
  // ── dribble ──
  let ahead = 30;
  for (const o of e.agents) {
    if (o.side === a.side || o.passive) continue;
    const rx = (o.st.pos.x - pos.x) * dir;
    const ry = o.st.pos.y - pos.y;
    if (rx > 0 && Math.abs(ry) < rx * 0.8 + 1.5) ahead = Math.min(ahead, hyp(rx, ry));
  }
  const lane = dribbleLane(e, a);
  const dribV = 0.15 + clamp(lane.space, 0, 10) * 0.05 - pressure * 0.45 + (a.a.dribbling / 99) * 0.2 + lane.prog * 0.15;

  const noise = () => e.rng.normal(0, 0.12 * (1.2 - vision));
  const choices: [string, number][] = [
    ['shoot', shootV + noise()], ['pass', passV + noise()], ['cross', crossV + noise()], ['dribble', dribV + noise()], ['through', thruV + noise()],
  ];
  if (settle) choices.length = 0;
  let pick = 'dribble';
  let pv = dribV;
  for (const [n, v] of choices) if (v > pv) { pv = v; pick = n; }

  // (shots and crosses are wound up: the ball leaves at foot contact, a beat after the decision;
  // a pass goes at once — a delay lets the defenders read it)
  if (pick === 'shoot') {
    e.windUp(a, 'kick', () => e.execKick(a, shotParams(e, a), { isShot: true }), 0.1);
    return;
  }
  if (pick === 'through' && thru) {
    const to = thru.to;
    const first = thru.lp;
    const runDir = thru.runDir;
    e.windUp(a, first.params.power > 0.65 ? 'kick' : 'pass', () => {
      // re-solved at contact (he has kept running), else the ball as planned
      const again = ledPass(e, a, to, { runDir, maxLead: clamp(HL - 7 - to.st.pos.x * to.dir, 3, 11) });
      const q = again.margin > first.margin - 0.1 ? again.params : reAim(e, first.params, first.from, first.at);
      e.execKick(a, q, { target: to.i, isShot: false, through: true });
      if (to.runT <= 0) { to.runT = 1.6; to.runTarget = { x: again.at.x, y: again.at.y }; }
    }, 0);
    return;
  }
  if (pick === 'pass' && best) {
    const p = led ? led.params : passParams(e, a, best);
    const to = best.to;
    // the receiver keeps moving during the (short) wind-up: aim where he will be, and re-solve the
    // led ball at contact when that is safer
    const at = led ? led.at : { x: best.at.x + to.st.vel.x * 0.06, y: best.at.y + to.st.vel.y * 0.06 };
    const from = { x: b.x, y: b.y };
    const ledOpts = led && !led.lofted ? { feet: ledFeet, maxLead: to.runT > 0 || to.isUser ? 9 : 4, quick: true } : null;
    e.windUp(a, p.power > 0.65 ? 'kick' : 'pass', () => {
      let q = reAim(e, p, from, at);
      if (ledOpts && led) {
        const again = ledPass(e, a, to, ledOpts);
        if (again.margin > led.margin - 0.1) q = again.params;
      }
      e.execKick(a, q, { target: to.i, isShot: false });
    }, 0);
    return;
  }
  if (pick === 'cross' && crossTarget && crossPlan) {
    const ct = crossTarget;
    const style = crossPlan.style;
    e.windUp(a, 'kick', () => {
      const d = deliverCross(e, a, ct, { style });
      e.execKick(a, d.params, { target: d.to ? d.to.i : ct.i, isShot: false, cross: true });
    }, 0.12);
    return;
  }
  // ── take the man in front on: a feint / change of pace past him ──
  if (takeOnStep(e, a, settle)) return;
  // into the space (or shield it when there is none)
  if (lane.space < 2.2 && pressure > 0.45 && !settle) { shield(e, a); a.think = 0.12; return; }
  a.target = { x: clamp(pos.x + lane.h.x * 7, -HL + 1, HL - 1), y: clamp(pos.y + lane.h.y * 7, -HW + 1.5, HW - 1.5) };
  if (dGoal < 18) { a.target = { x: dir * (HL - 6), y: pos.y * 0.5 }; }
  // (a runner in behind carries on at pace: no stop-start after the first touch)
  const csp = hyp(a.st.vel.x, a.st.vel.y);
  a.urgency = (lane.space > 7 && pressure < 0.3) || (csp > 4.5 && lane.space > 4.5 && pressure < 0.45) ? 1 : settle ? 0.7 : 0.82;
  a.duty = 'carry';
}

/** The opponent squarely in front of the carrier on his way to goal (within ~3.8 m), or null. */
function manInFront(e: Engine, a: Agent, within = 3.8): Agent | null {
  const pos = a.st.pos;
  const dir = a.dir;
  const gx = dir * HL - pos.x;
  const gy = -pos.y * 0.5;
  const gl = hyp(gx, gy) || 1;
  let best: Agent | null = null;
  let bd = within;
  for (const o of e.agents) {
    if (o.side === a.side || o.isGK || o.passive || o.stun > 0) continue;
    const rx = o.st.pos.x - pos.x;
    const ry = o.st.pos.y - pos.y;
    const d = hyp(rx, ry);
    if (d >= bd) continue;
    const along = (rx * gx + ry * gy) / gl;
    const lat = Math.abs(rx * gy - ry * gx) / gl;
    if (along > 0.3 && lat < 1.6 + 0.3 * along) { bd = d; best = o; }
  }
  return best;
}

/**
 * Take-on (both teams, by dribbling skill): a shimmy one way with the pace off, then a burst past
 * the defender on the side with room — or just a change of pace. A defender who bites leans the
 * wrong way for a beat (he recovers with his own acceleration and turning). Returns whether the
 * carrier is in the move (his target / urgency are set).
 */
function takeOnStep(e: Engine, a: Agent, settle: boolean): boolean {
  const t = e.state.time;
  const pos = a.st.pos;
  const sp = hyp(a.st.vel.x, a.st.vel.y);
  let to = a.takeOn ?? null;
  if (to && t >= to.until) to = a.takeOn = null;
  if (!to) {
    if (settle || a.carryT < 0.25) return false;
    const o = manInFront(e, a, 6.5);
    if (!o) return false;
    const od = hyp(o.st.pos.x - pos.x, o.st.pos.y - pos.y);
    const drib = clamp(a.a.dribbling, 1, 99) / 99;
    const h = unitV(o.st.pos.x - pos.x, o.st.pos.y - pos.y);
    const n = { x: -h.y, y: h.x };
    // the side with room past him (never into the touchline; the side he leaves open, mostly)
    let side = 1;
    let bestRoom = -Infinity;
    for (const sg of [1, -1]) {
      const px = o.st.pos.x + n.x * sg * 2.6 + h.x * 1.5;
      const py = o.st.pos.y + n.y * sg * 2.6 + h.y * 1.5;
      let room = Math.abs(py) > HW - 1.5 || Math.abs(px) > HL - 1 ? -10 : 6;
      for (const q of e.agents) {
        if (q.side === a.side || q.passive || q === o) continue;
        room = Math.min(room, hyp(q.st.pos.x - px, q.st.pos.y - py));
      }
      const open = -((o.st.pos.x - pos.x) * n.x + (o.st.pos.y - pos.y) * n.y) * sg;
      const v = room + open * 1.5 + (a.i % 2 ? 0.3 : -0.3) * sg;
      if (v > bestRoom) { bestRoom = v; side = sg; }
    }
    if (od > 4.2 || sp < 2.6) {
      // drive at him first (a take-on needs pace): straight at his outside shoulder
      if (od < 2 || !e.rng.chance(0.35 + 0.55 * drib)) return false;
      a.target = { x: clamp(o.st.pos.x + n.x * side * 0.9, -HL + 1, HL - 1), y: clamp(o.st.pos.y + n.y * side * 0.9, -HW + 1.5, HW - 1.5) };
      a.urgency = 1;
      a.think = 0.1;
      a.duty = 'carry';
      return true;
    }
    // (a good dribbler takes him on; a poorer one keeps it simple / shields)
    if (!e.rng.chance(0.25 + 0.6 * drib)) return false;
    // (the shimmy needs a yard of room: right on top of him it is just the cut)
    const feint = od > 2.9 && e.rng.chance(0.25 + 0.6 * drib);
    // (the cut has to start a stride away, out of his reach: no shimmy closer in)
    if (!feint && od > 3.3) {
      a.target = { x: clamp(o.st.pos.x + n.x * side * 0.9, -HL + 1, HL - 1), y: clamp(o.st.pos.y + n.y * side * 0.9, -HW + 1.5, HW - 1.5) };
      a.urgency = 1;
      a.think = 0.06;
      a.duty = 'carry';
      return true;
    }
    const burst = t + (feint ? 0.16 : 0.02);
    to = a.takeOn = { side, t0: t, burst, until: burst + 0.75, o: o.i, feint };
    if (feint && !o.isUser) {
      const bite = clamp(0.18 + 0.52 * drib - 0.32 * (clamp(o.a.positioning, 1, 99) / 99) + (o.reaction - 0.2) * 1.2, 0.08, 0.72);
      if (e.rng.chance(bite)) {
        const lean = { x: o.st.pos.x - n.x * side * 2.2 - h.x * 0.5, y: o.st.pos.y - n.y * side * 2.2 - h.y * 0.5 };
        o.sold = { until: burst + 0.12 + 0.22 * drib, lean };
        o.target = { x: lean.x, y: lean.y };
        o.urgency = 0.9;
      }
    }
  }
  const o = e.agents[to.o];
  if (!o || (o.st.pos.x - pos.x) * a.dir < -0.4) { a.takeOn = null; return false; }
  const h = unitV(o.st.pos.x - pos.x, o.st.pos.y - pos.y);
  const n = { x: -h.y, y: h.x };
  const gx = a.dir * HL - pos.x;
  const gy = -pos.y * 0.5;
  const gl = hyp(gx, gy) || 1;
  if (t < to.burst) {
    // the shimmy: the weight onto the other side, the pace off a touch
    a.target = { x: clamp(pos.x + h.x * 1.5 - n.x * to.side * 1.8, -HL + 1, HL - 1), y: clamp(pos.y + h.y * 1.5 - n.y * to.side * 1.8, -HW + 1.5, HW - 1.5) };
    a.urgency = 0.75;
    a.think = Math.max(0.02, to.burst - t);
  } else {
    // the cut beside him, then on past him toward goal
    const level = ((o.st.pos.x - pos.x) * gx + (o.st.pos.y - pos.y) * gy) / gl;
    const px = level > 0.6 ? o.st.pos.x + n.x * to.side * 2.6 + (gx / gl) * 0.6 : pos.x + (gx / gl) * 5 + n.x * to.side * 1.2;
    const py = level > 0.6 ? o.st.pos.y + n.y * to.side * 2.6 + (gy / gl) * 0.6 : pos.y + (gy / gl) * 5 + n.y * to.side * 1.2;
    a.target = { x: clamp(px, -HL + 1, HL - 1), y: clamp(py, -HW + 1.5, HW - 1.5) };
    a.urgency = 1;
    a.think = clamp(to.until - t, 0.04, 0.12);
  }
  a.duty = 'carry';
  return true;
}

const DRIB_ANG = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4];

/** Headings tried for an AI first touch (relative to the way to goal), the half-turn ones included. */
const TOUCH_ANG = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4, Math.PI];

/**
 * AI first touch (both teams): the ball is taken on the half-turn, away from the nearest opponent
 * and toward goal / space when the body shape allows it — a runner played in behind takes it on in
 * his stride. The better his first touch, the surer the pick; the sharper the turn at speed, the
 * more pace it costs (locomotion turns the rest).
 */
export function aiFirstTouch(e: Engine, a: Agent): void {
  const pos = a.st.pos;
  const v = a.st.vel;
  const dir = a.dir;
  const sp = hyp(v.x, v.y);
  const ft = clamp(a.a.firstTouch, 1, 99) / 99;
  const goalH = pos.x * dir > 12 ? Math.atan2(-pos.y * 0.85, dir * HL - pos.x) : dir > 0 ? 0 : Math.PI;
  const cur = sp > 0.8 ? Math.atan2(v.y, v.x) : a.st.facing;
  const near = e.nearestOpp(a);
  const pr = e.pressureOn(a);
  let bestH = cur;
  let bestV = -Infinity;
  let secondH = cur;
  let secondV = -Infinity;
  for (const da of TOUCH_ANG) {
    const h = goalH + da;
    const hx = Math.cos(h);
    const hy = Math.sin(h);
    const ex = pos.x + hx * 5;
    const ey = pos.y + hy * 5;
    if (Math.abs(ey) > HW - 1.2 || Math.abs(ex) > HL - 0.8) continue;
    // room along it: the nearest opponent to the line of the touch (and the point it reaches)
    let room = 8;
    for (const o of e.agents) {
      if (o.side === a.side || o.passive) continue;
      const r = segDist(o.st.pos.x, o.st.pos.y, pos.x, pos.y, ex, ey);
      room = Math.min(room, r.d + r.s * 1.2);
    }
    // a turn at speed costs (and an open body is needed to turn with it)
    let turn = Math.abs(h - cur);
    while (turn > Math.PI) turn = Math.abs(turn - 2 * Math.PI);
    const prog = hx * dir;
    // (at pace the touch goes on the way he is running: a runner in behind keeps his stride)
    let val = Math.min(room, 6) * 0.4 + prog * (1.2 - 0.6 * pr) - turn * (0.1 + 0.09 * sp * (1 - pr));
    // away from the man on him (the half-turn: never into him)
    if (near.o && near.d < 4) {
      const ax = pos.x - near.o.st.pos.x;
      const ay = pos.y - near.o.st.pos.y;
      const al = hyp(ax, ay) || 1;
      const away = (hx * ax + hy * ay) / al;
      val += away * (0.5 + 2.5 * pr);
      if (away < 0.1 && near.d < 2.8) val -= 1.5;
    }
    if (val > bestV) { secondV = bestV; secondH = bestH; bestV = val; bestH = h; }
    else if (val > secondV) { secondV = val; secondH = h; }
  }
  // (a poorer first touch sometimes sets it the second-best way)
  const h = e.rng.chance(0.55 + 0.42 * ft) ? bestH : secondH;
  let d = h - cur;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  if (sp > 0.5) {
    const ang = cur + clamp(d, -1.0, 1.0);
    const keep = clamp(1 - Math.abs(d) * (0.32 - 0.12 * ft), 0.5, 0.97);
    v.x = Math.cos(ang) * sp * keep;
    v.y = Math.sin(ang) * sp * keep;
  }
  a.st.facing += clamp(angDiff(a.st.facing, h), -0.7, 0.7);
  a.touch = 0;
  // ...and he goes with it (no stop-start): a runner in behind at full pace
  const room = Math.max(0, bestV);
  a.target = { x: clamp(pos.x + Math.cos(h) * 7, -HL + 1, HL - 1), y: clamp(pos.y + Math.sin(h) * 7, -HW + 1.5, HW - 1.5) };
  a.urgency = sp > 4.5 && pr < 0.4 ? 1 : sp > 2.5 || room > 2 ? 0.86 : 0.7;
  a.duty = 'carry';
}

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

/**
 * A pass bent round the man in the lane (side-spin either way, the same target and pace): the
 * noise-free flight judged against every opponent like a straight one; null when neither way is on.
 * Better passers bend it more surely.
 */
function bentAround(e: Engine, a: Agent, m: Agent, plain: LedPass, thr: number): KickParams | null {
  const b = e.state.ball.pos;
  const k = e.kicker(a);
  const pass = clamp(a.a.passing, 1, 99) / 99;
  if (pass < 0.45) return null;
  const at = plain.at;
  const d = hyp(at.x - b.x, at.y - b.y);
  const arrive = clamp(5.6 + d * 0.08, 6, 9.5);
  for (const curl of [0.5, -0.5]) {
    const params = curledPass(e.env, k, { x: b.x, y: b.y, z: b.z }, at, arrive, curl * (0.7 + 0.3 * pass));
    const spec = e.kickSpec(a, params, 'ground', false);
    const path = predictPath(launched({ x: b.x, y: b.y, z: BR }, params, k, spec), e.env, clamp(d / 6 + 0.8, 1.2, 3), 4);
    const tRecv = interceptFor(e, m, path, 0.6).t;
    let tOpp = Infinity;
    for (const o of e.agents) {
      if (o.side === a.side || o.passive || o.stun > 0.4) continue;
      tOpp = Math.min(tOpp, interceptFor(e, o, path, 0.6).t, bodyT(o, path));
    }
    if (tOpp - tRecv > thr) return params;
  }
  return null;
}

/**
 * Waiting for the lane to the user to open: with a yard of room he moves the ball off the line of
 * the man cutting it out (a touch sideways opens the angle); pressed, he shields it.
 */
function openLane(e: Engine, a: Agent): void {
  const u = e.user;
  const pos = a.st.pos;
  if (e.pressureOn(a) > 0.45) { shield(e, a); return; }
  // (the man who gets across the lane soonest: his distance to it against how far down it he is)
  let cut: Agent | null = null;
  let bd = 2.5;
  const L = hyp(u.st.pos.x - pos.x, u.st.pos.y - pos.y) || 1;
  for (const o of e.agents) {
    if (o.side === a.side || o.passive || o.isGK) continue;
    const r = segDist(o.st.pos.x, o.st.pos.y, pos.x, pos.y, u.st.pos.x, u.st.pos.y);
    if (r.s <= 0.03 || r.s >= 0.97) continue;
    const v = r.d / (r.s * L);
    if (v < bd) { bd = v; cut = o; }
  }
  if (!cut) { shield(e, a); return; }
  // perpendicular to the lane, away from the side the interceptor is on
  const lx = u.st.pos.x - pos.x;
  const ly = u.st.pos.y - pos.y;
  const ll = hyp(lx, ly) || 1;
  const nx = -ly / ll;
  const ny = lx / ll;
  const side = ((cut.st.pos.x - pos.x) * nx + (cut.st.pos.y - pos.y) * ny) > 0 ? -1 : 1;
  a.target = { x: clamp(pos.x + nx * side * 2.5, -HL + 1, HL - 1), y: clamp(pos.y + ny * side * 2.5, -HW + 1.5, HW - 1.5) };
  a.urgency = 0.62;
  a.duty = 'carry';
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
    const p = shotParams(e, a, { power: 0.85, zLow: 0.1, zHigh: 0.75, kind: 'header', curl: 0 });
    e.execKick(a, p, { kind: 'header', isShot: true });
    return;
  }
  if (ownGoalD < 30) {
    const p: KickParams = { dir: unitV(dir, clamp(b.y * 0.04, -0.6, 0.6)), power: 0.95, loft: 0.75, curl: 0 };
    e.execKick(a, p, { kind: 'header', isShot: false });
    return;
  }
  // knock it down to a team-mate nobody can step in on (the open one nearest the line of the
  // attack), else the nearest
  let to: Vec3 | null = null;
  let bd = Infinity;
  let bestV = -Infinity;
  for (const m of e.agents) {
    if (m.side !== a.side || m === a || m.isGK || m.passive) continue;
    const d = hyp(m.st.pos.x - b.x, m.st.pos.y - b.y);
    if (d <= 3 || d >= 18) continue;
    const v = -laneRisk(e, a, { x: b.x, y: b.y }, m.st.pos, 9) * 2 + clamp(e.nearestOpp(m).d, 0, 6) * 0.35 + (m.st.pos.x - b.x) * dir * 0.04 - Math.abs(d - 9) * 0.05;
    if (v > bestV) { bestV = v; bd = d; to = { x: m.st.pos.x, y: m.st.pos.y, z: BR }; }
  }
  const dx = to ? to.x - b.x : dir;
  const dy = to ? to.y - b.y : 0;
  const l = hyp(dx, dy) || 1;
  e.execKick(a, { dir: { x: dx / l, y: dy / l }, power: clamp(0.25 + bd * 0.03, 0.3, 0.8), loft: 0.4, curl: 0 }, { kind: 'header', isShot: false, target: to ? -1 : -1 });
}

/**
 * A runner meeting a ball played into his path: the point of its flight he gets to in his stride —
 * on along his run rather than checking back across to it, timed to arrive with the ball, before
 * any opponent — run through (aimed a few metres beyond, so he is still at full stride when he
 * takes it); when he would be there well before the ball he eases onto the point instead.
 */
function strideMeet(e: Engine, a: Agent, oppT = Infinity): { p: Vec2; urg: number } | null {
  const path = e.ballPath();
  const age = e.loosePath ? Math.max(0, e.state.time - e.loosePath.t) : 0;
  const vmax = a.topSpeed * (0.82 + 0.18 * a.st.stamina);
  const sp = hyp(a.st.vel.x, a.st.vel.y);
  // the way he is running (from a standstill: toward goal)
  const rx = sp > 2 ? a.st.vel.x / sp : a.dir;
  const ry = sp > 2 ? a.st.vel.y / sp : 0;
  let best = -1;
  let bestC = Infinity;
  let bestSlack = 0;
  for (let i = 1; i < path.length; i++) {
    const q = path[i];
    const qt = q.t - age;
    if (q.z > 1.0 || qt <= 0.05) continue;
    if (Math.abs(q.x) > HL - 0.5 || Math.abs(q.y) > HW - 0.5) break;
    // (an opponent there first: no later point is his)
    if (qt > oppT - 0.1 && best >= 0) break;
    const dx = q.x - a.st.pos.x;
    const dy = q.y - a.st.pos.y;
    const d = hyp(dx, dy);
    const v0 = d > 0.3 ? Math.max(0, (a.st.vel.x * dx + a.st.vel.y * dy) / d) : 0;
    const tr = runTime(Math.max(0, d - 0.6), v0, vmax, a.accel);
    const slack = qt - tr;
    if (slack < -0.04) continue;
    const fwd = d > 0.5 ? (dx * rx + dy * ry) / d : 1;
    const c = Math.abs(slack - 0.1) * 1.5 + Math.max(0, 0.3 - fwd) * 2.5 + qt * 0.15;
    if (c < bestC) { bestC = c; best = i; bestSlack = slack; }
    // (well into the future with nothing better: stop looking)
    if (best >= 0 && slack > 1.2) break;
  }
  if (best < 0) return null;
  const q = path[best];
  const dx = q.x - a.st.pos.x;
  const dy = q.y - a.st.pos.y;
  const d = hyp(dx, dy);
  if (d <= 0.3) return { p: { x: q.x, y: q.y }, urg: 1 };
  const qt = q.t - age;
  if (bestSlack > 0.35 && d < 6) {
    // early: arrive with the ball (no running across its line before it gets there)
    return { p: { x: q.x, y: q.y }, urg: clamp(d / Math.max(0.3, qt) / vmax + 0.3, 0.55, 1) };
  }
  // through it in his stride, going with the ball: a ball running on ahead of him is chased at
  // full pace; one coming across him is met on its line, easing into its direction (a softer touch)
  const pv = path[Math.max(0, best - 1)];
  const bv = hyp(q.x - pv.x, q.y - pv.y);
  let ux = dx / d;
  let uy = dy / d;
  let cos = 1;
  if (bv > 1e-3) {
    const bx = (q.x - pv.x) / bv;
    const by = (q.y - pv.y) / bv;
    cos = bx * ux + by * uy;
    ux = ux * 0.35 + bx * 0.65; uy = uy * 0.35 + by * 0.65;
    const l = hyp(ux, uy) || 1; ux /= l; uy /= l;
  }
  const over = 3 + 1.5 * clamp(cos, 0, 1);
  return { p: { x: q.x + ux * over, y: q.y + uy * over }, urg: 1 };
}

/**
 * A lofted ball to him: where it comes down to chest height (he takes it there instead of meeting
 * it in the air), when he gets there before any opponent. Null when it is not a high ball.
 */
function dropPoint(e: Engine, a: Agent, oppT: number): { p: Vec2; urg: number } | null {
  const path = e.ballPath();
  const age = e.loosePath ? Math.max(0, e.state.time - e.loosePath.t) : 0;
  let high = e.state.ball.pos.z > 1.8;
  const vmax = a.topSpeed * (0.82 + 0.18 * a.st.stamina);
  for (let i = 1; i < path.length; i++) {
    const q = path[i];
    const qt = q.t - age;
    if (q.z > 1.8) { high = true; continue; }
    if (!high || qt <= 0.1 || q.z > 1.4) continue;
    if (qt > oppT - 0.25) return null;
    const d = hyp(q.x - a.st.pos.x, q.y - a.st.pos.y);
    if (a.reaction * 0.5 + runTime(Math.max(0, d - 0.5), 0, vmax, a.accel) > qt + 0.05) continue;
    return { p: { x: q.x, y: q.y }, urg: clamp(d / Math.max(0.3, qt) / vmax + 0.25, 0.55, 1) };
  }
  return null;
}

/** Where a receiver can wait for a pass coming to him (the nearest point of its line), or null. */
function setOnLine(e: Engine, a: Agent, oppT: number): Vec2 | null {
  const k = e.lastKick;
  const b = e.state.ball;
  // only a pass still on its way to him (not one he has already touched / that is running away)
  if (!k || b.lastTouchId !== e.agents[k.by]?.id) return null;
  if (b.vel.x * (a.st.pos.x - b.pos.x) + b.vel.y * (a.st.pos.y - b.pos.y) <= 0) return null;
  const path = e.ballPath();
  const age = e.loosePath ? Math.max(0, e.state.time - e.loosePath.t) : 0;
  let q: PathSample | null = null;
  let bd = Infinity;
  for (const p of path) {
    if (p.z > 1 || p.t - age < 0.1) continue;
    const d = hyp(p.x - a.st.pos.x, p.y - a.st.pos.y);
    if (d < bd) { bd = d; q = p; }
  }
  if (!q || bd > 2.5 || q.t - age > oppT - 0.35) return null;
  return { x: q.x, y: q.y };
}

/** An opponent within ~4.5 m in front of the passer, on the line of the kick (a lob can't clear him). */
function blockedClose(e: Engine, a: Agent, to: Vec2): boolean {
  const b = e.state.ball.pos;
  const d = hyp(to.x - b.x, to.y - b.y) || 1;
  for (const o of e.agents) {
    if (o.side === a.side || o.passive || o.isGK) continue;
    const r = segDist(o.st.pos.x, o.st.pos.y, b.x, b.y, to.x, to.y);
    if (r.s > 0 && r.s * d < 4.5 && r.d < 0.9) return true;
  }
  return false;
}

/** Re-point a solved kick from the ball's current spot at the same target (after a wind-up). */
export function reAim(e: Engine, p: KickParams, from: Vec2, at: Vec2): KickParams {
  const b = e.state.ball.pos;
  const a0 = Math.atan2(at.y - from.y, at.x - from.x);
  const a1 = Math.atan2(at.y - b.y, at.x - b.x);
  const off = Math.atan2(p.dir.y, p.dir.x) - a0;
  const ang = a1 + off;
  return { ...p, dir: { x: Math.cos(ang), y: Math.sin(ang) } };
}

function unitV(x: number, y: number): Vec2 {
  const l = hyp(x, y) || 1;
  return { x: x / l, y: y / l };
}
