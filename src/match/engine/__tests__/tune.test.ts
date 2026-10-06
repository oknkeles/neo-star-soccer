import { it } from 'vitest';
import { computeLaunch } from '../kick';
import { integrateBall, newAux, newReport, physEnv } from '../physics';
import { BR, DT } from '../constants';
import type { Attributes, BallState } from '../../../core/types';

const attrs = (o: Partial<Attributes>): Attributes => ({ shooting: 75, curl: 99, passing: 70, dribbling: 60, firstTouch: 60, heading: 60, tackling: 40, pace: 70, acceleration: 70, stamina: 70, strength: 60, jumping: 60, vision: 60, composure: 60, positioning: 60, goalkeeping: 10, ...o });

function run(curlAttr: number, curl: number, power: number, loft: number) {
  const L = computeLaunch({ dir: { x: 1, y: 0 }, power, loft, curl }, { attrs: attrs({ curl: curlAttr }), foot: 'R', weakFoot: 3, stamina: 1 }, { kind: 'ground', isShot: true, pressure: 0, difficulty: 0.5 }, null);
  const b: BallState = { pos: { x: 0, y: 0, z: BR }, vel: { x: L.vx, y: L.vy, z: L.vz }, spin: { x: L.wx, y: L.wy, z: L.wz }, ownerId: null, lastTouchId: null, lastTouchSide: null };
  const aux = newAux(); const env = physEnv(undefined); const rep = newReport();
  let t = 0;
  while (b.pos.x < 25 && t < 4) { integrateBall(b, aux, env, DT, rep); t += DT; }
  return { y: b.pos.y, z: b.pos.z, t, speed: L.speed };
}
it('tune', () => {
  for (const [c, cu, p, l] of [[99, 1, 0.7, 0.3], [99, 1, 0.75, 0.25], [50, 1, 0.7, 0.3], [99, 1, 0.9, 0.15], [70, 1, 0.7, 0.3], [99,0,0.7,0.3]]) {
    console.log(c, cu, p, l, JSON.stringify(run(c, cu, p, l)));
  }
});
