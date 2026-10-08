/**
 * MATCH VIEW 2D — the default real-time match view: a clean top-down canvas in the style of
 * HaxBall / ballball.club with easy, assisted controls. Same contract as the 3D
 * mountMomentView (src/match/view/api.ts): owns the requestAnimationFrame loop, reads
 * engine.state, calls engine.step(dt) and engine.input(cmd).
 *
 * Controls (keyboard first, mouse optional, touch fallback):
 *  - WASD / arrows: run · Shift: sprint · click on the pitch without the ball: run there.
 *  - SPACE (or left mouse): hold to charge, release to shoot. Aim is automatic (corner away from
 *    the keeper); an active mouse cursor aims instead. Q / E while charging = curl. Shift on
 *    release = chip when the keeper is off his line.
 *  - F (or right mouse): pass to the best team-mate in your direction, led into his run.
 *    R: through ball into space.
 *  - Without the ball: SPACE / F next to the ball = one-touch; next to the carrier = tackle
 *    (double-tap = slide); otherwise call for the ball (C too).
 *  - Set pieces: W / S choose the target. Touch: joystick + ŞUT / PAS / ARA buttons.
 */
import type { MomentSetup } from '../../core/types';
import type { MomentEngine } from '../engine/api';
import type { MomentViewHandle, MomentViewOptions } from '../view/api';
import { mountMomentView2DImpl } from './view';

export function mountMomentView2D(container: HTMLElement, engine: MomentEngine, setup: MomentSetup, opts: MomentViewOptions): MomentViewHandle {
  return mountMomentView2DImpl(container, engine, setup, opts);
}
