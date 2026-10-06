/**
 * Pitch frame (x along the length, y across — +y is LEFT when facing +x —, z up) ↔ three.js
 * frame (x, y up, z): three = (x, z, −y). Handedness is preserved, so "left of travel" on the
 * pitch is also left on screen for any camera that looks down at the pitch.
 */
import * as THREE from 'three';
import type { Vec2, Vec3 } from '../../../core/types';

export function toThree(p: Vec3 | Vec2, out = new THREE.Vector3(), z?: number): THREE.Vector3 {
  const h = z ?? ('z' in p ? p.z : 0);
  return out.set(p.x, h, -p.y);
}

export function setThree(out: THREE.Vector3, x: number, y: number, z = 0): THREE.Vector3 {
  return out.set(x, z, -y);
}

export function fromThree(v: THREE.Vector3): Vec3 {
  return { x: v.x, y: -v.z, z: v.y };
}

/** Rotation about three's Y axis that turns a rig facing +x toward pitch angle `facing`. */
export const facingToYaw = (facing: number) => facing;
