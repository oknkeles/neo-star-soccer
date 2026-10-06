/**
 * The whole static-ish world shared by the moment view and the menu backdrop:
 * sky/lights/weather, pitch, both goals and the stadium.
 */
import * as THREE from 'three';
import type { Kit, Vec3, Weather } from '../../../core/types';
import { buildEnvironment, type EnvView, type Quality } from './env';
import { buildGoal, type GoalView } from './goal';
import { buildPitch, type PitchView } from './pitch';
import { buildStadium, type StadiumView } from './stadium';

export interface WorldOptions {
  quality: Quality;
  shadows: boolean;
  weather: Weather;
  home: Kit;
  away: Kit;
  homeName: string;
  awayName: string;
  /** 0..1 how full the stands are. */
  fullness?: number;
  screenTitle?: string;
}

export interface World {
  scene: THREE.Scene;
  env: EnvView;
  pitch: PitchView;
  stadium: StadiumView;
  goals: [GoalView, GoalView];
  update(dt: number, time: number, camera: THREE.Camera, focus: THREE.Vector3, ball?: { pos: Vec3; vel: Vec3 }): void;
  dispose(): void;
}

export function createRenderer(canvasHost: HTMLElement, quality: Quality, shadows: boolean, maxRatio?: number): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance', alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const cap = maxRatio ?? (quality === 'low' ? 1.25 : 2);
  renderer.setPixelRatio(Math.min(cap, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  const el = renderer.domElement;
  el.style.display = 'block';
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.touchAction = 'none';
  canvasHost.appendChild(el);
  return renderer;
}

export function buildWorld(renderer: THREE.WebGLRenderer, opts: WorldOptions): World {
  const scene = new THREE.Scene();
  const env = buildEnvironment(scene, renderer, opts.weather, { quality: opts.quality, shadows: opts.shadows });
  const pitch = buildPitch({
    quality: opts.quality,
    wet: opts.weather.kind === 'rain',
    snow: opts.weather.kind === 'snow',
    flagColor: opts.home.primary,
  });
  scene.add(pitch.group);
  const goals: [GoalView, GoalView] = [buildGoal(1, opts.quality, env.night), buildGoal(-1, opts.quality, env.night)];
  goals.forEach((g) => scene.add(g.group));
  const stadium = buildStadium({
    quality: opts.quality,
    night: env.night,
    flood: env.flood,
    beams: Math.min(1, env.flood * (opts.weather.kind === 'fog' || opts.weather.kind === 'rain' ? 1 : 0.55)),
    home: opts.home,
    away: opts.away,
    homeName: opts.homeName,
    awayName: opts.awayName,
    fullness: opts.fullness ?? 0.92,
    screenTitle: opts.screenTitle,
  });
  scene.add(stadium.group);

  return {
    scene, env, pitch, stadium, goals,
    update(dt, time, camera, focus, ball) {
      env.update(dt, time, focus);
      pitch.update(time, opts.weather.wind);
      stadium.update(dt, time, camera);
      if (ball) for (const g of goals) g.update(dt, ball.pos, ball.vel);
    },
    dispose() {
      env.dispose();
      pitch.dispose();
      goals.forEach((g) => g.dispose());
      stadium.dispose();
      disposeTree(scene);
      scene.clear();
    },
  };
}

/** Dispose every geometry, material and texture still reachable from an object tree. */
export function disposeTree(root: THREE.Object3D): void {
  const seen = new Set<unknown>();
  const disposeMat = (m: THREE.Material) => {
    if (seen.has(m)) return;
    seen.add(m);
    for (const v of Object.values(m as unknown as Record<string, unknown>)) {
      if (v instanceof THREE.Texture && !seen.has(v)) { seen.add(v); v.dispose(); }
    }
    if (m instanceof THREE.ShaderMaterial) {
      for (const u of Object.values(m.uniforms)) {
        const v = (u as { value: unknown }).value;
        if (v instanceof THREE.Texture && !seen.has(v)) { seen.add(v); v.dispose(); }
      }
    }
    m.dispose();
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !seen.has(mesh.geometry)) { seen.add(mesh.geometry); mesh.geometry.dispose(); }
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(disposeMat); else if (mat) disposeMat(mat);
  });
}
