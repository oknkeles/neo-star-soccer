/**
 * The ball: classic panel sphere that rolls/spins from its velocity and side-spin, a blob shadow
 * that shrinks and fades with height (so height stays readable from any camera), a ground marker
 * under high balls and a glowing motion trail on fast shots.
 */
import * as THREE from 'three';
import type { Vec3 } from '../../../core/types';
import { ballTexture, radialTexture } from './textures';

const R = 0.11;
/** Slightly oversized so the ball reads on small screens and far cameras. */
const VISUAL_SCALE = 1.3;
const TRAIL_POINTS = 26;

export interface BallView {
  group: THREE.Group;
  readonly mesh: THREE.Mesh;
  /** Pitch-frame position, velocity and spin (rad/s). */
  update(dt: number, pos: Vec3, vel: Vec3, spin: Vec3 | null): void;
  /** Teleport without trail streaks (replay start, resets). */
  reset(pos: Vec3): void;
  dispose(): void;
}

export function buildBall(quality: 'low' | 'medium' | 'high', castShadow: boolean): BallView {
  const group = new THREE.Group();
  group.name = 'ball';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => { disposables.push(d); return d; };

  const seg = quality === 'low' ? 16 : 28;
  const tex = track(ballTexture());
  const mat = track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.0, envMapIntensity: 0.8 }));
  const mesh = new THREE.Mesh(track(new THREE.SphereGeometry(R * VISUAL_SCALE, seg, Math.round(seg * 0.7))), mat);
  mesh.castShadow = castShadow;
  group.add(mesh);

  // Blob shadow: always visible (real shadows are soft and easy to lose).
  const blobTex = track(radialTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)', 64, [[0.45, 'rgba(0,0,0,0.5)']]));
  const blobMat = track(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.75 }));
  const blob = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1)), blobMat);
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 2;
  group.add(blob);

  // Ground marker ring for lofted balls.
  const ringMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  const ring = new THREE.Mesh(track(new THREE.RingGeometry(0.34, 0.42, 32)), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 2;
  group.add(ring);

  // Trail: a camera-agnostic ribbon (two vertices per sample, offset across the velocity on the ground plane + vertically).
  const trailPos = new Float32Array(TRAIL_POINTS * 2 * 3);
  const trailAlpha = new Float32Array(TRAIL_POINTS * 2);
  const trailGeo = track(new THREE.BufferGeometry());
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeo.setAttribute('alpha', new THREE.BufferAttribute(trailAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  const idx: number[] = [];
  for (let i = 0; i < TRAIL_POINTS - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  trailGeo.setIndex(idx);
  const trailMat = track(new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1.0, 0.95, 0.75) }, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float alpha; varying float vA;
      void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying float vA;
      void main() { gl_FragColor = vec4(uColor, vA * vA * uOpacity); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  trail.renderOrder = 3;
  group.add(trail);
  const history: THREE.Vector3[] = Array.from({ length: TRAIL_POINTS }, () => new THREE.Vector3());
  let historyFill = 0;
  let trailOpacity = 0;

  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const omega = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const side = new THREE.Vector3();

  const place = (pos: Vec3) => {
    const h = Math.max(0, pos.z);
    mesh.position.set(pos.x, Math.max(R * VISUAL_SCALE, h + (h < R * 1.5 ? R * (VISUAL_SCALE - 1) : 0)), -pos.y);
    const air = Math.max(0, h - R);
    const s = (0.62 + air * 0.08) * VISUAL_SCALE;
    blob.scale.set(s, s, 1);
    blob.position.set(pos.x, 0.015, -pos.y);
    blobMat.opacity = Math.max(0.12, 0.8 - air * 0.12);
    ring.position.set(pos.x, 0.02, -pos.y);
    ringMat.opacity = Math.min(0.55, Math.max(0, (air - 0.8) * 0.25));
    const rs = 0.8 + Math.min(1.5, air * 0.12);
    ring.scale.set(rs, rs, 1);
  };

  const view: BallView = {
    group,
    mesh,
    update(dt, pos, vel, spin) {
      place(pos);
      // Rotation: rolling on the ground (ω = up × v / r), engine spin in the air, plus side spin.
      const onGround = pos.z < R * 1.6;
      omega.set(0, 0, 0);
      if (onGround) {
        // (0,1,0) × (vx, 0, −vy) / r in three coords.
        omega.set(-vel.y / R, 0, -vel.x / R);
      } else {
        if (spin) omega.set(spin.x, spin.z, -spin.y);
        // A little visible topspin along the flight keeps the panels moving.
        const sp = Math.hypot(vel.x, vel.y);
        if (sp > 1) omega.add(tmp.set(-vel.y / sp, 0, -vel.x / sp).multiplyScalar(Math.min(18, sp * 0.6)));
      }
      if (spin && onGround) omega.y += spin.z;
      const w = omega.length();
      if (w > 1e-4) {
        axis.copy(omega).multiplyScalar(1 / w);
        q.setFromAxisAngle(axis, Math.min(w * dt, 1.2));
        mesh.quaternion.premultiply(q);
      }
      // Trail.
      const speed = Math.hypot(vel.x, vel.y, vel.z);
      for (let i = TRAIL_POINTS - 1; i > 0; i--) history[i].copy(history[i - 1]);
      history[0].copy(mesh.position);
      historyFill = Math.min(TRAIL_POINTS, historyFill + 1);
      const target = speed > 17 ? Math.min(1, (speed - 17) / 10) : 0;
      trailOpacity += (target - trailOpacity) * Math.min(1, dt * (target > trailOpacity ? 12 : 3));
      trailMat.uniforms.uOpacity.value = trailOpacity * 0.85;
      trail.visible = trailOpacity > 0.01 && historyFill > 2;
      if (trail.visible) {
        side.set(vel.y, 0, vel.x);
        if (side.lengthSq() < 1e-6) side.set(0, 0, 1);
        side.normalize();
        for (let i = 0; i < TRAIL_POINTS; i++) {
          const p = history[Math.min(i, historyFill - 1)];
          const f = 1 - i / (TRAIL_POINTS - 1);
          const wdt = R * VISUAL_SCALE * (0.25 + 0.75 * f);
          trailPos[i * 6] = p.x + side.x * wdt;
          trailPos[i * 6 + 1] = p.y + wdt * 0.5;
          trailPos[i * 6 + 2] = p.z + side.z * wdt;
          trailPos[i * 6 + 3] = p.x - side.x * wdt;
          trailPos[i * 6 + 4] = p.y - wdt * 0.5;
          trailPos[i * 6 + 5] = p.z - side.z * wdt;
          trailAlpha[i * 2] = f;
          trailAlpha[i * 2 + 1] = f;
        }
        (trailGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (trailGeo.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
      }
    },
    reset(pos) {
      place(pos);
      historyFill = 0;
      trailOpacity = 0;
      trail.visible = false;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
  return view;
}
