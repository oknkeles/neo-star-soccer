/**
 * Runs-in-behind / through-ball / AI-skill measurement harness. A scripted "human" carries the ball
 * in midfield and plays balls in behind the way a player would (R = through ball, or SPACE-freeze
 * and a line drawn into the space ahead of a runner), lays it off for team-mates, or defends; we
 * watch the AI of both teams behaviourally (only engine state every version has, so the same file
 * measures an older snapshot like-for-like):
 *  - runs in behind while the user is on the ball (per minute, offside share, live-runner share);
 *  - the user's through balls: team-mate first to it, commit time, taken in stride, offside, and
 *    the shots / goals that follow;
 *  - AI skills: beating a defender, shots on target, clear chances scored, first touch under pressure.
 */
import type { MomentType, Position, Vec2 } from '../../../core/types';
import { assistPass, assistShotDir, createMoment } from '../api';
import { HL, HW } from '../constants';
import type { Engine } from '../engine';
import type { Agent } from '../internal';
import { CalmAim } from '../../controls/calm';
import { makeSetup } from './helpers';

const STEP = 1 / 60;
const norm = (x: number, y: number): Vec2 => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export type RunVariant = 'R' | 'calm' | 'mates' | 'defend';

interface Acc {
  ep: number;
  possT: number; liveT: number; sampleT: number;
  runs: number; runsOff: number;
  thrN: number; thrFirst: number; thrOpp: number; thrOut: number; thrOff: number; thrUser: number; thrNone: number;
  reactSum: number; reactN: number; strideN: number; recvN: number;
  thrShots: number; thrGoals: number;
  dribN: number; dribBeat: number; dribLost: number; dribHeld: number;
  aiShots: number; aiOn: number; clearN: number; clearGoals: number;
  ftN: number; ftKept: number; ftAway: number; ftAwayN: number; ftMis: number;
  stepSum: number; stepN: number;
  goalsUs: number; goalsThem: number; goalBy: Record<string, number>; toUser: number; userShots: number; userTouches: number; thrNext: Record<string, number>;
}

const newAcc = (): Acc => ({
  ep: 0, possT: 0, liveT: 0, sampleT: 0, runs: 0, runsOff: 0, thrN: 0, thrFirst: 0, thrOpp: 0, thrOut: 0, thrOff: 0, thrUser: 0, thrNone: 0,
  reactSum: 0, reactN: 0, strideN: 0, recvN: 0, thrShots: 0, thrGoals: 0, dribN: 0, dribBeat: 0, dribLost: 0, dribHeld: 0,
  aiShots: 0, aiOn: 0, clearN: 0, clearGoals: 0, ftN: 0, ftKept: 0, ftAway: 0, ftAwayN: 0, ftMis: 0, stepSum: 0, stepN: 0, goalsUs: 0, goalsThem: 0, goalBy: {}, toUser: 0, userShots: 0, userTouches: 0, thrNext: {},
});

/** Draw a stroke from the ball to `end` (the calm controls), return the aim. */
function drawAim(e: Engine, end: Vec2): CalmAim {
  const b = e.state.ball.pos;
  const aim = new CalmAim(e, { dir: norm(end.x - b.x, end.y - b.y), power: 0.5, loft: 0, curl: 0 }, 'pass');
  const pt = (f: number) => ({ x: b.x + (end.x - b.x) * f, y: b.y + (end.y - b.y) * f });
  aim.begin(pt(0.1), 'mouse');
  for (let k = 2; k <= 12; k++) aim.extend(pt(k / 12));
  aim.end();
  return aim;
}

/** A team-mate sprinting forward near / toward the last line (a run in behind). */
function running(e: Engine, a: Agent, line: number, bu: number): boolean {
  const dir = a.dir;
  const v = a.st.vel;
  const fwd = v.x * dir;
  const sp = Math.hypot(v.x, v.y);
  const u = a.st.pos.x * dir;
  return fwd > 4.2 && fwd > 0.6 * sp && u > line - 12 && u > bu - 4;
}

/** Who a scripted calm user would draw for: the live runner furthest up, else the most advanced forward. */
function calmTarget(e: Engine): { m: Agent; end: Vec2 } | null {
  const u = e.user;
  const dir = u.dir;
  const b = e.state.ball.pos;
  const line = e.offsideX(u.side) * dir;
  let best: Agent | null = null;
  let bv = -Infinity;
  for (const m of e.agents) {
    if (m.side !== u.side || m.isUser || m.isGK || m.passive) continue;
    const d = Math.hypot(m.st.pos.x - b.x, m.st.pos.y - b.y);
    if (d < 6 || d > 38) continue;
    const u0 = m.st.pos.x * dir;
    const run = running(e, m, line, b.x * dir) && u0 <= line + 0.25;
    const v = (run ? 20 : 0) + u0 - Math.max(0, d - 28);
    if (v > bv) { bv = v; best = m; }
  }
  if (!best) return null;
  const v = best.st.vel;
  const sp = Math.hypot(v.x, v.y);
  let end: Vec2;
  if (sp > 3 && v.x * dir > 0.4 * sp) {
    // into the space ahead of his run (what the user sees: where he is going)
    const lead = 4 + sp * 1.1;
    end = { x: best.st.pos.x + (v.x / sp) * lead, y: best.st.pos.y + (v.y / sp) * lead };
  } else end = { x: best.st.pos.x + dir * 9, y: best.st.pos.y * 0.85 };
  end.x = dir * Math.min(end.x * dir, HL - 6);
  end.y = Math.max(-HW + 3, Math.min(HW - 3, end.y));
  return { m: best, end };
}

interface Thr { id: number; t: number; line: number; path: { x: number; y: number }[]; react: Map<number, number>; res: string | null; recv: number; recvT: number; shot: boolean; next?: string }
interface Rn { a: Agent; start: number; last: number; off: boolean; counted: boolean }
interface Drb { c: Agent; o: Agent; t: number }
interface Ft { a: Agent; t: number; bx: number; by: number; ox: number; oy: number; done: boolean; away: boolean }

function episode(type: MomentType, role: Position | undefined, seed: number, diff: number, variant: RunVariant, acc: Acc): void {
  const me = createMoment(makeSetup(type, { seed, difficulty: diff, timeLimit: 16, userRole: role }));
  me.input({ kind: 'start' });
  const e = me as unknown as Engine;
  const u = e.user;
  acc.ep++;
  let carryStart = -1;
  let plays = 0;
  let sample = 0;
  const thrs: Thr[] = [];
  const runs = new Map<number, Rn>();
  const drib = new Map<number, Drb>();
  const fts: Ft[] = [];
  let seenKicks = 0;
  let lastTouch = '';
  let lastSeq = -1;
  me.on((ev) => {
    const t = e.state.time;
    if (ev.t === 'offside') for (const x of thrs) if (!x.res || x.res === 'mate') { if (t - x.t < 5) { x.res = 'offside'; } }
    if (ev.t === 'out') for (const x of thrs) if (!x.res) x.res = 'out';
    if (ev.t === 'goal' && ev.side === 'them') acc.goalsThem++;
    if (ev.t === 'goal' && ev.side === 'us') {
      acc.goalsUs++;
      const sc = e.agents.find((q) => q.id === ev.scorer);
      const k = sc ? (sc.isUser ? 'user' : sc.slot.role) : '?';
      acc.goalBy[k] = (acc.goalBy[k] ?? 0) + 1;
      for (const x of thrs) if (x.res === 'mate' && t - x.recvT < 6) acc.thrGoals++;
    }
    if (ev.t === 'receive') {
      const a = e.agents.find((q) => q.id === ev.by)!;
      if (a.isUser) acc.userTouches++;
      // first touch under pressure (AI receivers of a team-mate's pass)
      if (!a.isUser && !a.isGK && ev.from) {
        const near = e.nearestOpp(a);
        if (near.o && near.d < 3.2) {
          fts.push({ a, t, bx: e.state.ball.pos.x, by: e.state.ball.pos.y, ox: near.o.st.pos.x, oy: near.o.st.pos.y, done: false, away: false });
        }
      }
    }
  });
  for (let f = 0; f < 60 * 40 && !me.isFinished(); f++) {
    const s = e.state;
    const t = s.time;
    const dir = u.dir;
    const b = s.ball.pos;
    const line = e.offsideX(u.side) * dir;
    // ── kicks ──
    while (seenKicks < e.kicks.length) {
      const k = e.kicks[seenKicks++];
      if (!k.user && k.side === u.side && !k.isShot && k.target === u.i) acc.toUser++;
      if (k.user && k.isShot) acc.userShots++;
      for (const x of thrs) if (!x.res && k.id !== x.id) x.res = e.agents[k.by].side === u.side ? (e.agents[k.by].isUser ? 'user' : 'mate1t') : 'opp';
      if (k.isShot) {
        const a = e.agents[k.by];
        if (!a.isUser && !a.isGK) {
          acc.aiShots++;
          if (k.onTarget) acc.aiOn++;
          if (k.xg >= 0.3) { acc.clearN++; (k as { _clear?: boolean })._clear = true; }
        }
        if (k.side === u.side) for (const x of thrs) if (x.res === 'mate' && !x.shot && t - x.recvT < 6) { x.shot = true; acc.thrShots++; }
      }
      // what the receiver of a through ball did next (his first action)
      for (const x of thrs) if (x.res === 'mate' && !x.next && k.by === x.recv) x.next = k.isShot ? 'shot' : k.target === u.i ? 'passUser' : 'passMate';
      if (k.user && !k.isShot) {
        // a ball played into the space behind the line?
        const path = e.ballPath();
        let behind = false;
        for (const q of path) if (q.z < 1.2 && q.x * dir > line + 1.0 && q.x * dir > k.from.x * dir + 3) { behind = true; break; }
        if (behind) {
          acc.thrN++;
          thrs.push({ id: k.id, t, line, path: path.map((q) => ({ x: q.x, y: q.y })), react: new Map(), res: null, recv: -1, recvT: 0, shot: false });
        }
        // a run that was on when the ball was played: offside then?
        for (const r of runs.values()) if (t - r.last < 0.3 && r.a.st.pos.x * dir > line + 0.25 && r.a.st.pos.x * dir > b.x * dir) r.off = true;
      }
    }
    // goals from clear chances
    for (const k of e.kicks) {
      const kk = k as { _clear?: boolean; _done?: boolean };
      if (kk._clear && !kk._done && k.result !== 'pending') { kk._done = true; if (k.result === 'goal') acc.clearGoals++; }
    }
    // ── through balls in flight: commit times, who gets there ──
    for (const x of thrs) {
      if (x.res) continue;
      for (const m of e.agents) {
        if (m.side !== u.side || m.isUser || m.isGK || x.react.has(m.i)) continue;
        if (m.urgency < 0.9) continue;
        // committed to the ball: sent after it (receive / chase), or his target on its path
        let dmin = Infinity;
        for (const q of x.path) dmin = Math.min(dmin, Math.hypot(q.x - m.target.x, q.y - m.target.y));
        if (dmin < 2.5 || m.duty === 'receive' || m.duty === 'chase') x.react.set(m.i, t - x.t);
      }
      if (e.touchSeq !== lastSeq && s.ball.lastTouchId && s.ball.lastTouchId !== u.id) {
        const a = e.agents.find((q) => q.id === s.ball.lastTouchId)!;
        if (a.side !== u.side) x.res = 'opp';
        else if (!a.isUser) {
          x.res = 'mate'; x.recv = a.i; x.recvT = t;
          acc.recvN++;
          if (Math.hypot(a.st.vel.x, a.st.vel.y) >= 4.5 && a.st.vel.x * dir > 0) acc.strideN++;
          const rt = x.react.get(a.i);
          if (rt !== undefined) { acc.reactSum += rt; acc.reactN++; }
        }
      } else if (e.owner === u && t - x.t > 0.2) x.res = 'user';
      if (!x.res && t - x.t > 6) x.res = 'none';
    }
    for (const x of thrs) if (x.res === 'mate' && !x.next && t - x.recvT > 0.05 && s.ball.lastTouchSide !== u.side) x.next = 'lost';
    // ── miscontrols under pressure (a team-mate's pass touched without control) ──
    if (e.touchSeq !== lastSeq && !e.owner && s.ball.lastTouchId && s.ball.lastTouchId !== lastTouch) {
      const a = e.agents.find((q) => q.id === s.ball.lastTouchId)!;
      const k = e.lastKick;
      if (a && !a.isUser && !a.isGK && k && k.side === a.side && k.by !== a.i && !k.isShot && t - k.t > 0.15) {
        const near = e.nearestOpp(a);
        if (near.d < 3.2) acc.ftMis++;
      }
    }
    lastTouch = s.ball.lastTouchId ?? '';
    lastSeq = e.touchSeq;
    // ── first touches under pressure ──
    for (const x of fts) {
      if (x.done) continue;
      const lost = s.ball.lastTouchSide !== x.a.side || (e.owner && e.owner.side !== x.a.side);
      if (t - x.t >= 0.35 && !x.away && Number.isFinite(x.bx)) {
        const dx = s.ball.pos.x - x.bx;
        const dy = s.ball.pos.y - x.by;
        const l = Math.hypot(dx, dy);
        if (l > 0.3) { acc.ftAwayN++; if (dx * (x.bx - x.ox) + dy * (x.by - x.oy) > 0) acc.ftAway++; }
        x.away = true;
      }
      if (lost) { x.done = true; acc.ftN++; continue; }
      if (t - x.t >= 1.0) { x.done = true; acc.ftN++; acc.ftKept++; }
    }
    // ── AI dribbles against a defender ──
    const c = e.owner;
    if (c && !c.isUser && !c.isGK) {
      if (!drib.has(c.i)) {
        for (const o of e.agents) {
          if (o.side === c.side || o.isGK || o.passive) continue;
          const d = Math.hypot(o.st.pos.x - c.st.pos.x, o.st.pos.y - c.st.pos.y);
          if (d < 2.2 && (o.st.pos.x - c.st.pos.x) * c.dir > 0.2) { drib.set(c.i, { c, o, t }); break; }
        }
      }
    }
    for (const [i, d] of drib) {
      const own = e.owner === d.c;
      if (s.ball.lastTouchSide !== d.c.side || (e.owner && e.owner.side !== d.c.side)) { acc.dribN++; acc.dribLost++; drib.delete(i); continue; }
      if (!own) { drib.delete(i); continue; } // passed / shot: no verdict
      if ((d.o.st.pos.x - d.c.st.pos.x) * d.c.dir < -0.8) { acc.dribN++; acc.dribBeat++; drib.delete(i); continue; }
      if (t - d.t > 3) { acc.dribN++; acc.dribHeld++; drib.delete(i); }
    }
    // ── runs in behind while the user is on the ball ──
    sample -= STEP;
    if (sample <= 0 && s.phase !== 'intro') {
      sample = 0.1;
      if (e.owner === u && !e.frozen && b.x * dir > -HL / 3) {
        acc.possT += 0.1;
        let live = false;
        for (const m of e.agents) {
          if (m.side !== u.side || m.isUser || m.isGK || m.passive) continue;
          if (!running(e, m, line, b.x * dir)) continue;
          const onside = m.st.pos.x * dir <= line + 0.25 || m.st.pos.x * dir <= b.x * dir;
          if (onside) live = true;
          const r = runs.get(m.i);
          if (r && t - r.last < 0.35) { r.last = t; if (!r.counted && t - r.start >= 0.35) { r.counted = true; acc.runs++; } }
          else runs.set(m.i, { a: m, start: t, last: t, off: false, counted: false });
        }
        if (live) acc.liveT += 0.1;
      }
      // a run ends: was he left offside?
      for (const [i, r] of runs) {
        if (t - r.last >= 0.35) {
          if (r.counted) {
            const u0 = r.a.st.pos.x * dir;
            if (r.off || (u0 > line + 0.25 && u0 > b.x * dir && e.owner === u)) acc.runsOff++;
          }
          runs.delete(i);
        }
      }
    }
    // ── the scripted user ──
    if (s.phase !== 'intro') {
      if (variant === 'defend') {
        const d = norm(b.x - u.st.pos.x, b.y - u.st.pos.y);
        me.input({ kind: 'moveDir', dir: Math.hypot(b.x - u.st.pos.x, b.y - u.st.pos.y) > 6 ? d : { x: 0, y: 0 } });
      } else if (e.owner === u) {
        if (carryStart < 0) carryStart = t;
        const head = norm(HL - 9 - u.st.pos.x, -u.st.pos.y * 0.5);
        me.input({ kind: 'moveDir', dir: head });
        me.input({ kind: 'sprint', on: false });
        const held = t - carryStart;
        const dist = Math.hypot(HL - b.x * dir, b.y);
        if (dist < 17 && held > 0.3) {
          const p = assistShotDir(me, { charge: 0.7, curl: 0, dir: head });
          if (p) me.input({ kind: 'kick', params: p });
          carryStart = -1;
        } else if (variant === 'mates' && held > 0.4) {
          const p = assistPass(me, { pref: { x: dir, y: 0 }, cone: (60 * Math.PI) / 180 }) ?? assistPass(me, { pref: { x: dir, y: 0 } });
          if (p) { me.input({ kind: 'kick', params: p }); carryStart = -1; }
        } else if (variant !== 'mates' && plays < 3) {
          let live = false;
          for (const m of e.agents) if (m.side === u.side && !m.isUser && !m.isGK && running(e, m, line, b.x * dir) && m.st.pos.x * dir <= line + 0.1) live = true;
          if ((held >= 0.5 && live) || held >= 1.8) {
            if (variant === 'R') {
              const p = assistPass(me, { through: true, pref: head });
              // (as the controls send it: R is a ball in behind)
              if (p) { me.input({ kind: 'kick', params: p, through: true }); plays++; carryStart = -1; }
            } else {
              const tg = calmTarget(e);
              if (tg) {
                me.input({ kind: 'aimStart', freeze: true });
                const aim = drawAim(e, tg.end);
                const an = aim.analysis();
                // (as the controls send it: a pass the assist snapped onto a man is meant for him)
                const to = an.kind === 'pass' && an.snapped ? an.receiverId : null;
                me.input({ kind: 'kick', params: aim.params(), to, through: !!to && !!(an as { through?: boolean }).through });
                plays++; carryStart = -1;
              }
            }
          }
        }
      } else {
        carryStart = -1;
        // off the ball: a run forward, onside until the ball is played to him
        const y = u.st.pos.y;
        let d = norm(1 * dir, -Math.sign(y || 1) * 0.25);
        if (u.st.pos.x * dir > line - 1.2 && !e.passForUser()) d = norm(0.05 * dir, -Math.sign(y || 1));
        me.input({ kind: 'moveDir', dir: d });
        me.input({ kind: 'sprint', on: false });
      }
    }
    const t0 = performance.now();
    me.step(STEP);
    acc.stepSum += performance.now() - t0; acc.stepN++;
  }
  for (const x of thrs) {
    if (x.res === 'mate') { const n = x.next ?? (e.state.ball.lastTouchSide !== u.side ? 'lost' : 'other'); acc.thrNext[n] = (acc.thrNext[n] ?? 0) + 1; }
    const r = x.res ?? 'none';
    if (r === 'mate' || r === 'mate1t') acc.thrFirst++;
    else if (r === 'offside') acc.thrOff++;
    else if (r === 'opp') acc.thrOpp++;
    else if (r === 'out') acc.thrOut++;
    else if (r === 'user') acc.thrUser++;
    else acc.thrNone++;
  }
}

export interface RunsMetrics {
  episodes: number;
  /** user possession (middle / final third) in seconds */
  possS: number;
  runsPerMin: number; runOffside: number; liveShare: number;
  thrN: number; thrFirst: number; thrOffside: number; thrOpp: number; thrOut: number; thrUser: number; thrNone: number;
  reactS: number; stride: number; thrShots: number; thrGoals: number;
  dribN: number; dribSuccess: number; dribLost: number; dribHeld: number;
  aiShots: number; aiOnTarget: number; clearN: number; clearConv: number;
  ftN: number; ftKept: number; ftAway: number; ftMis: number;
  goalsUs: number; goalsThem: number; goalBy: Record<string, number>; toUser: number; userShots: number; userTouches: number; thrNext: Record<string, number>;
  stepMs: number;
}

export function measureRuns(opts: { diffs?: number[]; seeds?: number; variants?: RunVariant[]; seed0?: number } = {}): RunsMetrics {
  const acc = newAcc();
  const configs: [MomentType, Position | undefined][] = [['open_play', 'ST'], ['open_play', 'AM'], ['counter', 'CM']];
  for (const diff of opts.diffs ?? [0.3, 0.5]) {
    for (let seed = opts.seed0 ?? 1; seed < (opts.seed0 ?? 1) + (opts.seeds ?? 8); seed++) {
      for (const v of opts.variants ?? ['R', 'calm', 'mates', 'defend']) {
        if (v === 'defend') { episode('defend', undefined, seed, diff, v, acc); continue; }
        for (const [type, role] of configs) episode(type, role, seed, diff, v, acc);
      }
    }
  }
  const d = (a: number, b: number) => r3(a / Math.max(1, b));
  return {
    episodes: acc.ep,
    possS: r3(acc.possT),
    runsPerMin: r3(acc.runs / Math.max(1e-6, acc.possT / 60)), runOffside: d(acc.runsOff, acc.runs), liveShare: d(acc.liveT, acc.possT),
    thrN: acc.thrN, thrFirst: d(acc.thrFirst, acc.thrN), thrOffside: d(acc.thrOff, acc.thrN), thrOpp: d(acc.thrOpp, acc.thrN), thrOut: d(acc.thrOut, acc.thrN),
    thrUser: d(acc.thrUser, acc.thrN), thrNone: d(acc.thrNone, acc.thrN),
    reactS: d(acc.reactSum, acc.reactN), stride: d(acc.strideN, acc.recvN), thrShots: acc.thrShots, thrGoals: acc.thrGoals,
    dribN: acc.dribN, dribSuccess: d(acc.dribBeat, acc.dribBeat + acc.dribLost), dribLost: d(acc.dribLost, acc.dribN), dribHeld: d(acc.dribHeld, acc.dribN),
    aiShots: acc.aiShots, aiOnTarget: d(acc.aiOn, acc.aiShots), clearN: acc.clearN, clearConv: d(acc.clearGoals, acc.clearN),
    ftN: acc.ftN + acc.ftMis, ftKept: d(acc.ftKept, acc.ftN + acc.ftMis), ftAway: d(acc.ftAway, acc.ftAwayN), ftMis: acc.ftMis,
    goalsUs: acc.goalsUs, goalsThem: acc.goalsThem, goalBy: acc.goalBy, toUser: acc.toUser, userShots: acc.userShots, userTouches: acc.userTouches, thrNext: acc.thrNext,
    stepMs: r3(acc.stepSum / Math.max(1, acc.stepN)),
  };
}

// ───────────────────────── AI skill drills (both teams) ─────────────────────────

/** First agent of the side (not the user / keeper) whose role is earliest in `roles`. */
function pickRole(e: Engine, side: 'us' | 'them', roles: string[]): Agent {
  const c = e.agents.filter((a) => a.side === side && !a.isUser && !a.isGK);
  for (const r of roles) { const a = c.find((x) => x.slot.role === r || x.spec.role === r); if (a) return a; }
  return c[0];
}

/** Everyone passive except the listed agents; the others are parked off the play. */
function isolate(e: Engine, keep: Agent[]): void {
  for (const a of e.agents) {
    if (keep.includes(a)) continue;
    a.passive = true;
    a.st.vel.x = 0; a.st.vel.y = 0;
    a.st.pos.x = a.side === 'us' ? -HL + 3 : HL - 3;
    a.st.pos.y = (a.i % 2 ? 1 : -1) * (HW - 1);
  }
}

export interface SkillMetrics {
  dribN: number; dribBeat: number; dribLost: number; dribOther: number; dribHeld: number;
  finN: number; finOn: number; finGoal: number;
}

/**
 * 1v1 dribble (an AI attacker 31 m out against one AI defender 4 m goal-side, keepers in) and
 * clear chances (an AI attacker on the ball 9–15 m out, the keeper, a defender chasing behind).
 */
export function measureSkills(opts: { diffs?: number[]; seeds?: number } = {}): SkillMetrics {
  const m: SkillMetrics = { dribN: 0, dribBeat: 0, dribLost: 0, dribOther: 0, dribHeld: 0, finN: 0, finOn: 0, finGoal: 0 };
  for (const diff of opts.diffs ?? [0.3, 0.5]) {
    for (let seed = 1; seed <= (opts.seeds ?? 20); seed++) {
      for (const side of ['us', 'them'] as const) {
        // ── dribble ──
        {
          const me = createMoment(makeSetup(side === 'us' ? 'open_play' : 'defend', { seed, difficulty: diff, timeLimit: 30 }));
          me.input({ kind: 'start' });
          const e = me as unknown as Engine;
          const att = pickRole(e, side, seed % 2 ? ['W', 'ST', 'AM'] : ['ST', 'W', 'AM']);
          const def = pickRole(e, side === 'us' ? 'them' : 'us', seed % 3 ? ['CB', 'FB'] : ['FB', 'CB']);
          const gk = e.agents.find((a) => a.side !== side && a.isGK)!;
          isolate(e, [att, def, gk]);
          const dir = att.dir;
          const y0 = ((seed * 7) % 21) - 10;
          att.st.pos.x = dir * (HL - 31); att.st.pos.y = y0; att.st.vel.x = dir * 2; att.st.vel.y = 0; att.st.facing = dir > 0 ? 0 : Math.PI;
          def.st.pos.x = dir * (HL - 26.5); def.st.pos.y = y0 + ((seed % 3) - 1) * 0.6; def.st.vel.x = 0; def.st.vel.y = 0; def.st.facing = dir > 0 ? Math.PI : 0;
          e.giveBall(att, false);
          att.think = 0.2;
          let res = 'held';
          for (let f = 0; f < 60 * 5 && !me.isFinished(); f++) {
            me.step(STEP);
            const s = e.state;
            if (s.ball.lastTouchSide !== side || (e.owner && e.owner !== att)) { res = 'lost'; break; }
            if (e.owner !== att) { res = 'other'; break; }
            if ((def.st.pos.x - att.st.pos.x) * dir < -0.8) { res = 'beat'; break; }
          }
          m.dribN++;
          if (res === 'beat') m.dribBeat++; else if (res === 'lost') m.dribLost++; else if (res === 'held') m.dribHeld++; else m.dribOther++;
        }
        // ── clear chance ──
        {
          const me = createMoment(makeSetup(side === 'us' ? 'open_play' : 'defend', { seed: seed + 100, difficulty: diff, timeLimit: 30 }));
          me.input({ kind: 'start' });
          const e = me as unknown as Engine;
          const att = pickRole(e, side, ['ST', 'W', 'AM']);
          const def = pickRole(e, side === 'us' ? 'them' : 'us', ['CB', 'FB']);
          const gk = e.agents.find((a) => a.side !== side && a.isGK)!;
          isolate(e, [att, def, gk]);
          const dir = att.dir;
          const dist = 9 + ((seed * 5) % 7);
          const ang = (((seed * 11) % 9) - 4) * 0.09;
          att.st.pos.x = dir * (HL - dist * Math.cos(ang)); att.st.pos.y = dist * Math.sin(ang);
          att.st.vel.x = dir * 5; att.st.vel.y = 0; att.st.facing = dir > 0 ? 0 : Math.PI;
          def.st.pos.x = att.st.pos.x - dir * 4.5; def.st.pos.y = att.st.pos.y + 1; def.st.vel.x = dir * 5; def.st.vel.y = 0;
          // (the keeper on his line, or a few metres off it when he has come out)
          gk.st.pos.x = dir * (HL - 1 - (seed % 3) * 2.5); gk.st.pos.y = att.st.pos.y * 0.2;
          e.giveBall(att, false);
          att.think = 0.1 + 0.05 * (seed % 3);
          let shot: ReturnType<typeof e.kicks.find> | null = null;
          for (let f = 0; f < 60 * 6 && !me.isFinished(); f++) {
            me.step(STEP);
            const k = e.kicks.find((x) => x.isShot && x.by === att.i);
            if (k) shot = k;
            if (shot && shot.result !== 'pending') break;
            if (!shot && e.owner !== att && e.state.ball.lastTouchSide !== side) break;
          }
          m.finN++;
          if (shot) {
            if (shot.onTarget) m.finOn++;
            if (shot.result === 'goal') m.finGoal++;
          }
        }
      }
    }
  }
  return m;
}
