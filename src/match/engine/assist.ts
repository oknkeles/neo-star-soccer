/**
 * Control assists for casual play (the 2D view's keyboard / touch controls): turn simple
 * intents — "shoot", "pass", "through ball" — into precise KickParams using the engine's
 * noise-free solvers. Execution noise, the keeper and defenders still decide the outcome.
 */
import type { KickParams, Vec2 } from '../../core/types';
import { clamp } from '../../core/util';
import type { MomentEngine } from './api';
import { GW, HL, HW } from './constants';
import { Engine } from './engine';
import { distToGoal, hyp } from './geom';
import type { Agent } from './internal';
import { naturalCurlSign } from './kick';
import { laneRisk, openMates, passOptions } from './ai';
import { atDistance, groundPass, launched, predictPath, solveLob, solveShot } from './solver';

export interface ShotIntent {
  /** 0..1 how long the button was held (power). */
  charge: number;
  /** −1..1 user curl ("falso"; + bends to the left of travel). 0 = automatic. */
  curl: number;
  /** World point under the cursor (mouse aim) or null for automatic aim. */
  aim?: Vec2 | null;
  /** Set pieces: −1..1 manual target offset along the goal line (+ = +y post). */
  offset?: number;
  /** Chip over an advancing keeper. */
  chip?: boolean;
}

export interface PassIntent {
  /** Preferred direction (movement keys / facing). */
  pref?: Vec2 | null;
  /** World point (cursor): prefer the team-mate nearest to it. */
  toward?: Vec2 | null;
  /** Through ball into space ahead of the most advanced team-mate. */
  through?: boolean;
  /** Only team-mates within this angle (rad) of `pref`; falls back to the most open one ahead. */
  cone?: number;
}

export interface DirShotIntent {
  /** 0..1 how long the button was held (power). */
  charge: number;
  /** −1..1 user curl (Q / E); 0 = automatic. */
  curl: number;
  /** World direction the user is running (keys / stick); null = the way he faces. */
  dir?: Vec2 | null;
  /** Set pieces: −1..1 manual target offset along the goal line. */
  offset?: number;
  /** Chip over an advancing keeper. */
  chip?: boolean;
}

export interface PassPick {
  id: string | null;
  at: Vec2;
  lofted: boolean;
}

export interface AssistInfo {
  /** The user carries the ball. */
  hasBall: boolean;
  /** Dead ball the user is about to take (keys aim instead of moving). */
  setPiece: 'free_kick' | 'penalty' | 'corner' | null;
  /** Automatic shot target on the goal line (y, z), null when out of range. */
  target: { y: number; z: number } | null;
  /** Distance to the goal centre. */
  dist: number;
  /** 0..1 of the moment's play time left (null in drills / unknown engines). */
  timeLeft: number | null;
}

const asEngine = (m: MomentEngine): Engine | null => (m instanceof Engine ? m : null);

function ballFrom(e: Engine) {
  const b = e.state.ball.pos;
  return { x: b.x, y: b.y, z: b.z };
}

function kindFor(e: Engine): 'ground' | 'volley' | 'header' {
  if (e.owner === e.user) return 'ground';
  return e.reach(e.user).kind;
}

/** Inside-the-post margin for automatic aim (safer on easy). */
const inner = (e: Engine) => GW - 0.55 - 0.3 * e.ease;

/** Automatic target: the corner farther from the keeper (far post when he is central). */
function autoTargetY(e: Engine, offset = 0): number {
  const m = inner(e);
  if (Math.abs(offset) > 0.04) return clamp(offset, -1, 1) * m;
  const b = e.state.ball.pos;
  const gk = e.gkThem;
  const ky = gk ? gk.st.pos.y : 0;
  const dl = Math.abs(ky - m);
  const dr = Math.abs(ky + m);
  if (Math.abs(dl - dr) < 0.5) {
    if (Math.abs(b.y) > 1.5) return -Math.sign(b.y) * m;
    return (e.setup.seed & 1 ? 1 : -1) * m;
  }
  return dl > dr ? m : -m;
}

export function assistInfo(engine: MomentEngine, offset = 0): AssistInfo {
  const e = asEngine(engine);
  const b = engine.state.ball.pos;
  const dist = hyp(HL - b.x, b.y);
  if (!e) return { hasBall: false, setPiece: null, target: null, dist, timeLeft: null };
  const hasBall = e.owner === e.user;
  const setPiece = e.frozen && hasBall ? e.setPiece : null;
  const target = dist < 34 && setPiece !== 'corner' ? { y: autoTargetY(e, offset), z: dist < 12 ? 0.35 : 0.6 } : null;
  const timeLeft = e.drill ? null : clamp(1 - e.playClock / e.timeLimitSec(), 0, 1);
  return { hasBall, setPiece, target, dist, timeLeft };
}

function shotAt(e: Engine, ty: number, tz: number, power: number, curl: number, kind: 'ground' | 'volley' | 'header', loft0?: number): KickParams {
  const u = e.user;
  const spec = e.kickSpec(u, { dir: { x: 1, y: 0 }, power, loft: 0.05, curl }, kind, true);
  return solveShot(e.env, e.kicker(u), spec, ballFrom(e), HL, ty, tz, power, curl, loft0 ?? (kind === 'header' ? 0.3 : 0.06)).params;
}

function clearsWall(e: Engine, p: KickParams): boolean {
  const walls = e.agents.filter((a) => a.wall);
  if (!walls.length) return true;
  const u = e.user;
  const b = ballFrom(e);
  const spec = e.kickSpec(u, p, 'ground', true);
  const path = predictPath(launched(b, p, e.kicker(u), spec), e.env, 2.5, 2);
  for (const w of walls) {
    const d = hyp(w.st.pos.x - b.x, w.st.pos.y - b.y);
    const at = atDistance(path, d);
    if (!at) continue;
    if (hyp(at.x - w.st.pos.x, at.y - w.st.pos.y) < 0.6 && at.z < 2.5) return false;
  }
  const g = atDistance(path, distToGoal({ x: b.x, y: b.y }, 1));
  return !g || g.z < 2.3;
}

function freeKick(e: Engine, intent: ShotIntent): KickParams {
  const b = e.state.ball.pos;
  const nat = naturalCurlSign(e.user.spec.foot);
  const userCurl = Math.abs(intent.curl) > 0.05 ? clamp(intent.curl, -1, 1) : 0;
  const first = Math.sign(autoTargetY(e, intent.offset ?? 0)) || (Math.sign(b.y) || 1);
  const sides = Math.abs(intent.offset ?? 0) > 0.04 ? [first] : [first, -first];
  let fallback: KickParams | null = null;
  for (const side of sides) {
    const ty = Math.abs(intent.offset ?? 0) > 0.04 ? autoTargetY(e, intent.offset) : side * (inner(e) - 0.1);
    // bend it back toward the goal from outside the wall unless the user chose a curl
    const curls = userCurl ? [userCurl * 0.95] : [0.85 * nat, -0.85 * nat];
    for (const curl of curls) {
      for (const tz of [1.75, 1.95, 2.1, 1.5]) {
        for (const power of [0.8, 0.74, 0.86, 0.68]) {
          const p = shotAt(e, ty, tz, power, curl, 'ground');
          fallback ??= p;
          if (clearsWall(e, p)) return p;
        }
      }
    }
  }
  return fallback ?? shotAt(e, 0, 2, 0.7, 0, 'ground');
}

function bestBoxTarget(e: Engine): Vec2 {
  const mates = e.agents.filter((a) => a.side === 'us' && !a.isUser && !a.isGK && a.st.pos.x > HL - 18 && Math.abs(a.st.pos.y) < 16);
  if (!mates.length) return { x: HL - 8, y: 0 };
  const m = mates.reduce((p, q) => (e.nearestOpp(q).d > e.nearestOpp(p).d ? q : p));
  return { x: m.st.pos.x + 1.2, y: m.st.pos.y * 0.9 };
}

/** Lofted ball into the box (corners, wide free kicks, crosses). */
function cross(e: Engine, to?: Vec2 | null): KickParams {
  const b = e.state.ball.pos;
  const tgt = to ?? bestBoxTarget(e);
  const curl = 0.35 * (b.y > 0 ? 1 : -1) * (b.x > HL - 3 ? 1 : -1);
  return solveLob(e.env, e.kicker(e.user), ballFrom(e), tgt, 1.8, curl, 0.45);
}

/** Shot / strike toward goal (or toward the cursor). Returns null when the user can't kick. */
export function assistShot(engine: MomentEngine, intent: ShotIntent): KickParams | null {
  const e = asEngine(engine);
  const charge = clamp(Number.isFinite(intent.charge) ? intent.charge : 0.5, 0, 1);
  const userCurl = clamp(Number.isFinite(intent.curl) ? intent.curl : 0, -1, 1);
  const b = engine.state.ball.pos;
  if (!e) {
    const aim = intent.aim ?? { x: HL, y: 0 };
    const d = hyp(aim.x - b.x, aim.y - b.y) || 1;
    return { dir: { x: (aim.x - b.x) / d, y: (aim.y - b.y) / d }, power: 0.55 + 0.4 * charge, loft: 0.08, curl: userCurl };
  }
  const kind = kindFor(e);
  const dist = hyp(HL - b.x, b.y);
  const set = e.frozen && e.owner === e.user ? e.setPiece : null;

  // the cursor points away from the goal mouth: strike toward it (long ball / clearance)
  const aim = intent.aim ?? null;
  const nearMouth = !!aim && aim.x > HL - 14 && Math.abs(aim.y) < GW + 7;
  if (aim && !nearMouth) {
    if (set === 'corner' || (aim.x > HL - 24 && Math.abs(aim.y) < 22 && b.x > HL - 40 && Math.abs(b.y) > 14)) return cross(e, aim);
    const dx = aim.x - b.x;
    const dy = aim.y - b.y;
    const d = hyp(dx, dy) || 1;
    return { dir: { x: dx / d, y: dy / d }, power: 0.35 + 0.6 * charge, loft: charge > 0.75 ? 0.3 : 0.06, curl: userCurl * 0.9 };
  }

  if (set === 'corner') return cross(e, null);
  if (set === 'free_kick' && dist < 32) return freeKick(e, intent);
  if (set === 'free_kick') return cross(e, null);

  const ty = nearMouth && aim ? clamp(aim.y, -(GW - 0.3), GW - 0.3) : autoTargetY(e, intent.offset ?? 0);
  if (set === 'penalty') {
    const power = 0.62 + 0.3 * charge;
    return shotAt(e, ty, 0.45 + 0.5 * Math.abs(userCurl), power, 0, 'ground');
  }
  if (kind === 'header') return shotAt(e, ty * 0.92, 0.4, 0.95, 0, 'header');
  const gk = e.gkThem;
  const gkOff = gk ? HL - gk.st.pos.x : 0;
  if (intent.chip && kind === 'ground' && gkOff > 4.5 && dist < 30) {
    const power = clamp(0.3 + dist * 0.014, 0.38, 0.78);
    return shotAt(e, ty * 0.7, 1.9, power, 0, 'ground', 0.5);
  }
  const power = clamp(0.74 + 0.23 * charge, 0.3, 0.97);
  const curl = Math.abs(userCurl) > 0.05 ? userCurl * 0.9 : autoCurl(e, ty, kind);
  const tz = kind === 'volley' ? 0.5 : dist < 12 ? 0.35 : 0.6;
  return shotAt(e, ty, tz, power, curl, kind);
}

/** A little automatic bend only from wide angles, where it helps keep the shot inside the posts. */
function autoCurl(e: Engine, ty: number, kind: 'ground' | 'volley' | 'header'): number {
  const b = e.state.ball.pos;
  const dist = hyp(HL - b.x, b.y);
  if (kind !== 'ground' || dist < 12 || Math.abs(b.y) < GW + 4) return 0;
  return -0.2 * Math.sign(ty || 1);
}

/** Half-angle (rad) of the cone around the goal within which a run counts as "at goal". */
export const GOAL_CONE = (35 * Math.PI) / 180;

/** Unit direction for a direction-based kick: the given one, else the way the user faces / runs. */
export function kickDir(engine: MomentEngine, dir?: Vec2 | null): Vec2 {
  if (dir) {
    const l = hyp(dir.x, dir.y);
    if (l > 0.05) return { x: dir.x / l, y: dir.y / l };
  }
  const u = engine.state.players.find((p) => p.isUser);
  if (!u) return { x: 1, y: 0 };
  const sp = hyp(u.vel.x, u.vel.y);
  if (sp > 1.2) return { x: u.vel.x / sp, y: u.vel.y / sp };
  return { x: Math.cos(u.facing), y: Math.sin(u.facing) };
}

/** Is a kick in direction `d` from the ball "at goal" (within GOAL_CONE of the goal mouth, in range)? */
export function goalBound(engine: MomentEngine, d: Vec2): boolean {
  const b = engine.state.ball.pos;
  const gx = HL - b.x;
  const gy = -b.y;
  const dist = hyp(gx, gy);
  if (dist > 36 || gx < 0.5) return false;
  let da = Math.atan2(d.y, d.x) - Math.atan2(gy, gx);
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  return Math.abs(da) <= GOAL_CONE + Math.atan2(GW, dist) * 0.5;
}

/** Corner for a run at goal: the side the run points to, unless the keeper covers it. */
function cornerFor(e: Engine, d: Vec2): number {
  const m = inner(e);
  const b = e.state.ball.pos;
  if (d.x < 0.05) return autoTargetY(e);
  const yc = clamp(b.y + (d.y * (HL - b.x)) / d.x, -(GW + 3), GW + 3);
  const gk = e.gkThem;
  const ky = gk ? gk.st.pos.y : 0;
  const cost = (c: number) => Math.abs(c - yc) * 0.35 - Math.min(3.5, Math.abs(c - ky));
  return cost(m) <= cost(-m) ? m : -m;
}

/**
 * SHOOT in the direction the user is running (keyboard / stick scheme): runs roughly at goal
 * (within GOAL_CONE) get a gentle aim assist into the goal mouth, away from the keeper;
 * anything else is struck exactly where he is running. Set pieces keep their target picking.
 */
export function assistShotDir(engine: MomentEngine, intent: DirShotIntent): KickParams | null {
  const e = asEngine(engine);
  const charge = clamp(Number.isFinite(intent.charge) ? intent.charge : 0.5, 0, 1);
  const userCurl = clamp(Number.isFinite(intent.curl) ? intent.curl : 0, -1, 1);
  const d = kickDir(engine, intent.dir);
  if (!e) return { dir: d, power: 0.55 + 0.4 * charge, loft: 0.08, curl: userCurl };
  const set = e.frozen && e.owner === e.user ? e.setPiece : null;
  if (set) return assistShot(engine, { charge, curl: userCurl, offset: intent.offset, chip: intent.chip });
  const kind = kindFor(e);
  const b = e.state.ball.pos;
  const dist = hyp(HL - b.x, b.y);
  if (goalBound(engine, d)) {
    const ty = cornerFor(e, d);
    if (kind === 'header') return shotAt(e, ty * 0.92, 0.4, 0.95, 0, 'header');
    const gk = e.gkThem;
    const gkOff = gk ? HL - gk.st.pos.x : 0;
    if (intent.chip && kind === 'ground' && gkOff > 4.5 && dist < 30) {
      return shotAt(e, ty * 0.7, 1.9, clamp(0.3 + dist * 0.014, 0.38, 0.78), 0, 'ground', 0.5);
    }
    const power = clamp(0.76 + 0.21 * charge, 0.3, 0.97);
    const curl = Math.abs(userCurl) > 0.05 ? userCurl * 0.9 : autoCurl(e, ty, kind);
    const tz = kind === 'volley' ? 0.5 : dist < 12 ? 0.35 : 0.6;
    return shotAt(e, ty, tz, power, curl, kind);
  }
  // exactly where he is running: a driven ball (lofted when fully charged)
  if (kind === 'header') return { dir: d, power: 0.85, loft: 0.25, curl: 0 };
  return { dir: d, power: clamp(0.45 + 0.5 * charge, 0.3, 0.97), loft: charge > 0.8 ? 0.24 : kind === 'volley' ? 0.1 : 0.05, curl: userCurl * 0.9 };
}

function prefDir(e: Engine, intent: PassIntent): Vec2 {
  const b = e.state.ball.pos;
  if (intent.toward) {
    const dx = intent.toward.x - b.x;
    const dy = intent.toward.y - b.y;
    const l = hyp(dx, dy);
    if (l > 0.5) return { x: dx / l, y: dy / l };
  }
  if (intent.pref) {
    const l = hyp(intent.pref.x, intent.pref.y);
    if (l > 0.1) return { x: intent.pref.x / l, y: intent.pref.y / l };
  }
  const v = e.user.st.vel;
  const sp = hyp(v.x, v.y);
  if (sp > 1) return { x: v.x / sp, y: v.y / sp };
  return { x: 1, y: 0 };
}

function throughPick(e: Engine, intent: PassIntent): PassPick | null {
  const u = e.user;
  const b = e.state.ball.pos;
  const pd = prefDir(e, intent);
  let best: Agent | null = null;
  let bestV = -Infinity;
  for (const m of e.agents) {
    if (m.side !== 'us' || m === u || m.isGK || m.passive || m.stun > 0) continue;
    if (m.st.pos.x < b.x - 6) continue;
    const dx = m.st.pos.x - b.x;
    const dy = m.st.pos.y - b.y;
    const d = hyp(dx, dy) || 1;
    const v = m.st.pos.x * 0.12 + ((dx * pd.x + dy * pd.y) / d) * 1.2 - Math.max(0, d - 32) * 0.1;
    if (v > bestV) { bestV = v; best = m; }
  }
  if (!best) return null;
  const lead = 9;
  const vy = best.st.vel.y;
  const at = { x: clamp(best.st.pos.x + lead, -HL + 2, HL - 6), y: clamp(best.st.pos.y + vy * 0.6 - best.st.pos.y * 0.12, -HW + 2, HW - 2) };
  const dist = hyp(at.x - b.x, at.y - b.y);
  const risk = laneRisk(e, u, { x: b.x, y: b.y }, at, 15);
  return { id: best.id, at, lofted: risk > 0.9 || dist > 32 };
}

/** Which team-mate a pass would go to (cheap: call a few times per second for the UI). */
export function pickPass(engine: MomentEngine, intent: PassIntent): PassPick | null {
  const e = asEngine(engine);
  if (!e) return null;
  if (intent.through) return throughPick(e, intent);
  const u = e.user;
  const b = e.state.ball.pos;
  const pd = prefDir(e, intent);
  const opts = passOptions(e, u);
  const minCos = intent.cone ? Math.cos(intent.cone) : -2;
  let best: (typeof opts)[number] | null = null;
  let bestV = -Infinity;
  for (const o of opts) {
    const dx = o.at.x - b.x;
    const dy = o.at.y - b.y;
    const d = hyp(dx, dy) || 1;
    const cos = (dx * pd.x + dy * pd.y) / d;
    if (cos < minCos) continue;
    let v = o.value * 0.6 - o.risk * (o.lofted ? 0.3 : 0.7) + cos * (intent.cone ? 1.8 : 1.3) - (cos < -0.2 ? 2 : 0) - Math.abs(d - 16) * 0.015;
    if (intent.toward) v -= hyp(o.at.x - intent.toward.x, o.at.y - intent.toward.y) * 0.12;
    if (v > bestV) { bestV = v; best = o; }
  }
  if (!best && intent.cone) {
    // nobody that way: the most open team-mate ahead (else anyone)
    for (const o of opts) {
      const ahead = o.at.x > b.x - 3;
      const v = (ahead ? 2 : 0) + clamp(e.nearestOpp(o.to, o.at).d, 0, 10) * 0.25 - o.risk * 0.6 + o.value * 0.2;
      if (v > bestV) { bestV = v; best = o; }
    }
  }
  if (!best) return null;
  return { id: best.to.id, at: best.at, lofted: best.lofted || best.dist > 30 || (best.risk > 0.6 && best.dist > 12) };
}

/** Pass (or through ball) to the best team-mate for the intent, led into his run. */
export function assistPass(engine: MomentEngine, intent: PassIntent): KickParams | null {
  const e = asEngine(engine);
  const b = engine.state.ball.pos;
  if (!e) {
    const pd = intent.pref ?? { x: 1, y: 0 };
    const l = hyp(pd.x, pd.y) || 1;
    return { dir: { x: pd.x / l, y: pd.y / l }, power: 0.5, loft: 0, curl: 0 };
  }
  const set = e.frozen && e.owner === e.user ? e.setPiece : null;
  const pick = pickPass(engine, intent) ?? (set === 'corner' ? { id: null, at: bestBoxTarget(e), lofted: true } : null);
  if (!pick) {
    const pd = prefDir(e, intent);
    return { dir: pd, power: 0.45, loft: 0, curl: 0 };
  }
  const k = e.kicker(e.user);
  const from = ballFrom(e);
  const dist = hyp(pick.at.x - b.x, pick.at.y - b.y);
  if (pick.lofted) return solveLob(e.env, k, from, pick.at, intent.through ? 0.4 : 0.9, 0, 0.42);
  const arrive = intent.through ? 4.5 : clamp(4.5 + dist * 0.1, 5.5, 8.5);
  return groundPass(e.env, k, from, pick.at, arrive);
}

/** Who the user can pass to right now, and who would play a one-two back (cheap enough for ~5 Hz). */
export interface SupportCue {
  /** Team-mates with an open lane (8–30 m, onside, no opponent can step in) while the user has the ball. */
  open: string[];
  /** The other outfield team-mates (marked / lane shut / out of range). */
  covered: string[];
  /** Team-mate who gives the ball straight back if the user runs on after his pass (null = none). */
  oneTwo: string | null;
}

const NO_CUE: SupportCue = { open: [], covered: [], oneTwo: null };

export function supportInfo(engine: MomentEngine): SupportCue {
  const e = asEngine(engine);
  if (!e) return NO_CUE;
  const s = e.state;
  if (s.phase === 'intro' || s.phase === 'outcome' || s.phase === 'ended' || e.frozen) return NO_CUE;
  const u = e.user;
  let oneTwo: string | null = null;
  const k = e.lastKick;
  if (k && k.user && !k.isShot && !k.oppTouched && k.target >= 0 && s.time - k.t < 3.2) {
    const m = e.agents[k.target];
    const live = m && m.side === u.side && !m.isUser && !m.isGK
      && ((!e.owner && !k.completed) || (e.owner === m && m.receivedFrom === u.i && m.carryT < 2));
    if (live && hyp(m.st.pos.x - u.st.pos.x, m.st.pos.y - u.st.pos.y) < 32) oneTwo = m.id;
  }
  // the user on the ball (or about to strike it in the calm aim)
  const onBall = e.owner === u || (!e.owner && e.frozenForAim);
  if (!onBall) return oneTwo ? { open: [], covered: [], oneTwo } : NO_CUE;
  const { open, covered } = openMates(e, u);
  return { open: open.map((a) => a.id), covered: covered.map((a) => a.id), oneTwo };
}
