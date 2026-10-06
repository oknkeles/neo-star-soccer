/**
 * Pointer (mouse + touch) and keyboard input → engine ControlCommands, including the
 * "Falso Çizgisi" kick gesture with live trajectory prediction and aftertouch swipes.
 */
import type { KickParams, MomentPlayerState, MomentType, Vec2, Vec3 } from '../../core/types';
import type { MomentEngine } from '../engine/api';
import {
  analyzeGesture, defaultLoft, gestureToKick, isDoubleTap, previewSeconds, simplifyPath, swipeToAftertouch, truncatePath,
  type GesturePoint,
} from './gesture';
import type { AimVisual } from './hud';

export interface InputHost {
  element: HTMLElement;
  engine: MomentEngine;
  momentType: MomentType;
  /** User's vision attribute (trajectory preview length). */
  vision: number;
  /** Container-relative CSS px → pitch ground point. */
  toGround(p: Vec2): Vec2 | null;
  /** Pitch point → container-relative CSS px (null when behind the camera). */
  toScreen(p: Vec3): Vec2 | null;
  /** Pitch-frame unit vectors for screen up / screen right (keyboard movement). */
  screenAxes(): { up: Vec2; right: Vec2 };
  viewport(): { w: number; h: number };
  setAim(a: AimVisual | null): void;
  setPath(path: Vec3[] | null, power: number): void;
  setLoftUi(v: number): void;
  onAftertouch(v: number): void;
  onCameraKey(): void;
  onHelpKey(): void;
  onAimChange(on: boolean): void;
}

export interface InputController {
  readonly aiming: boolean;
  readonly loft: number;
  setLoft(v: number, fromUser?: boolean): void;
  setEnabled(v: boolean): void;
  callForBall(through: boolean): void;
  setSprint(on: boolean): void;
  cancelAim(): void;
  /** Per-frame: throttled prediction, keyboard re-steering. */
  update(dt: number): void;
  dispose(): void;
}

const AIM_RADIUS_PX = 64;
const PREDICT_MS = 70;
const AFTER_WINDOW_MS = 450;

export function userPlayer(engine: MomentEngine): MomentPlayerState | undefined {
  return engine.state.players.find((p) => p.isUser);
}

export function ballCarrier(engine: MomentEngine): MomentPlayerState | undefined {
  const id = engine.state.ball.ownerId;
  return id ? engine.state.players.find((p) => p.id === id) : engine.state.players.find((p) => p.hasBall);
}

export function createInput(host: InputHost): InputController {
  const { element, engine } = host;
  let enabled = true;
  let loft = 0.15;
  let loftTouched = false;

  // Aim state.
  let aimPointer: number | null = null;
  let aimPoints: (GesturePoint & { t: number })[] = [];
  let predictDirty = false;
  let lastPredict = 0;
  // Aftertouch.
  let lastKick: { time: number; dir: Vec2 } | null = null;
  let swipe: { id: number; x: number; y: number; start: number; sent: boolean } | null = null;
  // Taps.
  let down: { id: number; x: number; y: number; time: number; moved: number } | null = null;
  let lastTap: { x: number; y: number; time: number } | null = null;
  // Keyboard.
  const keys = new Set<string>();
  let keyDir: Vec2 = { x: 0, y: 0 };
  let keyResend = 0;
  let sprintKey = false;
  let lastSpace = 0;

  const send = (cmd: Parameters<MomentEngine['input']>[0]) => {
    try { engine.input(cmd); } catch { /* engine refused */ }
  };

  const local = (e: PointerEvent | MouseEvent | WheelEvent): GesturePoint => {
    const r = element.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const fullPowerPx = () => {
    const v = host.viewport();
    return Math.max(140, Math.min(v.w, v.h) * 0.42);
  };

  const kickOpts = () => ({ fullPowerPx: fullPowerPx(), loft, toGround: host.toGround });

  const canKick = () => {
    try { return engine.canKick(); } catch { return false; }
  };

  const startAim = (id: number, p: GesturePoint) => {
    aimPointer = id;
    aimPoints = [{ ...p, t: performance.now() }];
    if (!loftTouched) {
      const b = engine.state.ball.pos;
      setLoft(defaultLoft({ type: host.momentType, ball: { x: b.x, y: b.y } }), false);
    }
    send({ kind: 'aimStart' });
    host.onAimChange(true);
    refreshAimVisual();
  };

  const endAim = () => {
    aimPointer = null;
    aimPoints = [];
    host.setAim(null);
    host.setPath(null, 0);
    host.onAimChange(false);
  };

  const cancelAim = () => {
    if (aimPointer === null) return;
    endAim();
    send({ kind: 'aimCancel' });
  };

  const refreshAimVisual = () => {
    const pts = simplifyPath(aimPoints, 96);
    const a = analyzeGesture(pts, { fullPowerPx: fullPowerPx() });
    const b = engine.state.ball.pos;
    host.setAim({
      points: pts,
      anchor: host.toScreen({ x: b.x, y: b.y, z: b.z }),
      power: a?.power ?? 0,
      curl: a?.curl ?? 0,
      valid: !!a,
    });
    predictDirty = true;
  };

  const predict = () => {
    predictDirty = false;
    lastPredict = performance.now();
    const kick = gestureToKick(simplifyPath(aimPoints, 96), kickOpts());
    if (!kick) { host.setPath(null, 0); return; }
    let path: Vec3[] = [];
    try { path = engine.predictKick(kick, 3); } catch { path = []; }
    host.setPath(path.length > 1 ? truncatePath(path, previewSeconds(host.vision)) : null, kick.power);
  };

  const release = () => {
    const pts = simplifyPath(aimPoints, 96);
    const kick: KickParams | null = gestureToKick(pts, kickOpts());
    const a = analyzeGesture(pts, { fullPowerPx: fullPowerPx() });
    endAim();
    if (!kick || !a) { send({ kind: 'aimCancel' }); return; }
    send({ kind: 'kick', params: kick });
    lastKick = { time: performance.now(), dir: a.screenDir };
    loftTouched = false;
  };

  const tap = (p: GesturePoint, time: number) => {
    const ground = host.toGround(p);
    const me = userPlayer(engine);
    const carrier = ballCarrier(engine);
    const dbl = isDoubleTap(lastTap, { ...p, time });
    lastTap = dbl ? null : { ...p, time };
    if (me && carrier && carrier.side === 'them') {
      const d = Math.hypot(carrier.pos.x - me.pos.x, carrier.pos.y - me.pos.y);
      const cs = host.toScreen({ x: carrier.pos.x, y: carrier.pos.y, z: 1 });
      const nearTap = (cs && Math.hypot(cs.x - p.x, cs.y - p.y) < 90)
        || (ground && Math.hypot(ground.x - carrier.pos.x, ground.y - carrier.pos.y) < 3);
      if ((nearTap || dbl) && d < (dbl ? 5.5 : 4)) {
        send({ kind: 'tackle', slide: dbl });
        return;
      }
    }
    if (dbl && me && carrier && carrier.side === 'us' && !carrier.isUser && ground && ground.x > me.pos.x + 1.5) {
      send({ kind: 'callForBall', through: true });
    }
    if (ground) send({ kind: 'move', target: ground });
  };

  // ── pointer ──
  const onDown = (e: PointerEvent) => {
    if (!enabled) return;
    if (e.button === 2) { cancelAim(); return; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = local(e);
    const now = performance.now();
    if (aimPointer !== null) return;
    if (lastKick && now - lastKick.time < AFTER_WINDOW_MS) {
      swipe = { id: e.pointerId, x: p.x, y: p.y, start: now, sent: false };
      try { element.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      return;
    }
    if (canKick()) {
      const b = engine.state.ball.pos;
      const bs = host.toScreen({ x: b.x, y: b.y, z: b.z });
      const me = userPlayer(engine);
      const us = me && me.hasBall ? host.toScreen({ x: me.pos.x, y: me.pos.y, z: 0.9 }) : null;
      const near = (s: Vec2 | null, r: number) => !!s && Math.hypot(s.x - p.x, s.y - p.y) <= r;
      const r = AIM_RADIUS_PX * (e.pointerType === 'touch' ? 1.3 : 1);
      if (near(bs, r) || near(us, r * 0.9)) {
        try { element.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        startAim(e.pointerId, p);
        e.preventDefault();
        return;
      }
    }
    down = { id: e.pointerId, x: p.x, y: p.y, time: now, moved: 0 };
  };

  const onMove = (e: PointerEvent) => {
    const p = local(e);
    if (aimPointer === e.pointerId) {
      const last = aimPoints[aimPoints.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 3) {
        aimPoints.push({ ...p, t: performance.now() });
        refreshAimVisual();
      }
      return;
    }
    if (swipe && swipe.id === e.pointerId && !swipe.sent && lastKick) {
      const dx = p.x - swipe.x;
      const dy = p.y - swipe.y;
      if (Math.hypot(dx, dy) > 46) sendSwipe(dx, dy);
      return;
    }
    if (down && down.id === e.pointerId) down.moved = Math.max(down.moved, Math.hypot(p.x - down.x, p.y - down.y));
  };

  const sendSwipe = (dx: number, dy: number) => {
    if (!swipe || !lastKick || swipe.sent) return;
    const v = host.viewport();
    const spin = swipeToAftertouch(lastKick.dir, { dx, dy }, swipe.start - lastKick.time, Math.min(v.w, v.h), AFTER_WINDOW_MS);
    swipe.sent = true;
    if (spin !== 0) {
      send({ kind: 'aftertouch', spin });
      host.onAftertouch(spin);
      lastKick = null;
    }
  };

  const onUp = (e: PointerEvent) => {
    const p = local(e);
    if (aimPointer === e.pointerId) {
      if (aimPoints.length && Math.hypot(p.x - aimPoints[aimPoints.length - 1].x, p.y - aimPoints[aimPoints.length - 1].y) >= 1) {
        aimPoints.push({ ...p, t: performance.now() });
      }
      release();
      return;
    }
    if (swipe && swipe.id === e.pointerId) {
      if (!swipe.sent) sendSwipe(p.x - swipe.x, p.y - swipe.y);
      swipe = null;
      return;
    }
    if (down && down.id === e.pointerId) {
      const d = down;
      down = null;
      if (!enabled) return;
      if (d.moved < 14 || e.pointerType !== 'mouse') tap(p, performance.now());
    }
  };

  const onCancel = (e: PointerEvent) => {
    if (aimPointer === e.pointerId) cancelAim();
    if (down?.id === e.pointerId) down = null;
    if (swipe?.id === e.pointerId) swipe = null;
  };

  const onContext = (e: MouseEvent) => { e.preventDefault(); cancelAim(); };

  const onWheel = (e: WheelEvent) => {
    if (!enabled) return;
    e.preventDefault();
    setLoft(loft - Math.sign(e.deltaY) * 0.05, true);
  };

  // ── keyboard ──
  const typing = (e: KeyboardEvent) => {
    const tgt = e.target as HTMLElement | null;
    return !!tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable);
  };
  const MOVE_KEYS: Record<string, [number, number]> = {
    KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
  };
  const computeKeyDir = (): Vec2 => {
    let sx = 0;
    let sy = 0;
    for (const k of keys) {
      const m = MOVE_KEYS[k];
      if (m) { sx += m[0]; sy += m[1]; }
    }
    if (sx === 0 && sy === 0) return { x: 0, y: 0 };
    const ax = host.screenAxes();
    const x = ax.up.x * sy + ax.right.x * sx;
    const y = ax.up.y * sy + ax.right.y * sx;
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  };
  const steer = (force = false) => {
    const d = computeKeyDir();
    const changed = Math.abs(d.x - keyDir.x) > 0.02 || Math.abs(d.y - keyDir.y) > 0.02;
    if (changed || (force && (d.x !== 0 || d.y !== 0))) {
      keyDir = d;
      send({ kind: 'moveDir', dir: d });
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!enabled || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const code = e.code;
    if (MOVE_KEYS[code]) {
      e.preventDefault();
      if (!keys.has(code)) { keys.add(code); steer(); }
      return;
    }
    switch (code) {
      case 'ShiftLeft': case 'ShiftRight':
        if (!sprintKey) { sprintKey = true; send({ kind: 'sprint', on: true }); }
        break;
      case 'Space': {
        e.preventDefault();
        if (e.repeat) break;
        const now = performance.now();
        api.callForBall(now - lastSpace < 330);
        lastSpace = now;
        break;
      }
      case 'KeyQ': setLoft(loft - 0.1, true); break;
      case 'KeyE': setLoft(loft + 0.1, true); break;
      case 'KeyC': if (!e.repeat) host.onCameraKey(); break;
      case 'KeyH': case 'Slash': if (!e.repeat) host.onHelpKey(); break;
      case 'Escape': cancelAim(); break;
      default: break;
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const code = e.code;
    if (MOVE_KEYS[code]) {
      keys.delete(code);
      if (enabled) steer();
      return;
    }
    if ((code === 'ShiftLeft' || code === 'ShiftRight') && sprintKey) {
      sprintKey = false;
      send({ kind: 'sprint', on: false });
    }
  };
  const onBlur = () => {
    keys.clear();
    if (keyDir.x !== 0 || keyDir.y !== 0) { keyDir = { x: 0, y: 0 }; send({ kind: 'moveDir', dir: keyDir }); }
    if (sprintKey) { sprintKey = false; send({ kind: 'sprint', on: false }); }
  };

  function setLoft(v: number, fromUser = false) {
    loft = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
    if (fromUser) loftTouched = true;
    host.setLoftUi(loft);
    if (aimPointer !== null) predictDirty = true;
  }

  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerup', onUp);
  element.addEventListener('pointercancel', onCancel);
  element.addEventListener('contextmenu', onContext);
  element.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  const api: InputController = {
    get aiming() { return aimPointer !== null; },
    get loft() { return loft; },
    setLoft,
    setEnabled(v) {
      if (enabled === v) return;
      enabled = v;
      if (!v) { cancelAim(); onBlur(); down = null; swipe = null; }
    },
    callForBall(through) {
      if (!enabled) return;
      const me = userPlayer(engine);
      const carrier = ballCarrier(engine);
      if (me && carrier && carrier.side === 'them') {
        const d = Math.hypot(carrier.pos.x - me.pos.x, carrier.pos.y - me.pos.y);
        if (d < 5) { send({ kind: 'tackle', slide: through }); return; }
        send({ kind: 'move', target: { x: carrier.pos.x, y: carrier.pos.y } });
        return;
      }
      send({ kind: 'callForBall', through });
    },
    setSprint(on) { send({ kind: 'sprint', on }); },
    cancelAim,
    update(dt) {
      if (aimPointer !== null && predictDirty && performance.now() - lastPredict > PREDICT_MS) predict();
      if (keyDir.x !== 0 || keyDir.y !== 0) {
        keyResend += dt;
        if (keyResend > 0.2) { keyResend = 0; steer(true); }
      }
      // The engine may take the ball away mid-aim (tackle) → drop the gesture.
      if (aimPointer !== null && !canKick() && engine.state.phase !== 'aiming') cancelAim();
    },
    dispose() {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onCancel);
      element.removeEventListener('contextmenu', onContext);
      element.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
  return api;
}
