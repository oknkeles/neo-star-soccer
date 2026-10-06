/**
 * MATCH VIEW — three.js renderer + input + in-viewport controls for a MomentEngine.
 * Owns the requestAnimationFrame loop for a moment: reads engine.state, calls
 * engine.step(dt) and engine.input(cmd). Owner: view agent.
 *
 * Controls (mouse, touch and keyboard):
 *  - Tap/click on the pitch: run there (dribble if you have the ball). WASD/arrows also move; Shift sprints.
 *  - Press on/near the ball and drag OUT in the direction you want to kick: drag length = power,
 *    the SIDEWAYS bend of the drawn path = curl (falso), loft from the on-screen loft slider
 *    (mouse wheel / Q-E keys). While aiming time slows (focus meter). A predicted path is drawn
 *    (its length depends on vision). Release = kick. Swiping sideways right after release = aftertouch.
 *  - Space / "PAS!" button: call for the ball; double-tap ahead of yourself: call for a through ball.
 *  - Defending: tap near the ball carrier when close = tackle; double-tap = slide tackle.
 */
import type { CameraMode, Kit, MomentEvent, MomentSetup, ReplayFrame } from '../../core/types';
import type { MomentEngine } from '../engine/api';
import { mountMomentViewImpl } from './view';
import { mountStadiumBackdropImpl } from './backdrop';
import './strings';

export { gestureToKick, analyzeGesture, swipeToAftertouch, previewSeconds, truncatePath, defaultLoft } from './gesture';
export type { GesturePoint, GestureOptions, GestureAnalysis } from './gesture';
export { desiredFraming, orbitFraming } from './camera';

export interface MomentViewOptions {
  camera: CameraMode;
  quality: 'low' | 'medium' | 'high';
  shadows: boolean;
  /** Show the controls coach-marks overlay on start. */
  showHelp: boolean;
  onEvent?: (e: MomentEvent) => void;
  /** Called once the engine reports finished and the outcome animation completed (~1.5 s). */
  onFinished?: () => void;
}

export interface MomentViewHandle {
  dispose(): void;
  setCamera(mode: CameraMode): void;
  pause(paused: boolean): void;
  /** Play recorded frames (slow-motion, cinematic camera); onDone when finished or skipped. */
  playReplay(frames: ReplayFrame[], onDone: () => void): void;
}

export function mountMomentView(container: HTMLElement, engine: MomentEngine, setup: MomentSetup, opts: MomentViewOptions): MomentViewHandle {
  return mountMomentViewImpl(container, engine, setup, opts);
}

/** Animated 3D stadium backdrop for menus (slow orbit, floodlights, crowd). */
export function mountStadiumBackdrop(container: HTMLElement, opts: { kit?: Kit; time?: 'day' | 'dusk' | 'night' }): { dispose(): void } {
  return mountStadiumBackdropImpl(container, opts);
}
