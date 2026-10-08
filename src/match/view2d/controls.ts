/**
 * Easy, assisted controls for the 2D view (keyboard first, mouse optional, touch fallback),
 * translated into engine ControlCommands. Shots / passes are aimed by the engine assists.
 *
 *  - WASD / arrows: run (moveDir) · Shift: sprint · click on the pitch (without the ball): run there
 *  - SPACE / left mouse: hold to charge, release to shoot (auto aim; cursor aims when the mouse is active)
 *    Q / E (or mouse sideways) while charging: curl · Shift on release: chip if the keeper is off his line
 *  - F / right mouse: pass to the best team-mate (direction of movement / cursor) · R: through ball
 *  - Without the ball: SPACE / F near the ball = one-touch; near the carrier = tackle (double-tap: slide);
 *    otherwise SPACE / F / C = call for the ball (R = ask for a through ball)
 *  - Set pieces: W / S move the target along the goal line
 */
import type { KickParams, Vec2, Vec3 } from '../../core/types';
import { assistInfo, assistPass, assistShot, pickPass, type AssistInfo, type MomentEngine, type PassPick } from '../engine/api';
import { audio } from '../../audio/api';
import { t } from '../../core/i18n';

const CHARGE_TIME = 0.8;
const DOUBLE_TAP = 0.32;
const MOUSE_ACTIVE = 2.5;

type Src = 'key' | 'mouse' | 'touch';

interface Charge { t: number; src: Src; curl: number; aim: Vec2 | null; startAim: Vec2 | null }

export interface ControlsOverlay {
  charge: { value: number; curl: number; chip: boolean; params: KickParams | null; path: Vec3[] } | null;
  pass: PassPick | null;
  info: AssistInfo;
  mode: 'attack' | 'noBall' | 'defend' | 'setPiece' | 'corner';
  aimPoint: Vec2 | null;
  touch: boolean;
}

export interface ControlsOptions {
  /** CSS-pixel position → world metres. */
  toWorld: (x: number, y: number) => Vec2;
  /** Whether the controls may act (live, not paused / replaying / finished). */
  enabled: () => boolean;
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

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
  touchMode = false;
  private disposers: (() => void)[] = [];
  private chipHeld = false;
  /** Set when the user did something (hides the hint). */
  acted = 0;

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
  private hasBall(): boolean { return this.state.ball.ownerId === this.userId; }
  private canKick(): boolean { try { return this.engine.canKick(); } catch { return false; } }
  private send(cmd: Parameters<MomentEngine['input']>[0]): void {
    try { this.engine.input(cmd); } catch { /* engine refused */ }
  }

  private mouseActive(): boolean {
    return !this.touchMode && this.mouse.inside && !!this.mouse.world && this.clock - this.mouse.moved < MOUSE_ACTIVE;
  }

  private releaseAll(): void {
    this.keys.clear();
    if (this.charge) this.charge = null;
    this.armed = null;
    this.touchDir = { x: 0, y: 0 };
    this.touchSprint = false;
    this.dragMove = false;
  }

  /** Cancel an in-progress charge (pause, replay, finish). */
  cancel(): void {
    this.charge = null;
    this.armed = null;
    this.tackleQ = null;
    this.dragMove = false;
  }

  // ───────────────────────── keyboard ─────────────────────────

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (isTyping(e.target)) return;
    const code = e.code;
    const game = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyF', 'KeyR', 'KeyC', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'];
    if (!game.includes(code)) return;
    if (!this.opts.enabled()) { if (!down) this.keys.delete(code); return; }
    if (code === 'Space' || code.startsWith('Arrow')) e.preventDefault();
    if (down) {
      audio.unlock();
      if (e.repeat) return;
      this.keys.add(code);
      this.acted = this.clock;
      if (code === 'Space') this.action('shoot', 'key', 'Space');
      else if (code === 'KeyF') this.action('pass', 'key', 'KeyF');
      else if (code === 'KeyR') this.action('through', 'key', 'KeyR');
      else if (code === 'KeyC') this.call(false, 'KeyC');
    } else {
      this.keys.delete(code);
      if (code === 'Space' && this.charge?.src === 'key') this.release();
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
    const owner = s.ball.ownerId ? s.players.find((p) => p.id === s.ball.ownerId) : null;
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
        this.armed = { kind: kind === 'shoot' ? 'shot' : 'pass', until: this.clock + 0.6, hold: src === 'key' ? code : null };
        return;
      }
    }
    if (owner && owner.side === 'us') this.send({ kind: 'callForBall', through: kind === 'through' || dbl });
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

  private intentCurl(): number {
    return this.charge ? this.charge.curl : 0;
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

  private fireShot(charge: number, curl: number, aim: Vec2 | null, chip = false): void {
    const p = assistShot(this.engine, { charge, curl, aim, offset: this.offset, chip });
    if (p) {
      this.send({ kind: 'kick', params: p });
      this.acted = this.clock;
    }
  }

  private pass(through: boolean, src: Src): void {
    const toward = src === 'mouse' || this.mouseActive() ? this.mouse.world : null;
    const p = assistPass(this.engine, { pref: this.moveDir(), toward, through });
    if (p) {
      this.send({ kind: 'kick', params: p });
      this.acted = this.clock;
    }
  }

  private moveDir(): Vec2 | null {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (!x && !y && (this.touchDir.x || this.touchDir.y)) { x = this.touchDir.x; y = this.touchDir.y; }
    const l = Math.hypot(x, y);
    return l > 0.05 ? { x: x / Math.max(1, l), y: y / Math.max(1, l) } : null;
  }

  // ───────────────────────── mouse ─────────────────────────

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.surface.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    const p = this.local(e);
    if (Math.hypot(p.x - this.mouse.sx, p.y - this.mouse.sy) > 2) this.mouse.moved = this.clock;
    this.mouse.sx = p.x;
    this.mouse.sy = p.y;
    this.mouse.world = this.opts.toWorld(p.x, p.y);
    this.mouse.inside = true;
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'touch') { this.touchMode = true; return; }
    if (e.target !== this.surface && !(e.target instanceof HTMLCanvasElement)) return;
    if (!this.opts.enabled()) return;
    audio.unlock();
    try { (document.activeElement as HTMLElement | null)?.blur?.(); } catch { /* ignore */ }
    this.onPointerMove(e);
    this.mouse.moved = this.clock;
    this.acted = this.clock;
    if (e.button === 2) { this.action('pass', 'mouse', 'Mouse2'); return; }
    if (e.button !== 0) return;
    if (this.hasBall() || this.canKick()) { this.action('shoot', 'mouse', 'Mouse0'); return; }
    const owner = this.state.ball.ownerId ? this.state.players.find((p) => p.id === this.state.ball.ownerId) : null;
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
    if (e.pointerType === 'touch') return;
    if (e.button === 0) {
      this.dragMove = false;
      if (this.charge?.src === 'mouse') this.release();
    }
  }

  // ───────────────────────── touch (driven by the view's DOM overlay) ─────────────────────────

  setTouchStick(dir: Vec2, sprint: boolean): void {
    this.touchDir = dir;
    this.touchSprint = sprint;
    if (dir.x || dir.y) this.acted = this.clock;
  }

  touchButton(kind: 'shoot' | 'pass' | 'through', down: boolean): void {
    if (!this.opts.enabled()) return;
    audio.unlock();
    if (down) { this.keys.add(`T-${kind}`); this.acted = this.clock; this.action(kind, 'touch', `T-${kind}`); return; }
    this.keys.delete(`T-${kind}`);
    if (kind === 'shoot' && this.charge?.src === 'touch') this.release();
    if (this.armed?.hold === `T-${kind}`) this.armed.until = Math.min(this.armed.until, this.clock + 0.2);
  }

  // ───────────────────────── per frame ─────────────────────────

  update(dt: number, clock: number): void {
    this.clock = clock;
    if (!this.opts.enabled()) {
      if (this.lastDir.x || this.lastDir.y) { this.send({ kind: 'moveDir', dir: { x: 0, y: 0 } }); this.lastDir = { x: 0, y: 0 }; }
      return;
    }
    const info = assistInfo(this.engine, this.offset);
    const k = this.keys;
    const dir = this.moveDir();

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

    // movement
    const d = dir ?? { x: 0, y: 0 };
    if (dir || !this.dragMove) {
      if (Math.abs(d.x - this.lastDir.x) > 1e-3 || Math.abs(d.y - this.lastDir.y) > 1e-3) {
        if (dir || this.lastDir.x || this.lastDir.y) this.send({ kind: 'moveDir', dir: d });
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
          this.pathT = 0.09;
          this.aimParams = assistShot(this.engine, { charge: this.chargeValue(), curl: c.curl, aim: c.aim, offset: this.offset, chip: this.shiftHeld() });
          try { this.aimPath = this.aimParams ? this.engine.predictKick(this.aimParams, 1.6) : []; } catch { this.aimPath = []; }
        }
      }
    }

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
        if (kind === 'shot') this.fireShot(0.75, 0, this.mouseActive() ? this.mouse.world : null);
        else this.pass(false, 'key');
      } else if (this.state.ball.ownerId && this.state.ball.ownerId !== this.userId) this.armed = null;
    }

    // queued tackle: close in on the carrier, then go in
    if (this.tackleQ) {
      const s = this.state;
      const u = this.user();
      const owner = s.ball.ownerId ? s.players.find((p) => p.id === s.ball.ownerId) : null;
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
      this.pick = info.hasBall && info.setPiece !== 'penalty' ? pickPass(this.engine, { pref: dir, toward: this.mouseActive() ? this.mouse.world : null }) : null;
    }
  }

  overlay(): ControlsOverlay {
    const info = assistInfo(this.engine, this.offset);
    const s = this.state;
    const owner = s.ball.ownerId ? s.players.find((p) => p.id === s.ball.ownerId) : null;
    const mode: ControlsOverlay['mode'] = info.setPiece === 'corner' ? 'corner' : info.setPiece ? 'setPiece'
      : info.hasBall ? 'attack' : owner?.side === 'them' || this.engine.setup.type === 'defend' ? 'defend' : 'noBall';
    const c = this.charge;
    const aimPoint = this.mouseActive() ? this.mouse.world : null;
    return {
      charge: c ? { value: this.chargeValue(), curl: this.intentCurl(), chip: this.shiftHeld(), params: this.aimParams, path: this.aimPath } : null,
      pass: this.pick,
      info,
      mode,
      aimPoint,
      touch: this.touchMode,
    };
  }

  setChipHeld(v: boolean): void { this.chipHeld = v; }

  hint(mode: ControlsOverlay['mode']): string {
    if (this.touchMode) return t('v2d.hint.touch');
    return t(`v2d.hint.${mode}`);
  }
}
