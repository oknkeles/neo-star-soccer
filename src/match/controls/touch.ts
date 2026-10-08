/**
 * On-screen touch controls shared by the 3D and 2D views: a floating joystick on the left half
 * and two buttons (ŞUT / PAS) on the right. Plain DOM; drives a Controls instance.
 */
import { audio } from '../../audio/api';
import { t } from '../../core/i18n';
import type { Controls } from './controls';
import '../view2d/strings';

export interface TouchUi { dispose(): void }

export function mountTouchControls(root: HTMLElement, controls: Controls): TouchUi {
  const ui = document.createElement('div');
  ui.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6;';
  const zone = document.createElement('div');
  zone.style.cssText = 'position:absolute;left:0;bottom:0;width:50%;height:65%;pointer-events:auto;touch-action:none;';
  const base = document.createElement('div');
  base.style.cssText = 'position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.25);display:none;';
  const knob = document.createElement('div');
  knob.style.cssText = 'position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(198,255,61,0.55);border:2px solid rgba(198,255,61,0.9);';
  base.appendChild(knob);
  zone.appendChild(base);
  let stickId: number | null = null;
  let ox = 0;
  let oy = 0;
  const stick = (e: PointerEvent, end = false) => {
    if (end) { stickId = null; base.style.display = 'none'; controls.setTouchStick({ x: 0, y: 0 }, false); return; }
    const r = zone.getBoundingClientRect();
    let dx = e.clientX - r.left - ox;
    let dy = e.clientY - r.top - oy;
    const l = Math.hypot(dx, dy);
    const max = 50;
    if (l > max) { dx = (dx / l) * max; dy = (dy / l) * max; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const m = Math.min(1, l / max);
    const n = Math.hypot(dx, dy) || 1;
    controls.setTouchStick(l > 8 ? { x: (dx / n) * m, y: (-dy / n) * m } : { x: 0, y: 0 }, l > max * 0.95);
  };
  zone.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    e.preventDefault();
    stickId = e.pointerId;
    zone.setPointerCapture?.(e.pointerId);
    const r = zone.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    base.style.left = `${ox}px`;
    base.style.top = `${oy}px`;
    base.style.display = 'block';
    knob.style.transform = '';
    audio.unlock();
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stick(e); });
  const end = (e: PointerEvent) => { if (e.pointerId === stickId) stick(e, true); };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  ui.appendChild(zone);

  const btn = (label: string, size: number, right: number, bottom: number, kind: 'shoot' | 'pass', strong: boolean) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = `position:absolute;right:calc(${right}px + env(safe-area-inset-right));bottom:calc(${bottom}px + env(safe-area-inset-bottom));width:${size}px;height:${size}px;border-radius:50%;pointer-events:auto;touch-action:none;` +
      `font:800 ${Math.round(size * 0.2)}px Inter,system-ui,sans-serif;letter-spacing:0.04em;color:${strong ? '#0b1210' : '#fff'};` +
      `background:${strong ? 'rgba(198,255,61,0.92)' : 'rgba(10,20,14,0.6)'};border:2px solid ${strong ? '#e8ffb0' : 'rgba(255,255,255,0.35)'};box-shadow:0 6px 18px rgba(0,0,0,0.35);`;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.setPointerCapture?.(e.pointerId); b.style.transform = 'scale(0.92)'; controls.touchButton(kind, true); });
    const up = (e: PointerEvent) => { e.preventDefault(); b.style.transform = ''; controls.touchButton(kind, false); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    ui.appendChild(b);
  };
  btn(t('v2d.touch.shoot'), 92, 18, 26, 'shoot', true);
  btn(t('v2d.touch.pass'), 74, 124, 22, 'pass', false);
  root.appendChild(ui);
  return { dispose: () => ui.remove() };
}
