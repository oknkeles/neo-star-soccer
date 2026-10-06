/**
 * Pitch: striped grass plane, crisp line geometry (separate from the texture so lines stay
 * sharp at any distance), grass apron and waving corner flags.
 * Coordinates: pitch (x, y, z) ↔ three (x, z, −y). See toThree() in coords.ts.
 */
import * as THREE from 'three';
import type { Vec2 } from '../../../core/types';
import { grassDetailTexture, pitchTexture } from './textures';

const HL = 52.5;
const HW = 34;
const LINE = 0.12;

type P = [number, number];

/** Builds all pitch markings as flat quads in pitch coordinates. */
export function pitchLineSegments(): { strips: P[][]; discs: { c: P; r: number }[] } {
  const strips: P[][] = [];
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 48): P[] => {
    const pts: P[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
  };
  strips.push([[-HL, -HW], [HL, -HW], [HL, HW], [-HL, HW], [-HL, -HW]]);
  strips.push([[0, -HW], [0, HW]]);
  strips.push(arc(0, 0, 9.15, 0, Math.PI * 2, 96));
  for (const s of [-1, 1]) {
    const gx = s * HL;
    strips.push([[gx, -20.16], [gx - s * 16.5, -20.16], [gx - s * 16.5, 20.16], [gx, 20.16]]);
    strips.push([[gx, -9.16], [gx - s * 5.5, -9.16], [gx - s * 5.5, 9.16], [gx, 9.16]]);
    // Penalty arc: the part of the 9.15 m circle around the spot outside the box.
    const spot = gx - s * 11;
    const c = Math.acos(5.5 / 9.15);
    if (s > 0) strips.push(arc(spot, 0, 9.15, Math.PI - c, Math.PI + c, 32));
    else strips.push(arc(spot, 0, 9.15, -c, c, 32));
    // Corner arcs.
    for (const t of [-1, 1]) {
      const cy = t * HW;
      const a0 = t > 0 ? (s > 0 ? Math.PI : 1.5 * Math.PI) : (s > 0 ? Math.PI / 2 : 0);
      strips.push(arc(gx, cy, 1, a0, a0 + Math.PI / 2, 10));
    }
  }
  const discs = [{ c: [0, 0] as P, r: 0.16 }, { c: [-41.5, 0] as P, r: 0.13 }, { c: [41.5, 0] as P, r: 0.13 }];
  return { strips, discs };
}

function linesGeometry(): THREE.BufferGeometry {
  const { strips, discs } = pitchLineSegments();
  const pos: number[] = [];
  const h = LINE / 2;
  const quad = (a: P, b: P) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) return;
    // Extend each segment by half a line width so joints have no gaps.
    const ux = dx / l;
    const uy = dy / l;
    const ax = a[0] - ux * h, ay = a[1] - uy * h, bx = b[0] + ux * h, by = b[1] + uy * h;
    const nx = -uy * h;
    const ny = ux * h;
    const v = (x: number, y: number) => pos.push(x, 0, -y);
    v(ax + nx, ay + ny); v(ax - nx, ay - ny); v(bx - nx, by - ny);
    v(ax + nx, ay + ny); v(bx - nx, by - ny); v(bx + nx, by + ny);
  };
  for (const s of strips) for (let i = 0; i < s.length - 1; i++) quad(s[i], s[i + 1]);
  for (const d of discs) {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      pos.push(d.c[0], 0, -d.c[1]);
      pos.push(d.c[0] + Math.cos(a0) * d.r, 0, -(d.c[1] + Math.sin(a0) * d.r));
      pos.push(d.c[0] + Math.cos(a1) * d.r, 0, -(d.c[1] + Math.sin(a1) * d.r));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // Normals may be flipped by winding; force +Y.
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

export interface PitchView {
  group: THREE.Group;
  update(time: number, wind: Vec2): void;
  dispose(): void;
}

export function buildPitch(opts: { quality: 'low' | 'medium' | 'high'; wet: boolean; snow: boolean; flagColor: string }): PitchView {
  const group = new THREE.Group();
  group.name = 'pitch';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => { disposables.push(d); return d; };

  const tex = track(pitchTexture(opts.quality, opts.wet, opts.snow));
  const detail = track(grassDetailTexture());
  detail.repeat.set(113 / 1.6, 76 / 1.6);
  const pitchMat = track(new THREE.MeshStandardMaterial({
    map: tex,
    bumpMap: opts.quality === 'low' ? null : detail,
    bumpScale: 0.9,
    roughness: opts.wet ? 0.38 : opts.snow ? 0.75 : 0.93,
    metalness: 0,
    envMapIntensity: opts.wet ? 0.9 : 0.25,
  }));
  const pitch = new THREE.Mesh(track(new THREE.PlaneGeometry(113, 76)), pitchMat);
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  group.add(pitch);

  // Apron: darker grass all the way to the stands.
  const apronTex = track(grassDetailTexture());
  apronTex.repeat.set(60, 45);
  const apronMat = track(new THREE.MeshStandardMaterial({ color: opts.snow ? 0x9fb3a6 : opts.wet ? 0x24502a : 0x2c5e27, roughness: 0.95, bumpMap: opts.quality === 'low' ? null : apronTex, bumpScale: 0.6 }));
  const apron = new THREE.Mesh(track(new THREE.PlaneGeometry(190, 140)), apronMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  apron.receiveShadow = true;
  group.add(apron);

  const linesMat = track(new THREE.MeshStandardMaterial({
    color: 0xf4f6f2, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.06, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const lines = new THREE.Mesh(track(linesGeometry()), linesMat);
  lines.position.y = 0.006;
  lines.receiveShadow = true;
  group.add(lines);

  // Corner flags.
  const poleGeo = track(new THREE.CylinderGeometry(0.018, 0.018, 1.55, 6));
  const poleMat = track(new THREE.MeshStandardMaterial({ color: 0xf3f3f3, roughness: 0.5 }));
  const flagGeoBase = new THREE.PlaneGeometry(0.42, 0.3, 8, 2);
  const flagMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(opts.flagColor), side: THREE.DoubleSide, roughness: 0.8 }));
  const flags: { mesh: THREE.Mesh; base: Float32Array; phase: number }[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(sx * HL, 0.775, -sy * HW);
    pole.castShadow = true;
    group.add(pole);
    const geo = track(flagGeoBase.clone());
    geo.translate(0.21, 0, 0);
    const flag = new THREE.Mesh(geo, flagMat);
    flag.position.set(sx * HL, 1.4, -sy * HW);
    flag.castShadow = true;
    group.add(flag);
    flags.push({ mesh: flag, base: Float32Array.from(geo.getAttribute('position').array as ArrayLike<number>), phase: (sx + 2) * 1.7 + sy });
  }
  flagGeoBase.dispose();

  return {
    group,
    update(time: number, wind: Vec2) {
      const ws = Math.hypot(wind.x, wind.y);
      const heading = ws > 0.05 ? Math.atan2(wind.y, wind.x) : 0.6;
      const amp = 0.035 + Math.min(0.08, ws * 0.012);
      for (const f of flags) {
        f.mesh.rotation.y = heading;
        const pos = f.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const bx = f.base[i * 3];
          const k = bx / 0.42;
          pos.setZ(i, Math.sin(time * (5 + ws * 0.6) + bx * 14 + f.phase) * amp * k);
          pos.setY(i, f.base[i * 3 + 1] - k * k * 0.05 * (1 - Math.min(1, ws / 8)));
        }
        pos.needsUpdate = true;
      }
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}
