/**
 * Menu backdrop: a slowly orbiting, floodlit stadium with a few players warming up.
 * Capped at ~30 fps with a low pixel ratio so it stays cheap behind the title screen.
 */
import * as THREE from 'three';
import { getSettings } from '../../core/settings';
import type { Kit, Weather } from '../../core/types';
import { resolveKitClash, shortsColor } from './palette';
import { buildBall } from './three/ball';
import { buildPlayer, createBodyMaterial, type PlayerRig } from './three/players';
import { buildWorld, createRenderer } from './three/world';

const DEFAULT_KIT: Kit = { primary: '#0f7a3c', secondary: '#b8ff3c', style: 'stripes' };
const RIVAL_KIT: Kit = { primary: '#f2f2f2', secondary: '#1a1f2e', style: 'plain' };

export function mountStadiumBackdropImpl(container: HTMLElement, opts: { kit?: Kit; time?: 'day' | 'dusk' | 'night' }): { dispose(): void } {
  let q: 'low' | 'medium' | 'high' = 'medium';
  try { q = getSettings().graphics.quality === 'low' ? 'low' : 'medium'; } catch { /* default */ }
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  const renderer = createRenderer(container, q, false, 1.25);
  renderer.domElement.style.pointerEvents = 'none';
  const home = opts.kit ?? DEFAULT_KIT;
  const away = resolveKitClash(home, RIVAL_KIT);
  const weather: Weather = { kind: 'clear', time: opts.time ?? 'night', wind: { x: 0, y: 0 }, temperature: 14 };
  const world = buildWorld(renderer, { quality: q, shadows: false, weather, home, away, homeName: 'NEO', awayName: 'STAR', fullness: 0.85, screenTitle: 'NEO STAR' });
  const { scene, stadium } = world;
  stadium.setWave(true);
  stadium.setExcitement(0.45, 0.35);

  // A few players jogging warm-up laps around the centre circle, one ball rolling between two of them.
  const bodyMat = createBodyMaterial();
  const runners: { rig: PlayerRig; r: number; speed: number; phase: number; cx: number; cy: number }[] = [];
  const count = q === 'low' ? 3 : 6;
  for (let i = 0; i < count; i++) {
    const kit = i % 2 === 0 ? home : away;
    const rig = buildPlayer({
      id: `bd${i}`, name: '', number: 4 + i * 3,
      appearance: { skin: (i * 5) % 6, hairStyle: (i * 3) % 8, hairColor: ['#1b1310', '#6b4a2b', '#2c1a10', '#c9a066'][i % 4], beard: i % 3, boots: i % 2 ? '#ff4f64' : '#111111', height: 176 + i * 2 },
      foot: i % 3 === 0 ? 'L' : 'R', kit, shorts: shortsColor(kit), socks: kit.primary, isUser: false,
    }, bodyMat, q, false);
    scene.add(rig.root);
    runners.push({ rig, r: 6 + (i % 3) * 5, speed: 0.12 + (i % 4) * 0.03, phase: (i / count) * Math.PI * 2, cx: i < 3 ? -14 : 16, cy: (i % 2 ? 6 : -5) });
  }
  const ball = buildBall(q, false);
  scene.add(ball.group);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1500);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const resize = () => {
    const r = container.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(container);

  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let time = 0;
  let disposed = false;
  const target = new THREE.Vector3(0, 2, 0);
  const tick = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    if (acc < 1 / 32 || document.hidden) return;
    const step = Math.min(0.1, acc);
    acc = 0;
    time += step;
    const a = time * (reduced ? 0.015 : 0.045) + 0.6;
    const r = camera.aspect < 0.9 ? 96 : 78;
    camera.position.set(Math.cos(a) * r, 24 + Math.sin(time * 0.07) * 6, Math.sin(a) * r * 0.72);
    camera.lookAt(target);
    for (const p of runners) {
      const ang = p.phase + time * p.speed * 2;
      const x = p.cx + Math.cos(ang) * p.r;
      const y = p.cy + Math.sin(ang) * p.r * 0.6;
      const vx = -Math.sin(ang) * p.r * p.speed * 2;
      const vy = Math.cos(ang) * p.r * 0.6 * p.speed * 2;
      p.rig.update(step, { pos: { x, y }, vel: { x: vx, y: vy }, facing: Math.atan2(vy, vx), anim: 'run', animTime: time });
    }
    // Ball rolling back and forth across the centre circle.
    const bt = time * 0.35;
    const bx = Math.sin(bt) * 9;
    const by = Math.sin(bt * 0.5) * 3;
    ball.update(step, { x: bx, y: by, z: 0.11 }, { x: Math.cos(bt) * 9 * 0.35, y: Math.cos(bt * 0.5) * 0.75, z: 0 }, null);
    world.update(step, time, camera, target);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame((n) => { last = n; tick(n); });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      runners.forEach((p) => p.rig.dispose());
      bodyMat.dispose();
      ball.dispose();
      world.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* ignore */ }
      renderer.domElement.remove();
    },
  };
}
