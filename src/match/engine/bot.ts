/**
 * A competent automatic USER player for tests and headless careers. It only talks to the
 * engine through ControlCommands (like a human would), but reads engine internals to decide.
 */
import type { MomentEngine } from './api';
import type { ControlCommand, KickParams, Vec2 } from '../../core/types';
import type { Rng } from '../../core/rng';
import { clamp } from '../../core/util';
import { GW, HL, HW } from './constants';
import { Engine } from './engine';
import { baseXg, distToGoal, hyp, inBox, unit } from './geom';
import type { Agent } from './internal';
import { naturalCurlSign } from './kick';
import { passOptions, passParams } from './ai';
import { atDistance, groundPass, predictPath, solveLob, solveShot, launched } from './solver';

interface BotMem { wait: number; nextThink: number; lastTackle: number; lastCall: number; plan: number }
const mems = new WeakMap<object, BotMem>();

function memOf(e: object): BotMem {
  let m = mems.get(e);
  if (!m) { m = { wait: -1, nextThink: 0, lastTackle: -9, lastCall: -9, plan: 0 }; mems.set(e, m); }
  return m;
}

export function runBot(engine: MomentEngine, rng: Rng): void {
  if (engine.isFinished()) return;
  if (engine instanceof Engine) smartBot(engine, rng);
  else simpleBot(engine, rng);
}

const send = (e: MomentEngine, c: ControlCommand) => e.input(c);

// ───────────────────────── aim helpers ─────────────────────────

function shotAt(e: Engine, ty: number, tz: number, power: number, curl: number, kind: 'ground' | 'volley' | 'header' = 'ground'): KickParams {
  const u = e.user;
  const b = e.state.ball.pos;
  const spec = e.kickSpec(u, { dir: { x: 1, y: 0 }, power, loft: 0.05, curl }, kind, true);
  return solveShot(e.env, e.kicker(u), spec, { x: b.x, y: b.y, z: b.z }, HL, ty, tz, power, curl, kind === 'header' ? 0.3 : 0.06).params;
}

/** Corner away from the keeper (mostly), low when close. */
function botShot(e: Engine, rng: Rng, kind: 'ground' | 'volley' | 'header' = 'ground'): KickParams {
  const b = e.state.ball.pos;
  const gk = e.gkThem;
  const ky = gk ? gk.st.pos.y : 0;
  const far = Math.abs(ky - GW) > Math.abs(ky + GW) ? 1 : -1;
  const pick = rng.chance(0.8) ? far : -far;
  const ty = pick * (GW - 0.45 - 0.3 * rng.next());
  const d = distToGoal({ x: b.x, y: b.y }, 1);
  const tz = kind === 'header' ? 0.3 + 0.5 * rng.next() : d < 12 ? 0.25 + 0.6 * rng.next() : 0.3 + 1.3 * rng.next();
  const power = kind === 'header' ? 0.9 : clamp(0.72 + d * 0.006, 0.7, 0.92);
  const curl = kind === 'ground' && d > 18 ? 0.35 * naturalCurlSign(e.user.spec.foot) : 0;
  return shotAt(e, ty, tz, power, curl, kind);
}

/** Curled free kick that clears (or goes round) the wall. */
function freeKickShot(e: Engine, rng: Rng): KickParams {
  const u = e.user;
  const b = e.state.ball.pos;
  const nat = naturalCurlSign(u.spec.foot);
  const near = Math.sign(b.y) || 1;
  const order = rng.chance(0.5) ? [near, -near] : [-near, near];
  const walls = e.agents.filter((a) => a.wall);
  let fallback: KickParams | null = null;
  for (const side of order) {
    for (const tz of [1.75, 1.95, 2.1]) {
      for (const power of [0.8, 0.74, 0.86]) {
        const ty = side * (GW - 0.7 - 0.2 * rng.next());
        const p = shotAt(e, ty, tz, power, 0.85 * nat);
        fallback ??= p;
        if (clearsWall(e, p, walls)) return p;
      }
    }
  }
  return fallback ?? shotAt(e, 0, 2, 0.7, 0);
}

function clearsWall(e: Engine, p: KickParams, walls: Agent[]): boolean {
  if (!walls.length) return true;
  const u = e.user;
  const b = e.state.ball.pos;
  const spec = e.kickSpec(u, p, 'ground', true);
  const path = predictPath(launched({ x: b.x, y: b.y, z: b.z }, p, e.kicker(u), spec), e.env, 2.5, 2);
  for (const w of walls) {
    const d = hyp(w.st.pos.x - b.x, w.st.pos.y - b.y);
    const at = atDistance(path, d);
    if (!at) continue;
    if (hyp(at.x - w.st.pos.x, at.y - w.st.pos.y) < 0.55 && at.z < 2.45) return false;
  }
  const g = atDistance(path, distToGoal({ x: b.x, y: b.y }, 1));
  return !g || g.z < 2.35;
}

function crossTo(e: Engine, rng: Rng): KickParams {
  const b = e.state.ball.pos;
  const mates = e.agents.filter((a) => a.side === 'us' && !a.isUser && !a.isGK && inBox(a.st.pos, 1));
  let tgt: Vec2 = { x: HL - 8, y: rng.float(-3, 3) };
  if (mates.length) {
    const m = mates.reduce((p, q) => (e.nearestOpp(q).d > e.nearestOpp(p).d ? q : p));
    tgt = { x: m.st.pos.x + 1.2, y: m.st.pos.y * 0.9 };
  }
  const curl = 0.35 * (b.y > 0 ? 1 : -1) * (b.x > HL - 3 ? 1 : -1);
  return solveLob(e.env, e.kicker(e.user), { x: b.x, y: b.y, z: b.z }, tgt, 1.8, curl, 0.45);
}

// ───────────────────────── the brain ─────────────────────────

function smartBot(e: Engine, rng: Rng): void {
  const s = e.state;
  if (s.phase === 'intro' || s.phase === 'outcome' || s.phase === 'ended') return;
  const m = memOf(e);
  const u = e.user;
  const owner = e.owner;

  // set pieces & drill restarts: take a breath, then strike
  if (e.frozen && owner === u) {
    if (m.wait < 0 || m.wait < s.time - 30) m.wait = s.time + 0.35 + 0.4 * rng.next();
    if (s.time < m.wait) return;
    m.wait = -1;
    let p: KickParams;
    if (e.setPiece === 'penalty') {
      const side = rng.chance(0.5) ? 1 : -1;
      p = shotAt(e, side * (GW - 0.6 - 0.25 * rng.next()), 0.35 + 0.9 * rng.next(), 0.74, 0);
    } else if (e.setPiece === 'corner') {
      p = crossTo(e, rng);
    } else if (distToGoal({ x: s.ball.pos.x, y: s.ball.pos.y }, 1) < 31) {
      p = freeKickShot(e, rng);
    } else {
      p = crossTo(e, rng);
    }
    send(e, { kind: 'kick', params: p });
    return;
  }

  if (owner === u) { withBall(e, rng, m); return; }
  if (!owner) { looseBall(e, rng, m); return; }
  if (owner.side === 'us') { supportRun(e, rng, m); return; }
  defendCarrier(e, rng, m, owner);
}

function withBall(e: Engine, rng: Rng, m: BotMem): void {
  const s = e.state;
  const u = e.user;
  const pos = u.st.pos;
  if (s.time < m.nextThink) return;
  m.nextThink = s.time + 0.12;
  // passing drill: find the team-mate on the pitch
  if (e.setup.type === 'drill_passing') {
    const tg = e.agents.find((a) => a.side === 'us' && !a.isUser && !a.isGK && Math.abs(a.st.pos.y) < HW);
    if (tg) {
      send(e, { kind: 'kick', params: groundPass(e.env, e.kicker(u), s.ball.pos, tg.st.pos, 6.5) });
      return;
    }
  }
  if (e.attackSide === 'them') {
    // won it back: play the safe ball upfield
    const opts = passOptions(e, u);
    if (opts.length && opts[0].value > -0.4) send(e, { kind: 'kick', params: passParams(e, u, opts[0]) });
    else send(e, { kind: 'kick', params: { dir: unit(1, -pos.y * 0.02), power: 0.85, loft: 0.4, curl: 0 } });
    return;
  }
  const dGoal = distToGoal(pos, 1);
  const pressure = e.pressureOn(u);
  const xg = baseXg(pos, 1);
  const finishing = e.setup.type === 'drill_finishing';
  if (dGoal < 16.5 || (dGoal < 24 && xg > 0.06 && (pressure > 0.5 || rng.chance(0.06))) || (finishing && (dGoal < 20 || s.time - e.possSince > 1.5))) {
    send(e, { kind: 'kick', params: botShot(e, rng) });
    return;
  }
  // wide in the final third: cross it
  if (Math.abs(pos.y) > 15 && pos.x > HL - 24 && rng.chance(0.35)) {
    send(e, { kind: 'kick', params: crossTo(e, rng) });
    return;
  }
  const opts = passOptions(e, u);
  const best = opts[0];
  const buildUp = e.setup.type === 'build_up';
  if (best && ((pressure > 0.5 && best.value > 0.05) || (best.value > 0.75 && rng.chance(buildUp ? 0.5 : 0.15)) || (buildUp && pressure > 0.3 && best.value > -0.1))) {
    send(e, { kind: 'kick', params: passParams(e, u, best) });
    return;
  }
  // dribble at goal, away from the nearest defender
  const near = e.nearestOpp(u);
  let dx = HL - 6 - pos.x;
  let dy = -pos.y * 0.45;
  if (near.o && near.d < 5) {
    const ax = pos.x - near.o.st.pos.x;
    const ay = pos.y - near.o.st.pos.y;
    const l = hyp(ax, ay) || 1;
    dx += (ax / l) * (5 - near.d) * 2.5;
    dy += (ay / l) * (5 - near.d) * 3.5;
  }
  const d = unit(dx, dy);
  send(e, { kind: 'moveDir', dir: d });
  send(e, { kind: 'sprint', on: near.d > 6 });
}

function looseBall(e: Engine, rng: Rng, m: BotMem): void {
  const s = e.state;
  const u = e.user;
  const b = s.ball.pos;
  const k = e.lastKick;
  // a one-touch finish when the ball is at him in the final third
  if (e.canKick() && e.attackSide === 'us' && b.x > HL - 30 && !(k?.user && s.time - k.t < 0.5)) {
    const r = e.reach(u);
    const kind = r.kind;
    if (kind !== 'ground' || distToGoal({ x: b.x, y: b.y }, 1) < 20) {
      send(e, { kind: 'kick', params: botShot(e, rng, kind) });
      return;
    }
  }
  if (e.canKick() && e.attackSide === 'them' && b.z > 0.5) {
    // defending an aerial ball: clear it
    send(e, { kind: 'kick', params: { dir: unit(1, b.y > 0 ? 0.5 : -0.5), power: 0.9, loft: 0.6, curl: 0 } });
    return;
  }
  const mine = (k && k.target === u.i && k.side === 'us') || u.eit < 2.6;
  if (u.eitPoint && mine && Number.isFinite(u.eit)) {
    send(e, { kind: 'move', target: u.eitPoint });
    send(e, { kind: 'sprint', on: u.eit > 0.6 });
    return;
  }
  if (e.attackSide === 'them') {
    const goal = { x: -HL, y: 0 };
    send(e, { kind: 'move', target: { x: (b.x * 2 + goal.x) / 3, y: b.y * 0.6 } });
    send(e, { kind: 'sprint', on: false });
    return;
  }
  supportRun(e, rng, m);
}

function supportRun(e: Engine, rng: Rng, m: BotMem): void {
  const s = e.state;
  const u = e.user;
  const pos = u.st.pos;
  const line = e.offsideX('us');
  const owner = e.owner;
  const ahead = owner ? Math.max(owner.st.pos.x + 6, pos.x) : pos.x + 3;
  const tx = Math.min(line - 0.8, HL - 8, ahead + 4);
  const ty = clamp(pos.y * 0.85 + (owner && Math.abs(owner.st.pos.y - pos.y) < 6 ? (pos.y > owner.st.pos.y ? 4 : -4) : 0), -HW + 3, HW - 3);
  send(e, { kind: 'move', target: { x: tx, y: ty } });
  send(e, { kind: 'sprint', on: false });
  if (owner && owner.side === 'us' && s.time - m.lastCall > 2 && e.nearestOpp(u).d > 4 && rng.chance(0.08)) {
    m.lastCall = s.time;
    send(e, { kind: 'callForBall', through: rng.chance(0.3) });
  }
}

function defendCarrier(e: Engine, rng: Rng, m: BotMem, c: Agent): void {
  const s = e.state;
  const u = e.user;
  const own = { x: -HL, y: 0 };
  const g = unit(own.x - c.st.pos.x, own.y - c.st.pos.y);
  const d = hyp(c.st.pos.x - u.st.pos.x, c.st.pos.y - u.st.pos.y);
  const close = d < 3 ? 0.7 : 1.4;
  send(e, { kind: 'move', target: { x: c.st.pos.x + g.x * close + c.st.vel.x * 0.25, y: c.st.pos.y + g.y * close + c.st.vel.y * 0.25 } });
  send(e, { kind: 'sprint', on: d > 4 });
  const fx = Math.cos(c.st.facing);
  const fy = Math.sin(c.st.facing);
  const behind = ((u.st.pos.x - c.st.pos.x) * fx + (u.st.pos.y - c.st.pos.y) * fy) / (d || 1) < -0.35;
  if (d < 1.25 && !behind && !c.isGK && s.time - m.lastTackle > 0.6 && rng.chance(0.35)) {
    m.lastTackle = s.time;
    send(e, { kind: 'tackle', slide: false });
  }
}

// ───────────────────────── fallback for foreign engines ─────────────────────────

function simpleBot(engine: MomentEngine, rng: Rng): void {
  const s = engine.state;
  if (s.phase === 'intro' || s.phase === 'outcome' || s.phase === 'ended') return;
  const me = s.players.find((p) => p.isUser);
  if (!me) return;
  if (engine.canKick()) {
    const b = s.ball.pos;
    const ty = (rng.chance(0.5) ? 1 : -1) * (GW - 0.6);
    engine.input({ kind: 'kick', params: { dir: unit(HL - b.x, ty - b.y), power: 0.8, loft: b.x > HL - 20 ? 0.08 : 0.15, curl: 0 } });
    return;
  }
  engine.input({ kind: 'move', target: { x: s.ball.pos.x - 0.3, y: s.ball.pos.y } });
}
