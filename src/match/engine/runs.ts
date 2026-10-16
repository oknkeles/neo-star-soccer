/**
 * Runs in behind. Forwards and wide men wait on the shoulder of the last defender while the man on
 * the ball cannot play them in, and burst (diagonal / curved, staggered: one at a time) once he has
 * the ball under control, his head up and no one on top of him; a run that is not found bends along
 * the line instead of straying offside, then drops back onside and is re-timed. The attacking
 * midfielder (or the most advanced central midfielder) arrives late from deep as the third man.
 * Also: the projected burst of every live runner (the calm-mode cue, the pass assist's target).
 */
import type { Vec2 } from '../../core/types';
import { clamp } from '../../core/util';
import type { MomentEngine } from './api';
import { HL, HW } from './constants';
import { Engine } from './engine';
import { hyp } from './geom';
import type { Agent, RunMem } from './internal';
import { locoStep } from './locomotion';

export interface RunSpot { x: number; y: number; urg: number; duty: Agent['duty'] }

/** Is the carrier ready to play a forward runner in (on the ball, facing up, not hounded)? */
export function passerReady(e: Engine, c: Agent): boolean {
  if (e.owner !== c || c.isGK) return false;
  if (e.pressureOn(c) > 0.7) return false;
  if (c.isUser) {
    const v = c.st.vel;
    const sp = hyp(v.x, v.y);
    return sp < 1 || v.x * c.dir > -0.2 * sp;
  }
  return Math.cos(c.st.facing) * c.dir > -0.2;
}

const forward = (m: Agent) => m.slot.role === 'ST' || m.slot.role === 'W';
/** Seconds from one burst to the next (runs are staggered, not all at once). */
const STAGGER = 0.55;
/** Longest a run bends along the line waiting for the ball before he drops back. */
const BEND_MAX = 0.9;

/** The shoulder spot he holds, and where his burst goes (diagonal across his marker / into the channel). */
function runGeometry(e: Engine, m: Agent, c: Agent, p: Vec2, line: number, kind: RunMem['kind']): { hold: Vec2; end: Vec2 } {
  const dir = c.dir;
  const pu = p.x * dir;
  const endU = Math.min(line + 10.5, HL - 7);
  if (kind === 'third') {
    // arriving late from deep, through the inside channel
    const y = clamp(m.st.pos.y * 0.8 + p.y * 0.2, -14, 14);
    return { hold: { x: m.st.pos.x, y: m.st.pos.y }, end: { x: dir * Math.min(line + 8, HL - 8), y: clamp(y + Math.sign(y - p.y || 1) * 2, -15, 15) } };
  }
  if (m.slot.role === 'ST') {
    // between the centre-backs, a step off the ball's line; the burst goes across the near man
    // (away from the ball: the blind side, which opens the angle for the pass)
    const hy = clamp(p.y * 0.35 + (m.st.pos.y - p.y) * 0.25, -10, 10);
    const away = Math.sign(hy - p.y) || (m.i % 2 ? 1 : -1);
    const hold = { x: dir * Math.min(line - 2.6, pu + 24), y: hy };
    return { hold, end: { x: dir * endU, y: clamp(hy + away * 4.5, -13, 13) } };
  }
  // wide men: high on the line in their lane; the burst attacks the channel inside the full-back
  // (or, from inside, the space outside him)
  const sg = Math.sign(m.st.pos.y) || (m.i % 2 ? 1 : -1);
  const ay = Math.abs(m.st.pos.y);
  const hy = sg * clamp(Math.max(ay, 13), 13, HW - 6);
  const hold = { x: dir * Math.min(line - 3.0, pu + 30), y: hy };
  const ey = ay > 15 ? sg * clamp(ay - 7, 8, 15) : sg * clamp(ay + 5, 10, 19);
  return { hold, end: { x: dir * endU, y: ey } };
}

/**
 * Timed runs around the carrier `c` (at `p`): forwards and the third man, while there is room in
 * behind and the ball is in the middle / final third. Returns spots for runners on the move
 * (bursting, bending along the line, dropping back onside) and, when the user is on the ball, for
 * those waiting on the shoulder; with a team-mate on the ball a waiting runner is left to the
 * support plan (an option in his lane) and goes from there.
 */
export function timedRuns(e: Engine, c: Agent, p: Vec2, mates: Agent[]): Map<number, RunSpot> {
  const out = new Map<number, RunSpot>();
  const s = e.state;
  const t = s.time;
  const dir = c.dir;
  const line = e.offsideX(c.side) * dir;
  const pu = p.x * dir;
  const owned = e.owner === c;
  const room = line < HL - 9 && line - pu < 38 && pu > -HL / 3 - 6 && !c.isGK;
  const vis = clamp(c.a.vision, 1, 99) / 99;
  // time to get it under control and look up (the user: a beat)
  const look = c.isUser ? 0.2 : 0.18 + 0.3 * (1 - vis);
  // (the user calling for it from a team-mate: no competing runs — the ball is his)
  const userCalls = !c.isUser && c.side === e.user.side && e.state.time < e.ctl.callUntil;
  const ready = owned && room && !userCalls && c.carryT >= look && passerReady(e, c);
  let going = 0;
  let lastGo = -Infinity;
  for (const m of mates) {
    const r = m.run;
    if (r && (r.phase === 'go' || r.phase === 'bend')) { going++; lastGo = Math.max(lastGo, r.t); }
  }
  // the third man: the most advanced central midfielder (attacking one first)
  let third: Agent | null = null;
  for (const m of mates) {
    const ro = m.slot.role;
    if (ro !== 'AM' && ro !== 'CM') continue;
    if (!third || (ro === 'AM' && third.slot.role !== 'AM') || (ro === third.slot.role && m.st.pos.x * dir > third.st.pos.x * dir)) third = m;
  }
  let forwardsLive = false;
  for (const m of mates) if (forward(m) && m.run && m.run.phase !== 'recover') forwardsLive = true;
  for (const m of mates) {
    const kind: RunMem['kind'] | null = forward(m) ? 'behind' : m === third ? 'third' : null;
    if (!kind) { m.run = null; continue; }
    const u = m.st.pos.x * dir;
    let r = m.run ?? null;
    if (!room && !(r && r.phase === 'go' && !owned)) {
      // no space in behind (or the ball deep in our half): the support plan has him
      m.run = null;
      continue;
    }
    if (kind === 'third' && (!r || r.phase === 'hold')) {
      // the third man only goes when a forward is pinning the line, from up to ~15 m behind it
      const can = ready && forwardsLive && t >= (r?.cool ?? 0) && going < 2 && t - lastGo >= STAGGER && u > line - 15 && u < line - 2
        && u > pu - 3 && e.rng.chance(0.18 + 0.2 * (clamp(m.a.vision, 1, 99) / 99));
      if (!can) { if (!r) m.run = null; else r.c = c.i; continue; }
    }
    const g = runGeometry(e, m, c, p, line, kind);
    if (!r) {
      r = { kind, phase: 'hold', t, end: g.end, side: Math.sign(g.end.y - m.st.pos.y) || 1, c: c.i, cool: t + 0.15 * (m.i % 3) };
      // a run already on (the counter's breakaway runners, an older plan): keep it going
      if (m.runT > 0 && m.runTarget) { r.phase = 'go'; r.end = { x: m.runTarget.x, y: m.runTarget.y }; }
      m.run = r;
    }
    r.c = c.i;
    if (r.phase === 'hold' || r.phase === 'recover') { r.end = g.end; r.side = Math.sign(g.end.y - m.st.pos.y) || r.side; }
    if (kind === 'third' && r.phase === 'hold') { r.phase = 'go'; r.t = t; going++; lastGo = t; }
    const offside = owned && u > line + 0.2 && u > pu + 0.2;
    if (offside && r.phase !== 'recover') { r.phase = 'recover'; r.t = t; r.cool = Math.max(r.cool, t + 0.7); }
    if (r.phase === 'hold') {
      // (a wide man can start from deeper: his run is a long diagonal)
      const near = u > line - (m.slot.role === 'W' ? 14 : 9) && u <= line + 0.2 && u > pu - 4;
      const pGo = 0.24 + 0.22 * (clamp(m.a.vision, 1, 99) / 99) + 0.12 * (clamp(m.a.positioning, 1, 99) / 99) + (c.isUser ? 0.12 * e.ease : 0);
      if (ready && near && t >= r.cool && going < 2 && t - lastGo >= STAGGER && e.rng.chance(pGo)) {
        r.phase = 'go'; r.t = t; going++; lastGo = t;
      } else {
        m.runT = 0;
        // waiting for the user's pass: on the shoulder of the last man, in his channel, ready to go
        // (with a team-mate on the ball the support plan keeps him an option in his lane — the
        // burst comes from there)
        if (c.isUser) {
          const d = hyp(g.hold.x - m.st.pos.x, g.hold.y - m.st.pos.y);
          out.set(m.i, { x: g.hold.x, y: g.hold.y, urg: d > 6 ? 0.86 : 0.7, duty: 'support' });
        }
        continue;
      }
    }
    if (r.phase === 'go') {
      if (owned && u >= line - 0.5) { r.phase = 'bend'; r.t = t; }
      else if (t - r.t > 3 || hyp(r.end.x - m.st.pos.x, r.end.y - m.st.pos.y) < 1.5) { r.phase = 'recover'; r.t = t; r.cool = t + 0.6; }
      else {
        out.set(m.i, { x: r.end.x, y: r.end.y, urg: 1, duty: 'run' });
        m.runT = Math.max(m.runT, 0.5); m.runTarget = { x: r.end.x, y: r.end.y };
        continue;
      }
    }
    if (r.phase === 'bend') {
      if (owned && u < line - 1.6 && ready) {
        // the line dropped off: on again
        r.phase = 'go'; r.t = t;
        out.set(m.i, { x: r.end.x, y: r.end.y, urg: 1, duty: 'run' });
        continue;
      }
      if (t - r.t <= BEND_MAX && owned) {
        // curve along the line (onside) the way his run goes, still at pace
        const by = clamp(m.st.pos.y + r.side * 4, -HW + 3, HW - 3);
        out.set(m.i, { x: dir * (line - 0.4), y: by, urg: 0.85, duty: 'run' });
        m.runT = Math.max(m.runT, 0.3); m.runTarget = { x: r.end.x, y: r.end.y };
        continue;
      }
      // not found: drop back onside and time it again
      r.phase = 'recover'; r.t = t; r.cool = t + 0.7 + 0.5 * e.rng.next();
    }
    // recover
    m.runT = 0;
    out.set(m.i, { x: dir * Math.min(line - 2.2, u), y: g.hold.y, urg: offside ? 0.95 : 0.72, duty: 'support' });
    if (!offside && t - r.t > 0.5) r.phase = 'hold';
  }
  return out;
}

/** Live runner (bursting / bending along the line) or one on the shoulder ready to go. */
export function runnerState(m: Agent): 'live' | 'ready' | null {
  const r = m.run;
  if (r) return r.phase === 'go' || r.phase === 'bend' ? 'live' : r.phase === 'hold' ? 'ready' : null;
  return m.runT > 0 && m.runTarget ? 'live' : null;
}

/** Where his burst goes if the ball is played now. */
function burstTarget(m: Agent): Vec2 | null {
  const r = m.run;
  if (r) return r.end;
  return m.runT > 0 && m.runTarget ? m.runTarget : null;
}

/**
 * His projected run for the next `T` s (samples every `dt`): a sprint toward the end of his burst
 * with his own acceleration and turning (locomotion), from where he is and how he is moving now.
 */
export function runPath(e: Engine, m: Agent, T = 1.5, dt = 0.1): Vec2[] {
  const tg = burstTarget(m);
  const out: Vec2[] = [];
  if (!tg) return out;
  const fatigue = 0.78 + 0.22 * m.st.stamina;
  const lp = e.locoParams(m, fatigue, false);
  const pos = { x: m.st.pos.x, y: m.st.pos.y };
  const vel = { x: m.st.vel.x, y: m.st.vel.y };
  let facing = m.st.facing;
  const sub = 3;
  const h = dt / sub;
  // past the end of his burst he runs on the same way (the ball can be played beyond it)
  let ux = tg.x - pos.x;
  let uy = tg.y - pos.y;
  for (let k = 1; k * dt <= T + 1e-6; k++) {
    for (let j = 0; j < sub; j++) {
      const dx = tg.x - pos.x;
      const dy = tg.y - pos.y;
      const d = hyp(dx, dy);
      if (d > 1.2) { ux = dx / d; uy = dy / d; }
      else { const l = hyp(ux, uy) || 1; ux /= l; uy /= l; }
      const want = { x: ux * lp.vtop, y: uy * lp.vtop };
      locoStep(vel, want, facing, lp, h);
      pos.x += vel.x * h;
      pos.y += vel.y * h;
      const sp = hyp(vel.x, vel.y);
      if (sp > 1.2) facing = Math.atan2(vel.y, vel.x);
    }
    out.push({ x: clamp(pos.x, -HL + 0.5, HL - 0.5), y: clamp(pos.y, -HW + 0.5, HW - 0.5) });
  }
  return out;
}

export interface RunnerCue {
  id: string;
  /** Projected run (pitch frame), one point every 0.1 s for ~1.5 s. */
  pts: Vec2[];
  /** Already bursting / bending along the line (true) or waiting on the shoulder to go (false). */
  live: boolean;
}

let cueCache: { e: Engine; key: string; cues: RunnerCue[] } | null = null;

/**
 * The user's team-mates making (or about to make) a run in behind, with their projected runs:
 * the calm mode shows them while the game is frozen (draw the ball onto one and he runs onto it).
 */
export function runnerCues(engine: MomentEngine): RunnerCue[] {
  const e = engine instanceof Engine ? engine : null;
  if (!e) return [];
  const s = e.state;
  if (s.phase === 'intro' || s.phase === 'outcome' || s.phase === 'ended' || e.frozen) return [];
  const u = e.user;
  const onBall = e.owner === u || (!e.owner && e.frozenForAim);
  if (!onBall) return [];
  const key = `${s.time.toFixed(3)}|${e.touchSeq}`;
  if (cueCache && cueCache.e === e && cueCache.key === key) return cueCache.cues;
  const line = e.offsideX(u.side) * u.dir;
  const bu = s.ball.pos.x * u.dir;
  const cues: RunnerCue[] = [];
  for (const m of e.agents) {
    if (m.side !== u.side || m.isUser || m.isGK || m.passive || m.stun > 0) continue;
    const st = runnerState(m);
    if (!st) continue;
    const mu = m.st.pos.x * u.dir;
    // (onside, a real threat in behind)
    if (mu > line + 0.2 && mu > bu + 0.2) continue;
    if (st === 'ready' && mu < line - 7.5) continue;
    const pts = runPath(e, m);
    if (pts.length) cues.push({ id: m.id, pts, live: st === 'live' });
  }
  cueCache = { e, key, cues };
  return cues;
}
