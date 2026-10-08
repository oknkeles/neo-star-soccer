/**
 * Easy, assisted controls shared by the 3D and the 2D match views (keyboard first, touch
 * fallback, mouse optional), translated into engine ControlCommands. Kicks go where the player
 * RUNS; the engine assists solve power / aim (gentle goal-mouth assist when running at goal).
 *
 *  - WASD / arrows: run (camera-relative in 3D: "up" = away from the camera) · Shift: sprint
 *  - SPACE with the ball: hold to charge (~0.6 s), release = shot in the running direction
 *    (no keys held: the facing direction). Q / E while charging: curl. Shift on release: chip.
 *  - SPACE without the ball: near a loose ball = one-touch shot; near the carrier = tackle
 *    (double-tap: slide); a team-mate on the ball = call for it.
 *  - F with the ball: pass to the best team-mate in the running direction (±50°, else the most
 *    open one ahead). Without the ball: call for it (held while running = through ball ahead).
 *  - R: through ball (without the ball: ask for one) · C: call for the ball.
 *  - Set pieces: W / S move the target along the goal line.
 *  - Mouse: click the pitch = run there. Mouse aiming only with `mouseAim`.
 *
 * "Sakin" (calm, the default control mode, settings.controlMode): SPACE (or F) with the ball —
 * or with a loose ball / incoming pass in reach — FREEZES the game and opens the aim (see
 * calm.ts): draw the kick with the mouse / finger (direction, length = power, bend = curl) or
 * set it with the keys (A / D direction, W / S power, Q / E curl, Z loft), SPACE / Enter /
 * releasing the mouse = kick, Esc = cancel. Running, calling for the ball etc. stay real-time.
 */
import type { KickParams, Vec2, Vec3 } from '../../core/types';
import {
  assistInfo, assistPass, assistShot, assistShotDir, goalBound, kickDir, pickPass, type AssistInfo, type MomentEngine, type PassPick,
} from '../engine/api';
import type { AimAnalysis } from '../engine/aim';
import { audio } from '../../audio/api';
import { t } from '../../core/i18n';
import { getSettings } from '../../core/settings';
import { CalmAim, type AimSrc } from './calm';
import '../view2d/strings';

const CHARGE_TIME = 0.6;
const DOUBLE_TAP = 0.32;
const MOUSE_ACTIVE = 2.5;
/** Pass cone around the running direction. */
const PASS_CONE = (50 * Math.PI) / 180;
/** Holding F (without the ball) this long while running = ask for a through ball. */
const THROUGH_HOLD = 0.3;

type Src = 'key' | 'mouse' | 'touch';

interface Charge { t: number; src: Src; curl: number; aim: Vec2 | null; startAim: Vec2 | null }

export type ControlsMode = 'attack' | 'noBall' | 'defend' | 'setPiece' | 'corner';

/** The frozen calm-mode aim (what the views draw while the game is stopped). */
export interface CalmOverlay {
  analysis: AimAnalysis;
  /** Bumped when the analysis changed (rebuild the path only then). */
  version: number;
  /** Shown kick (after the pass assist). */
  power: number;
  curl: number;
  loftIdx: number;
  /** The stroke being / last drawn (pitch frame; the ball is its implicit start), null = keys. */
  stroke: readonly Vec2[] | null;
  drawing: boolean;
  src: AimSrc;
  intent: 'shot' | 'pass' | 'setPiece';
}

export interface ControlsOverlay {
  charge: { value: number; curl: number; chip: boolean; params: KickParams | null; path: Vec3[] } | null;
  pass: PassPick | null;
  info: AssistInfo;
  mode: ControlsMode;
  aimPoint: Vec2 | null;
  touch: boolean;
  /** Calm mode: the game is stopped and the user sets his kick. */
  calm: CalmOverlay | null;
}

export interface ControlsOptions {
  /** CSS-pixel position on the surface → world metres (null when off the pitch). */
  toWorld: (x: number, y: number) => Vec2 | null;
  /** Whether the controls may act (live, not paused / replaying / finished). */
  enabled: () => boolean;
  /** Screen "up" / "right" as pitch-frame unit vectors (3D camera). Default: up = +y, right = +x. */
  axes?: () => { up: Vec2; right: Vec2 };
  /** The cursor aims shots / passes (off by default: kicks follow the running direction). */
  mouseAim?: boolean;
  /** Control mode override (default: settings.controlMode, 'calm'). */
  controlMode?: 'calm' | 'fast';
}

/** The control mode in the settings ('calm' unless the player picked 'fast'). */
export function controlMode(): 'calm' | 'fast' {
  try { return getSettings().controlMode === 'fast' ? 'fast' : 'calm'; } catch { return 'calm'; }
}

/** Key → help text rows of the calm scheme (Settings, help cards). Keys are i18n keys. */
export const CALM_ROWS: [string, string][] = [
  ['WASD / ← ↑ → ↓', 'v2d.help.move'],
  ['Shift', 'v2d.help.sprint'],
  ['SPACE', 'v2d.calm.space'],
  ['v2d.help.mouseKey', 'v2d.calm.draw'],
  ['A / D · W / S', 'v2d.calm.keys'],
  ['Q / E · Z', 'v2d.calm.curlLoft'],
  ['SPACE / Enter · Esc', 'v2d.calm.confirm'],
  ['F', 'v2d.calm.f'],
  ['SPACE / F', 'v2d.help.defend'],
];

/** The key column of a help row (may be an i18n key itself). */
export function keyLabel(k: string): string {
  return k.startsWith('v2d.') ? t(k) : k;
}

/** Help rows of a control mode (the first column may itself be an i18n key). */
export function controlRows(mode: 'calm' | 'fast' = controlMode()): [string, string][] {
  return mode === 'calm' ? CALM_ROWS : CONTROL_ROWS;
}

/** Key → help text rows of the fast (real-time) scheme. Keys are i18n keys. */
export const CONTROL_ROWS: [string, string][] = [
  ['WASD / ← ↑ → ↓', 'v2d.help.move'],
  ['Shift', 'v2d.help.sprint'],
  ['SPACE', 'v2d.help.shoot'],
  ['Q / E', 'v2d.help.curl'],
  ['F', 'v2d.help.pass'],
  ['R', 'v2d.help.through'],
  ['C', 'v2d.help.call'],
  ['SPACE / F', 'v2d.help.defend'],
  ['W / S', 'v2d.help.setPiece'],
];

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyF', 'KeyR', 'KeyC', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight']);
/** Extra keys used only while the calm aim is open. */
const AIM_KEYS = new Set(['KeyZ', 'Enter', 'NumpadEnter', 'Escape']);

export class Controls {
  private keys = new Set<string>();
  private charge: Charge | null = null;
  private lastDir = { x: 0, y: 0 };
  private sprint = false;
  private clock = 0;
  private lastTap: Record<string, number> = {};
  private armed: { kind: 'shot' | 'pass'; until: number; hold: string | null } | null = null;
  private tackleQ: { until: number; slide: boolean } | null = null;
  private mouse: { sx: number; sy: number; world: Vec2 | null; moved: number; inside: boolean } = { sx: 0, sy: 0, world: null, moved: -99, inside: false };
  private dragMove = false;
  private dragT = 0;
  private offset = 0;
  private pickT = 0;
  private pick: PassPick | null = null;
  private pathT = 0;
  private aimParams: KickParams | null = null;
  private aimPath: Vec3[] = [];
  private touchDir: Vec2 = { x: 0, y: 0 };
  private touchSprint = false;
  private passHeld = -1;
  private throughCallT = 0;
  touchMode = false;
  private disposers: (() => void)[] = [];
  private chipHeld = false;
  /** Set when the user did something (hides the hint). */
  acted = 0;
  // ── calm mode ──
  private aim: CalmAim | null = null;
  /** Keys already held when the aim opened (no aim adjustment until pressed again). */
  private aimHeld = new Set<string>();
  /** Keys pressed while aiming (no movement until released). */
  private aimKeys = new Set<string>();
  private aimPointer: number | null = null;
  private rotHold = 0;
  private wheelAcc = 0;
  private wheelT = -9;
  private forceDir = false;
  private setPieceAimed = false;

  constructor(private engine: MomentEngine, private surface: HTMLElement, private opts: ControlsOptions) {
    const on = <K extends keyof WindowEventMap>(tg: Window | HTMLElement, ev: K, fn: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => {
      tg.addEventListener(ev, fn as EventListener, o);
      this.disposers.push(() => tg.removeEventListener(ev, fn as EventListener, o));
    };
    on(window, 'keydown', (e) => this.onKey(e, true));
    on(window, 'keyup', (e) => this.onKey(e, false));
    on(window, 'blur', () => this.releaseAll());
    on(surface, 'pointermove', (e) => this.onPointerMove(e));
    on(surface, 'pointerdown', (e) => this.onPointerDown(e));
    on(window, 'pointerup', (e) => this.onPointerUp(e));
    on(surface, 'pointerleave', () => { this.mouse.inside = false; });
    on(surface, 'contextmenu', (e) => e.preventDefault());
    on(surface, 'wheel', (e) => this.onWheel(e), { passive: false });
    try {
      this.touchMode = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
    } catch { this.touchMode = false; }
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
  }

  private get state() { return this.engine.state; }
  private get userId(): string {
    return this.state.players.find((p) => p.isUser)?.id ?? this.engine.setup.userId;
  }
  private user() { return this.state.players.find((p) => p.isUser) ?? null; }
  private owner() {
    const id = this.state.ball.ownerId;
    return id ? this.state.players.find((p) => p.id === id) ?? null : null;
  }
  private hasBall(): boolean { return this.state.ball.ownerId === this.userId; }
  private canKick(): boolean { try { return this.engine.canKick(); } catch { return false; } }
  private send(cmd: Parameters<MomentEngine['input']>[0]): void {
    try { this.engine.input(cmd); } catch { /* engine refused */ }
  }

  private mouseActive(): boolean {
    return !!this.opts.mouseAim && !this.touchMode && this.mouse.inside && !!this.mouse.world && this.clock - this.mouse.moved < MOUSE_ACTIVE;
  }

  /** Calm controls ("stop & draw") on? */
  get calm(): boolean {
    return (this.opts.controlMode ?? controlMode()) === 'calm';
  }

  /** The calm aim is open (the game is stopped). */
  get aiming(): boolean { return this.aim !== null; }

  private releaseAll(): void {
    this.keys.clear();
    this.aimHeld.clear();
    this.aimKeys.clear();
    this.charge = null;
    this.armed = null;
    this.passHeld = -1;
    this.touchDir = { x: 0, y: 0 };
    this.touchSprint = false;
    this.dragMove = false;
  }

  /** Cancel an in-progress charge (pause, replay, finish). */
  cancel(): void {
    if (this.aim) this.closeAim(false);
    this.charge = null;
    this.armed = null;
    this.tackleQ = null;
    this.dragMove = false;
    this.passHeld = -1;
  }

  // ───────────────────────── keyboard ─────────────────────────

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (isTyping(e.target)) return;
    const code = e.code;
    if (!GAME_KEYS.has(code) && !(this.aim && AIM_KEYS.has(code))) {
      if (!down) { this.aimKeys.delete(code); this.aimHeld.delete(code); }
      return;
    }
    if (!this.opts.enabled()) { if (!down) { this.keys.delete(code); this.aimKeys.delete(code); this.aimHeld.delete(code); } return; }
    if (code === 'Space' || code.startsWith('Arrow')) e.preventDefault();
    if (this.aim) {
      // the game is stopped: keys set the kick
      e.preventDefault();
      if (down) {
        audio.unlock();
        this.acted = this.clock;
        if (e.repeat) return;
        this.keys.add(code);
        if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter' || code === 'KeyF') this.aimConfirm();
        else if (code === 'Escape') this.aimAbort();
        else if (code === 'KeyZ') this.aim.cycleLoft(1);
      } else {
        this.keys.delete(code);
        this.aimHeld.delete(code);
        this.aimKeys.delete(code);
      }
      return;
    }
    if (down) {
      audio.unlock();
      if (e.repeat) return;
      this.keys.add(code);
      this.acted = this.clock;
      if (code === 'Space') this.action('shoot', 'key', 'Space');
      else if (code === 'KeyF') { this.passHeld = this.clock; this.action('pass', 'key', 'KeyF'); }
      else if (code === 'KeyR') this.action('through', 'key', 'KeyR');
      else if (code === 'KeyC') this.call(false, 'KeyC');
    } else {
      this.keys.delete(code);
      this.aimKeys.delete(code);
      this.aimHeld.delete(code);
      if (code === 'Space' && this.charge?.src === 'key') this.release();
      if (code === 'KeyF') this.passHeld = -1;
      if (this.armed?.hold === code) this.armed.until = Math.min(this.armed.until, this.clock + 0.2);
    }
  }

  private doubleTap(code: string): boolean {
    const prev = this.lastTap[code] ?? -9;
    this.lastTap[code] = this.clock;
    return this.clock - prev < DOUBLE_TAP;
  }

  private call(through: boolean, code: string): void {
    const dbl = this.doubleTap(code);
    this.send({ kind: 'callForBall', through: through || dbl });
  }

  /** SHOOT / PASS / THROUGH pressed. */
  action(kind: 'shoot' | 'pass' | 'through', src: Src, code: string): void {
    const dbl = this.doubleTap(code);
    if (this.state.phase === 'intro' && !this.hasBall()) return;
    if (this.calm && (this.hasBall() || this.canKick())) {
      // calm: stop the game and set the kick
      this.openAim(kind, src);
      return;
    }
    if (this.hasBall()) {
      if (kind === 'shoot') this.startCharge(src);
      else this.pass(kind === 'through', src);
      return;
    }
    if (this.canKick()) {
      // one-touch: strike it now
      if (kind === 'shoot') this.fireShot(0.7, 0, src === 'mouse' ? this.mouse.world : null);
      else this.pass(kind === 'through', src);
      return;
    }
    const s = this.state;
    const u = this.user();
    if (!u) return;
    const owner = this.owner();
    if (owner && owner.side === 'them') {
      const d = Math.hypot(owner.pos.x - u.pos.x, owner.pos.y - u.pos.y);
      if (d < 4 && kind !== 'through') {
        this.tackleQ = { until: this.clock + 0.7, slide: dbl };
        if (d < 1.3 || (dbl && d < 2.3)) this.doTackle();
      }
      return;
    }
    if (!owner) {
      const d = Math.hypot(s.ball.pos.x - u.pos.x, s.ball.pos.y - u.pos.y);
      if (d < 7 && kind !== 'through') {
        this.armed = { kind: kind === 'shoot' ? 'shot' : 'pass', until: this.clock + 0.6, hold: src === 'key' ? code : src === 'touch' ? code : null };
        return;
      }
    }
    // a team-mate has it (or is about to): ask for it
    if (!owner || owner.side === 'us') this.send({ kind: 'callForBall', through: kind === 'through' || dbl });
  }

  // ───────────────────────── calm aim ─────────────────────────

  /** Stop the game and open the aim, seeded with a sensible kick (shot at goal / pass). */
  private openAim(kind: 'shoot' | 'pass' | 'through', src: Src): boolean {
    if (this.aim) return true;
    if (!this.canKick()) return false;
    this.send({ kind: 'aimStart', freeze: true });
    if (this.engine.frozenForAim === false) return false;
    const e = this.engine;
    const info = assistInfo(e, this.offset);
    const dir = this.worldDir();
    let seed: KickParams | null = null;
    let intent: 'shot' | 'pass' | 'setPiece' = 'pass';
    try {
      if (info.setPiece === 'corner') {
        intent = 'setPiece';
        const b = this.state.ball.pos;
        const spot = { x: 52.5 - 9, y: 0 };
        seed = assistPass(e, { pref: { x: spot.x - b.x, y: spot.y - b.y }, toward: spot });
        if (seed && seed.loft < 0.25) seed = null;
        if (!seed) {
          const l = Math.hypot(spot.x - b.x, spot.y - b.y) || 1;
          seed = { dir: { x: (spot.x - b.x) / l, y: (spot.y - b.y) / l }, power: 0.62, loft: 0.6, curl: 0 };
        }
      } else if (info.setPiece) {
        intent = 'setPiece';
        seed = assistShotDir(e, { charge: info.setPiece === 'penalty' ? 0.7 : 0.72, curl: 0, dir: null, offset: this.offset });
      } else {
        const shotLook = kind === 'shoot' && !!info.target && (info.dist < 20 || goalBound(e, kickDir(e, dir)));
        if (shotLook) {
          intent = 'shot';
          seed = assistShotDir(e, { charge: 0.75, curl: 0, dir, offset: 0 });
        } else {
          seed = assistPass(e, { pref: dir ?? kickDir(e, null), through: kind === 'through', cone: kind === 'through' ? undefined : PASS_CONE })
            ?? assistPass(e, { pref: dir ?? kickDir(e, null) });
          if (!seed && kind === 'shoot' && info.target) { intent = 'shot'; seed = assistShotDir(e, { charge: 0.75, curl: 0, dir, offset: 0 }); }
        }
      }
    } catch { seed = null; }
    if (!seed) seed = { dir: kickDir(e, dir), power: 0.5, loft: 0, curl: 0 };
    this.aim = new CalmAim(e, seed, intent);
    this.aim.src = src;
    this.aimHeld = new Set(this.keys);
    this.aimKeys.clear();
    this.charge = null;
    this.armed = null;
    this.rotHold = 0;
    this.acted = this.clock;
    audio.play('kick_soft', 0.12);
    return true;
  }

  /** Close the aim: kick (true) or resume without kicking. */
  private closeAim(kick: boolean): void {
    const a = this.aim;
    if (!a) return;
    const params = kick ? a.params() : null;
    this.aim = null;
    this.aimPointer = null;
    if (params) this.send({ kind: 'kick', params });
    else this.send({ kind: 'aimCancel' });
    // keys pressed while aiming are not movement until released; the run resumes from the keys held
    for (const c of this.keys) if (!this.aimHeld.has(c)) this.aimKeys.add(c);
    this.aimHeld.clear();
    this.forceDir = true;
    this.acted = this.clock;
  }

  /** Kick the aimed ball (SPACE / Enter / 'Vur'). */
  aimConfirm(): void { if (this.aim) this.closeAim(true); }
  /** Resume without kicking (Esc / 'İptal'). */
  aimAbort(): void { if (this.aim) this.closeAim(false); }
  /** Loft toggle (0 = Yerden, 1 = Yarım, 2 = Havadan). */
  aimSetLoft(i: number): void { this.aim?.setLoft(i); }

  private onWheel(e: WheelEvent): void {
    if (!this.aim) return;
    e.preventDefault();
    this.wheelAcc += e.deltaY;
    if (Math.abs(this.wheelAcc) < 60 || this.clock - this.wheelT < 0.18) return;
    this.aim.cycleLoft(this.wheelAcc < 0 ? 1 : -1);
    this.wheelAcc = 0;
    this.wheelT = this.clock;
  }

  /** Per-frame key adjustments while aiming (real dt: the game itself is stopped). */
  private updateAim(dt: number): void {
    const a = this.aim;
    if (!a) return;
    // the engine dropped the freeze (moment over, skipped …): close
    if (this.engine.frozenForAim === false) { this.aim = null; this.aimPointer = null; this.aimHeld.clear(); this.forceDir = true; return; }
    if (a.drawing) return;
    const k = (c: string) => this.keys.has(c) && !this.aimHeld.has(c);
    const rot = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    if (rot) {
      this.rotHold += dt;
      const ax = this.opts.axes?.();
      // screen orientation of the pitch frame (+1 unless mirrored)
      const o = ax ? Math.sign(ax.right.x * ax.up.y - ax.right.y * ax.up.x) || 1 : 1;
      const rate = 0.45 + Math.min(1.35, this.rotHold * 1.5);
      a.rotate(-rot * o * rate * dt);
    } else this.rotHold = 0;
    const pw = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
    if (pw) a.addPower(pw * 0.55 * dt);
    const cu = (k('KeyQ') ? 1 : 0) - (k('KeyE') ? 1 : 0);
    if (cu) a.addCurl(cu * 1.4 * dt);
  }

  private doTackle(): void {
    const q = this.tackleQ;
    if (!q) return;
    this.tackleQ = null;
    this.send({ kind: 'tackle', slide: q.slide });
  }

  private startCharge(src: Src): void {
    const aim = src === 'mouse' || this.mouseActive() ? this.mouse.world : null;
    this.charge = { t: 0, src, curl: 0, aim: aim ? { ...aim } : null, startAim: aim ? { ...aim } : null };
    this.pathT = 0;
  }

  /** Loose ball about to reach the user (volley / header timing). */
  private ballArriving(): boolean {
    const s = this.state;
    const u = this.user();
    if (!u || s.ball.ownerId) return false;
    const dx = u.pos.x - s.ball.pos.x;
    const dy = u.pos.y - s.ball.pos.y;
    const d = Math.hypot(dx, dy);
    const closing = (s.ball.vel.x * dx + s.ball.vel.y * dy) / (d || 1) - (u.vel.x * dx + u.vel.y * dy) / (d || 1);
    return d < 2.6 && closing > 2 && d / closing < 0.3;
  }

  private chargeValue(): number {
    return this.charge ? Math.min(1, this.charge.t / CHARGE_TIME) : 0;
  }

  private shiftHeld(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.chipHeld;
  }

  /** Release SHOOT: strike with the charged power. */
  release(): void {
    const c = this.charge;
    if (!c) return;
    this.charge = null;
    if (!this.hasBall() && !this.canKick()) return;
    this.fireShot(Math.min(1, c.t / CHARGE_TIME), c.curl, c.aim, this.shiftHeld());
  }

  private shotParams(charge: number, curl: number, aim: Vec2 | null, chip: boolean): KickParams | null {
    if (aim) return assistShot(this.engine, { charge, curl, aim, offset: this.offset, chip });
    return assistShotDir(this.engine, { charge, curl, dir: this.worldDir(), offset: this.offset, chip });
  }

  private fireShot(charge: number, curl: number, aim: Vec2 | null, chip = false): void {
    const p = this.shotParams(charge, curl, aim, chip);
    if (p) {
      this.send({ kind: 'kick', params: p });
      this.acted = this.clock;
    }
  }

  private pass(through: boolean, src: Src): void {
    const toward = src === 'mouse' || this.mouseActive() ? this.mouse.world : null;
    const pref = this.worldDir() ?? kickDir(this.engine, null);
    const p = assistPass(this.engine, { pref, toward, through, cone: through ? undefined : PASS_CONE });
    if (p) {
      this.send({ kind: 'kick', params: p });
      this.acted = this.clock;
    }
  }

  /** Keys / stick as a screen direction (x = right, y = up), length ≤ 1. */
  private screenDir(): Vec2 | null {
    const ks = this.keys;
    const skip = this.aimKeys;
    const k = { has: (c: string) => ks.has(c) && !skip.has(c) };
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (!x && !y && (this.touchDir.x || this.touchDir.y)) { x = this.touchDir.x; y = this.touchDir.y; }
    const l = Math.hypot(x, y);
    return l > 0.05 ? { x: x / Math.max(1, l), y: y / Math.max(1, l) } : null;
  }

  /** The running direction in the pitch frame (camera-relative), null when no keys are held. */
  worldDir(): Vec2 | null {
    const d = this.screenDir();
    if (!d) return null;
    const ax = this.opts.axes?.();
    if (!ax) return d;
    return { x: ax.right.x * d.x + ax.up.x * d.y, y: ax.right.y * d.x + ax.up.y * d.y };
  }

  // ───────────────────────── mouse ─────────────────────────

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.surface.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.aim?.drawing && e.pointerId === this.aimPointer) {
      const p = this.local(e);
      const w = this.opts.toWorld(p.x, p.y);
      if (w) this.aim.extend(w);
      return;
    }
    if (e.pointerType === 'touch') return;
    const p = this.local(e);
    if (Math.hypot(p.x - this.mouse.sx, p.y - this.mouse.sy) > 2) this.mouse.moved = this.clock;
    this.mouse.sx = p.x;
    this.mouse.sy = p.y;
    this.mouse.world = this.opts.toWorld(p.x, p.y);
    this.mouse.inside = true;
  }

  /** Calm: start drawing the kick at this pointer (the stroke runs from the ball). */
  private beginDraw(e: PointerEvent, src: AimSrc): boolean {
    const a = this.aim;
    if (!a || this.aimPointer !== null) return false;
    const p = this.local(e);
    const w = this.opts.toWorld(p.x, p.y);
    if (!w) return false;
    e.preventDefault();
    this.aimPointer = e.pointerId;
    try { this.surface.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    a.begin(w, src);
    this.acted = this.clock;
    return true;
  }

  private onPointerDown(e: PointerEvent): void {
    const onSurface = e.target === this.surface || e.target instanceof HTMLCanvasElement;
    if (this.aim && onSurface && this.opts.enabled() && (e.pointerType === 'touch' || e.button === 0)) {
      audio.unlock();
      if (e.pointerType === 'touch') this.touchMode = true;
      this.beginDraw(e, e.pointerType === 'touch' ? 'touch' : 'mouse');
      return;
    }
    if (e.pointerType === 'touch') { this.touchMode = true; return; }
    if (!onSurface) return;
    if (!this.opts.enabled()) return;
    // calm: press near the ball you can kick = stop the game and draw in one go
    if (this.calm && e.button === 0 && !this.opts.mouseAim && (this.hasBall() || this.canKick())) {
      const lp = this.local(e);
      const w = this.opts.toWorld(lp.x, lp.y);
      const b = this.state.ball.pos;
      if (w && Math.hypot(w.x - b.x, w.y - b.y) < 2.6 && this.openAim('shoot', 'mouse')) {
        audio.unlock();
        this.beginDraw(e, 'mouse');
        return;
      }
    }
    audio.unlock();
    try { (document.activeElement as HTMLElement | null)?.blur?.(); } catch { /* ignore */ }
    this.onPointerMove(e);
    this.mouse.moved = this.clock;
    this.acted = this.clock;
    if (this.opts.mouseAim) {
      if (e.button === 2) { this.action('pass', 'mouse', 'Mouse2'); return; }
      if (e.button !== 0) return;
      if (this.hasBall() || this.canKick()) { this.action('shoot', 'mouse', 'Mouse0'); return; }
    } else if (e.button !== 0) return;
    const owner = this.owner();
    const u = this.user();
    if (owner && owner.side === 'them' && u && Math.hypot(owner.pos.x - u.pos.x, owner.pos.y - u.pos.y) < 2.5) {
      this.action('shoot', 'mouse', 'Mouse0');
      return;
    }
    if (this.mouse.world) {
      this.send({ kind: 'move', target: { ...this.mouse.world } });
      this.dragMove = true;
      this.dragT = 0;
      this.lastDir = { x: 0, y: 0 };
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.aim && e.pointerId === this.aimPointer) {
      this.aimPointer = null;
      const drawn = this.aim.end();
      // mouse: releasing a real drawing kicks; touch: confirm with the 'Vur' button
      if (drawn && e.pointerType !== 'touch') this.closeAim(true);
      return;
    }
    if (e.pointerType === 'touch') return;
    if (e.button === 0) {
      this.dragMove = false;
      if (this.charge?.src === 'mouse') this.release();
    }
  }

  // ───────────────────────── touch (driven by the view's DOM overlay) ─────────────────────────

  /** Joystick in screen terms (x = right, y = up). */
  setTouchStick(dir: Vec2, sprint: boolean): void {
    this.touchDir = dir;
    this.touchSprint = sprint;
    if (dir.x || dir.y) this.acted = this.clock;
  }

  touchButton(kind: 'shoot' | 'pass' | 'through', down: boolean): void {
    if (!this.opts.enabled()) return;
    audio.unlock();
    const code = `T-${kind}`;
    if (down && this.aim) { this.aimConfirm(); return; }
    if (down) {
      this.keys.add(code);
      this.acted = this.clock;
      if (kind === 'pass') this.passHeld = this.clock;
      this.action(kind, 'touch', code);
      return;
    }
    this.keys.delete(code);
    if (kind === 'pass') this.passHeld = -1;
    if (kind === 'shoot' && this.charge?.src === 'touch') this.release();
    if (this.armed?.hold === code) this.armed.until = Math.min(this.armed.until, this.clock + 0.2);
  }

  // ───────────────────────── per frame ─────────────────────────

  update(dt: number, clock: number): void {
    this.clock = clock;
    if (!this.opts.enabled()) {
      if (this.lastDir.x || this.lastDir.y) { this.send({ kind: 'moveDir', dir: { x: 0, y: 0 } }); this.lastDir = { x: 0, y: 0 }; }
      return;
    }
    if (this.aim) {
      // the game is stopped: only the aim changes
      this.updateAim(dt);
      if (this.aim) return;
    }
    const info = assistInfo(this.engine, this.offset);
    // calm set pieces start straight in the (frozen) aim
    if (this.calm && info.setPiece && !this.setPieceAimed && this.canKick()) {
      this.setPieceAimed = true;
      if (this.openAim('shoot', this.touchMode ? 'touch' : 'key')) return;
    }
    const k = this.keys;
    const dir = this.worldDir();

    // set pieces: W / S (or the stick) move the target along the goal line
    if (info.setPiece === 'free_kick' || info.setPiece === 'penalty') {
      const vy = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + (this.touchDir.y || 0);
      if (vy) {
        if (Math.abs(this.offset) < 0.04 && info.target) this.offset = Math.sign(info.target.y) * 0.98;
        this.offset = Math.max(-1, Math.min(1, this.offset + vy * dt * 1.4));
        if (Math.abs(this.offset) < 0.05) this.offset = 0.05 * Math.sign(vy);
      }
    } else if (!info.hasBall) {
      this.offset = 0;
    }

    // movement (no keys: the engine runs the user onto passes meant for him)
    const d = dir ?? { x: 0, y: 0 };
    if (dir || !this.dragMove) {
      if (this.forceDir || Math.abs(d.x - this.lastDir.x) > 1e-3 || Math.abs(d.y - this.lastDir.y) > 1e-3) {
        if (this.forceDir || dir || this.lastDir.x || this.lastDir.y) this.send({ kind: 'moveDir', dir: d });
        this.forceDir = false;
        this.lastDir = { ...d };
        if (dir) this.dragMove = false;
      }
    }
    if (this.dragMove && this.mouse.world) {
      this.dragT -= dt;
      if (this.dragT <= 0) { this.dragT = 0.12; this.send({ kind: 'move', target: { ...this.mouse.world } }); }
    }
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight') || this.touchSprint;
    if (sprint !== this.sprint) { this.sprint = sprint; this.send({ kind: 'sprint', on: sprint }); }

    // charging
    const c = this.charge;
    if (c) {
      if (!this.hasBall() && !this.canKick()) this.charge = null;
      else {
        c.t += dt;
        const want = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0);
        if (want) c.curl = Math.max(-1, Math.min(1, c.curl + want * dt * 2.6));
        if (c.src === 'mouse' && c.startAim && this.mouse.world) {
          // sideways from the locked aim line = curl (left of travel = +)
          const b = this.state.ball.pos;
          const ax = c.startAim.x - b.x;
          const ay = c.startAim.y - b.y;
          const al = Math.hypot(ax, ay) || 1;
          const lat = ((this.mouse.world.x - c.startAim.x) * -ay + (this.mouse.world.y - c.startAim.y) * ax) / al;
          c.curl = Math.max(-1, Math.min(1, lat / 4));
        }
        this.pathT -= dt;
        if (this.pathT <= 0) {
          this.pathT = 0.1;
          this.aimParams = this.shotParams(this.chargeValue(), c.curl, c.aim, this.shiftHeld());
          try { this.aimPath = this.aimParams ? this.engine.predictKick(this.aimParams, 1.4) : []; } catch { this.aimPath = []; }
        }
      }
    }

    // F held without the ball while running: ask for a through ball into the space ahead
    const owner = this.owner();
    if (this.passHeld >= 0 && !this.hasBall() && dir && owner && owner.side === 'us' && clock - this.passHeld > THROUGH_HOLD) {
      this.throughCallT -= dt;
      if (this.throughCallT <= 0) { this.throughCallT = 0.45; this.send({ kind: 'callForBall', through: true }); }
    } else this.throughCallT = 0;

    // holding SHOOT / PASS without the ball arms a one-touch strike when a loose ball comes near
    if (!this.charge && !this.armed && !this.hasBall() && !this.state.ball.ownerId) {
      const held = k.has('Space') || k.has('T-shoot') ? 'shot' : k.has('KeyF') || k.has('T-pass') ? 'pass' : null;
      const u = this.user();
      if (held && u && Math.hypot(this.state.ball.pos.x - u.pos.x, this.state.ball.pos.y - u.pos.y) < 7) {
        const code = held === 'shot' ? (k.has('Space') ? 'Space' : 'T-shoot') : k.has('KeyF') ? 'KeyF' : 'T-pass';
        this.armed = { kind: held, until: this.clock + 0.15, hold: code };
      }
    }
    // one-touch armed (held SPACE / F near a loose ball)
    if (this.armed) {
      if (this.clock > this.armed.until && !(this.armed.hold && k.has(this.armed.hold))) this.armed = null;
      else if (this.clock > this.armed.until + 3) this.armed = null;
      else if (this.hasBall() || this.canKick() || this.ballArriving()) {
        // (an arriving ball: the engine buffers the strike for the moment it is in reach)
        const kind = this.armed.kind;
        this.armed = null;
        if (this.calm) {
          // calm: stop the game the moment the ball is playable
          if (this.canKick()) this.openAim(kind === 'shot' ? 'shoot' : 'pass', 'key');
          else this.armed = { kind, until: this.clock + 0.4, hold: null };
        } else if (kind === 'shot') this.fireShot(0.75, 0, this.mouseActive() ? this.mouse.world : null);
        else this.pass(false, 'key');
      } else if (this.state.ball.ownerId && this.state.ball.ownerId !== this.userId) this.armed = null;
    }

    // queued tackle: close in on the carrier, then go in
    if (this.tackleQ) {
      const u = this.user();
      if (!u || !owner || owner.side !== 'them' || this.clock > this.tackleQ.until) this.tackleQ = null;
      else {
        const dd = Math.hypot(owner.pos.x - u.pos.x, owner.pos.y - u.pos.y);
        if (!dir) this.send({ kind: 'move', target: { x: owner.pos.x, y: owner.pos.y } });
        if (dd < 1.25 || (this.tackleQ.slide && dd < 2.2)) this.doTackle();
      }
    }

    // pass target preview
    this.pickT -= dt;
    if (this.pickT <= 0) {
      this.pickT = 0.15;
      this.pick = info.hasBall && info.setPiece !== 'penalty'
        ? pickPass(this.engine, { pref: dir ?? kickDir(this.engine, null), toward: this.mouseActive() ? this.mouse.world : null, cone: PASS_CONE })
        : null;
    }
  }

  overlay(): ControlsOverlay {
    const info = assistInfo(this.engine, this.offset);
    const owner = this.owner();
    const mode: ControlsMode = info.setPiece === 'corner' ? 'corner' : info.setPiece ? 'setPiece'
      : info.hasBall ? 'attack' : owner?.side === 'them' || this.engine.setup.type === 'defend' ? 'defend' : 'noBall';
    const c = this.charge;
    return {
      charge: c ? { value: this.chargeValue(), curl: c.curl, chip: this.shiftHeld(), params: this.aimParams, path: this.aimPath } : null,
      pass: this.pick,
      info,
      mode,
      aimPoint: this.mouseActive() ? this.mouse.world : null,
      touch: this.touchMode,
      calm: this.calmOverlay(),
    };
  }

  private calmOverlay(): CalmOverlay | null {
    const a = this.aim;
    if (!a) return null;
    const an = a.analysis();
    return {
      analysis: an, version: a.version,
      power: an.params.power, curl: an.params.curl, loftIdx: a.loftIdx,
      stroke: a.stroke, drawing: a.drawing, src: a.src, intent: a.intent,
    };
  }

  setChipHeld(v: boolean): void { this.chipHeld = v; }

  hint(mode: ControlsMode): string {
    const ns = this.calm ? 'v2d.chint' : 'v2d.hint';
    if (this.touchMode) return t(`${ns}.touch`);
    return t(`${ns}.${mode}`);
  }
}
