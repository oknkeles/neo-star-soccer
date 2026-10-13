/**
 * Shared bits of the "press any key to begin" hold and the stamina ("Aksiyon") bar, used by the
 * 3D HUD and the 2D canvas view alike: copy (TR + EN), colour ramp and the one-shot "tired" hint.
 *
 * The engine holds a fresh moment (state.awaitingStart) until the player sends { kind: 'start' };
 * the views show the prompt over the frozen scene and Controls turns the first key / tap into
 * that command (the key itself never also acts).
 */
import { registerStrings, t } from '../../core/i18n';
import type { MomentType } from '../../core/types';
import '../flow/strings';

registerStrings('mstart', {
  tr: {
    press: 'Başlamak için bir tuşa bas',
    tap: 'Başlamak için dokun',
    bar: 'Aksiyon',
    tired: 'Yoruldun!',
    helpGo: 'Anladım',
    helpKey: 'Bir tuş / dokun',
    helpStart: 'Pozisyon sen başlatana kadar bekler: sahneye bak, hazır olunca bir tuşa bas (dokunmatikte ekrana dokun).',
    helpBarKey: 'Aksiyon',
    helpBar: 'Alttaki Aksiyon çubuğu enerjin. Depar ve topla koşmak onu harcar; boşalınca yavaşlarsın. Paslaş, boşluğa koş, nefeslen.',
    barTip: 'Alttaki Aksiyon çubuğu enerjin: depar yorar, boşalınca yavaşlarsın.',
    introNext: 'Sonra bir tuşa basarak başlarsın',
    drillBar: 'Aksiyon çubuğu enerjini gösterir: depar yorar, boşalınca yavaşlarsın.',
  },
  en: {
    press: 'Press any key to begin',
    tap: 'Tap to begin',
    bar: 'Action',
    tired: 'Tired!',
    helpGo: 'Got it',
    helpKey: 'Any key / tap',
    helpStart: 'Each moment waits for you: look at the scene, press any key (or tap on touch) when you are ready.',
    helpBarKey: 'Action',
    helpBar: 'The Action bar at the bottom is your energy. Sprinting and running with the ball drain it; empty and you slow down. Pass, find space, catch your breath.',
    barTip: 'The Action bar at the bottom is your energy: sprinting drains it, empty and you slow down.',
    introNext: 'Then press any key to begin',
    drillBar: 'The Action bar shows your energy: sprinting drains it, empty and you slow down.',
  },
});

/** Below this the bar pulses and the "tired" hint shows once. */
export const TIRED_AT = 0.15;

export interface StartInfo {
  /** The moment title (BIG). */
  title: string;
  /** One line: what to do. */
  tip: string;
  /** Small second line about the Action bar. */
  bar: string;
  /** "Press any key to begin" / "Tap to begin". */
  key: string;
}

/** Copy of the start prompt for a moment type (title and tip reuse the intro card's strings). */
export function startInfo(type: MomentType, touch: boolean): StartInfo {
  const tip = t(`match.tip.${type}`);
  return {
    title: t(`match.mt.${type}`),
    tip: tip.startsWith('match.') ? '' : tip,
    bar: t('mstart.barTip'),
    key: t(touch ? 'mstart.tap' : 'mstart.press'),
  };
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const GREEN: [number, number, number] = [150, 240, 70];
const AMBER: [number, number, number] = [255, 203, 71];
const RED: [number, number, number] = [255, 79, 100];

/** Bar colour: green → amber (≈ 40 %) → red (≈ 12 %). */
export function staminaColor(v: number): string {
  const x = Math.max(0, Math.min(1, v));
  let a: [number, number, number];
  let b: [number, number, number];
  let k: number;
  if (x >= 0.4) { a = AMBER; b = GREEN; k = Math.min(1, (x - 0.4) / 0.3); }
  else { a = RED; b = AMBER; k = Math.max(0, (x - 0.12) / 0.28); }
  return `rgb(${Math.round(lerp(a[0], b[0], k))},${Math.round(lerp(a[1], b[1], k))},${Math.round(lerp(a[2], b[2], k))})`;
}

/** "Tired!" hint: shows once when the bar drops below TIRED_AT, re-arms after a recovery. */
export class TiredWatch {
  private armed = true;
  private until = -1;
  /** True while the bar is in the red zone (pulse). */
  low = false;
  /** Returns the hint's visibility 0..1 (clock in seconds). */
  update(v: number, clock: number): number {
    this.low = v < TIRED_AT;
    if (this.low) {
      if (this.armed) { this.armed = false; this.until = clock + 2.8; }
    } else if (v > 0.3) this.armed = true;
    const left = this.until - clock;
    return left <= 0 ? 0 : Math.min(1, left * 2);
  }
}
