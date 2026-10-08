/** Simulated "human" for play-tests of the casual control assists (shared 3D / 2D keyboard scheme). */
import type { MomentEvent, MomentResult, MomentType } from '../../../core/types';
import { assistInfo, assistPass, assistShot, assistShotDir, createMoment, type MomentEngine } from '../api';
import { HL } from '../constants';
import { makeSetup } from './helpers';

const STEP = 1 / 60;

export interface Human {
  shootAt: number; holdFor: number; passFirst?: boolean; holdShoot?: boolean;
  /** Old auto-aim (corner away from the keeper) instead of shooting where he runs. */
  autoAim?: boolean;
}

export function humanPlay(type: MomentType, seed: number, difficulty: number, h: Human): { r: MomentResult | null; events: MomentEvent[] } {
  const e: MomentEngine = createMoment(makeSetup(type, { seed, difficulty, timeLimit: 16 }));
  const events: MomentEvent[] = [];
  e.on((ev) => events.push(ev));
  let chargeT = -1;
  let passed = false;
  let struck = false;
  for (let f = 0; f < 60 * 40 && !e.isFinished(); f++) {
    const s = e.state;
    const u = s.players.find((p) => p.isUser)!;
    const hasBall = s.ball.ownerId === u.id;
    if (s.phase !== 'intro') {
      if (hasBall || e.canKick()) {
        if (h.passFirst && !passed) {
          const p = assistPass(e, { pref: { x: 1, y: 0 }, cone: (50 * Math.PI) / 180 });
          if (p) { e.input({ kind: 'kick', params: p }); passed = true; }
        } else {
          const dx = HL - 9 - u.pos.x;
          const dy = -u.pos.y * 0.6;
          const l = Math.hypot(dx, dy) || 1;
          e.input({ kind: 'moveDir', dir: { x: dx / l, y: dy / l } });
          e.input({ kind: 'sprint', on: true });
          const dist = Math.hypot(HL - s.ball.pos.x, s.ball.pos.y);
          if (chargeT < 0 && (dist < h.shootAt || assistInfo(e).setPiece !== null)) chargeT = 0;
          if (chargeT >= 0) {
            chargeT += STEP;
            if (chargeT >= h.holdFor) {
              const charge = Math.min(1, chargeT / 0.6);
              // the scheme: SPACE strikes where he is running (here: at the goal area)
              const p = h.autoAim ? assistShot(e, { charge, curl: 0 }) : assistShotDir(e, { charge, curl: 0, dir: { x: dx / l, y: dy / l } });
              if (p) e.input({ kind: 'kick', params: p });
              chargeT = -1;
            }
          }
        }
      } else if (h.holdShoot && !s.ball.ownerId) {
        // holding SHOOT without the ball: strike an arriving ball first time (the 2D view's armed one-touch)
        const dx = u.pos.x - s.ball.pos.x;
        const dy = u.pos.y - s.ball.pos.y;
        const d = Math.hypot(dx, dy) || 1;
        const closing = (s.ball.vel.x * dx + s.ball.vel.y * dy) / d - (u.vel.x * dx + u.vel.y * dy) / d;
        if (!struck && (e.canKick() || (d < 2.6 && closing > 2 && d / closing < 0.3))) {
          const p = assistShotDir(e, { charge: 0.75, curl: 0, dir: { x: 1, y: -s.ball.pos.y * 0.04 } });
          if (p) { e.input({ kind: 'kick', params: p }); struck = true; }
        }
      } else {
        e.input({ kind: 'moveDir', dir: { x: 0, y: 0 } });
      }
    }
    e.step(STEP);
  }
  return { r: e.isFinished() ? e.result() : null, events };
}

export function humanRate(type: MomentType, difficulty: number, h: Human, n = 30) {
  let goals = 0;
  const outs: Record<string, number> = {};
  for (let seed = 1; seed <= n; seed++) {
    const { r } = humanPlay(type, seed, difficulty, h);
    if (r?.goalFor) goals++;
    const k = r?.outcome ?? 'unfinished';
    outs[k] = (outs[k] ?? 0) + 1;
  }
  return { goals: goals / n, outs };
}

