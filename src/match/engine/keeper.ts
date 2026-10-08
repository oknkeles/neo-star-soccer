/**
 * Goalkeeper AI: angle positioning, reaction delay, trajectory re-prediction (with a partial
 * read of side-spin, so late curl fools him), dives, catch vs parry, 1v1 rushes / smothers,
 * cross claiming, penalty guesses and distribution. Keepers handle every ball contact here
 * (the engine's generic interaction loop skips them).
 */
import type { Vec2 } from '../../core/types';
import { clamp } from '../../core/util';
import { BR, DT, GH, GW, HL } from './constants';
import type { Engine } from './engine';
import { distToGoal, hyp, segDist } from './geom';
import type { Agent, KeeperMem } from './internal';
import { ballSpeed } from './physics';
import { crossPlane, predictPath } from './solver';
import { passOptions, passParams } from './ai';

export function newKeeperMem(): KeeperMem {
  return {
    mode: 'set', react: 0, kickId: -1, repredict: 0, aim: null, aimT: 0, hands: { x: 0, y: 0, z: 1.2 },
    diveDir: { x: 0, y: 1 }, down: 0, guess: null, spinRead: 0.55, holdT: 0, diveT: 0, diveSide: 0, diveTarget: null,
    bias: 0, smother: 0, touchKey: '', lastTouch: -9, flight: 0,
  };
}

/** Reset a keeper between drill attempts / set pieces (keeps his skill-derived read). */
export function resetKeeper(a: Agent): void {
  const m = a.keeper;
  if (!m) return;
  const read = m.spinRead;
  Object.assign(m, newKeeperMem(), { spinRead: read });
  a.st.vel.x = 0; a.st.vel.y = 0;
  a.st.anim = 'gk_ready';
  a.st.animTime = 0;
  a.animLock = 0;
  a.stun = 0;
}

const gkSkill = (a: Agent) => clamp(a.a.goalkeeping, 1, 99) / 99;

/** Sharpness of the opposing keeper scales with difficulty; ours is neutral. */
function sharp(e: Engine, a: Agent): number {
  return a.side === 'them' ? clamp(e.setup.difficulty, 0, 1) - 0.5 - 0.35 * e.ease : 0;
}

function diveSpeed(e: Engine, a: Agent): number {
  return 3.9 + 1.6 * gkSkill(a) + 0.6 * sharp(e, a) + 0.4 * (clamp(a.a.acceleration, 1, 99) / 99);
}

/** How far his body travels in a full-length dive (the hands reach further). */
function diveTravel(e: Engine, a: Agent): number {
  return 1.2 + 0.5 * gkSkill(a) + 0.15 * sharp(e, a);
}

const DIVE_RAMP = 0.22;

function armReach(a: Agent): number {
  return 0.95 + 0.3 * gkSkill(a);
}

/** Where the keeper wants to stand: on the ball–goal line, a little off his line. */
function setPosition(e: Engine, a: Agent, m: KeeperMem, from?: Vec2): Vec2 {
  const b = from ?? e.state.ball.pos;
  const out = a.dir;
  const gx = -out * HL;
  const bu = (b.x - gx) * out;
  const dist = hyp(bu, b.y);
  const anchor = { x: gx, y: clamp(b.y * 0.1, -1.2, 1.2) };
  let depth: number;
  if (dist > 38) depth = clamp(2 + (dist - 38) * 0.12, 2, 7);
  else depth = clamp(0.5 + dist * 0.055, 0.5, 2.4);
  const ux = Math.max(0.15, bu);
  const l = hyp(ux, b.y - anchor.y) || 1;
  let x = gx + out * (ux / l) * depth;
  let y = anchor.y + ((b.y - anchor.y) / l) * depth;
  if (e.frozen && e.setPiece === 'free_kick') y += m.bias;
  y = clamp(y, -(GW - 0.25), GW - 0.25);
  if ((x - gx) * out < 0.25) x = gx + out * 0.25;
  return { x, y };
}

/** Is an outfield team-mate goal-side of the carrier, roughly in his path? */
function covered(e: Engine, a: Agent, c: Agent): boolean {
  const gx = -a.dir * HL;
  const cu = (c.st.pos.x - gx) * a.dir;
  for (const d of e.agents) {
    if (d.side !== a.side || d.isGK || d.passive || d.stun > 0) continue;
    const du = (d.st.pos.x - gx) * a.dir;
    if (du > cu - 0.3) continue;
    const r = segDist(d.st.pos.x, d.st.pos.y, c.st.pos.x, c.st.pos.y, gx, 0);
    if (r.d < 2.2) return true;
  }
  return false;
}

export function keeperTick(e: Engine, a: Agent, live: boolean): void {
  const m = a.keeper;
  if (!m) return;
  const s = e.state;
  const b = s.ball;
  if (m.smother > 0) m.smother -= DT;
  if (a.passive) return;

  // ── holding the ball ──
  if (e.owner === a) {
    m.mode = 'hold';
    m.holdT += DT;
    a.target = { x: a.st.pos.x, y: a.st.pos.y };
    a.urgency = 0;
    if (a.side === e.attackSide && m.holdT > 0.9 && s.phase !== 'outcome') distribute(e, a, m);
    return;
  }
  if (m.mode === 'hold') { m.mode = 'set'; m.holdT = 0; }

  // ── committed: diving / on the floor ──
  if (m.mode === 'dive') {
    m.diveT += DT;
    a.st.animTime += DT;
    const tgt = m.diveTarget;
    if (m.diveT < DIVE_RAMP) {
      // push-off: the dive accelerates over the first fifth of a second
      const acc = (diveSpeed(e, a) * 0.65 / DIVE_RAMP) * DT;
      a.st.vel.x += m.diveDir.x * acc;
      a.st.vel.y += m.diveDir.y * acc;
    }
    if (tgt) {
      const rem = (tgt.x - a.st.pos.x) * m.diveDir.x + (tgt.y - a.st.pos.y) * m.diveDir.y;
      const went = (a.st.pos.x - m.hands.x) * m.diveDir.x + (a.st.pos.y - m.hands.y) * m.diveDir.y;
      if (rem < armReach(a) * 0.55 || went > diveTravel(e, a)) { const k = Math.exp(-12 * DT); a.st.vel.x *= k; a.st.vel.y *= k; }
    }
    contact(e, a, m);
    if (m.diveT > 0.62) { m.mode = 'down'; m.down = 0.55 + 0.35 * (1 - gkSkill(a)); }
    return;
  }
  if (m.mode === 'down') {
    m.down -= DT;
    a.st.animTime += DT;
    const k = Math.exp(-8 * DT);
    a.st.vel.x *= k; a.st.vel.y *= k;
    contact(e, a, m);
    if (m.down <= 0) { m.mode = 'set'; a.animLock = 0; }
    return;
  }

  const home = setPosition(e, a, m);
  if (!live) {
    a.target = home;
    a.urgency = 0.7;
    return;
  }

  // ── penalty: stand on the line, commit on the kick ──
  if (e.setPiece === 'penalty' && e.frozen) {
    a.target = { x: -a.dir * (HL - 0.15), y: 0 };
    a.urgency = 0.5;
    return;
  }

  const k = e.lastKick;
  const loose = !e.owner;
  const key = `${k ? k.id : -1}:${b.lastTouchId ?? ''}`;
  if (loose && key !== m.touchKey) {
    m.touchKey = key;
    m.kickId = k ? k.id : -1;
    m.repredict = 0;
    m.aim = null;
    const fromOpp = !!k && k.side !== a.side;
    const screened = !!k?.setPiece && e.setPiece === 'free_kick' && e.agents.some((w) => w.wall);
    const wall = screened ? 0.32 + 0.1 * (1 - gkSkill(a)) : 0;
    m.react = (clamp(0.22 - 0.1 * gkSkill(a) - 0.06 * sharp(e, a), 0.08, 0.3) + wall) * (fromOpp ? 1 : 0.6);
    m.flight = 0;
    if (k && k.setPiece && e.setPiece === 'penalty' && fromOpp) penaltyGuess(e, a, m);
  }

  // ── 1v1: rush and smother ──
  const c = e.owner;
  if (c && c.side !== a.side && !c.isGK) {
    const dc = distToGoal(c.st.pos, c.dir);
    if (dc < 19 && Math.abs(c.st.pos.y) < 15 && !covered(e, a, c)) {
      m.mode = 'rush';
      const gx = -a.dir * HL;
      const ux = c.st.pos.x - gx;
      const uy = c.st.pos.y;
      const l = hyp(ux, uy) || 1;
      const out = clamp(dc * 0.5, 1.2, 8.5);
      a.target = { x: gx + (ux / l) * out, y: (uy / l) * out };
      a.urgency = 1;
      const d = hyp(c.st.pos.x - a.st.pos.x, c.st.pos.y - a.st.pos.y);
      if (d < 1.7 && m.smother <= 0 && c.carryT > 0.15) smother(e, a, c, m);
      return;
    }
  }

  if (loose) {
    if (m.react > 0) {
      m.react -= DT;
      m.mode = 'track';
      a.target = k && k.side !== a.side ? setPosition(e, a, m, k.from) : home;
      a.urgency = 0.85;
      contact(e, a, m);
      return;
    }
    if (m.guess !== null && k && k.setPiece) {
      // penalty dive already chosen
      startPenaltyDive(e, a, m);
      contact(e, a, m);
      return;
    }
    m.repredict -= DT;
    if (m.repredict <= 0) {
      m.repredict = 0.09;
      predictThreat(e, a, m);
    }
    const aim = m.aim;
    if (aim) {
      m.aimT -= DT;
      const dy = aim.y - a.st.pos.y;
      const dx = aim.x - a.st.pos.x;
      const lateral = hyp(dx, dy);
      const standReach = 0.62 + 0.25 * gkSkill(a);
      if (lateral > standReach || aim.z > 2.25) {
        const need = Math.min(Math.max(0, lateral - armReach(a)), diveTravel(e, a)) / diveSpeed(e, a) + DIVE_RAMP * 0.35;
        // on long flights he sets his feet and commits early (late curl and dip beat him)
        const lead = 0.1 + clamp((m.flight - 0.7) * 0.35, 0, 0.22);
        if (m.aimT <= need + lead || m.aimT < 0.3) {
          startDive(e, a, m, aim);
          contact(e, a, m);
          return;
        }
      }
      m.mode = 'track';
      // stance is set where the shot was struck; only a shuffle before the dive
      const base = k ? setPosition(e, a, m, k.from) : home;
      const shuffle = clamp(aim.y - base.y, -0.7, 0.7);
      a.target = { x: base.x, y: lateral <= standReach ? aim.y : base.y + shuffle };
      a.urgency = lateral <= standReach ? 0.9 : 0.55;
      contact(e, a, m);
      return;
    }
    // claim a cross / loose ball in his area
    if (claim(e, a, m)) { contact(e, a, m); return; }
  }
  m.mode = 'set';
  a.target = home;
  a.urgency = loose && ballSpeed(b) > 8 ? 1 : 0.75;
  contact(e, a, m);
}

/** Predict (with his imperfect spin read) where a loose ball heading at goal will cross his plane. */
function predictThreat(e: Engine, a: Agent, m: KeeperMem): void {
  const b = e.state.ball;
  const out = a.dir;
  const gx = -out * HL;
  m.aim = null;
  if (b.vel.x * out > -2.5) return;
  const path = predictPath(b, e.env, 2.2, 2, m.spinRead, e.aux);
  const line = crossPlane(path, gx);
  if (!line) return;
  const onTarget = Math.abs(line.y) < GW + 0.35 && line.z < GH + 0.25;
  if (!onTarget) return;
  // meet it in front of him if the ball is still ahead of his plane
  const kx = a.st.pos.x;
  const ahead = (b.pos.x - kx) * out > 0.3;
  const hit = ahead ? crossPlane(path, kx) ?? line : line;
  m.aim = { x: hit.x, y: clamp(hit.y, -GW - 0.6, GW + 0.6), z: Math.max(BR, hit.z) };
  m.aimT = hit.t;
  if (m.flight <= 0) m.flight = hit.t + (e.state.time - (e.lastKick?.t ?? e.state.time));
}

function startDive(e: Engine, a: Agent, m: KeeperMem, aim: { x: number; y: number; z: number }): void {
  const dx = aim.x - a.st.pos.x;
  const dy = aim.y - a.st.pos.y;
  const l = hyp(dx, dy) || 1;
  const sp = diveSpeed(e, a);
  m.mode = 'dive';
  m.diveT = 0;
  m.hands = { x: a.st.pos.x, y: a.st.pos.y, z: aim.z };
  m.diveTarget = { x: aim.x, y: aim.y, z: aim.z };
  m.diveDir = { x: dx / l, y: dy / l };
  a.st.vel.x = (dx / l) * sp * 0.35;
  a.st.vel.y = (dy / l) * sp * 0.35;
  // dive to his left or right (relative to facing out of goal)
  const fx = a.dir;
  const left = fx * dy > 0;
  m.diveSide = left ? 1 : -1;
  a.st.facing = a.dir === 1 ? 0 : Math.PI;
  e.lockAnim(a, left ? 'dive_left' : 'dive_right', 1.1);
}

function penaltyGuess(e: Engine, a: Agent, m: KeeperMem): void {
  const b = e.state.ball;
  const path = predictPath(b, e.env, 1.5, 2, 1, e.aux);
  const hit = crossPlane(path, -a.dir * HL);
  const trueSide = hit ? (Math.abs(hit.y) < 0.9 ? 0 : Math.sign(hit.y)) : 0;
  const read = clamp(0.06 + 0.16 * gkSkill(a) + 0.12 * sharp(e, a), 0.03, 0.35);
  if (e.rng.chance(read)) m.guess = trueSide;
  else {
    const r = e.rng.next();
    m.guess = r < 0.12 ? 0 : r < 0.56 ? 1 : -1;
  }
  m.react = 0.1 + 0.06 * e.rng.next();
  m.aimT = hit ? hit.t : 0.5;
  m.aim = hit ? { x: hit.x, y: hit.y, z: hit.z } : null;
}

function startPenaltyDive(e: Engine, a: Agent, m: KeeperMem): void {
  const g = m.guess ?? 0;
  m.guess = null;
  if (g === 0) {
    // stays big in the middle and reacts to what comes at him
    m.mode = 'track';
    a.target = { x: a.st.pos.x, y: 0 };
    a.urgency = 1;
    return;
  }
  const z = m.aim && Math.sign(m.aim.y) === g ? clamp(m.aim.z + e.rng.normal(0, 0.35), 0.3, 2.1) : 0.4 + 1.2 * e.rng.next();
  startDive(e, a, m, { x: -a.dir * (HL - 0.4), y: g * (GW - 0.6 - 0.8 * e.rng.next()), z });
}

/** Go for a cross or a loose ball in his area when he gets there first. */
function claim(e: Engine, a: Agent, m: KeeperMem): boolean {
  if (!a.eitPoint || !Number.isFinite(a.eit) || a.eit > 2.6) return false;
  const p = a.eitPoint;
  const gx = -a.dir * HL;
  const u = (p.x - gx) * a.dir;
  const k = e.lastKick;
  const pass = !!k && k.side === a.side && k.target === a.i;
  const inArea = u > -0.5 && u < (pass ? 40 : 14) && Math.abs(p.y) < (pass ? 34 : 13);
  if (!inArea) return false;
  let rival = Infinity;
  for (const o of e.agents) {
    if (o === a || o.passive || o.side === a.side) continue;
    rival = Math.min(rival, o.eit);
  }
  const sixYard = u < 6 && Math.abs(p.y) < 9.5;
  if (!pass && a.eit > rival + (sixYard ? 0.35 : -0.05)) return false;
  m.mode = 'claim';
  a.target = { x: p.x, y: p.y };
  a.urgency = 1;
  return true;
}

function smother(e: Engine, a: Agent, c: Agent, m: KeeperMem): void {
  const s = e.state;
  m.smother = 1.1;
  const gk = gkSkill(a);
  const pWin = clamp(0.28 + 0.4 * gk - 0.33 * (c.a.dribbling / 99) + 0.2 * sharp(e, a), 0.08, 0.72);
  const dx = s.ball.pos.x - a.st.pos.x;
  const dy = s.ball.pos.y - a.st.pos.y;
  const left = a.dir * dy > 0;
  e.lockAnim(a, left ? 'dive_left' : 'dive_right', 1.0);
  if (e.rng.chance(pWin)) {
    c.stun = 0.4;
    e.lockAnim(c, 'fall');
    if (c.isUser) { e.log.lostBall = true; e.log.lostT = s.time; }
    takeBall(e, a, m);
    e.emit({ t: 'save', by: a.id, held: true });
    e.emit({ t: 'crowd', level: 0.7 });
  } else {
    // beaten: he goes to ground the wrong way
    const l = hyp(dx, dy) || 1;
    a.st.vel.x = (dx / l) * 3;
    a.st.vel.y = (dy / l) * 3;
    m.mode = 'down';
    m.down = 0.9;
  }
}

function takeBall(e: Engine, a: Agent, m: KeeperMem): void {
  const k = e.lastKick;
  if (k && k.isShot && k.side !== a.side && k.result === 'pending') k.result = 'saved';
  e.giveBall(a, false);
  m.mode = 'hold';
  m.holdT = 0;
  m.lastTouch = e.state.time;
  e.lockAnim(a, 'catch');
}

/** Ball within his hands / body this tick? Resolve catch, parry or a fingertip miss. */
function contact(e: Engine, a: Agent, m: KeeperMem): void {
  const s = e.state;
  const b = s.ball;
  if (e.owner || m.smother > 0.6) return;
  if (b.lastTouchId === a.id && s.time - m.lastTouch < 0.45) return;
  if (s.phase === 'outcome' && e.state.outcome === 'goal') return;
  const gk = gkSkill(a);
  const dx = b.pos.x - a.st.pos.x;
  const dy = b.pos.y - a.st.pos.y;
  const z = b.pos.z;
  let ok = false;
  let stretch = 0;
  if (m.mode === 'dive') {
    const along = dx * m.diveDir.x + dy * m.diveDir.y;
    const lat = Math.abs(dx * m.diveDir.y - dy * m.diveDir.x);
    const top = Math.min(2.65, (m.diveTarget?.z ?? 1) + 0.75);
    ok = along > -0.55 && along < armReach(a) && lat < 0.42 && z < top;
    stretch = clamp(along / armReach(a), 0, 1);
  } else if (m.mode === 'down') {
    ok = hyp(dx, dy) < 1.0 && z < 0.55;
    stretch = 0.6;
  } else {
    const dh = hyp(dx, dy);
    const reach = 0.62 + 0.25 * gk;
    ok = dh < reach && z < 2.3 + 0.25 * gk;
    stretch = clamp(dh / reach, 0, 1) * 0.6 + (z > 1.9 ? 0.3 : 0);
  }
  if (!ok) return;
  const v = ballSpeed(b);
  const k = e.lastKick;
  const shot = !!k && k.isShot && k.side !== a.side && k.result === 'pending';
  const wet = e.env.restitution < 0.5 ? 1 : 0;
  // a slow, friendly ball is simply gathered
  if (!shot && v < 9 && z < 1.9) { takeBall(e, a, m); return; }
  const pBeat = shot ? clamp(0.03 + stretch * 0.22 * (1.15 - gk) + Math.max(0, v - 20) / 45 - 0.12 * sharp(e, a), 0, 0.45) : 0;
  if (e.rng.chance(pBeat)) {
    // fingertips, but it is past him
    m.smother = 0.7;
    b.vel.x *= 0.9; b.vel.y *= 0.9;
    return;
  }
  let pCatch = 1.3 - v / 21 - stretch * 0.5 - wet * 0.18 - (z > 2.0 ? 0.2 : 0) + 0.3 * gk + (m.mode === 'claim' ? 0.15 : 0);
  if (!shot) pCatch += 0.25;
  if (e.rng.chance(clamp(pCatch, 0.04, 0.97))) {
    takeBall(e, a, m);
    e.emit({ t: 'save', by: a.id, held: true });
    e.emit({ t: 'crowd', level: shot ? 0.7 : 0.35 });
    return;
  }
  parry(e, a, m, v, z);
}

function parry(e: Engine, a: Agent, m: KeeperMem, v: number, z: number): void {
  const s = e.state;
  const b = s.ball;
  const out = a.dir;
  const k = e.lastKick;
  const side = Math.sign(b.pos.y) || m.diveSide || 1;
  if (z > 1.95 && e.rng.chance(0.6)) {
    // tipped over the bar
    b.vel.x = -out * (1.5 + e.rng.next());
    b.vel.y = side * e.rng.float(0, 1.5);
    b.vel.z = 4 + 2 * e.rng.next();
  } else {
    const sp = clamp(v * (0.25 + 0.25 * e.rng.next()), 3, 13);
    const ang = Math.atan2(side * (0.55 + 0.9 * e.rng.next()), out);
    b.vel.x = Math.cos(ang) * sp;
    b.vel.y = Math.sin(ang) * sp;
    b.vel.z = 0.8 + 3 * e.rng.next();
  }
  b.spin.x = 0; b.spin.y = 0; b.spin.z = 0;
  b.lastTouchId = a.id;
  b.lastTouchSide = a.side;
  if (k && k.side !== a.side) {
    k.oppTouched = true;
    if (k.isShot && k.result === 'pending') k.result = 'saved';
  }
  e.touchSeq++;
  m.lastTouch = s.time;
  m.smother = 0.9;
  e.emit({ t: 'save', by: a.id, held: false });
  e.emit({ t: 'crowd', level: 0.85 });
}

/** Keeper in possession starts the attack (only when his side is the attacking side). */
function distribute(e: Engine, a: Agent, m: KeeperMem): void {
  const opts = passOptions(e, a).filter((o) => o.risk < 1.2);
  m.mode = 'set';
  m.holdT = 0;
  m.lastTouch = e.state.time;
  if (opts.length) {
    const p = passParams(e, a, opts[0]);
    e.execKick(a, p, { target: opts[0].to.i, isShot: false });
    return;
  }
  e.execKick(a, { dir: { x: a.dir, y: 0 }, power: 0.85, loft: 0.45, curl: 0 }, { isShot: false });
}
