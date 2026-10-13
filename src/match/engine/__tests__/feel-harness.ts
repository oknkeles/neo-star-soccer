/**
 * "Feel" measurement harness: locomotion (acceleration, stopping, turning, body orientation,
 * foot slide), passing (user fast / calm, AI), crossing (user wing crosses, crosses to the user,
 * team-mates' crosses) and difficulty. Scripted "humans" play like the shared keyboard / calm
 * controls do. Used by feel.test.ts (before → after numbers of the movement / pass / cross work).
 */
import type { MomentEvent, MomentType, Vec2, Vec3 } from '../../../core/types';
import { assistPass, assistShotDir, createMoment, type MomentEngine } from '../api';
import { HL, KICK_CONTACT, KICK_SNAP } from '../constants';
import type { Engine } from '../engine';
import type { Agent } from '../internal';
import { openMates } from '../ai';
import { CalmAim } from '../../controls/calm';
import { computePose, strideLength } from '../../view/pose';
import { makeSetup } from './helpers';

const STEP = 1 / 60;
const TICK = 1 / 120;
const r2 = (x: number) => Math.round(x * 100) / 100;
const norm = (x: number, y: number): Vec2 => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
const angD = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const DEG = 180 / Math.PI;

/** Deterministic 0..1 from integers. */
function h01(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function gauss(a: number, b: number): number {
  const u = Math.max(1e-6, h01(a, b));
  const v = h01(b + 7, a + 13);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ───────────────────────── locomotion ─────────────────────────

interface LocoRun { t90: number; tJog: number; stopDist: number; stopT: number; turnRate: number; turnMinSp: number; turn80: number; rev5: number; jogTurnRate: number }

/** Drive one agent's locomotion alone (everyone else frozen) through accelerate / stop / cut / reverse. */
function locoRun(diff: number, who: 'user' | 'ai'): LocoRun {
  const me = createMoment(makeSetup('open_play', { seed: 2, difficulty: diff }));
  const e = me as unknown as Engine;
  for (let i = 0; i < 40; i++) me.step(STEP);
  const subj: Agent = who === 'user' ? e.user : e.agents.find((a) => a.side === 'us' && !a.isUser && !a.isGK && a.slot.role === 'CM')!;
  for (const a of e.agents) if (a !== subj) a.passive = true;
  e.placeBall({ x: -50, y: 33, z: 0.11 });
  subj.st.pos = { x: -20, y: 0 };
  subj.st.vel = { x: 0, y: 0 };
  subj.st.facing = 0;
  subj.st.stamina = 1;
  const E = e as unknown as { moveAgents(l: boolean): void; updateUser(a: boolean): void };
  let cdir: Vec2 | null = null;
  const cmd = (d: Vec2 | null, sprint: boolean) => {
    cdir = d;
    if (who === 'user') {
      e.ctl.dir = d; e.ctl.sprint = sprint; e.ctl.target = null;
    } else {
      subj.target = d ? { x: subj.st.pos.x + d.x * 30, y: subj.st.pos.y + d.y * 30 } : { x: subj.st.pos.x, y: subj.st.pos.y };
      subj.urgency = d ? (sprint ? 1 : 0.55) : 0;
    }
  };
  const tick = () => {
    e.state.time += TICK;
    if (who === 'user') E.updateUser(true);
    else if (cdir) subj.target = { x: subj.st.pos.x + cdir.x * 30, y: subj.st.pos.y + cdir.y * 30 };
    E.moveAgents(true);
  };
  const sp = () => Math.hypot(subj.st.vel.x, subj.st.vel.y);
  const vtop = subj.topSpeed;
  // 1) from rest: sprint along +x
  let t = 0; let t90 = NaN; let tJog = NaN;
  cmd({ x: 1, y: 0 }, true);
  for (; t < 5; t += TICK) {
    tick();
    if (Number.isNaN(tJog) && sp() >= 3.5) tJog = t;
    if (Number.isNaN(t90) && sp() >= 0.9 * vtop * (0.78 + 0.22 * subj.st.stamina)) t90 = t;
  }
  // 2) stop
  const p0 = { ...subj.st.pos };
  cmd(null, false);
  let stopT = 0;
  for (stopT = 0; stopT < 4 && sp() > 0.3; stopT += TICK) tick();
  const stopDist = Math.hypot(subj.st.pos.x - p0.x, subj.st.pos.y - p0.y);
  // 3) cut 90° at full speed
  const cut = (sprint: boolean) => {
    subj.st.vel = { x: 0, y: 0 }; subj.st.facing = 0;
    cmd({ x: 1, y: 0 }, sprint);
    for (let k = 0; k < 4 / TICK; k++) tick();
    cmd({ x: 0, y: 1 }, sprint);
    const hs: number[] = [];
    let minSp = Infinity; let t80 = NaN;
    const h0 = Math.atan2(subj.st.vel.y, subj.st.vel.x);
    for (let k = 0; k < 2 / TICK; k++) {
      tick();
      const h = Math.atan2(subj.st.vel.y, subj.st.vel.x);
      hs.push(h);
      minSp = Math.min(minSp, sp());
      if (Number.isNaN(t80) && Math.abs(angD(h0, h)) >= (80 / DEG)) t80 = k * TICK;
    }
    let maxRate = 0;
    const w = 12; // 0.1 s windows
    for (let k = w; k < hs.length; k++) if (sp() > 0) maxRate = Math.max(maxRate, Math.abs(angD(hs[k - w], hs[k])) / (w * TICK) * DEG);
    return { maxRate, minSp, t80 };
  };
  const c = cut(true);
  const jog = cut(false);
  // 4) reverse at full speed: time until 5 m/s the other way (or the max he reaches)
  subj.st.vel = { x: 0, y: 0 }; subj.st.facing = 0;
  cmd({ x: 1, y: 0 }, true);
  for (let k = 0; k < 4 / TICK; k++) tick();
  cmd({ x: -1, y: 0 }, true);
  let rev5 = NaN;
  for (let k = 0; k < 4 / TICK; k++) { tick(); if (subj.st.vel.x < -5) { rev5 = k * TICK; break; } }
  return { t90, tJog, stopDist, stopT, turnRate: c.maxRate, turnMinSp: c.minSp, turn80: c.t80, rev5, jogTurnRate: jog.maxRate };
}

/** Body orientation and foot-slide estimate over a live open_play moment (AI players). */
function orientation(): { jitterDeg: number; snaps: number; skate: number; footSlide: number; kickLagS: number; kickLagAiS: number } {
  const me = createMoment(makeSetup('open_play', { seed: 9, difficulty: 0.5 }));
  const hist = new Map<string, number[]>();
  let skateN = 0; let runN = 0;
  let slideSum = 0; let slideN = 0;
  for (let i = 0; i < 60 * 12 && !me.isFinished(); i++) {
    me.step(STEP);
    for (const p of me.state.players) {
      if (p.isUser) continue;
      let h = hist.get(p.id);
      if (!h) { h = []; hist.set(p.id, h); }
      h.push(p.facing);
      const sp = Math.hypot(p.vel.x, p.vel.y);
      if (sp > 4.5 && p.role !== 'GK') {
        runN++;
        if (Math.abs(angD(p.facing, Math.atan2(p.vel.y, p.vel.x))) > 50 / DEG) skateN++;
      }
      if (sp > 1 && (p.anim === 'run' || p.anim === 'sprint' || p.anim === 'dribble')) {
        const pose = computePose({ anim: p.anim, t: 0, speed: sp, cycle: Math.PI / 2, kickFoot: 'R', variant: 0.5 });
        const amp = Math.abs(pose.hipL);
        const geo = 4 * 0.89 * Math.sin(amp);
        slideSum += Math.abs(1 - geo / strideLength(sp));
        slideN++;
      }
    }
  }
  let jit = 0; let n = 0; let snaps = 0;
  for (const h of hist.values()) {
    for (let i = 2; i < h.length; i++) {
      const d2 = angD(h[i - 1], h[i]) - angD(h[i - 2], h[i - 1]);
      jit += Math.abs(d2) * DEG; n++;
      if (Math.abs(angD(h[i - 1], h[i])) > 25 / DEG) snaps++;
    }
  }
  // visual kick: seconds from the ball leaving the foot (execKick) to the kicking leg reaching the
  // ball in the pose timeline (hip swung forward through ~0.35 rad). The user's strikes start the
  // animation at KICK_CONTACT − KICK_SNAP, the AI's wind up and leave the ball at KICK_CONTACT.
  let cross = 0;
  for (let t = 0; t < 0.6; t += 0.002) {
    const p = computePose({ anim: 'kick', t, speed: 0, cycle: 0, kickFoot: 'R', variant: 0.5 });
    if (p.hipR > 0.35) { cross = t; break; }
  }
  const lag = cross - (KICK_CONTACT.kick - KICK_SNAP);
  const aiLag = cross - KICK_CONTACT.kick;
  return { jitterDeg: jit / Math.max(1, n), snaps, skate: skateN / Math.max(1, runN), footSlide: slideSum / Math.max(1, slideN), kickLagS: lag, kickLagAiS: aiLag };
}

// ───────────────────────── pass tracking ─────────────────────────

interface PassAcc { n: number; ok: number; int: number; out: number; none: number; arr: number[]; prog: number; errN: number; err: number }
const newPass = (): PassAcc => ({ n: 0, ok: 0, int: 0, out: 0, none: 0, arr: [], prog: 0, errN: 0, err: 0 });

/**
 * Follows every pass (non-shot kick with an intended receiver) of the filter: completed (a
 * team-mate controls / plays it), intercepted (an opponent touches it first) or out.
 */
class PassWatch {
  private open = new Map<number, { side: string; by: string; fromX: number; dir: number }>();
  private seen = 0;
  private lastBallRel = new Map<string, number>();
  constructor(private e: Engine, private acc: PassAcc, private filter: (k: Engine['kicks'][number]) => boolean) {
    e.on((ev) => this.onEvent(ev));
  }
  private onEvent(ev: MomentEvent): void {
    if (ev.t === 'out') for (const [id] of this.open) { this.acc.out++; this.open.delete(id); }
    if (ev.t === 'receive') {
      for (const [id, o] of this.open) {
        if (ev.side === o.side && ev.by !== o.by) {
          this.acc.ok++;
          const rel = this.lastBallRel.get(ev.by);
          if (rel !== undefined) this.acc.arr.push(rel);
          const a = this.e.agents.find((x) => x.id === ev.by)!;
          this.acc.prog += (a.st.pos.x - o.fromX) * o.dir;
        } else if (ev.side !== o.side) this.acc.int++;
        else continue;
        this.open.delete(id);
      }
    }
  }
  /** Call before every engine step. */
  pre(): void {
    const e = this.e;
    const b = e.state.ball;
    this.lastBallRel.clear();
    if (!e.owner) for (const a of e.agents) {
      if (Math.hypot(b.pos.x - a.st.pos.x, b.pos.y - a.st.pos.y) < 3) this.lastBallRel.set(a.id, Math.hypot(b.vel.x - a.st.vel.x, b.vel.y - a.st.vel.y));
    }
    while (this.seen < e.kicks.length) {
      const k = e.kicks[this.seen++];
      // a new kick resolves the passes before it (one-touch by a team-mate = completed)
      for (const [id, o] of this.open) {
        if (k.side === o.side && e.agents[k.by].id !== o.by) this.acc.ok++;
        else if (k.side !== o.side) this.acc.int++;
        else this.acc.none++;
        this.open.delete(id);
      }
      if (!k.isShot && this.filter(k)) {
        this.acc.n++;
        this.open.set(k.id, { side: k.side, by: e.agents[k.by].id, fromX: k.from.x, dir: k.dir });
      }
    }
    for (const [id, o] of this.open) {
      const t = b.lastTouchSide;
      if (t && t !== o.side) { this.acc.int++; this.open.delete(id); }
    }
  }
  finish(): void { this.acc.none += this.open.size; this.open.clear(); }
}

const passOut = (p: PassAcc) => {
  const a = p.arr.slice().sort((x, y) => x - y);
  const q = (f: number) => (a.length ? r2(a[Math.min(a.length - 1, Math.floor(f * a.length))]) : NaN);
  return {
    n: p.n, completion: r2(p.ok / Math.max(1, p.n)), intercepted: r2(p.int / Math.max(1, p.n)), out: r2(p.out / Math.max(1, p.n)),
    arrP10: q(0.1), arrMed: q(0.5), arrP90: q(0.9), hard: r2(a.filter((x) => x > 13).length / Math.max(1, a.length)),
    prog: r2(p.prog / Math.max(1, p.ok)), previewErr: p.errN ? r2(p.err / p.errN) : NaN,
  };
};

/** A team-mate to draw a pass to (open and ahead first, else the nearest 8–30 m). */
function drawTarget(e: Engine): Agent | null {
  const u = e.user;
  const b = e.state.ball.pos;
  const { open } = openMates(e, u);
  const ahead = open.filter((m) => m.st.pos.x > b.x - 4);
  if (ahead.length) return ahead.reduce((p, q) => (q.st.pos.x > p.st.pos.x ? q : p));
  if (open.length) return open[0];
  const mates = e.agents.filter((m) => m.side === u.side && !m.isUser && !m.isGK && !m.passive)
    .map((m) => ({ m, d: Math.hypot(m.st.pos.x - b.x, m.st.pos.y - b.y) })).filter((x) => x.d > 8 && x.d < 30).sort((p, q) => p.d - q.d);
  return mates[0]?.m ?? null;
}

/** Draw a straight stroke from the ball to `end` and return the calm aim (as the controls would). */
function drawAim(e: Engine, end: Vec2, loftIdx: number | null, intent: 'pass' | 'shot' = 'pass'): CalmAim {
  const b = e.state.ball.pos;
  const aim = new CalmAim(e, { dir: norm(end.x - b.x, end.y - b.y), power: 0.5, loft: 0, curl: 0 }, intent);
  if (loftIdx !== null) aim.setLoft(loftIdx);
  aim.begin({ x: b.x + (end.x - b.x) * 0.1, y: b.y + (end.y - b.y) * 0.1 }, 'mouse');
  for (let k = 2; k <= 12; k++) aim.extend({ x: b.x + ((end.x - b.x) * k) / 12, y: b.y + ((end.y - b.y) * k) / 12 });
  aim.end();
  return aim;
}

/** Preview vs reality: mean distance between the noise-free preview and the real flight at ~1 s (before any touch). */
class PreviewCheck {
  private path: Vec3[] | null = null;
  private t0 = 0;
  private seq = 0;
  private best = -1;
  constructor(private e: Engine, private acc: PassAcc) {}
  start(path: Vec3[]): void { this.path = path; this.t0 = this.e.state.time; this.seq = this.e.touchSeq; this.best = -1; }
  step(): void {
    const p = this.path;
    if (!p) return;
    const e = this.e;
    const dt = e.state.time - this.t0;
    if (e.touchSeq !== this.seq || e.owner || dt > 1.0) { this.close(); return; }
    const i = Math.round(dt * 30);
    if (i >= 1 && i < p.length) {
      const q = p[i];
      const b = e.state.ball.pos;
      this.best = Math.hypot(q.x - b.x, q.y - b.y, q.z - b.z);
    }
  }
  private close(): void {
    if (this.best >= 0) { this.acc.err += this.best; this.acc.errN++; }
    this.path = null;
  }
}

/** The user plays passes (fast: F = assistPass; calm: a drawn stroke to a team-mate), then team-mates play on. */
function passEpisodes(mode: 'fast' | 'calm', diff: number, seeds: number, userAcc: PassAcc, aiAcc: PassAcc, toUser?: PassAcc, oppAcc?: PassAcc): void {
  for (const type of ['open_play', 'build_up', 'counter'] as MomentType[]) {
    for (let seed = 1; seed <= seeds; seed++) {
      const me = createMoment(makeSetup(type, { seed, difficulty: diff, timeLimit: 16 }));
      const e = me as unknown as Engine;
      const u = e.user;
      const pw = new PassWatch(e, userAcc, (k) => k.user);
      const aw = new PassWatch(e, aiAcc, (k) => !k.user && k.side === u.side && k.target >= 0 && !k.cross && k.target !== u.i);
      const tw = new PassWatch(e, toUser ?? newPass(), (k) => !k.user && k.target === u.i && !k.cross);
      const ow = new PassWatch(e, oppAcc ?? newPass(), (k) => k.side !== u.side && k.target >= 0 && !k.cross);
      const pc = new PreviewCheck(e, userAcc);
      let carry = -1;
      let passes = 0;
      for (let f = 0; f < 60 * 30 && !me.isFinished(); f++) {
        const s = e.state;
        if (s.phase !== 'intro') {
          if (e.owner === u && passes < 3) {
            if (carry < 0) carry = s.time;
            me.input({ kind: 'moveDir', dir: norm(HL - 9 - u.st.pos.x, -u.st.pos.y * 0.5) });
            if (s.time - carry > 0.4 + 0.6 * h01(seed, passes + 3)) {
              if (mode === 'fast') {
                const p = assistPass(me, { pref: { x: 1, y: 0 }, cone: (50 * Math.PI) / 180 }) ?? assistPass(me, { pref: { x: 1, y: 0 } });
                if (p) { me.input({ kind: 'kick', params: p }); passes++; carry = -1; }
              } else {
                const m = drawTarget(e);
                if (m) {
                  me.input({ kind: 'aimStart', freeze: true });
                  const lead = { x: m.st.pos.x + m.st.vel.x * 0.5 + 1.6 * gauss(seed, passes * 11 + 1), y: m.st.pos.y + m.st.vel.y * 0.5 + 1.6 * gauss(seed, passes * 11 + 2) };
                  const far = Math.hypot(lead.x - s.ball.pos.x, lead.y - s.ball.pos.y) > 30;
                  const aim = drawAim(e, lead, far ? 2 : null);
                  const an = aim.analysis();
                  me.input({ kind: 'kick', params: aim.params() });
                  pc.start(an.path);
                  passes++; carry = -1;
                }
              }
            }
          } else {
            carry = -1;
            // after his pass he makes a run (and calls for it once a team-mate has it for a while)
            me.input({ kind: 'moveDir', dir: norm(1, -Math.sign(u.st.pos.y) * 0.2) });
          }
        }
        pw.pre(); aw.pre(); tw.pre(); ow.pre();
        me.step(STEP);
        pc.step();
      }
      pw.finish(); aw.finish(); tw.finish(); ow.finish();
    }
  }
}

/** Opponents' passes (defend moments: the user presses the carrier). */
function oppPasses(diff: number, seeds: number, acc: PassAcc): void {
  for (let seed = 1; seed <= seeds; seed++) {
    const me = createMoment(makeSetup('defend', { seed, difficulty: diff, timeLimit: 16 }));
    const e = me as unknown as Engine;
    const w = new PassWatch(e, acc, (k) => k.side === 'them' && k.target >= 0);
    for (let f = 0; f < 60 * 25 && !me.isFinished(); f++) {
      const u = e.user;
      const b = e.state.ball.pos;
      if (e.state.phase !== 'intro') me.input({ kind: 'moveDir', dir: norm(b.x - u.st.pos.x, b.y - u.st.pos.y) });
      w.pre();
      me.step(STEP);
    }
    w.finish();
  }
}

// ───────────────────────── crosses ─────────────────────────

interface CrossAcc { flat: number; n: number; reach: number; shot: number; goal: number; gk: number; opp: number; out: number; headers: number; headersOn: number }
const newCross = (): CrossAcc => ({ flat: 0, n: 0, reach: 0, shot: 0, goal: 0, gk: 0, opp: 0, out: 0, headers: 0, headersOn: 0 });
const crossOut = (c: CrossAcc) => ({
  n: c.n, flat: c.flat, reach: r2(c.reach / Math.max(1, c.n)), shot: r2(c.shot / Math.max(1, c.n)), goal: r2(c.goal / Math.max(1, c.n)),
  keeper: r2(c.gk / Math.max(1, c.n)), opp: r2(c.opp / Math.max(1, c.n)), out: r2(c.out / Math.max(1, c.n)),
  headerOnTarget: c.headers ? r2(c.headersOn / c.headers) : NaN, headers: c.headers,
});

/** Follows crosses (kick records with .cross, filtered): first touch after it, a shot / goal within 4 s. */
class CrossWatch {
  private seen = 0;
  private cur: { id: number; t: number; by: string; touched: boolean; shot: boolean; goal: boolean } | null = null;
  constructor(private e: Engine, private acc: CrossAcc, private filter: (k: Engine['kicks'][number]) => boolean) {
    e.on((ev) => {
      const c = this.cur;
      if (ev.t === 'shot' && ev.by.startsWith('us')) {
        const k = this.e.lastKick;
        if (k && k.kind === 'header') { this.acc.headers++; if (ev.onTarget) this.acc.headersOn++; }
      }
      if (!c) return;
      if (ev.t === 'out' && !c.touched) { c.touched = true; this.acc.out++; }
      if (ev.t === 'shot' && ev.by.startsWith('us') && !c.shot && this.e.state.time - c.t < 4) { c.shot = true; this.acc.shot++; }
      if (ev.t === 'goal' && ev.side === 'us' && !c.goal && this.e.state.time - c.t < 5) { c.goal = true; this.acc.goal++; }
    });
  }
  step(): void {
    const e = this.e;
    while (this.seen < e.kicks.length) {
      const k = e.kicks[this.seen++];
      if (this.filter(k) && (!this.cur || this.cur.id !== k.id)) {
        if (!this.cur || e.state.time - this.cur.t > 4) {
          this.cur = { id: k.id, t: e.state.time, by: e.agents[k.by].id, touched: false, shot: false, goal: false };
          this.acc.n++;
        }
      }
    }
    const c = this.cur;
    if (!c || c.touched) return;
    const lt = e.state.ball.lastTouchId;
    if (lt && lt !== c.by) {
      c.touched = true;
      const a = e.agents.find((x) => x.id === lt)!;
      if (a.side === 'us') this.acc.reach++;
      else if (a.isGK) this.acc.gk++;
      else this.acc.opp++;
    }
  }
}

/** wing_cross: the user carries toward the byline, then crosses (fast: F toward the box; calm: a drawn line into the box). */
function wingCross(mode: 'fast' | 'calm' | 'calmHigh', diff: number, seeds: number, acc: CrossAcc): void {
  for (let seed = 1; seed <= seeds; seed++) {
    const me = createMoment(makeSetup('wing_cross', { seed, difficulty: diff, timeLimit: 16 }));
    const e = me as unknown as Engine;
    const u = e.user;
    const w = new CrossWatch(e, acc, (k) => k.user && !k.isShot && e.kicks.filter((x) => x.user).length === 1);
    let crossed = false;
    let carry = -1;
    const side = Math.sign(u.st.pos.y) || 1;
    for (let f = 0; f < 60 * 25 && !me.isFinished(); f++) {
      const s = e.state;
      if (s.phase !== 'intro' && !crossed) {
        if (e.owner === u) {
          if (carry < 0) carry = s.time;
          me.input({ kind: 'moveDir', dir: norm(HL - 4 - u.st.pos.x, (side * 22 - u.st.pos.y) * 0.3) });
          const dur = 0.5 + 1.0 * h01(seed, 5);
          if (s.time - carry > dur || u.st.pos.x > HL - 7) {
            const zones = [{ x: HL - 5, y: side * 2.5 }, { x: HL - 11, y: 0 }, { x: HL - 6, y: -side * 4 }];
            const z = zones[Math.floor(h01(seed, 9) * 3)];
            const end = { x: z.x + 1.5 * gauss(seed, 1), y: z.y + 1.5 * gauss(seed, 2) };
            const b = s.ball.pos;
            if (mode === 'fast') {
              const p = assistPass(me, { pref: norm(end.x - b.x, end.y - b.y), cone: (50 * Math.PI) / 180 }) ?? assistPass(me, { pref: norm(end.x - b.x, end.y - b.y) });
              if (p) { me.input({ kind: 'kick', params: p }); crossed = true; }
            } else {
              me.input({ kind: 'aimStart', freeze: true });
              const aim = drawAim(e, end, mode === 'calmHigh' ? 2 : null);
              me.input({ kind: 'kick', params: aim.params() });
              crossed = true;
            }
            // (a 'flat' delivery: the engine did not treat it as a cross)
            const k = e.lastKick;
            if (crossed && k && k.user && !k.cross) acc.flat++;
          }
        }
      } else if (s.phase !== 'intro') me.input({ kind: 'moveDir', dir: { x: 0, y: 0 } });
      me.step(STEP);
      w.step();
    }
  }
}

/** cross_receive: a team-mate crosses to the user. 'hold' = no steering, SHOOT held; 'steer' = runs at the ball's flight. */
function crossReceive(mode: 'hold' | 'steer' | 'calm', diff: number, seeds: number, acc: CrossAcc): void {
  for (let seed = 1; seed <= seeds; seed++) {
    const me = createMoment(makeSetup('cross_receive', { seed, difficulty: diff, timeLimit: 16 }));
    const e = me as unknown as Engine;
    const u = e.user;
    const w = new CrossWatch(e, acc, (k) => !k.user && k.cross);
    let struck = false;
    for (let f = 0; f < 60 * 25 && !me.isFinished(); f++) {
      const s = e.state;
      if (s.phase !== 'intro' && !struck) {
        const k = e.lastKick;
        const inFlight = !e.owner && !!k && k.cross && !k.user;
        if (mode !== 'hold' && inFlight) {
          // run at the flight: the point of the predicted path below head height nearest to him
          const path = e.ballPath();
          let best: Vec2 | null = null; let bd = Infinity;
          for (const q of path) {
            if (q.z > 2.2 || q.t < 0.15) continue;
            const d = Math.hypot(q.x - u.st.pos.x, q.y - u.st.pos.y);
            if (d < bd) { bd = d; best = { x: q.x, y: q.y }; }
          }
          if (best && bd > 0.4) me.input({ kind: 'moveDir', dir: norm(best.x - u.st.pos.x, best.y - u.st.pos.y) });
          else me.input({ kind: 'moveDir', dir: { x: 0, y: 0 } });
        }
        if (inFlight || (e.owner === u)) {
          const b = s.ball.pos;
          const dir = { x: 1, y: -b.y * 0.04 };
          if (mode === 'calm') {
            if (me.canKick()) {
              me.input({ kind: 'aimStart', freeze: true });
              const seedP = assistShotDir(me, { charge: 0.75, curl: 0, dir });
              if (seedP) {
                const aim = new CalmAim(me, seedP, 'shot');
                me.input({ kind: 'kick', params: aim.params() });
                struck = true;
              }
            }
          } else {
            const dx = u.st.pos.x - b.x; const dy = u.st.pos.y - b.y;
            const d = Math.hypot(dx, dy) || 1;
            const closing = (s.ball.vel.x * dx + s.ball.vel.y * dy) / d - (u.st.vel.x * dx + u.st.vel.y * dy) / d;
            if (me.canKick() || (d < 2.6 && closing > 2 && d / closing < 0.3)) {
              const p = assistShotDir(me, { charge: 0.75, curl: 0, dir });
              if (p) { me.input({ kind: 'kick', params: p }); struck = true; }
            }
          }
        }
      }
      me.step(STEP);
      w.step();
    }
  }
}

/** Team-mates' crosses in open play: the user passes, then attacks the box. */
function mateCrosses(diff: number, seeds: number, acc: CrossAcc): void {
  for (const type of ['open_play', 'counter', 'wing_cross'] as MomentType[]) {
    for (let seed = 1; seed <= seeds; seed++) {
      const me = createMoment(makeSetup(type, { seed, difficulty: diff, timeLimit: 18 }));
      const e = me as unknown as Engine;
      const u = e.user;
      const w = new CrossWatch(e, acc, (k) => !k.user && k.cross && k.side === 'us');
      let passed = false;
      for (let f = 0; f < 60 * 30 && !me.isFinished(); f++) {
        const s = e.state;
        if (s.phase !== 'intro') {
          if (e.owner === u) {
            if (!passed && s.time > 1.2) {
              // wing_cross: square it to a team-mate wide; else the usual pass
              const p = assistPass(me, { pref: { x: 1, y: Math.sign(u.st.pos.y) * 0.6 }, cone: (60 * Math.PI) / 180 }) ?? assistPass(me, { pref: { x: 1, y: 0 } });
              if (p) { me.input({ kind: 'kick', params: p }); passed = true; }
            } else me.input({ kind: 'moveDir', dir: norm(HL - 9 - u.st.pos.x, -u.st.pos.y * 0.5) });
          } else {
            // into the box
            const tx = HL - 10; const ty = 0;
            const d = Math.hypot(tx - u.st.pos.x, ty - u.st.pos.y);
            me.input({ kind: 'moveDir', dir: d > 1.5 ? norm(tx - u.st.pos.x, ty - u.st.pos.y) : { x: 0, y: 0 } });
            if (passed && e.owner === u) passed = true;
          }
        }
        me.step(STEP);
        w.step();
      }
    }
  }
}

// ───────────────────────── report ─────────────────────────

export function measureFeel(opts: { seeds?: number; parts?: ('move' | 'pass' | 'cross')[] } = {}) {
  const seeds = opts.seeds ?? 15;
  const parts = opts.parts ?? ['move', 'pass', 'cross'];
  const out: Record<string, unknown> = {};
  if (parts.includes('move')) {
    const fix = (o: LocoRun) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r2(v)]));
    out.move = {
      userEasy: fix(locoRun(0.3, 'user')), userNormal: fix(locoRun(0.5, 'user')), ai: fix(locoRun(0.5, 'ai')),
      orient: Object.fromEntries(Object.entries(orientation()).map(([k, v]) => [k, r2(v)])),
    };
  }
  if (parts.includes('pass')) {
    const pass: Record<string, unknown> = {};
    for (const [name, diff] of [['easy', 0.3], ['normal', 0.5]] as const) {
      const fu = newPass(); const fa = newPass(); const cu = newPass(); const ca = newPass(); const op = newPass();
      const tu = newPass();
      const oo = newPass();
      passEpisodes('fast', diff, seeds, fu, fa, tu, oo);
      passEpisodes('calm', diff, seeds, cu, ca, tu, oo);
      oppPasses(diff, seeds, op);
      const ai = newPass();
      for (const k of ['n', 'ok', 'int', 'out', 'none', 'prog'] as const) ai[k] = fa[k] + ca[k];
      ai.arr = [...fa.arr, ...ca.arr];
      pass[name] = { userFast: passOut(fu), userCalm: passOut(cu), mates: passOut(ai), matesToUser: passOut(tu), opponents: passOut(op), opponentsOpenPlay: passOut(oo) };
    }
    out.pass = pass;
  }
  if (parts.includes('cross')) {
    const cross: Record<string, unknown> = {};
    for (const [name, diff] of [['easy', 0.3], ['normal', 0.5]] as const) {
      const r: Record<string, unknown> = {};
      for (const m of ['fast', 'calm', 'calmHigh'] as const) {
        const c = newCross(); wingCross(m, diff, seeds * 2, c);
        r[`wing_${m}`] = crossOut(c);
      }
      for (const m of ['hold', 'steer', 'calm'] as const) { const c = newCross(); crossReceive(m, diff, seeds * 2, c); r[`recv_${m}`] = crossOut(c); }
      const mc = newCross(); mateCrosses(diff, seeds, mc); r.mates = crossOut(mc);
      cross[name] = r;
    }
    out.cross = cross;
  }
  return out;
}
