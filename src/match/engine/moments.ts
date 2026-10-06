/**
 * Moment scenarios: the opening situation for every MomentType (who stands where, who has
 * the ball, set-piece walls), small scripted beats (a team-mate's pass or cross to the user)
 * and the training-drill loop (attempts, scoring, resets).
 */
import type { Position, Vec2 } from '../../core/types';
import { clamp } from '../../core/util';
import { t } from '../../core/i18n';
import { BR, GH, GW, HL, HW } from './constants';
import type { Engine } from './engine';
import { slotHome } from './formation';
import { distToGoal, hyp, inBox, unit } from './geom';
import type { Agent, Side } from './internal';
import { resetKeeper } from './keeper';
import { ballSpeed } from './physics';
import { groundPass, solveLob } from './solver';

export interface ScriptAction {
  /** Sim time at which the beat fires. */
  at: number;
  kind: 'pass' | 'cross';
  /** Agent index of the passer / crosser and of the intended receiver. */
  by: number;
  to: number;
  /** Cross: height the ball should drop through at the receiver. */
  z?: number;
  curl?: number;
  done: boolean;
}

export interface MomentScript { actions: ScriptAction[] }

type DrillKind = 'drill_free_kick' | 'drill_finishing' | 'drill_passing';

/** Per-attempt drill bookkeeping (engine-private, never in MomentState). */
interface DrillMem {
  kind: DrillKind;
  start: number;
  kickT: number;
  /** Passing drill: the target team-mate and the closest the ball came to him. */
  target: Agent | null;
  minD: number;
  passDist: number;
  bannerUntil: number;
  woodwork: boolean;
}

const drillMems = new WeakMap<Engine, DrillMem>();

// ───────────────────────── placement helpers ─────────────────────────

function place(a: Agent, x: number, y: number, face?: Vec2): void {
  a.st.pos.x = clamp(x, -HL - 3, HL + 3);
  a.st.pos.y = clamp(y, -HW - 3, HW + 3);
  a.st.vel.x = 0;
  a.st.vel.y = 0;
  a.target = { x: a.st.pos.x, y: a.st.pos.y };
  a.urgency = 0;
  if (face) a.st.facing = Math.atan2(face.y - a.st.pos.y, face.x - a.st.pos.x);
}

/** Everyone to his formation spot for this ball position (keepers on their line). */
function shape(e: Engine, ball: Vec2, poss: Side, jitter = 1.2): void {
  const r = e.rng;
  for (const a of e.agents) {
    if (a.isGK) {
      place(a, -a.dir * (HL - 1.2), clamp(ball.y * 0.08, -2, 2), ball);
      continue;
    }
    const style = a.side === 'us' ? e.setup.us.style : e.setup.them.style;
    const home = slotHome(a.slot, { dir: a.dir, inPossession: a.side === poss, ball, style });
    place(a, home.x + r.float(-jitter, jitter), home.y + r.float(-jitter, jitter), ball);
  }
}

function roleRank(a: Agent, roles: readonly Position[]): number {
  const i = roles.indexOf(a.spec.role);
  const j = roles.indexOf(a.slot.role);
  const best = Math.min(i < 0 ? 99 : i, j < 0 ? 99 : j);
  return best;
}

/** A team-mate (never the user or a keeper) by role preference, nearest to `near` on ties. */
function pickMate(e: Engine, side: Side, roles: readonly Position[], near?: Vec2, exclude: readonly Agent[] = []): Agent | null {
  let best: Agent | null = null;
  let bestScore = Infinity;
  for (const a of e.agents) {
    if (a.side !== side || a.isGK || a.isUser || exclude.includes(a)) continue;
    const score = roleRank(a, roles) * 1000 + (near ? hyp(a.st.pos.x - near.x, a.st.pos.y - near.y) : a.i);
    if (score < bestScore) { bestScore = score; best = a; }
  }
  return best;
}

function nearestOf(e: Engine, side: Side, p: Vec2, n: number, exclude: readonly Agent[] = []): Agent[] {
  return e.agents
    .filter((a) => a.side === side && !a.isGK && !a.isUser && !exclude.includes(a))
    .sort((a, b) => hyp(a.st.pos.x - p.x, a.st.pos.y - p.y) - hyp(b.st.pos.x - p.x, b.st.pos.y - p.y))
    .slice(0, n);
}

function giveTo(e: Engine, a: Agent): void {
  const f = a.st.facing;
  e.placeBall({ x: a.st.pos.x + Math.cos(f) * 0.42, y: a.st.pos.y + Math.sin(f) * 0.42, z: BR });
  e.giveBall(a, false);
}

/** Our outfielders step back onside (offside is judged at pass time). */
function keepOnside(e: Engine, except: readonly Agent[] = []): void {
  const line = e.offsideX('us');
  for (const a of e.agents) {
    if (a.side !== 'us' || a.isGK || except.includes(a) || a.passive) continue;
    if (a.st.pos.x > line - 0.8) {
      a.st.pos.x = line - 0.8 - e.rng.float(0, 2.5);
      a.target = { x: a.st.pos.x, y: a.st.pos.y };
    }
  }
}

const GOAL: Vec2 = { x: HL, y: 0 };

// ───────────────────────── scenarios ─────────────────────────

export function initMoment(e: Engine): void {
  const s = e.setup;
  for (const a of e.agents) {
    if (!a.keeper) continue;
    const gk = clamp(a.a.goalkeeping, 1, 99) / 99;
    const sharp = a.side === 'them' ? clamp(s.difficulty, 0, 1) - 0.5 : 0;
    a.keeper.spinRead = clamp(0.3 + 0.4 * gk + 0.25 * sharp, 0.2, 0.85);
  }
  switch (s.type) {
    case 'open_play': openPlay(e); break;
    case 'counter': counter(e); break;
    case 'one_on_one': oneOnOne(e); break;
    case 'cross_receive': crossReceive(e); break;
    case 'wing_cross': wingCross(e); break;
    case 'build_up': buildUp(e); break;
    case 'defend': defend(e); break;
    case 'free_kick': freeKick(e); break;
    case 'penalty': penalty(e); break;
    case 'corner': corner(e); break;
    case 'drill_free_kick':
    case 'drill_finishing':
    case 'drill_passing':
      initDrill(e, s.type);
      break;
    default:
      openPlay(e);
  }
  for (const a of e.agents) { a.target = { x: a.st.pos.x, y: a.st.pos.y }; }
}

function openPlay(e: Engine): void {
  const r = e.rng;
  const u = e.user;
  const B = { x: r.float(6, 20), y: r.float(-15, 15) };
  shape(e, B, 'us');
  const defs = nearestOf(e, 'them', B, 2);
  const receive = r.chance(0.4);
  place(u, B.x, B.y, { x: HL, y: B.y * 0.4 });
  if (receive) {
    const m = pickMate(e, 'us', ['CM', 'AM', 'DM', 'FB'], B);
    if (m) {
      place(m, B.x - r.float(9, 14), clamp(B.y + r.float(-9, 9), -28, 28), B);
      giveTo(e, m);
      m.think = 99;
      e.script.actions.push({ at: e.introEnd + r.float(0.25, 0.55), kind: 'pass', by: m.i, to: u.i, done: false });
    } else giveTo(e, u);
  } else {
    giveTo(e, u);
  }
  if (defs[0]) place(defs[0], B.x + r.float(3.6, 5.5), B.y + r.float(-1.6, 1.6), B);
  if (defs[1]) place(defs[1], B.x + r.float(6, 9), B.y + (B.y > 0 ? -1 : 1) * r.float(3, 6), B);
  keepOnside(e, [u]);
}

function counter(e: Engine): void {
  const r = e.rng;
  const u = e.user;
  const B = { x: r.float(-14, 0), y: r.float(-12, 12) };
  shape(e, B, 'us');
  place(u, B.x, B.y, GOAL);
  giveTo(e, u);
  // they were caught upfield: three defenders back, the rest behind the ball
  const them = e.agents.filter((a) => a.side === 'them' && !a.isGK).sort((p, q) => p.slot.y - q.slot.y);
  const lanes = [-11, 0, 11];
  them.forEach((a, i) => {
    if (i < 3) {
      place(a, Math.min(HL - 12, B.x + r.float(15, 28)), clamp(B.y * 0.5 + lanes[i] + r.float(-2, 2), -28, 28), B);
    } else {
      place(a, B.x - r.float(2, 18), clamp(r.float(-24, 24), -30, 30), B);
    }
  });
  // two team-mates break with him
  const runners = [pickMate(e, 'us', ['ST', 'W', 'AM'], B)];
  runners.push(pickMate(e, 'us', ['W', 'ST', 'AM'], B, runners.filter((x): x is Agent => !!x)));
  runners.forEach((m, i) => {
    if (!m) return;
    const side = i === 0 ? -Math.sign(B.y || 1) : Math.sign(B.y || 1);
    place(m, B.x + r.float(-1, 4), clamp(B.y + side * r.float(8, 15), -28, 28), GOAL);
    m.runT = 3.2;
    m.runTarget = { x: Math.min(HL - 9, B.x + 32), y: clamp(m.st.pos.y * 0.6, -18, 18) };
  });
  keepOnside(e, [u]);
}

function oneOnOne(e: Engine): void {
  const r = e.rng;
  const u = e.user;
  const B = { x: HL - r.float(19, 27), y: r.float(-7, 7) };
  shape(e, B, 'us');
  place(u, B.x, B.y, GOAL);
  giveTo(e, u);
  const chaser = pickMate(e, 'them', ['CB', 'FB', 'DM'], B);
  for (const a of e.agents) {
    if (a.side !== 'them' || a.isGK) continue;
    if (a === chaser) place(a, B.x - r.float(1.8, 3.0), B.y + r.float(-1.8, 1.8), B);
    else place(a, B.x - r.float(6, 26), clamp(a.st.pos.y * 0.8, -28, 28), B);
  }
  if (chaser) chaser.reaction = Math.max(chaser.reaction, 0.25);
  for (const a of e.agents) {
    if (a.side === 'us' && !a.isGK && !a.isUser && a.st.pos.x > B.x - 1) place(a, B.x - r.float(3, 12), a.st.pos.y, GOAL);
  }
}

function crossReceive(e: Engine): void {
  const r = e.rng;
  const u = e.user;
  const side = r.chance(0.5) ? 1 : -1;
  const C = { x: HL - r.float(9, 17), y: side * r.float(22, 29) };
  const U = { x: HL - r.float(9, 13.5), y: -side * r.float(-1.5, 4) };
  shape(e, C, 'us');
  const crosser = pickMate(e, 'us', ['W', 'FB', 'AM', 'CM'], C);
  place(u, U.x, U.y, C);
  const cbs = nearestOf(e, 'them', U, 3);
  if (cbs[0]) place(cbs[0], U.x + 1.1, U.y + side * 0.7, C);
  if (cbs[1]) place(cbs[1], HL - 5, side * 2.5, C);
  if (cbs[2]) place(cbs[2], HL - 8.5, -side * 6, C);
  const other = pickMate(e, 'us', ['ST', 'AM', 'CM'], undefined, crosser ? [crosser] : []);
  if (other) place(other, HL - r.float(10, 12), side * r.float(2, 5), C);
  if (!crosser) { giveTo(e, u); return; }
  place(crosser, C.x, C.y, { x: HL - 8, y: 0 });
  giveTo(e, crosser);
  crosser.think = 99;
  crosser.target = { x: C.x + 2, y: C.y };
  crosser.urgency = 0.5;
  const fb = nearestOf(e, 'them', C, 1, cbs)[0];
  if (fb) place(fb, C.x + r.float(3, 4.5), C.y - side * r.float(2, 3.5), C);
  keepOnside(e, [crosser]);
  const header = r.chance(0.65);
  e.script.actions.push({
    at: e.introEnd + r.float(0.5, 0.9), kind: 'cross', by: crosser.i, to: u.i,
    z: header ? r.float(1.75, 2.05) : r.float(0.75, 1.0), curl: side * r.float(0.15, 0.45) * (r.chance(0.6) ? 1 : -1), done: false,
  });
}

function wingCross(e: Engine): void {
  const r = e.rng;
  const u = e.user;
  const side = r.chance(0.5) ? 1 : -1;
  const B = { x: HL - r.float(15, 26), y: side * r.float(19, 27) };
  shape(e, B, 'us');
  place(u, B.x, B.y, { x: HL, y: side * 10 });
  giveTo(e, u);
  const fb = nearestOf(e, 'them', B, 1)[0];
  if (fb) place(fb, B.x + r.float(4, 6.5), B.y - side * r.float(0.5, 2.5), B);
  const spots = [{ x: HL - 11, y: side * 1.5 }, { x: HL - 8.5, y: -side * 4 }, { x: HL - 16, y: -side * 1 }];
  const used: Agent[] = [];
  const markers: Agent[] = fb ? [fb] : [];
  for (const p of spots) {
    const m = pickMate(e, 'us', ['ST', 'AM', 'W', 'CM'], p, used);
    if (!m) break;
    used.push(m);
    place(m, p.x + r.float(-1, 1), p.y + r.float(-1, 1), B);
    const d = nearestOf(e, 'them', p, 1, markers)[0];
    if (d) { markers.push(d); place(d, m.st.pos.x + 1.2, m.st.pos.y + side * 0.5, B); }
  }
  keepOnside(e, [u]);
}

function buildUp(e: Engine): void {
  const r = e.rng;
  const u = e.user;
  const B = { x: r.float(-40, -24), y: r.float(-22, 22) };
  shape(e, B, 'us');
  place(u, B.x, B.y, { x: B.x + 10, y: B.y * 0.7 });
  giveTo(e, u);
  const press = nearestOf(e, 'them', B, 2);
  const side = B.y > 0 ? -1 : 1;
  if (press[0]) place(press[0], B.x + r.float(5, 7.5), B.y + r.float(-3, 3), B);
  if (press[1]) place(press[1], B.x + r.float(3, 6), B.y + side * r.float(5, 8), B);
}

function defend(e: Engine): void {
  const r = e.rng;
  const u = e.user;
  const B = { x: -HL + r.float(22, 34), y: r.float(-18, 18) };
  shape(e, B, 'them');
  const c = pickMate(e, 'them', ['AM', 'ST', 'W', 'CM'], B);
  place(u, B.x - r.float(4, 7), B.y * 0.85 + r.float(-1.5, 1.5), B);
  if (!c) return;
  place(c, B.x, B.y, { x: -HL, y: 0 });
  giveTo(e, c);
  c.think = 0.5;
  // a second attacker makes a run
  const run = pickMate(e, 'them', ['ST', 'W', 'AM'], B, [c]);
  if (run) {
    run.runT = 2.5;
    run.runTarget = { x: -HL + 12, y: clamp(-B.y * 0.4, -12, 12) };
  }
}

// ───────────────────────── set pieces ─────────────────────────

function setUpFreeKick(e: Engine, spot: Vec2, drill: boolean): void {
  const r = e.rng;
  const u = e.user;
  e.frozen = true;
  e.setPiece = 'free_kick';
  const to = unit(HL - spot.x, -spot.y);
  place(u, spot.x - to.x * 0.42, spot.y - to.y * 0.42);
  u.st.facing = Math.atan2(to.y, to.x);
  e.placeBall({ x: spot.x, y: spot.y, z: BR });
  e.giveBall(u, false);
  const d = distToGoal(spot, 1);
  const n = d < 21 ? 5 : d < 25 ? 4 : d < 29 ? 3 : d < 34 ? 2 : 0;
  const near = Math.abs(spot.y) < 2.5 ? 0 : Math.sign(spot.y);
  const wd = unit(HL - spot.x, near * GW * 0.5 - spot.y);
  const perp = { x: -wd.y, y: wd.x };
  const cx = spot.x + wd.x * 9.15;
  const cy = spot.y + wd.y * 9.15;
  const pool = e.agents.filter((a) => a.side === 'them' && !a.isGK).sort((p, q) => (q.spec.appearance?.height ?? 180) - (p.spec.appearance?.height ?? 180));
  const wall = pool.slice(0, n);
  wall.forEach((a, k) => {
    const off = (k - (n - 1) / 2) * 0.62;
    place(a, cx + perp.x * off, cy + perp.y * off, spot);
    a.wall = true;
    a.st.inWall = true;
    a.jump = 0;
  });
  const gk = e.gkThem;
  if (gk?.keeper) {
    resetKeeper(gk);
    gk.keeper.bias = n > 0 ? -near * 0.6 : 0;
    place(gk, HL - 1.0, clamp(spot.y * 0.08 - near * 0.6, -GW + 0.5, GW - 0.5), spot);
  }
  if (drill) return;
  // attackers on the edge of the box, markers goal-side; everybody else holds the shape
  const rest = e.agents.filter((a) => !a.isGK && !a.isUser && !a.wall);
  for (const a of rest) {
    const home = slotHome(a.slot, { dir: a.dir, inPossession: a.side === 'us', ball: spot, style: a.side === 'us' ? e.setup.us.style : e.setup.them.style });
    place(a, home.x, home.y, spot);
  }
  const attackers = rest.filter((a) => a.side === 'us').sort((p, q) => roleRank(p, ['ST', 'CB', 'AM', 'W']) - roleRank(q, ['ST', 'CB', 'AM', 'W'])).slice(0, 4);
  const markers = rest.filter((a) => a.side === 'them');
  attackers.forEach((a, i) => {
    let y = clamp(-spot.y * 0.3 + (i - 1.5) * 5 + r.float(-1, 1), -16, 16);
    const x = HL - r.float(14, 18);
    // never stand in the shooting lane
    const lane = spot.y + (0 - spot.y) * clamp((x - spot.x) / (HL - spot.x), 0, 1);
    if (Math.abs(y - lane) < 3) y = lane + (y >= lane ? 3 : -3);
    place(a, x, y, spot);
    const m = markers[i];
    if (m) place(m, a.st.pos.x + 1.4, a.st.pos.y + r.float(-0.5, 0.5), spot);
  });
}

function freeKick(e: Engine): void {
  const r = e.rng;
  const s = e.setup;
  const spot = s.spot && Number.isFinite(s.spot.x) && Number.isFinite(s.spot.y)
    ? { x: clamp(s.spot.x, -10, HL - 5), y: clamp(s.spot.y, -HW + 2, HW - 2) }
    : { x: HL - r.float(19, 29), y: r.float(-14, 14) };
  if (inBox(spot, 1)) spot.x = HL - 16.5 - 0.6;
  e.introEnd = 0.6;
  shape(e, spot, 'us');
  setUpFreeKick(e, spot, false);
}

function penalty(e: Engine): void {
  const r = e.rng;
  const u = e.user;
  e.frozen = true;
  e.setPiece = 'penalty';
  e.introEnd = 0.8;
  const spot = { x: HL - 11, y: 0 };
  for (const a of e.agents) {
    if (a.isGK) continue;
    const y = r.float(-17, 17);
    place(a, HL - r.float(19.5, 24) + Math.abs(y) * 0.05, y, spot);
  }
  place(u, spot.x - 0.42, 0);
  u.st.facing = 0;
  e.placeBall({ x: spot.x, y: 0, z: BR });
  e.giveBall(u, false);
  if (e.gkThem) place(e.gkThem, HL - 0.15, 0, spot);
  if (e.gkUs) place(e.gkUs, -HL + 1.2, 0, spot);
}

function corner(e: Engine): void {
  const r = e.rng;
  const u = e.user;
  const s = e.setup;
  const side = s.spot && Math.abs(s.spot.y) > 1 ? Math.sign(s.spot.y) : r.chance(0.5) ? 1 : -1;
  e.frozen = true;
  e.setPiece = 'corner';
  e.introEnd = 0.6;
  const spot = { x: HL - 0.5, y: side * (HW - 0.5) };
  shape(e, { x: HL - 10, y: 0 }, 'us');
  const to = unit(HL - 11 - spot.x, -spot.y);
  place(u, spot.x - to.x * 0.42, spot.y - to.y * 0.42);
  u.st.facing = Math.atan2(to.y, to.x);
  e.placeBall({ x: spot.x, y: spot.y, z: BR });
  e.giveBall(u, false);
  const boxSpots = [
    { x: HL - 6, y: side * 2 }, { x: HL - 8, y: -side * 1 }, { x: HL - 11, y: side * 3 },
    { x: HL - 10, y: -side * 4.5 }, { x: HL - 13, y: 0 },
  ];
  const ours = e.agents.filter((a) => a.side === 'us' && !a.isGK && !a.isUser)
    .sort((p, q) => (q.a.heading + q.a.jumping) - (p.a.heading + p.a.jumping));
  const theirs = e.agents.filter((a) => a.side === 'them' && !a.isGK);
  const used = new Set<Agent>();
  boxSpots.forEach((p, i) => {
    const a = ours[i];
    if (!a) return;
    place(a, p.x + r.float(-0.8, 0.8), p.y + r.float(-0.8, 0.8), spot);
    used.add(a);
    const m = theirs[i];
    if (m) { place(m, a.st.pos.x + 0.9, a.st.pos.y - side * 0.4, spot); used.add(m); }
  });
  const nearPost = theirs.find((a) => !used.has(a));
  if (nearPost) { place(nearPost, HL - 0.9, side * (GW + 0.4), spot); used.add(nearPost); }
  const edge = theirs.find((a) => !used.has(a));
  if (edge) { place(edge, HL - 17, side * 3, spot); used.add(edge); }
  const lurker = ours.find((a) => !used.has(a));
  if (lurker) { place(lurker, HL - 20, -side * 6, spot); used.add(lurker); }
}

// ───────────────────────── scripted beats ─────────────────────────

export function scriptTick(e: Engine): void {
  const acts = e.script.actions;
  if (!acts.length) return;
  const s = e.state;
  for (const act of acts) {
    if (act.done || s.time < act.at) continue;
    act.done = true;
    const by = e.agents[act.by];
    const to = e.agents[act.to];
    if (!by || !to) continue;
    by.think = 0.35;
    if (e.owner !== by) continue;
    const b = s.ball.pos;
    if (act.kind === 'pass') {
      const lead = { x: to.st.pos.x + to.st.vel.x * 0.6, y: to.st.pos.y + to.st.vel.y * 0.6 };
      const p = groundPass(e.env, e.kicker(by), b, lead, 7.5);
      e.execKick(by, p, { target: to.i, isShot: false });
    } else {
      const aim = { x: to.st.pos.x + 1.2, y: to.st.pos.y * 0.9 };
      const p = solveLob(e.env, e.kicker(by), { x: b.x, y: b.y, z: b.z }, aim, act.z ?? 1.9, act.curl ?? 0, 0.42);
      e.execKick(by, p, { target: to.i, isShot: false, cross: true });
    }
  }
}

// ───────────────────────── drills ─────────────────────────

function initDrill(e: Engine, kind: DrillKind): void {
  const attempts = clamp(Math.round(e.setup.drill?.attempts ?? 5), 1, 20);
  e.drill = { attempt: 1, attempts, score: 0, resolveAt: -1, kicked: false, best: [] };
  drillMems.set(e, { kind, start: 0, kickT: -1, target: null, minD: Infinity, passDist: 0, bannerUntil: 0, woodwork: false });
  // everybody not involved watches from the touchline
  e.agents.forEach((a, k) => {
    if (a.isUser || a.isGK) return;
    a.passive = true;
    place(a, -6 + (k % 11) * 3.2, (a.side === 'us' ? -1 : 1) * (HW + 2.2));
    a.st.facing = a.side === 'us' ? Math.PI / 2 : -Math.PI / 2;
  });
  if (e.gkUs) { e.gkUs.passive = true; place(e.gkUs, -HL + 1.2, 0); }
  setupAttempt(e, true);
}

function setupAttempt(e: Engine, first: boolean): void {
  const d = e.drill;
  const mem = drillMems.get(e);
  if (!d || !mem) return;
  const s = e.state;
  const r = e.rng;
  const u = e.user;
  d.kicked = false;
  d.resolveAt = -1;
  mem.start = s.time;
  mem.kickT = -1;
  mem.minD = Infinity;
  mem.target = null;
  mem.woodwork = false;
  e.lastKick = null;
  e.frozen = false;
  e.setPiece = null;
  e.ctl.pending = null;
  e.ctl.aiming = false;
  e.ctl.target = null;
  e.ctl.dir = null;
  e.log.idle = 0;
  e.log.woodwork = false;
  s.timeScale = 1;
  if (!first) s.phase = 'live';
  u.stun = 0;
  u.cool = 0;
  u.animLock = 0;
  // wall / mannequins back to the side
  for (const a of e.agents) {
    if (a.wall) { a.wall = false; a.st.inWall = false; a.jump = 0; }
  }
  const outfield = e.agents.filter((a) => !a.isUser && !a.isGK);
  outfield.forEach((a, k) => place(a, -6 + (k % 11) * 3.2, (a.side === 'us' ? -1 : 1) * (HW + 2.2)));
  if (e.gkThem) resetKeeper(e.gkThem);
  if (e.gkThem) place(e.gkThem, HL - 0.8, 0, { x: 0, y: 0 });

  if (mem.kind === 'drill_free_kick') {
    const sp = first && e.setup.spot ? e.setup.spot : { x: HL - r.float(19, 28), y: r.float(-13, 13) };
    const spot = { x: clamp(sp.x, -10, HL - 17.2), y: clamp(sp.y, -HW + 2, HW - 2) };
    // the wall comes from the bibs team; they are mannequins that still jump
    for (const a of e.agents) if (a.side === 'them' && !a.isGK) a.passive = true;
    setUpFreeKick(e, spot, true);
  } else if (mem.kind === 'drill_finishing') {
    const spot = { x: HL - r.float(10, 19), y: r.float(-10, 10) };
    const served = e.agents.find((a) => a.side === 'us' && !a.isUser && !a.isGK) ?? null;
    const def = e.agents.find((a) => a.side === 'them' && !a.isGK) ?? null;
    place(u, spot.x, spot.y, GOAL);
    if (def) {
      const lat = (r.chance(0.5) ? 1 : -1) * r.float(1.4, 2.6);
      place(def, spot.x + r.float(3, 5), spot.y + lat, spot);
    }
    if (served && r.chance(0.4)) {
      const sy = spot.y > 0 ? -1 : 1;
      place(served, spot.x - r.float(6, 10), clamp(spot.y + sy * r.float(8, 14), -HW + 2, HW - 2), spot);
      giveTo(e, served);
      e.script.actions = [{ at: s.time + 0.5, kind: 'pass', by: served.i, to: u.i, done: false }];
    } else {
      giveTo(e, u);
    }
  } else {
    // passing: one team-mate shows for the ball, mannequins guard the lanes
    const start = { x: -18 + r.float(-4, 4), y: r.float(-10, 10) };
    place(u, start.x, start.y, GOAL);
    const mates = e.agents.filter((a) => a.side === 'us' && !a.isUser && !a.isGK);
    const target = mates.length ? mates[(d.attempt - 1) % mates.length] : null;
    if (target) {
      const dist = r.float(12, 28);
      const ang = r.float(-1.1, 1.1);
      const p = { x: start.x + Math.cos(ang) * dist, y: clamp(start.y + Math.sin(ang) * dist, -HW + 3, HW - 3) };
      place(target, p.x, p.y, start);
      mem.target = target;
      mem.passDist = hyp(p.x - start.x, p.y - start.y);
      const opp = e.agents.filter((a) => a.side === 'them' && !a.isGK);
      opp.slice(0, 2).forEach((o, k) => {
        const f = 0.45 + 0.2 * k;
        const side = k % 2 ? 1 : -1;
        place(o, start.x + (p.x - start.x) * f - side * 2.4 * Math.sin(ang), start.y + (p.y - start.y) * f + side * 2.4 * Math.cos(ang), start);
      });
      e.emit({ t: 'call', by: target.id });
    }
    giveTo(e, u);
  }
  syncDrillState(e);
  if (!first) {
    s.banner = t('engine.banner.attempt', { n: d.attempt, total: d.attempts });
    mem.bannerUntil = s.time + 0.9;
  }
}

function syncDrillState(e: Engine): void {
  const d = e.drill;
  if (!d) return;
  e.state.drill = { attempt: Math.min(d.attempt, d.attempts), attempts: d.attempts, score: d.score };
}

/** Points (0..100) for a finished shooting attempt. */
function shotPoints(e: Engine, result: string, kind: DrillKind): number {
  const k = e.lastKick;
  if (!k) return 0;
  if (result === 'goal') {
    const b = e.state.ball.pos;
    const corner = clamp(Math.abs(e.aux.inGoal ? b.y : 0) / GW, 0, 1);
    const hit = k.xg < 0.15 ? 1 : 0.5;
    const base = kind === 'drill_free_kick' ? 62 : 55;
    return Math.round(clamp(base + 25 * corner + 13 * hit, 0, 100));
  }
  if (result === 'woodwork') return 30;
  if (result === 'saved') return k.onTarget ? 18 : 10;
  return 0;
}

function resolveAttempt(e: Engine, points: number, banner: string | null): void {
  const d = e.drill;
  const mem = drillMems.get(e);
  if (!d || !mem) return;
  const s = e.state;
  d.best.push(clamp(Math.round(points), 0, 100));
  d.score = Math.round(d.best.reduce((p, q) => p + q, 0) / d.attempts);
  d.resolveAt = s.time + 1.4;
  s.banner = banner ?? t('engine.banner.points', { n: Math.round(points) });
  mem.bannerUntil = Infinity;
  syncDrillState(e);
}

export function drillTick(e: Engine): void {
  const d = e.drill;
  const mem = drillMems.get(e);
  if (!d || !mem) return;
  const s = e.state;
  if (s.phase === 'outcome') return;
  if (s.time > mem.bannerUntil) { s.banner = null; mem.bannerUntil = Infinity; }
  if (d.resolveAt > 0) {
    if (s.time < d.resolveAt) return;
    s.banner = null;
    if (d.attempt >= d.attempts) {
      d.attempt = d.attempts;
      syncDrillState(e);
      e.finish('drill_complete', 1.0, t('engine.banner.drillDone'));
      return;
    }
    d.attempt++;
    setupAttempt(e, false);
    return;
  }
  const limit = clamp(e.setup.timeLimit / d.attempts, 8, 20);
  if (!d.kicked) {
    const gone = e.owner && e.owner.side === 'them';
    if (s.time - mem.start > limit || e.log.idle > 11 || gone) resolveAttempt(e, 0, t('engine.banner.points', { n: 0 }));
    return;
  }
  if (mem.kickT < 0) mem.kickT = s.time;
  const since = s.time - mem.kickT;
  const b = s.ball;
  if (mem.kind === 'drill_passing') {
    const tg = mem.target;
    if (!tg) { resolveAttempt(e, 0, null); return; }
    const dd = hyp(b.pos.x - tg.st.pos.x, b.pos.y - tg.st.pos.y);
    if (b.pos.z < 1.6) mem.minD = Math.min(mem.minD, dd);
    if (dd < 0.95 && b.pos.z < 1.5) {
      const v = ballSpeed(b);
      const acc = 1 - clamp((mem.minD - 0.25) / 1.4, 0, 0.5);
      const pace = v > 16 ? 0.7 : v > 13 ? 0.85 : v < 2.5 ? 0.75 : 1;
      const base = 62 + 38 * clamp((mem.passDist - 10) / 18, 0, 1);
      const lofted = b.pos.z > 0.5 ? 0.92 : 1;
      e.placeBall({ x: tg.st.pos.x + 0.35, y: tg.st.pos.y, z: BR });
      e.emit({ t: 'receive', by: tg.id, from: e.user.id, side: 'us' });
      e.log.passesCompleted++;
      resolveAttempt(e, base * acc * pace * lofted, null);
      return;
    }
    const stopped = ballSpeed(b) < 0.4 && b.pos.z < 0.2;
    const away = since > 4 || Math.abs(b.pos.x) > HL || Math.abs(b.pos.y) > HW;
    if (stopped || away) resolveAttempt(e, 0, t('engine.banner.points', { n: 0 }));
    return;
  }
  // shooting drills
  const k = e.lastKick;
  if (e.log.woodwork) mem.woodwork = true;
  const gkHolds = !!e.owner && e.owner.isGK;
  const result = k?.user ? k.result : 'pending';
  const out = Math.abs(b.pos.y) > HW + 0.2 || (Math.abs(b.pos.x) > HL + 0.2 && !e.aux.inGoal);
  const dead = ballSpeed(b) < 0.8 && b.pos.z < 0.3;
  if (result === 'goal') {
    if (since > 0.35 || e.aux.inGoal) resolveAttempt(e, shotPoints(e, 'goal', mem.kind), t('engine.banner.goal'));
    return;
  }
  if (gkHolds || out || dead || since > 3.6 || (e.owner && e.owner.side === 'them')) {
    const res = mem.woodwork ? 'woodwork' : result === 'saved' || gkHolds ? 'saved' : result;
    const banner = res === 'woodwork' ? t('engine.banner.post') : res === 'saved' ? t('engine.banner.save') : res === 'blocked' ? t('engine.banner.blocked')
      : b.pos.z > GH ? t('engine.banner.over') : null;
    resolveAttempt(e, shotPoints(e, res, mem.kind), banner);
  }
}
