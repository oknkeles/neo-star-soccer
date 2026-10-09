/**
 * Support / give-and-go measurement harness: a scripted "human" plays open_play, counter and
 * build_up moments the way a player would with the keyboard scheme (carry, pass, run for the
 * return, call for the ball with F) and we measure how well the AI team-mates play around him.
 */
import type { MomentType, Vec2 } from '../../../core/types';
import { assistPass, assistShotDir, createMoment } from '../api';
import { HL } from '../constants';
import type { Engine } from '../engine';
import { aiUpdate, openMates } from '../ai';
import { makeSetup } from './helpers';

const STEP = 1 / 60;

export type Variant = 'gg' | 'call' | 'stand';

export interface SupportMetrics {
  episodes: number;
  /** (a) mean number of OPEN team-mates while the user has the ball. */
  openAvg: number;
  /** open team-mates level with or ahead of the ball (progressive options). */
  openFwd: number;
  /** share of on-ball samples with no open team-mate at all. */
  openNone: number;
  /** (b) give-and-go: user passes, runs → return reaches him within 3 s (and in stride). */
  ggAtt: number; ggOk: number; ggStride: number;
  /** (c) call for the ball (F while running): received within 3.5 s; lead ahead of the runner. */
  callAtt: number; callOk: number; callLead: number; callBehind: number; callLatency: number;
  /** (d) passes played to the user: clean controls; first-touch direction error (deg). */
  recvAtt: number; recvOk: number; ftErr: number;
  /** (e) team-mate receives from the user and we still have it 3 s later. */
  retAtt: number; retKept: number;
  /** (f) share of team-mate samples standing still / bunched (<6 m) during our possession. */
  still: number; bunched: number;
  goals: number;
  offsides: number;
  /** why passes to the user failed */
  recvWhy: Record<string, number>;
  /** wall-clock ms per 1/60 s engine step (mean / worst). */
  stepMs: number; stepMaxMs: number;
}

interface Acc {
  ep: number; openSum: number; openFwdSum: number; openN: number; openZero: number;
  ggAtt: number; ggOk: number; ggStride: number;
  callAtt: number; callOk: number; callLead: number; callBehind: number; callLat: number; callLatN: number;
  recvAtt: number; recvOk: number; ftSum: number; ftN: number;
  retAtt: number; retKept: number;
  stillN: number; bunchN: number; mateN: number; goals: number; offsides: number;
  why: Record<string, number>; stepSum: number; stepN: number; stepMax: number;
}

const newAcc = (): Acc => ({
  ep: 0, openSum: 0, openFwdSum: 0, openN: 0, openZero: 0, ggAtt: 0, ggOk: 0, ggStride: 0, callAtt: 0, callOk: 0, callLead: 0, callBehind: 0, callLat: 0, callLatN: 0,
  recvAtt: 0, recvOk: 0, ftSum: 0, ftN: 0, retAtt: 0, retKept: 0, stillN: 0, bunchN: 0, mateN: 0, goals: 0, offsides: 0, why: {}, stepSum: 0, stepN: 0, stepMax: 0,
});

/** Deterministic 0..1 from integers. */
function hash01(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const norm = (x: number, y: number): Vec2 => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };

function episode(type: MomentType, seed: number, difficulty: number, variant: Variant, acc: Acc): void {
  const me = createMoment(makeSetup(type, { seed, difficulty, timeLimit: 16 }));
  const e = me as unknown as Engine;
  const u = e.user;
  const uid = u.id;
  acc.ep++;
  let mode: 'carry' | 'after' | 'idle' = 'idle';
  let carryStart = 0;
  let carryDur = 0.6;
  let passN = 0;
  let afterStart = 0;
  let runDir: Vec2 | null = null;
  let called = false;
  let sampleT = 0;
  // pending measurements
  let gg = null as { t: number; mate: string; kicked: boolean } | null;
  let call = null as { t: number; dir: Vec2; kickT: number; minAlign: number } | null;
  const recv = new Map<number, number>(); // kick id → state (0 pending)
  let ft = null as { t: number; bx: number; by: number; dir: Vec2 } | null;
  const rets: { t: number; lost: boolean }[] = [];
  let mateSince = -1;
  let lastKickId = -1;
  const why = (w: string) => { acc.why[w] = (acc.why[w] ?? 0) + 1; };

  me.on((ev) => {
    const t = e.state.time;
    if (ev.t === 'receive') {
      if (ev.by === uid) {
        const k = e.lastKick;
        if (k && recv.get(k.id) === 0) { recv.set(k.id, 1); acc.recvOk++; }
        const sp = Math.hypot(u.st.vel.x, u.st.vel.y);
        if (gg && ev.from === gg.mate && t - gg.t <= 3.0) {
          acc.ggOk++;
          if (sp >= 3.5) acc.ggStride++;
          gg = null;
        }
        if (call && ev.from) {
          if (t - call.t <= 3.5) {
            acc.callOk++;
            const al = (u.st.vel.x * call.dir.x + u.st.vel.y * call.dir.y) / (sp || 1);
            if (sp >= 3 && al >= 0.75) acc.callLead++;
            if (call.minAlign < 0.2) acc.callBehind++;
          }
          call = null;
        }
        // (the touch is measured from 0.1 s after the reception: where the first touch sends it)
        if (e.ctl.dir) ft = { t, bx: NaN, by: NaN, dir: { ...e.ctl.dir } };
      } else if (ev.side === 'us' && ev.from === uid) {
        rets.push({ t, lost: false });
        acc.retAtt++;
        if (variant === 'gg') { gg = { t, mate: ev.by, kicked: false }; acc.ggAtt++; }
      }
      if (ev.side === 'them') for (const r of rets) if (t - r.t <= 3) r.lost = true;
    } else if (ev.t === 'offside') acc.offsides++;
    else if (ev.t === 'goal' && ev.side === 'us') acc.goals++;
  });

  for (let f = 0; f < 60 * 40 && !me.isFinished(); f++) {
    const s = e.state;
    const t = s.time;
    const has = e.owner === u;
    const dirX = u.dir;
    // pass bookkeeping (passes aimed at the user)
    const k = e.lastKick;
    if (k && k.id !== lastKickId) {
      lastKickId = k.id;
      if (k.side === 'us' && k.by !== u.i && k.target === u.i && !k.isShot) { recv.set(k.id, 0); acc.recvAtt++; }
      if (call && k.side === 'us' && k.by !== u.i && call.kickT < 0) { call.kickT = t; acc.callLat += t - call.t; acc.callLatN++; }
    }
    // a pass aimed at him that he touched without controlling (or anyone else touched first)
    if (k && recv.get(k.id) === 0 && !e.owner && s.ball.lastTouchId !== e.agents[k.by].id) {
      recv.set(k.id, 2);
      const who = e.agents.find((a) => a.id === s.ball.lastTouchId);
      why(who === u ? 'miscontrol' : who?.side === 'them' ? 'opp' : 'other');
    }
    if (k && recv.get(k.id) === 0 && e.owner && e.owner !== u) { recv.set(k.id, 2); why(e.owner.side === 'them' ? 'opp' : 'other'); }
    if (e.owner && e.owner.side === 'them') for (const r of rets) if (t - r.t <= 3) r.lost = true;
    if (ft && Number.isNaN(ft.bx) && t - ft.t >= 0.1) { ft.bx = s.ball.pos.x; ft.by = s.ball.pos.y; }
    if (ft && t - ft.t >= 0.4) {
      const dx = s.ball.pos.x - ft.bx;
      const dy = s.ball.pos.y - ft.by;
      const l = Math.hypot(dx, dy);
      const err = l < 0.3 ? 90 : (Math.acos(Math.max(-1, Math.min(1, (dx * ft.dir.x + dy * ft.dir.y) / l))) * 180) / Math.PI;
      acc.ftSum += err; acc.ftN++;
      ft = null;
    }
    if (call && call.kickT >= 0) {
      const sp = Math.hypot(u.st.vel.x, u.st.vel.y);
      if (sp > 1) call.minAlign = Math.min(call.minAlign, (u.st.vel.x * call.dir.x + u.st.vel.y * call.dir.y) / sp);
    }
    if (call && t - call.t > 3.5) call = null;
    if (gg && !gg.kicked && k && k.t >= gg.t && e.agents[k.by].id === gg.mate && k.target === u.i) { gg.kicked = true; why('ggKick'); }
    if (gg && t - gg.t > 3.0) { if (!gg.kicked) why(e.owner?.side === 'them' || s.ball.lastTouchSide === 'them' ? 'ggLost' : 'ggNoKick'); gg = null; }

    // ── samples ──
    sampleT -= STEP;
    if (sampleT <= 0 && s.phase !== 'intro') {
      sampleT = 0.1;
      if (has && !e.frozen) {
        const om = openMates(e, u).open;
        const n = om.length;
        acc.openSum += n; acc.openN++;
        acc.openFwdSum += om.filter((m) => (m.st.pos.x - s.ball.pos.x) * dirX > -3).length;
        if (n === 0) acc.openZero++;
      }
      if (e.owner && e.owner.side === 'us') {
        const ours = e.agents.filter((a) => a.side === 'us' && !a.isGK && !a.passive);
        for (const a of ours) {
          if (a.isUser || a === e.owner) continue;
          acc.mateN++;
          if (Math.hypot(a.st.vel.x, a.st.vel.y) < 0.4) acc.stillN++;
          let near = Infinity;
          for (const b of ours) if (b !== a) near = Math.min(near, Math.hypot(a.st.pos.x - b.st.pos.x, a.st.pos.y - b.st.pos.y));
          if (near < 6) acc.bunchN++;
        }
      }
    }

    // ── the scripted user ──
    if (s.phase !== 'intro') {
      const line = e.offsideX('us') * dirX;
      const fwd = () => {
        const y = u.st.pos.y;
        let d = norm(1, -Math.sign(y || 1) * 0.3 * (Math.abs(y) > 8 ? 1 : 0.3));
        // (staying onside; but a ball already played to him is run onto)
        if (u.st.pos.x * dirX > line - 1.2 && u.st.pos.x > 0 && !e.passForUser()) d = norm(0.05, -Math.sign(y || 1));
        return d;
      };
      if (has) {
        if (mode !== 'carry') { mode = 'carry'; carryStart = t; carryDur = 0.45 + 0.6 * hash01(seed, passN * 7 + 1); }
        const dist = Math.hypot(HL - s.ball.pos.x, s.ball.pos.y);
        // (keeps the direction he received it with for a moment: the first touch goes that way)
        const d = ft ? ft.dir : norm(HL - 9 - u.st.pos.x, -u.st.pos.y * 0.6);
        me.input({ kind: 'moveDir', dir: d });
        me.input({ kind: 'sprint', on: false });
        if (t - carryStart >= carryDur) {
          if (dist < 18) {
            const p = assistShotDir(me, { charge: 0.7, curl: 0, dir: d });
            if (p) me.input({ kind: 'kick', params: p });
          } else {
            const p = assistPass(me, { pref: { x: 1, y: 0 }, cone: (50 * Math.PI) / 180 }) ?? assistPass(me, { pref: { x: 1, y: 0 } });
            if (p) {
              me.input({ kind: 'kick', params: p });
              mode = 'after'; afterStart = t; passN++; runDir = null; called = false;
            }
          }
        }
      } else if (mode === 'after' || mode === 'carry') {
        if (mode === 'carry') { mode = 'after'; afterStart = t; runDir = null; called = false; }
        const mateHas = !!e.owner && e.owner.side === 'us' && !e.owner.isUser;
        if (mateHas) { if (mateSince < 0) mateSince = t; } else mateSince = -1;
        if (variant === 'gg') {
          runDir = fwd();
          me.input({ kind: 'moveDir', dir: runDir });
          me.input({ kind: 'sprint', on: true });
          if (!called && t - afterStart > 3.6 && mateHas) { called = true; me.input({ kind: 'callForBall', through: false }); }
        } else if (variant === 'call') {
          if (!called && mateHas && t - mateSince >= 0.35) {
            called = true;
            runDir = fwd();
            me.input({ kind: 'callForBall', through: false });
            call = { t, dir: runDir, kickT: -1, minAlign: 1 };
            acc.callAtt++;
          }
          if (called && runDir) {
            runDir = fwd();
            if (call) call.dir = runDir;
            me.input({ kind: 'moveDir', dir: runDir });
            me.input({ kind: 'sprint', on: true });
          } else me.input({ kind: 'moveDir', dir: { x: 0, y: 0 } });
          if (called && !call && mateHas && t - afterStart > 6) { called = false; afterStart = t; }
        } else {
          me.input({ kind: 'moveDir', dir: { x: 0, y: 0 } });
          if (!called && t - afterStart > 2.5 && mateHas) { called = true; me.input({ kind: 'callForBall', through: false }); }
        }
      } else {
        me.input({ kind: 'moveDir', dir: { x: 0, y: 0 } });
      }
    }
    const t0 = performance.now();
    me.step(STEP);
    const dt = performance.now() - t0;
    acc.stepSum += dt; acc.stepN++;
    if (dt > acc.stepMax) acc.stepMax = dt;
  }
  for (const r of rets) {
    if (!r.lost) acc.retKept++;
  }
  for (const v of recv.values()) if (v === 0) why('unresolved');
}

export function measureSupport(opts: { types?: MomentType[]; diffs?: number[]; seeds?: number; variants?: Variant[]; seed0?: number } = {}): SupportMetrics {
  const acc = newAcc();
  for (const type of opts.types ?? ['open_play', 'counter', 'build_up']) {
    for (const diff of opts.diffs ?? [0.3, 0.5]) {
      for (let seed = opts.seed0 ?? 1; seed < (opts.seed0 ?? 1) + (opts.seeds ?? 10); seed++) {
        for (const v of opts.variants ?? ['gg', 'call', 'stand']) episode(type, seed, diff, v, acc);
      }
    }
  }
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return {
    episodes: acc.ep,
    openAvg: r(acc.openSum / Math.max(1, acc.openN)),
    openFwd: r(acc.openFwdSum / Math.max(1, acc.openN)),
    openNone: r(acc.openZero / Math.max(1, acc.openN)),
    ggAtt: acc.ggAtt, ggOk: r(acc.ggOk / Math.max(1, acc.ggAtt)), ggStride: r(acc.ggStride / Math.max(1, acc.ggAtt)),
    callAtt: acc.callAtt, callOk: r(acc.callOk / Math.max(1, acc.callAtt)), callLead: r(acc.callLead / Math.max(1, acc.callOk)),
    callBehind: r(acc.callBehind / Math.max(1, acc.callOk)), callLatency: r(acc.callLat / Math.max(1, acc.callLatN)),
    recvAtt: acc.recvAtt, recvOk: r(acc.recvOk / Math.max(1, acc.recvAtt)), ftErr: r(acc.ftSum / Math.max(1, acc.ftN)),
    retAtt: acc.retAtt, retKept: r(acc.retKept / Math.max(1, acc.retAtt)),
    still: r(acc.stillN / Math.max(1, acc.mateN)), bunched: r(acc.bunchN / Math.max(1, acc.mateN)),
    goals: acc.goals, offsides: acc.offsides, recvWhy: acc.why,
    stepMs: r(acc.stepSum / Math.max(1, acc.stepN)), stepMaxMs: r(acc.stepMax),
  };
}

/** Mean wall-clock µs per coordinator update over a few live moments. */
export function coordinatorCost(): number {
  let total = 0;
  let n = 0;
  for (const type of ['open_play', 'counter', 'build_up'] as MomentType[]) {
    const me = createMoment(makeSetup(type, { seed: 4, difficulty: 0.4 }));
    const e = me as unknown as Engine;
    for (let f = 0; f < 60 * 1.5; f++) me.step(STEP);
    for (let i = 0; i < 300; i++) {
      const t0 = performance.now();
      aiUpdate(e);
      total += performance.now() - t0;
      n++;
      if (i % 10 === 0) me.step(STEP);
    }
  }
  return Math.round((total / n) * 1000);
}
