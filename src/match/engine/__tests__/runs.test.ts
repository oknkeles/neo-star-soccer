/**
 * Runs in behind, through balls into them, and the AI's individual skills (runs-harness.ts):
 * loose regression guards on the numbers of the work (full before → after tables:
 * MEASURE=1 npx vitest run src/match/engine/__tests__/runs.explore.test.ts).
 */
import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../../../core/types';
import { createMoment, runnerCues } from '../api';
import type { Engine } from '../engine';
import { CalmAim } from '../../controls/calm';
import { makeSetup } from './helpers';
import { measureRuns, measureSkills } from './runs-harness';

const out = (tag: string, v: unknown) => process.stdout.write(`\n${tag} ${JSON.stringify(v)}\n`);

describe('runs in behind and through balls', () => {
  it('forwards time runs, the through ball is run onto in stride (normal)', () => {
    const m = measureRuns({ diffs: [0.5], seeds: 12, variants: ['R', 'calm'] });
    out('RUNS', m);
    // (before: 8.1 runs / min, 17 % of the time a live runner, 45 % first to the ball, 8 % in stride)
    expect(m.runsPerMin).toBeGreaterThanOrEqual(12);
    expect(m.liveShare).toBeGreaterThanOrEqual(0.18);
    expect(m.runOffside).toBeLessThanOrEqual(0.1);
    expect(m.thrN).toBeGreaterThan(20);
    expect(m.thrFirst).toBeGreaterThanOrEqual(0.5);
    expect(m.thrOffside).toBeLessThanOrEqual(0.05);
    expect(m.stride).toBeGreaterThanOrEqual(0.5);
    expect(m.reactS).toBeLessThanOrEqual(0.15);
    expect(m.stepMs).toBeLessThan(1);
  }, 120000);

  it('AI skills: beating a man, finishing clear chances (both teams)', () => {
    const s = measureSkills({ diffs: [0.5], seeds: 16 });
    out('SKILL', s);
    // (before: 22 of 80 duels won, 31 held off — the carrier mostly avoided the defender)
    expect(s.dribBeat / s.dribN).toBeGreaterThanOrEqual(0.4);
    expect(s.dribBeat / Math.max(1, s.dribBeat + s.dribLost)).toBeGreaterThanOrEqual(0.55);
    expect(s.finOn / s.finN).toBeGreaterThanOrEqual(0.8);
    expect(s.finGoal / s.finN).toBeGreaterThanOrEqual(0.45);
  }, 120000);

  it('calm mode: the runner path cue, a ball drawn onto it is run onto', () => {
    let tested = 0;
    for (let seed = 1; seed <= 30 && tested < 3; seed++) {
      const me = createMoment(makeSetup('open_play', { seed, difficulty: 0.5, userRole: 'AM', timeLimit: 20 }));
      me.input({ kind: 'start' });
      const e = me as unknown as Engine;
      const u = e.user;
      // carry the ball forward until a team-mate is making a run in behind
      let cue: ReturnType<typeof runnerCues>[number] | null = null;
      for (let f = 0; f < 60 * 6 && !me.isFinished(); f++) {
        if (e.owner === u) {
          me.input({ kind: 'moveDir', dir: { x: 1, y: -u.st.pos.y * 0.02 } });
          const live = runnerCues(me).filter((c) => c.live);
          if (live.length && e.state.time > 1) { cue = live[0]; break; }
        } else me.input({ kind: 'moveDir', dir: { x: 0, y: 0 } });
        me.step(1 / 60);
      }
      if (!cue || e.owner !== u) continue;
      me.input({ kind: 'aimStart', freeze: true });
      // frozen: the cue is there and stays put
      const cues = runnerCues(me);
      const c = cues.find((x) => x.id === cue!.id);
      expect(c).toBeTruthy();
      expect(c!.pts.length).toBeGreaterThanOrEqual(12);
      const runner = e.agents.find((a) => a.id === c!.id)!;
      expect(Math.hypot(c!.pts[0].x - runner.st.pos.x, c!.pts[0].y - runner.st.pos.y)).toBeLessThan(1.5);
      // a stroke from the ball to his projected run ~1.2 s ahead: snapped onto him, a ball he runs onto
      const b = e.state.ball.pos;
      const end: Vec2 = c!.pts[Math.min(c!.pts.length - 1, 11)];
      if ((end.x - b.x) * u.dir < 3) continue;
      const aim = new CalmAim(me, { dir: { x: 1, y: 0 }, power: 0.5, loft: 0, curl: 0 }, 'pass');
      aim.begin({ x: b.x + (end.x - b.x) * 0.15, y: b.y + (end.y - b.y) * 0.15 }, 'mouse');
      for (let k = 2; k <= 12; k++) aim.extend({ x: b.x + ((end.x - b.x) * k) / 12, y: b.y + ((end.y - b.y) * k) / 12 });
      expect(aim.end()).toBe(true);
      const an = aim.analysis();
      expect(an.snapped).toBe(true);
      expect(an.receiverId).toBe(runner.id);
      expect(an.through).toBe(true);
      me.input({ kind: 'kick', params: aim.params(), to: an.receiverId, through: an.through });
      expect(e.lastKick?.target).toBe(runner.i);
      // he gets there first and takes it in his stride
      let got: string | null = null;
      let speed = 0;
      const k = e.lastKick!;
      for (let f = 0; f < 60 * 4 && !me.isFinished(); f++) {
        me.step(1 / 60);
        const o = e.owner;
        if (o && o !== u) { got = o.id; speed = Math.hypot(o.st.vel.x, o.st.vel.y); break; }
      }
      // (a ball blocked / deflected on its way is no test of the run)
      if (k.oppTouched || (got === null && e.state.outcome === 'offside')) continue;
      tested++;
      expect(got).toBe(runner.id);
      // (still running when he takes it — not waiting for it)
      expect(speed).toBeGreaterThan(3);
    }
    expect(tested).toBeGreaterThanOrEqual(2);
  }, 60000);
});
