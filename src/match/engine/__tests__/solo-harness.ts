/**
 * Solo-run limiter metrics: a scripted user who only dribbles at goal (sprint, steer past the man
 * in front, shoot at ~16 m) vs one who passes and moves (short carry, pass, run, call, shoot), over
 * moments that start deep (build_up, defend, counter). Goals per moment and how far the soloist got.
 */
import type { MomentType, Vec2 } from '../../../core/types';
import { assistPass, assistShotDir, createMoment } from '../api';
import { HL } from '../constants';
import type { Engine } from '../engine';
import { makeSetup } from './helpers';

const STEP = 1 / 60;
const norm = (x: number, y: number): Vec2 => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };

export type Style = 'solo' | 'passmove';

function defendStep(e: Engine): void {
  const u = e.user;
  const b = e.state.ball.pos;
  const d = Math.hypot(b.x - u.st.pos.x, b.y - u.st.pos.y);
  e.input({ kind: 'moveDir', dir: norm(b.x - u.st.pos.x, b.y - u.st.pos.y) });
  e.input({ kind: 'sprint', on: d > 3 });
  if (e.owner && e.owner.side !== u.side && d < 1.3 && u.cool <= 0) e.input({ kind: 'tackle', slide: false });
}

export function soloPlay(type: MomentType, seed: number, difficulty: number, style: Style): { goal: boolean; outcome: string; maxRun: number; shots: number } {
  const e = createMoment(makeSetup(type, { seed, difficulty, timeLimit: type === 'build_up' ? 18 : 14 })) as unknown as Engine;
  e.input({ kind: 'start' });
  const u = e.user;
  let carryFrom: number | null = null;
  let maxRun = 0;
  let shots = 0;
  let lastCall = -9;
  let ownSince = -1;
  for (let f = 0; f < 60 * 45 && !e.isFinished(); f++) {
    const s = e.state;
    if (s.phase !== 'intro' && s.phase !== 'outcome') {
      const b = s.ball.pos;
      const dist = Math.hypot(HL - b.x, b.y);
      if (e.owner === u) {
        if (carryFrom === null) carryFrom = u.st.pos.x;
        if (ownSince < 0) ownSince = s.time;
        maxRun = Math.max(maxRun, u.st.pos.x - carryFrom);
        let dir = norm(HL - 9 - u.st.pos.x, -u.st.pos.y * 0.6);
        // steer past the man in front
        const near = e.nearestOpp(u);
        if (near.o && near.d < 4.5 && (near.o.st.pos.x - u.st.pos.x) > -0.5) {
          const side = Math.sign(u.st.pos.y - near.o.st.pos.y) || 1;
          dir = norm(dir.x, dir.y + side * 0.9);
        }
        e.input({ kind: 'moveDir', dir });
        e.input({ kind: 'sprint', on: true });
        if (dist < 16.5) {
          const p = assistShotDir(e, { charge: 0.8, curl: 0, dir: norm(HL - b.x, -b.y * 0.5) });
          if (p) { e.input({ kind: 'kick', params: p }); shots++; }
        } else if (style === 'passmove') {
          const pressed = e.pressureOn(u) > 0.35;
          if (s.time - ownSince > (pressed ? 0.35 : 1.1)) {
            const p = assistPass(e, { pref: { x: 1, y: 0 }, cone: (60 * Math.PI) / 180 }) ?? assistPass(e, { pref: { x: 1, y: 0 } });
            if (p) e.input({ kind: 'kick', params: p });
          }
        }
      } else {
        carryFrom = null;
        ownSince = -1;
        if (e.owner && e.owner.side !== u.side) defendStep(e);
        else if (!e.owner && s.ball.lastTouchSide !== u.side && type === 'defend') defendStep(e);
        else if (!e.owner && e.passForUser()) e.input({ kind: 'moveDir', dir: { x: 0, y: 0 } });
        else {
          // off the ball: run forward into the inside channel and call for it
          const tx = Math.min(HL - 12, Math.max(u.st.pos.x + 8, b.x + 6));
          const ty = u.st.pos.y * 0.7;
          e.input({ kind: 'moveDir', dir: norm(tx - u.st.pos.x, ty - u.st.pos.y) });
          e.input({ kind: 'sprint', on: false });
          if (style === 'passmove' && s.time - lastCall > 1.6 && e.owner && e.owner.side === u.side) { e.input({ kind: 'callForBall', through: false }); lastCall = s.time; }
        }
      }
    }
    e.step(STEP);
  }
  const r = e.isFinished() ? e.result() : null;
  return { goal: !!r?.goalFor, outcome: r?.outcome ?? 'unfinished', maxRun, shots };
}

export function soloRate(type: MomentType, difficulty: number, style: Style, n = 30) {
  let goals = 0;
  let run = 0;
  let long = 0;
  const outs: Record<string, number> = {};
  for (let seed = 1; seed <= n; seed++) {
    const r = soloPlay(type, seed, difficulty, style);
    if (r.goal) goals++;
    run += r.maxRun;
    if (r.goal && r.maxRun > 40) long++;
    outs[r.outcome] = (outs[r.outcome] ?? 0) + 1;
  }
  return { goals: Math.round((goals / n) * 100) / 100, longSoloGoals: long, avgRun: Math.round(run / n), outs };
}
