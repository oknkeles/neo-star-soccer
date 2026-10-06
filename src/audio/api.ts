/**
 * AUDIO — fully synthesized with WebAudio (no asset files): crowd ambience whose intensity
 * follows the action, cheers/groans/"oooh", whistles, ball kicks, net swish, post clang,
 * UI clicks, and a short goal fanfare. Owner: view agent.
 *
 * Safe everywhere: without an AudioContext (tests, SSR, old browsers) every call is a no-op.
 * The first pointer/key gesture anywhere on the page unlocks audio automatically.
 */
import { getSettings, onSettingsChange } from '../core/settings';
import { Synth } from './synth';

export type Sfx = 'kick_soft' | 'kick_hard' | 'whistle_short' | 'whistle_long' | 'whistle_final' | 'net' | 'post' | 'bounce' | 'save' | 'click' | 'notify' | 'cash' | 'levelup' | 'tackle';
export type CrowdBurst = 'cheer' | 'goal' | 'groan' | 'ooh' | 'boo' | 'applause';

export interface AudioApi {
  /** Must be called from a user gesture before sounds can play (idempotent). */
  unlock(): void;
  play(sfx: Sfx, volume?: number): void;
  /** Continuous crowd bed, 0 = silent, 1 = roaring. Smoothly interpolated. */
  setCrowd(level: number): void;
  burst(kind: CrowdBurst): void;
  /** Re-read volumes from settings. */
  refresh(): void;
  stopAll(): void;
}

const synth = new Synth();
let settingsHooked = false;
let gestureHooked = false;

function readVolumes() {
  try {
    const a = getSettings().audio;
    return { master: a.master, sfx: a.sfx, crowd: a.crowd, muted: a.muted };
  } catch {
    return { master: 0.8, sfx: 0.9, crowd: 0.7, muted: false };
  }
}

function hookSettings(): void {
  if (settingsHooked) return;
  settingsHooked = true;
  try { onSettingsChange(() => synth.setVolumes(readVolumes())); } catch { /* settings unavailable */ }
}

/** Unlock on the first user gesture anywhere (browsers require a gesture to start audio). */
function hookGesture(): void {
  if (gestureHooked || typeof window === 'undefined') return;
  gestureHooked = true;
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  const handler = () => {
    audio.unlock();
    if (synth.ready) {
      window.removeEventListener('pointerdown', handler, opts);
      window.removeEventListener('keydown', handler, opts);
      window.removeEventListener('touchend', handler, opts);
    }
  };
  window.addEventListener('pointerdown', handler, opts);
  window.addEventListener('keydown', handler, opts);
  window.addEventListener('touchend', handler, opts);
}

const safe = (fn: () => void) => {
  try { fn(); } catch { /* audio must never break the game */ }
};

export const audio: AudioApi = {
  unlock: () => safe(() => {
    hookSettings();
    synth.setVolumes(readVolumes());
    synth.unlock();
    synth.setVolumes(readVolumes());
  }),
  play: (sfx, volume) => safe(() => synth.play(sfx, volume)),
  setCrowd: (level) => safe(() => synth.setCrowd(level)),
  burst: (kind) => safe(() => synth.burst(kind)),
  refresh: () => safe(() => synth.setVolumes(readVolumes())),
  stopAll: () => safe(() => synth.stopAll()),
};

/** Muffles the crowd (low-pass) while the player is focused on aiming; 0 = off, 1 = full. */
export function setAudioFocus(amount: number): void {
  safe(() => synth.setFocus(amount));
}

/** True once an AudioContext is running (after the first gesture). */
export function audioReady(): boolean {
  return synth.ready;
}

hookGesture();
