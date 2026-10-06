/**
 * Goal frame + net. The net is a LineSegments grid whose vertices bulge around the ball when it
 * hits the net and then ripple out with a damped oscillation. Edge vertices stay pinned to the frame.
 */
import * as THREE from 'three';
import type { Vec3 } from '../../../core/types';

const GHW = 3.66;
const GH = 2.44;
const TOP_DEPTH = 1.0;
const TOP_BACK_Z = 2.25;
const DEPTH = 2.0;
const CELL = 0.15;

interface Impact { x: number; y: number; z: number; dx: number; dy: number; dz: number; strength: number; age: number }

export interface GoalView {
  group: THREE.Group;
  /** Call every frame with the ball position (pitch frame). */
  update(dt: number, ball: Vec3, ballVel: Vec3): void;
  /** Force a ripple (e.g. from an engine 'net' event) at the ball position. */
  hit(ball: Vec3, vel: Vec3): void;
  /** +1 for the goal at x = +52.5. */
  readonly side: 1 | -1;
  dispose(): void;
}

export function buildGoal(side: 1 | -1, quality: 'low' | 'medium' | 'high', night: boolean): GoalView {
  const group = new THREE.Group();
  const gx = side * 52.5;
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => { disposables.push(d); return d; };

  // ── frame ──
  const frameMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: night ? 0.12 : 0.02 }));
  const postGeo = track(new THREE.CylinderGeometry(0.06, 0.06, GH + 0.12, 14));
  const barGeo = track(new THREE.CylinderGeometry(0.06, 0.06, (GHW + 0.06) * 2 + 0.12, 14));
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, frameMat);
    post.position.set(gx - side * 0.06, (GH + 0.12) / 2, -s * (GHW + 0.06));
    post.castShadow = true;
    group.add(post);
  }
  const bar = new THREE.Mesh(barGeo, frameMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(gx - side * 0.06, GH + 0.06, 0);
  bar.castShadow = true;
  group.add(bar);

  // Back stanchions and ground bars (thin, grey).
  const supportMat = track(new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.5, metalness: 0.3 }));
  const tube = (a: THREE.Vector3, b: THREE.Vector3, r = 0.025) => {
    const len = a.distanceTo(b);
    const geo = track(new THREE.CylinderGeometry(r, r, len, 6));
    const m = new THREE.Mesh(geo, supportMat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.castShadow = true;
    group.add(m);
  };
  for (const s of [-1, 1]) {
    const z = -s * GHW;
    tube(new THREE.Vector3(gx - side * 0.06, GH, z), new THREE.Vector3(gx + side * TOP_DEPTH, TOP_BACK_Z, z));
    tube(new THREE.Vector3(gx + side * TOP_DEPTH, TOP_BACK_Z, z), new THREE.Vector3(gx + side * DEPTH, 0.03, z));
    tube(new THREE.Vector3(gx - side * 0.06, 0.03, z), new THREE.Vector3(gx + side * DEPTH, 0.03, z));
  }
  tube(new THREE.Vector3(gx + side * DEPTH, 0.03, -GHW), new THREE.Vector3(gx + side * DEPTH, 0.03, GHW));
  tube(new THREE.Vector3(gx + side * TOP_DEPTH, TOP_BACK_Z, -GHW), new THREE.Vector3(gx + side * TOP_DEPTH, TOP_BACK_Z, GHW));

  // ── net ──
  // Vertices are generated per panel on a (u, v) grid in pitch coordinates; pin weight w = 0 on the frame.
  const base: number[] = [];
  const pin: number[] = [];
  const index: number[] = [];
  const addPanel = (nu: number, nv: number, at: (u: number, v: number) => [number, number, number], pinFn: (u: number, v: number) => number) => {
    const start = base.length / 3;
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const v = j / nv;
        const [x, y, z] = at(u, v);
        base.push(x, y, z);
        pin.push(pinFn(u, v));
      }
    }
    const idx = (i: number, j: number) => start + j * (nu + 1) + i;
    for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) index.push(idx(i, j), idx(i + 1, j));
    for (let j = 0; j < nv; j++) for (let i = 0; i <= nu; i++) index.push(idx(i, j), idx(i, j + 1));
  };
  const nu = Math.ceil((GHW * 2) / (quality === 'low' ? CELL * 1.6 : CELL));
  const edge = (a: number) => Math.min(1, a * 6);
  // Roof: crossbar → back top.
  addPanel(nu, Math.ceil(TOP_DEPTH / CELL), (u, v) => [gx + side * (-0.06 + v * (TOP_DEPTH + 0.06)), -GHW + u * 2 * GHW, GH + (TOP_BACK_Z - GH) * v],
    (u, v) => edge(Math.min(u, 1 - u)) * edge(v) * 0.6);
  // Back: back top → ground.
  const backLen = Math.hypot(DEPTH - TOP_DEPTH, TOP_BACK_Z);
  addPanel(nu, Math.ceil(backLen / CELL), (u, v) => [gx + side * (TOP_DEPTH + v * (DEPTH - TOP_DEPTH)), -GHW + u * 2 * GHW, TOP_BACK_Z * (1 - v)],
    (u, v) => edge(Math.min(u, 1 - u)) * edge(Math.min(v, 1 - v)));
  // Sides.
  for (const s of [-1, 1]) {
    const nd = Math.ceil(DEPTH / CELL);
    const nz = Math.ceil(GH / CELL);
    addPanel(nd, nz, (u, v) => {
      const d = -0.06 + u * (DEPTH + 0.06);
      const top = d <= TOP_DEPTH ? GH + (TOP_BACK_Z - GH) * ((d + 0.06) / (TOP_DEPTH + 0.06)) : TOP_BACK_Z * (DEPTH - d) / (DEPTH - TOP_DEPTH);
      return [gx + side * d, s * GHW, Math.max(0, top) * v];
    }, (u, v) => edge(Math.min(u, 1 - u)) * edge(Math.min(v, 1 - v)) * 0.8);
  }
  const basePos = Float32Array.from(base);
  const pinW = Float32Array.from(pin);
  // three coordinates: (x, z, -y).
  const live = new Float32Array(basePos.length);
  const writeLive = (disp: ((i: number) => [number, number, number]) | null) => {
    for (let i = 0; i < basePos.length / 3; i++) {
      let x = basePos[i * 3], y = basePos[i * 3 + 1], z = basePos[i * 3 + 2];
      if (disp) {
        const d = disp(i);
        x += d[0]; y += d[1]; z += d[2];
      }
      live[i * 3] = x;
      live[i * 3 + 1] = Math.max(0.01, z);
      live[i * 3 + 2] = -y;
    }
  };
  writeLive(null);
  const netGeo = track(new THREE.BufferGeometry());
  const posAttr = new THREE.BufferAttribute(live, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  netGeo.setAttribute('position', posAttr);
  netGeo.setIndex(index);
  const netMat = track(new THREE.LineBasicMaterial({ color: night ? 0xffffff : 0xf0f0f0, transparent: true, opacity: night ? 0.62 : 0.5, depthWrite: false }));
  const net = new THREE.LineSegments(netGeo, netMat);
  net.frustumCulled = false;
  group.add(net);

  const impacts: Impact[] = [];
  let inside = false;
  let resting = 0;
  let dirty = false;

  const view: GoalView = {
    group,
    side,
    hit(ball, vel) {
      const sp = Math.hypot(vel.x, vel.y, vel.z);
      const n = sp > 0.1 ? 1 / sp : 0;
      const strength = Math.min(0.55, 0.08 + sp * 0.018);
      impacts.push({ x: ball.x, y: ball.y, z: ball.z, dx: sp > 0.1 ? vel.x * n : side, dy: vel.y * n, dz: vel.z * n, strength, age: 0 });
      if (impacts.length > 4) impacts.shift();
    },
    update(dt, ball, vel) {
      const behindLine = side * (ball.x - gx) > 0.15;
      const inMouth = Math.abs(ball.y) < GHW + 0.3 && ball.z < GH + 0.3;
      const nowInside = behindLine && inMouth && side * (ball.x - gx) < DEPTH + 0.6;
      if (nowInside && !inside) view.hit(ball, vel);
      inside = nowInside;
      resting = nowInside ? Math.min(1, resting + dt * 3) : Math.max(0, resting - dt * 2);
      for (const im of impacts) im.age += dt;
      while (impacts.length && impacts[0].age > 2.5) impacts.shift();
      if (impacts.length === 0 && resting <= 0) {
        if (dirty) { writeLive(null); posAttr.needsUpdate = true; dirty = false; }
        return;
      }
      dirty = true;
      writeLive((i) => {
        const bx = basePos[i * 3], by = basePos[i * 3 + 1], bz = basePos[i * 3 + 2];
        const w = pinW[i];
        let ox = 0, oy = 0, oz = 0;
        if (w <= 0) return [0, 0, 0];
        for (const im of impacts) {
          const d2 = (bx - im.x) ** 2 + (by - im.y) ** 2 + (bz - im.z) ** 2;
          const fall = Math.exp(-d2 / 0.9);
          if (fall < 0.01) continue;
          // Bulge, then a damped ripple that travels outward.
          const ripple = Math.cos(im.age * 15 - Math.sqrt(d2) * 4) * Math.exp(-im.age * 3.2);
          const a = im.strength * w * (fall * ripple + Math.exp(-d2 / 0.35) * Math.exp(-im.age * 5) * 0.8);
          ox += im.dx * a; oy += im.dy * a; oz += im.dz * a * 0.5;
        }
        if (resting > 0) {
          // Wrap around a ball resting in the net.
          const d2 = (bx - ball.x) ** 2 + (by - ball.y) ** 2 + (bz - ball.z) ** 2;
          const a = Math.exp(-d2 / 0.18) * 0.16 * resting * w;
          ox += side * a;
        }
        return [ox, oy, oz];
      });
      posAttr.needsUpdate = true;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
  return view;
}
