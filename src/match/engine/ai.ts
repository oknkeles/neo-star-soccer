/**
 * Outfield AI for both teams: a coordinator (10 Hz) assigns chasers, pressers, markers,
 * receivers and runners; the ball carrier decides between shooting, passing, crossing
 * and dribbling. Everything is deterministic (engine Rng only).
 */
import type { KickParams, Vec2, Vec3 } from '../../core/types';
import { clamp } from '../../core/util';
import { BR, GW, HL, HW } from './constants';
import type { Engine } from './engine';
import { slotHome } from './formation';
import { baseXg, distToGoal, hyp, inBox, segDist } from './geom';
import type { Agent, PathSample, Side } from './internal';
import { groundPass, solveLob, solveShot } from './solver';

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
  }
  const passIn = loose && k && !k.isShot && !k.completed && k.target >= 0 && s.time - k.t < 4 ? k : null;
  const pressers = loose ? null : assignPressers(e);
  const marks = assignMarks(e, pressers);

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
        attackOffBall(e, a);
      } else {
        defendOffBall(e, a, null, marks);
      }
    } else if (owner && owner.side === a.side) {
      attackOffBall(e, a);
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

function attackOffBall(e: Engine, a: Agent): void {
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
  const settle = a.carryT < 0.28 && pressure < 0.6 && dGoal > 14;
  const vision = clamp(a.a.vision, 1, 99) / 99;

  // casual play: the user called for it → give it to him at once unless the lane is shut
  if (a.side === e.user.side && s.time < e.ctl.callUntil && e.ease > 0.15 && !e.user.passive && e.user.stun <= 0) {
    const opt = passOptions(e, a).find((o) => o.to.isUser);
    const maxRisk = 1.4 + 1.2 * e.ease;
    if (opt && !opt.offside && (opt.lofted || opt.risk < maxRisk)) {
      e.execKick(a, passParams(e, a, opt), { target: opt.to.i, isShot: false });
      return;
    }
  }

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
  }
  // ── pass / cross ──
  const opts = settle ? [] : passOptions(e, a);
  const best = opts[0] ?? null;
  let passV = best ? best.value : -Infinity;
  // ── cross from wide areas ──
  let crossTarget: Agent | null = null;
  if (!settle && Math.abs(pos.y) > 15 && pos.x * dir > 28) {
    let bestT = Infinity;
    for (const m of e.agents) {
      if (m.side !== a.side || m === a || m.isGK || m.passive) continue;
      if (!inBox(m.st.pos, dir)) continue;
      const near = e.nearestOpp(m).d;
      const score = -near + Math.abs(m.st.pos.y) * 0.1;
      if (score < bestT) { bestT = score; crossTarget = m; }
    }
  }
  const crossV = crossTarget ? 0.55 + (pos.x * dir > 38 ? 0.25 : 0) : -Infinity;
  // ── dribble ──
  let ahead = 30;
  for (const o of e.agents) {
    if (o.side === a.side || o.passive) continue;
    const rx = (o.st.pos.x - pos.x) * dir;
    const ry = o.st.pos.y - pos.y;
    if (rx > 0 && Math.abs(ry) < rx * 0.8 + 1.5) ahead = Math.min(ahead, hyp(rx, ry));
  }
  const dribV = 0.15 + clamp(ahead, 0, 15) * 0.04 - pressure * 0.55 + (a.a.dribbling / 99) * 0.2;

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
    const p = passParams(e, a, best);
    e.execKick(a, p, { target: best.to.i, isShot: false });
    return;
  }
  if (pick === 'cross' && crossTarget) {
    const at = { x: crossTarget.st.pos.x + dir * 1.5, y: crossTarget.st.pos.y * 0.8 };
    const curl = 0.4 * Math.sign(pos.y) * dir * -1;
    const p = solveLob(e.env, e.kicker(a), { x: b.x, y: b.y, z: b.z }, at, 1.6, curl, 0.42);
    e.execKick(a, p, { target: crossTarget.i, isShot: false, cross: true });
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
