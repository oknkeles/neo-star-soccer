/**
 * Play-tests of the casual control assists: a simple "human" holds a direction toward goal,
 * presses SHOOT (≈0.4 s charge) or PASS, exactly like the 2D view's keyboard controls.
 */
import { describe, expect, it } from 'vitest';
import type { MomentType } from '../../../core/types';
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
