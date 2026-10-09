/**
 * Play-tests of the casual control assists: a simple "human" holds a direction toward goal,
 * presses SHOOT (≈0.4 s charge) or PASS, exactly like the shared keyboard controls.
 */
import { describe, expect, it } from 'vitest';
import type { MomentEvent, MomentType } from '../../../core/types';
import { assistPass, assistShotDir, createMoment, goalBound } from '../api';
import { HL } from '../constants';
import { makeSetup } from './helpers';
import { humanPlay, humanRate } from './human';

describe('assisted controls play-test', () => {
  it('one-on-one: run at goal and shoot scores often on easy', () => {
    const easy = humanRate('one_on_one', 0.3, { shootAt: 14, holdFor: 0.4 });
    const normal = humanRate('one_on_one', 0.5, { shootAt: 14, holdFor: 0.4 });
    console.log('one_on_one easy', easy, 'normal', normal);
    expect(easy.goals).toBeGreaterThanOrEqual(0.5);
    expect(normal.goals).toBeGreaterThanOrEqual(0.3);
  }, 60000);

  it('open play: dribble + shoot scores regularly on easy', () => {
    const easy = humanRate('open_play', 0.3, { shootAt: 17, holdFor: 0.35 });
    console.log('open_play easy', easy);
    expect(easy.goals).toBeGreaterThanOrEqual(0.25);
  }, 60000);

  it('set pieces: assisted penalties and free kicks are scoreable', () => {
    const pen = humanRate('penalty', 0.3, { shootAt: 99, holdFor: 0.4 });
    const fk = humanRate('free_kick', 0.3, { shootAt: 99, holdFor: 0.4 });
    console.log('penalty easy', pen, 'free_kick easy', fk);
    expect(pen.goals).toBeGreaterThanOrEqual(0.65);
    expect(fk.goals).toBeGreaterThanOrEqual(0.2);
  }, 60000);

  it('crosses: holding SHOOT finishes a fair share first time', () => {
    const r = humanRate('cross_receive', 0.3, { shootAt: 0, holdFor: 0, holdShoot: true });
    console.log('cross_receive easy', r);
    // the scripted "human" does not steer at all (only the auto-run onto the cross)
    expect(r.goals).toBeGreaterThanOrEqual(0.1);
  }, 60000);

  it('assisted passes reach team-mates', () => {
    let ok = 0;
    let n = 0;
    for (const type of ['open_play', 'build_up', 'counter'] as MomentType[]) {
      for (let seed = 1; seed <= 15; seed++) {
        const { events } = humanPlay(type, seed, 0.3, { shootAt: 0, holdFor: 0, passFirst: true });
        const kick = events.findIndex((ev) => ev.t === 'kick' && ev.by.startsWith('us') && !ev.shot);
        if (kick < 0) continue;
        n++;
        const next = events.slice(kick + 1).find((ev) => ev.t === 'receive' || ev.t === 'offside' || ev.t === 'out');
        if (next && next.t === 'receive' && next.side === 'us') ok++;
      }
    }
    console.log('pass completion', ok, '/', n);
    expect(n).toBeGreaterThan(20);
    expect(ok / n).toBeGreaterThanOrEqual(0.75);
  }, 60000);
});

describe('direction-based controls (shoot where you run, F = pass / call)', () => {
  it('a run at goal snaps into the goal mouth; a run elsewhere is struck exactly that way', () => {
    const e = createMoment(makeSetup('one_on_one', { seed: 3, difficulty: 0.3 }));
    for (let i = 0; i < 90; i++) e.step(1 / 60);
    const b = e.state.ball.pos;
    const toGoal = { x: HL - b.x, y: -b.y };
    const l = Math.hypot(toGoal.x, toGoal.y);
    const at = { x: toGoal.x / l, y: toGoal.y / l };
    expect(goalBound(e, at)).toBe(true);
    const shot = assistShotDir(e, { charge: 0.5, curl: 0, dir: at })!;
    const path = e.predictKick(shot, 3);
    const cross = path.find((p) => p.x >= HL - 0.05);
    expect(cross).toBeTruthy();
    expect(Math.abs(cross!.y)).toBeLessThan(3.66);
    // sideways: no aim assist, the ball goes exactly where he runs
    const side = { x: 0, y: 1 };
    expect(goalBound(e, side)).toBe(false);
    const p2 = assistShotDir(e, { charge: 0.3, curl: 0, dir: side })!;
    expect(p2.dir.x).toBeCloseTo(0, 5);
    expect(p2.dir.y).toBeCloseTo(1, 5);
  });

  it('F without the ball: a team-mate passes straight to the user (easy and normal)', () => {
    for (const diff of [0.3, 0.5]) {
      let n = 0;
      let ok = 0;
      let slow = 0;
      let latest = 0;
      for (const type of ['build_up', 'open_play', 'counter'] as MomentType[]) {
        for (let seed = 1; seed <= 12; seed++) {
          const e = createMoment(makeSetup(type, { seed, difficulty: diff, timeLimit: 16 }));
          const evs: { t: number; ev: MomentEvent }[] = [];
          e.on((ev) => evs.push({ t: e.state.time, ev }));
          let calledAt = -1;
          let mate = '';
          for (let f = 0; f < 60 * 14 && !e.isFinished(); f++) {
            const s = e.state;
            const u = s.players.find((p) => p.isUser)!;
            if (s.phase !== 'intro' && calledAt < 0) {
              if (s.ball.ownerId === u.id) {
                const p = assistPass(e, { pref: { x: 1, y: 0 }, cone: (50 * Math.PI) / 180 });
                if (p) e.input({ kind: 'kick', params: p });
              } else {
                const o = s.players.find((p) => p.id === s.ball.ownerId);
                if (o && o.side === 'us' && !o.isUser && o.role !== 'GK' && Math.hypot(o.pos.x - u.pos.x, o.pos.y - u.pos.y) < 30) {
                  e.input({ kind: 'callForBall', through: false });
                  calledAt = s.time;
                  mate = o.id;
                }
              }
            }
            e.step(1 / 60);
            if (calledAt >= 0 && s.time - calledAt > 1.5) break;
          }
          if (calledAt < 0) continue;
          n++;
          const kick = evs.find((x) => x.t >= calledAt && x.ev.t === 'kick' && x.ev.by === mate);
          if (kick) { ok++; if (kick.t - calledAt > 0.3) slow++; latest = Math.max(latest, kick.t - calledAt); }
        }
      }
      console.log('call for the ball', diff, ok, '/', n, 'slow', slow, 'latest', latest.toFixed(2));
      expect(n).toBeGreaterThan(10);
      expect(ok / n).toBeGreaterThanOrEqual(0.8);
      // straight away, unless the lane is shut and he is about to come free: then a beat (≤ ~0.6 s)
      expect(slow).toBeLessThanOrEqual(Math.ceil(n * 0.15));
      expect(latest).toBeLessThanOrEqual(0.8);
    }
  }, 60000);
});
