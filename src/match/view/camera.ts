/**
 * Camera director: desired framing per mode (pure, testable, pitch frame) and a smoothed rig on
 * top of it with shake, goal drama (slow dolly + zoom) and a cinematic replay orbit.
 */
import * as THREE from 'three';
import type { CameraMode, Vec2, Vec3 } from '../../core/types';

export interface FramingInput {
  mode: CameraMode;
  /** The user's player (null when he is not on the pitch). */
  user: Vec2 | null;
  ball: Vec3;
  ballVel: Vec3;
  /** The user is drawing a kick. */
  aiming: boolean;
  /** Follow the ball (our shot / a fast ball in flight). */
  followBall: boolean;
  /** Narrow viewports (portrait phones) need a wider view. */
  aspect: number;
}

export interface Framing { pos: Vec3; target: Vec3; fov: number }

const HL = 52.5;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Where the camera wants to be (pitch frame: x along, y across (+ = left when facing +x), z up). */
export function desiredFraming(i: FramingInput): Framing {
  const portrait = i.aspect < 0.9;
  const u = i.user ?? { x: i.ball.x, y: i.ball.y };
  const bx = i.ball.x;
  const by = i.ball.y;
  switch (i.mode) {
    case 'broadcast': {
      const fx = i.followBall ? bx : bx * 0.65 + u.x * 0.35;
      const fy = i.followBall ? by : by * 0.65 + u.y * 0.35;
      const dist = portrait ? 74 : 60;
      return {
        pos: { x: clamp(fx * 0.88, -46, 46), y: -dist, z: portrait ? 30 : 23 },
        target: { x: clamp(fx, -HL - 2, HL + 2), y: fy * 0.55, z: 0.5 },
        fov: portrait ? 44 : 30,
      };
    }
    case 'top': {
      const fx = bx * 0.6 + u.x * 0.4;
      const fy = by * 0.6 + u.y * 0.4;
      const h = portrait ? 70 : 52;
      return {
        pos: { x: fx, y: fy - h * 0.24, z: h },
        target: { x: fx, y: fy, z: 0 },
        fov: 42,
      };
    }
    case 'behind':
    default: {
      if (i.followBall) {
        const sp = Math.hypot(i.ballVel.x, i.ballVel.y) || 1;
        const vx = i.ballVel.x / sp;
        const vy = i.ballVel.y / sp;
        // Mostly behind along +x, leaning into the ball's travel direction.
        const dx = vx * 0.45 + 0.55;
        const dy = vy * 0.45;
        const dl = Math.hypot(dx, dy) || 1;
        const back = 9.5;
        return {
          pos: { x: bx - (dx / dl) * back, y: by - (dy / dl) * back * 0.9, z: 3.4 + i.ball.z * 0.55 },
          target: { x: Math.min(bx + (dx / dl) * 9, HL + 4), y: by + (dy / dl) * 7, z: 0.8 + i.ball.z * 0.6 },
          fov: portrait ? 64 : 50,
        };
      }
      // Frame the user with a pull toward the ball (limited so the ball never drags the shot away).
      let ox = bx - u.x;
      let oy = by - u.y;
      const ol = Math.hypot(ox, oy);
      const maxPull = 9;
      const pull = ol > 1e-6 ? Math.min(ol * 0.35, maxPull) / ol : 0;
      ox *= pull;
      oy *= pull;
      const fx = u.x + ox;
      const fy = u.y + oy;
      const back = i.aiming ? 8.5 : portrait ? 14 : 12;
      const height = i.aiming ? 4.4 : portrait ? 7.6 : 6.2;
      const ahead = i.aiming ? 16 : 15;
      // A ball behind the user (defending toward our goal) pulls the camera back so both stay in shot.
      const behindBy = Math.max(0, u.x - bx - 2);
      const camX = fx - back - Math.min(28, behindBy * 0.9);
      return {
        pos: { x: camX, y: fy * 0.9, z: height + Math.min(6, behindBy * 0.2) },
        target: { x: Math.min(fx + ahead - Math.min(ahead, behindBy * 0.8), HL + 3), y: fy * 0.94, z: i.aiming ? 1.0 : 0.4 },
        fov: i.aiming ? (portrait ? 62 : 48) : (portrait ? 66 : 52),
      };
    }
  }
}

/** Cinematic replay orbit around a centre (pitch frame); `t` in seconds. */
export function orbitFraming(ball: Vec3, t: number, seed = 0): Framing {
  // Keep the subject on the pitch (a ball flying into the stands would frame concrete).
  const center = { x: clamp(ball.x, -HL + 1, HL - 1), y: clamp(ball.y, -32, 32), z: Math.min(ball.z, 6) };
  const a = seed + t * 0.32;
  const r = 11.5 - Math.min(3, t * 0.35);
  return {
    pos: { x: center.x - Math.cos(a) * r, y: center.y - Math.sin(a) * r, z: 2.6 + Math.sin(t * 0.4) * 0.9 + center.z * 0.4 },
    target: { x: center.x, y: center.y, z: 0.8 + center.z * 0.7 },
    fov: 42,
  };
}

const toV3 = (p: Vec3, out: THREE.Vector3) => out.set(p.x, p.z, -p.y);

export interface CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** Current look-at point (three frame). */
  readonly target: THREE.Vector3;
  update(dt: number, f: Framing, rate?: number): void;
  /** Jump straight to a framing. */
  snap(f: Framing): void;
  shake(amount: number): void;
  /** Goal drama: slow dolly-in and zoom on a point for `seconds`. */
  drama(point: Vec3, seconds?: number): void;
  readonly dramatic: boolean;
}

export function createCameraRig(camera: THREE.PerspectiveCamera): CameraRig {
  const pos = new THREE.Vector3(-20, 8, 0);
  const target = new THREE.Vector3(0, 0, 0);
  const wantPos = new THREE.Vector3();
  const wantTarget = new THREE.Vector3();
  const dramaPoint = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let fov = camera.fov;
  let shakeAmt = 0;
  let dramaLeft = 0;
  let dramaTotal = 1;
  let t = 0;

  const apply = () => {
    camera.position.copy(pos);
    if (shakeAmt > 0.001) {
      camera.position.x += (Math.sin(t * 47) + Math.sin(t * 31.3)) * 0.5 * shakeAmt;
      camera.position.y += Math.sin(t * 53.1) * 0.5 * shakeAmt;
      camera.position.z += (Math.sin(t * 41.7) + Math.cos(t * 27)) * 0.5 * shakeAmt;
    }
    camera.lookAt(target);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  };

  const rig: CameraRig = {
    camera,
    target,
    get dramatic() { return dramaLeft > 0; },
    update(dt, f, rate = 3.2) {
      t += dt;
      toV3(f.pos, wantPos);
      toV3(f.target, wantTarget);
      let wantFov = f.fov;
      if (dramaLeft > 0) {
        dramaLeft = Math.max(0, dramaLeft - dt);
        const k = 1 - dramaLeft / dramaTotal;
        // Slow push toward the drama point, looking straight at it.
        tmp.copy(dramaPoint).sub(pos);
        wantPos.copy(pos).addScaledVector(tmp, Math.min(0.5, 0.08 + k * 0.1));
        wantPos.y = Math.max(1.6, wantPos.y);
        wantTarget.copy(dramaPoint);
        wantFov = Math.max(26, f.fov - 14 * Math.min(1, k * 2));
        rate = 1.6;
      }
      const a = 1 - Math.exp(-dt * rate);
      pos.lerp(wantPos, a);
      target.lerp(wantTarget, 1 - Math.exp(-dt * rate * 1.6));
      fov += (wantFov - fov) * a;
      shakeAmt *= Math.exp(-dt * 5);
      apply();
    },
    snap(f) {
      toV3(f.pos, pos);
      toV3(f.target, target);
      fov = f.fov;
      apply();
    },
    shake(amount) { shakeAmt = Math.max(shakeAmt, amount); },
    drama(point, seconds = 2.6) {
      toV3(point, dramaPoint);
      dramaLeft = seconds;
      dramaTotal = seconds;
    },
  };
  return rig;
}
