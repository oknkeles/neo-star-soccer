/** Scripted-shot harness shared by the balancing tests. */
import type { KickParams, MomentType } from '../../../core/types';
import { Rng } from '../../../core/rng';
import { createMoment } from '../api';
import { Engine } from '../engine';
import { GW, HL } from '../constants';
import { solveShot } from '../solver';
import { botStep } from '../api';
import { makeSetup, type SetupOpts } from './helpers';

export function engineFor(type: MomentType, seed: number, o: SetupOpts = {}): Engine {
  return createMoment(makeSetup(type, { ...o, seed })) as Engine;
}

/** Clear every outfield opponent out of the way (unpressured finishing). */
export function clearDefenders(e: Engine): void {
  for (const a of e.agents) {
    if (a.side === 'them' && !a.isGK) { a.st.pos.x = -30; a.st.pos.y = a.i - 15; a.passive = true; }
  }
}

export function aimShot(e: Engine, ty: number, tz: number, power: number, curl = 0): KickParams {
  const u = e.user;
  const b = e.state.ball.pos;
  const spec = e.kickSpec(u, { dir: { x: 1, y: 0 }, power, loft: 0.05, curl }, 'ground', true);
  return solveShot(e.env, e.kicker(u), spec, { x: b.x, y: b.y, z: b.z }, HL, ty, tz, power, curl, 0.06).params;
}

export function finish(e: Engine, max = 20): void {
  for (let f = 0; f < max * 60 && !e.isFinished(); f++) e.step(1 / 60);
}

/** Box finish from ~(HL-d, y0) with the user at the ball: returns the goal rate. */
export const lastSplit: Record<string, number> = {};
export function boxShots(n: number, target: 'corner' | 'centre', o: SetupOpts = {}): number {
  let goals = 0;
  for (const k of Object.keys(lastSplit)) delete lastSplit[k];
  for (let seed = 1; seed <= n; seed++) {
    const e = engineFor('one_on_one', seed, { userAttrs: { shooting: 70, composure: 70 }, ...o });
    const r = new Rng(seed * 31 + 7);
    clearDefenders(e);
    const u = e.user;
    u.st.pos.x = HL - r.float(11, 15); u.st.pos.y = r.float(-5, 5); u.st.facing = 0;
    e.placeBall({ x: u.st.pos.x + 0.4, y: u.st.pos.y, z: 0.11 });
    e.giveBall(u, false);
    // let the keeper set himself
    for (let f = 0; f < 50; f++) { e.input({ kind: 'moveDir', dir: { x: 0, y: 0 } }); e.step(1 / 60); }
    const side = r.chance(0.5) ? 1 : -1;
    const ty = target === 'corner' ? side * (GW - 0.5) : r.float(-0.6, 0.6);
    e.input({ kind: 'kick', params: aimShot(e, ty, target === 'corner' ? r.float(0.3, 1.6) : r.float(0.4, 1.4), 0.8) });
    finish(e);
    const oc = e.result().outcome;
    lastSplit[oc] = (lastSplit[oc] ?? 0) + 1;
    if (e.goalFor) goals++;
  }
  return goals / n;
}

export function penalties(n: number, o: SetupOpts = {}): number {
  let goals = 0;
  for (const k of Object.keys(lastSplit)) delete lastSplit[k];
  for (let seed = 1; seed <= n; seed++) {
    const e = engineFor('penalty', seed, { userAttrs: { shooting: 70, composure: 70 }, ...o });
    const r = new Rng(seed * 17 + 1);
    for (let f = 0; f < 70; f++) e.step(1 / 60);
    const side = r.chance(0.5) ? 1 : -1;
    e.input({ kind: 'kick', params: aimShot(e, side * (GW - 0.6), r.float(0.3, 1.5), 0.72) });
    finish(e);
    const oc = e.result().outcome;
    lastSplit[oc] = (lastSplit[oc] ?? 0) + 1;
    if (e.goalFor) goals++;
  }
  return goals / n;
}

export function freeKicks(n: number, o: SetupOpts = {}): { rate: number; outcomes: Record<string, number> } {
  let goals = 0;
  const outcomes: Record<string, number> = {};
  for (let seed = 1; seed <= n; seed++) {
    const r = new Rng(seed * 13 + 5);
    const d = r.float(20, 25);
    const y = r.float(-8, 8);
    const e = engineFor('free_kick', seed, { userAttrs: { shooting: 75, curl: 80, composure: 70 }, spot: { x: HL - Math.sqrt(Math.max(0, d * d - y * y)), y }, ...o });
    const bot = new Rng(seed * 101 + 3);
    for (let f = 0; f < 20 * 60 && !e.isFinished(); f++) { botStep(e, bot); e.step(1 / 60); }
    const res = e.result();
    outcomes[res.outcome] = (outcomes[res.outcome] ?? 0) + 1;
    if (e.goalFor) goals++;
  }
  return { rate: goals / n, outcomes };
}
