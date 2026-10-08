/**
 * MATCH VIEW — three.js renderer + input + in-viewport controls for a MomentEngine.
 * Owns the requestAnimationFrame loop for a moment: reads engine.state, calls
 * engine.step(dt) and engine.input(cmd). Owner: view agent.
 *
 * Controls: the shared assisted scheme in src/match/controls/controls.ts (WASD camera-relative
 * run, SPACE = shot where you run, F = pass / call for the ball, R through ball, Q/E curl,
 * touch joystick + ŞUT / PAS). No slow motion. V cycles the camera, H shows the controls.
 */
import type { CameraMode, Kit, MomentEvent, MomentSetup, ReplayFrame, Vec3 } from '../../core/types';
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
  /** Pitch point → container CSS px (null when off screen). For tests / debugging tools. */
  project?(p: Vec3): { x: number; y: number } | null;
}

export function mountMomentView(container: HTMLElement, engine: MomentEngine, setup: MomentSetup, opts: MomentViewOptions): MomentViewHandle {
  return mountMomentViewImpl(container, engine, setup, opts);
}

/** Animated 3D stadium backdrop for menus (slow orbit, floodlights, crowd). */
export function mountStadiumBackdrop(container: HTMLElement, opts: { kit?: Kit; time?: 'day' | 'dusk' | 'night' }): { dispose(): void } {
  return mountStadiumBackdropImpl(container, opts);
}
