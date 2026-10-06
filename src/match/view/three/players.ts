/**
 * Procedural low-poly footballers. Each bone segment is ONE merged mesh with vertex colours
 * (skin, sleeve, shorts, socks, boots, hair) sharing a single material, plus a textured torso
 * (kit pattern, number and surname on the back) — ~11 draw calls per player.
 * Rig frame: the player faces +X, up is +Y, his LEFT is −Z (see pose.ts).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AnimState, Appearance, Foot, Kit, Vec2 } from '../../../core/types';
import { shade, skinColor } from '../palette';
import { advanceCycle, angleDelta, blendPose, computePose, idVariant, neutralPose, type Pose } from '../pose';
import { shirtTexture } from './textures';

const HIP_Y = 0.95;
const THIGH = 0.45;
const SHIN = 0.44;
const UPPER_ARM = 0.29;

export interface PlayerLook {
  id: string;
  name: string;
  number: number;
  appearance: Appearance;
  foot: Foot;
  kit: Kit;
  shorts: string;
  socks: string;
  /** Goalkeeper gloves. */
  gloves?: string;
  isUser: boolean;
}

export interface PlayerFrame {
  pos: Vec2;
  vel: Vec2;
  facing: number;
  anim: AnimState;
  animTime: number;
}

export interface PlayerRig {
  readonly id: string;
  readonly root: THREE.Group;
  /** World-space head top (three coords), for name tags. */
  headTop(out: THREE.Vector3): THREE.Vector3;
  /** Snap to a frame without smoothing (spawn / replay start). */
  snap(f: PlayerFrame): void;
  update(dt: number, f: PlayerFrame): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

/** Shared material for every vertex-coloured body part. */
export function createBodyMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 });
}

function colored(geo: THREE.BufferGeometry, color: string | THREE.Color): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return m ?? new THREE.BufferGeometry();
}

const capsule = (r: number, len: number, seg = 8) => new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 3, seg);

function hairGeometry(style: number, color: string, detail: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const R = 0.118;
  const cap = (scale = 1.06, theta = 0.5) => {
    const g = new THREE.SphereGeometry(R * scale, 12 * detail, 8 * detail, 0, Math.PI * 2, 0, Math.PI * theta);
    g.scale(0.98, 1.1, 0.95);
    return g;
  };
  switch (style) {
    case 0: return parts;
    case 1: { const g = cap(1.03, 0.42); g.translate(-0.005, 0.005, 0); parts.push(colored(g, color)); break; }
    case 2: {
      const g = cap(1.07, 0.47); g.translate(-0.01, 0.01, 0); parts.push(colored(g, color));
      const fringe = new THREE.BoxGeometry(0.05, 0.035, 0.2); fringe.translate(0.1, 0.085, 0); parts.push(colored(fringe, color));
      break;
    }
    case 3: { const g = new THREE.SphereGeometry(R * 1.45, 12 * detail, 10 * detail); g.scale(1, 0.9, 1.05); g.translate(-0.025, 0.07, 0); parts.push(colored(g, color)); break; }
    case 4: {
      const g = cap(1.02, 0.4); parts.push(colored(g, shade(color, -0.35)));
      const crest = new THREE.BoxGeometry(0.22, 0.07, 0.045); crest.translate(-0.01, 0.125, 0); parts.push(colored(crest, color));
      break;
    }
    case 5: {
      const g = cap(1.1, 0.55); g.translate(-0.012, 0.0, 0); parts.push(colored(g, color));
      const back = new THREE.BoxGeometry(0.06, 0.2, 0.22); back.translate(-0.095, -0.06, 0); parts.push(colored(back, color));
      break;
    }
    case 6: {
      const g = cap(1.06, 0.46); parts.push(colored(g, color));
      const bun = new THREE.SphereGeometry(0.05, 8, 6); bun.translate(-0.11, 0.08, 0); parts.push(colored(bun, color));
      break;
    }
    default: {
      const g = cap(1.12, 0.5); g.translate(-0.005, 0.02, 0); parts.push(colored(g, color));
      for (let i = 0; i < 5; i++) {
        const b = new THREE.SphereGeometry(0.045, 6, 5);
        const a = (i / 5) * Math.PI * 2;
        b.translate(Math.cos(a) * 0.06, 0.12, Math.sin(a) * 0.06);
        parts.push(colored(b, color));
      }
      break;
    }
  }
  return parts;
}

/** Builds a rig; geometries are per player (vertex colours), the body material is shared. */
export function buildPlayer(look: PlayerLook, bodyMat: THREE.Material, quality: 'low' | 'medium' | 'high', castShadow: boolean): PlayerRig {
  const detail = quality === 'high' ? 1.5 : 1;
  const seg = quality === 'low' ? 6 : 10;
  const skin = skinColor(look.appearance.skin);
  const sleeve = look.kit.style === 'halves' ? look.kit.secondary : look.kit.primary;
  const boots = look.appearance.boots || '#111111';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => { disposables.push(d); return d; };
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material = bodyMat) => {
    const m = new THREE.Mesh(track(geo), mat);
    m.castShadow = castShadow;
    return m;
  };

  const root = new THREE.Group();
  root.name = `player:${look.id}`;
  const scale = Math.max(0.88, Math.min(1.12, (look.appearance.height || 180) / 180));
  const body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(scale);

  // Pelvis / shorts.
  const pelvisGeo = new THREE.CylinderGeometry(0.165, 0.18, 0.25, seg);
  pelvisGeo.scale(0.72, 1, 1);
  pelvisGeo.translate(0, -0.045, 0);
  body.add(mk(merge([colored(pelvisGeo, look.shorts)])));

  // Legs.
  const legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0, -0.07, side * 0.093);
    body.add(hip);
    const thighSkin = capsule(0.072, THIGH, seg);
    thighSkin.translate(0, -THIGH / 2, 0);
    const shortsLeg = new THREE.CylinderGeometry(0.09, 0.085, 0.21, seg);
    shortsLeg.translate(0, -0.08, 0);
    hip.add(mk(merge([colored(thighSkin, skin), colored(shortsLeg, look.shorts)])));
    const knee = new THREE.Group();
    knee.position.set(0, -THIGH, 0);
    hip.add(knee);
    const shin = capsule(0.058, SHIN, seg);
    shin.translate(0, -SHIN / 2, 0);
    const sock = new THREE.CylinderGeometry(0.067, 0.058, 0.3, seg);
    sock.translate(0, -0.25, 0);
    const sockBand = new THREE.CylinderGeometry(0.069, 0.069, 0.035, seg);
    sockBand.translate(0, -0.12, 0);
    const boot = new THREE.BoxGeometry(0.25, 0.075, 0.1);
    boot.translate(0.055, -SHIN - 0.02, 0);
    const toe = new THREE.SphereGeometry(0.05, 8, 6);
    toe.scale(1, 0.75, 1);
    toe.translate(0.17, -SHIN - 0.025, 0);
    const studs = new THREE.BoxGeometry(0.22, 0.012, 0.085);
    studs.translate(0.05, -SHIN - 0.062, 0);
    knee.add(mk(merge([
      colored(shin, skin), colored(sock, look.socks), colored(sockBand, shade(look.socks, look.socks === '#ffffff' ? -0.3 : 0.45)),
      colored(boot, boots), colored(toe, boots), colored(studs, shade(boots, -0.6)),
    ])));
    legs.push({ hip, knee });
  }

  // Spine + torso (textured).
  const spine = new THREE.Group();
  spine.position.set(0, 0.04, 0);
  body.add(spine);
  const shirtTex = track(shirtTexture(look.kit, look.number, look.name, look.isUser ? 'lg' : 'sm'));
  const torsoMat = track(new THREE.MeshStandardMaterial({ map: shirtTex, roughness: 0.82 }));
  const torsoGeo = new THREE.CylinderGeometry(0.205, 0.16, 0.58, seg + 6, 1);
  torsoGeo.scale(0.64, 1, 1);
  torsoGeo.translate(0, 0.3, 0);
  spine.add(mk(torsoGeo, torsoMat));
  // Shoulder yoke (sleeve colour) closes the top of the torso.
  const yoke = new THREE.SphereGeometry(0.205, seg + 4, 6, 0, Math.PI * 2, 0, Math.PI * 0.32);
  yoke.scale(0.64, 0.42, 1);
  yoke.translate(0, 0.585, 0);
  spine.add(mk(merge([colored(yoke, sleeve)])));

  // Arms.
  const arms: { shoulder: THREE.Group; elbow: THREE.Group }[] = [];
  const handColor = look.gloves ?? skin;
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0, 0.53, side * 0.215);
    spine.add(shoulder);
    const upper = capsule(0.05, UPPER_ARM, seg);
    upper.translate(0, -UPPER_ARM / 2, 0);
    const sl = new THREE.CylinderGeometry(0.07, 0.064, 0.17, seg);
    sl.translate(0, -0.05, 0);
    const cap = new THREE.SphereGeometry(0.075, seg, 6);
    cap.scale(1, 0.85, 1);
    shoulder.add(mk(merge([colored(upper, skin), colored(sl, sleeve), colored(cap, sleeve)])));
    const elbow = new THREE.Group();
    elbow.position.set(0, -UPPER_ARM, 0);
    shoulder.add(elbow);
    const fore = capsule(0.044, 0.25, seg);
    fore.translate(0, -0.125, 0);
    const hand = new THREE.SphereGeometry(look.gloves ? 0.06 : 0.048, 8, 6);
    hand.scale(0.8, 1.15, 1);
    hand.translate(0, -0.28, 0);
    const parts = [colored(fore, skin), colored(hand, handColor)];
    if (look.gloves) {
      const cuff = new THREE.CylinderGeometry(0.056, 0.052, 0.07, seg);
      cuff.translate(0, -0.22, 0);
      parts.push(colored(cuff, handColor));
    }
    elbow.add(mk(merge(parts)));
    arms.push({ shoulder, elbow });
  }

  // Head.
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.6, 0);
  spine.add(headPivot);
  const neck = new THREE.CylinderGeometry(0.052, 0.058, 0.12, seg);
  neck.translate(0, 0.04, 0);
  const head = new THREE.SphereGeometry(0.118, Math.round(14 * detail), Math.round(10 * detail));
  head.scale(0.98, 1.1, 0.92);
  head.translate(0.008, 0.17, 0);
  const nose = new THREE.SphereGeometry(0.022, 6, 4);
  nose.scale(1, 1.3, 0.9);
  nose.translate(0.117, 0.16, 0);
  const ears = [-1, 1].map((s) => {
    const e = new THREE.SphereGeometry(0.026, 6, 4);
    e.scale(0.6, 1, 0.6);
    e.translate(0.0, 0.165, s * 0.108);
    return colored(e, shade(skin, -0.06));
  });
  const headParts = [colored(neck, shade(skin, -0.08)), colored(head, skin), colored(nose, shade(skin, -0.05)), ...ears];
  if (quality !== 'low') {
    for (const s of [-1, 1]) {
      const eye = new THREE.SphereGeometry(0.014, 6, 4);
      eye.translate(0.106, 0.19, s * 0.04);
      headParts.push(colored(eye, '#1a1410'));
      const brow = new THREE.BoxGeometry(0.012, 0.012, 0.045);
      brow.translate(0.107, 0.215, s * 0.042);
      headParts.push(colored(brow, shade(look.appearance.hairColor || '#2b1d14', -0.2)));
    }
  }
  const hairParts = hairGeometry(Math.round(look.appearance.hairStyle) % 8, look.appearance.hairColor || '#2b1d14', detail);
  hairParts.forEach((g) => g.translate(0.008, 0.17, 0));
  headParts.push(...hairParts);
  const beard = Math.round(look.appearance.beard || 0);
  if (beard > 0) {
    const b = new THREE.SphereGeometry(0.121, 12, 8, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.55, Math.PI * (beard >= 3 ? 0.36 : 0.28));
    b.scale(0.98, 1.1, 0.93);
    b.translate(0.008, 0.17, 0);
    // SphereGeometry phi = 0 starts at −x; rotate so the beard faces +x.
    b.rotateY(Math.PI / 2);
    headParts.push(colored(b, shade(look.appearance.hairColor || '#2b1d14', beard === 1 ? 0.15 : 0)));
  }
  headPivot.add(mk(merge(headParts)));

  // ── animation state ──
  const variant = idVariant(look.id);
  const pose: Pose = neutralPose();
  let cycle = variant * Math.PI * 2;
  let yaw = 0;
  let lastAnim: AnimState = 'idle';
  let animBlend = 0;
  let roll = 0;
  const tmp = new THREE.Vector3();

  const apply = () => {
    body.position.y = HIP_Y + pose.rootY;
    body.rotation.set(-pose.rootRoll + roll, 0, -pose.rootPitch, 'XYZ');
    spine.rotation.set(0, pose.twist, -pose.spine, 'XYZ');
    headPivot.rotation.set(0, -pose.twist * 0.5, -pose.head, 'XYZ');
    legs[0].hip.rotation.set(pose.hipOutL, 0, pose.hipL, 'XYZ');
    legs[1].hip.rotation.set(-pose.hipOutR, 0, pose.hipR, 'XYZ');
    legs[0].knee.rotation.set(0, 0, -pose.kneeL);
    legs[1].knee.rotation.set(0, 0, -pose.kneeR);
    arms[0].shoulder.rotation.set(pose.shoulderOutL, 0, pose.shoulderL, 'XYZ');
    arms[1].shoulder.rotation.set(-pose.shoulderOutR, 0, pose.shoulderR, 'XYZ');
    arms[0].elbow.rotation.set(0, 0, pose.elbowL);
    arms[1].elbow.rotation.set(0, 0, pose.elbowR);
  };

  const frameInput = (f: PlayerFrame) => ({
    anim: f.anim, t: f.animTime, speed: Math.hypot(f.vel.x, f.vel.y), cycle, kickFoot: look.foot, variant,
  });

  const rig: PlayerRig = {
    id: look.id,
    root,
    headTop(out) {
      return headPivot.getWorldPosition(out).add(tmp.set(0, 0.42 * scale, 0));
    },
    snap(f) {
      root.position.set(f.pos.x, 0, -f.pos.y);
      yaw = f.facing;
      root.rotation.y = yaw;
      Object.assign(pose, computePose(frameInput(f)));
      lastAnim = f.anim;
      apply();
    },
    update(dt, f) {
      const speed = Math.hypot(f.vel.x, f.vel.y);
      cycle = advanceCycle(cycle, speed, dt);
      root.position.set(f.pos.x, 0, -f.pos.y);
      const d = angleDelta(yaw, f.facing);
      const turnRate = d / Math.max(dt, 1e-3);
      yaw += d * Math.min(1, dt * 14);
      root.rotation.y = yaw;
      // Lean into turns when running.
      const targetRoll = Math.max(-0.22, Math.min(0.22, -turnRate * speed * 0.004));
      roll += (targetRoll - roll) * Math.min(1, dt * 8);
      if (f.anim !== lastAnim) { lastAnim = f.anim; animBlend = 1; }
      animBlend = Math.max(0, animBlend - dt * 4);
      const target = computePose(frameInput(f));
      const fast = f.anim === 'kick' || f.anim === 'pass' || f.anim === 'volley' || f.anim === 'header' || f.anim === 'tackle'
        || f.anim === 'dive_left' || f.anim === 'dive_right' || f.anim === 'slide' || f.anim === 'wall_jump';
      const rate = fast ? 30 : 13 + 10 * animBlend;
      blendPose(pose, target, 1 - Math.exp(-dt * rate));
      apply();
    },
    setVisible(v) { root.visible = v; },
    dispose() {
      disposables.forEach((x) => x.dispose());
    },
  };
  apply();
  return rig;
}

/** A floating name tag sprite (canvas) for the user's player. */
export function nameTag(name: string, number: number, accent = '#b8ff3c'): { sprite: THREE.Sprite; dispose(): void } {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  const draw = () => {
    if (!g) return;
    g.clearRect(0, 0, 512, 128);
    const label = `${number}  ${name.toLocaleUpperCase('tr-TR')}`;
    g.font = '72px "Bebas Neue", "Impact", sans-serif';
    const w = Math.min(500, g.measureText(label).width + 64);
    const x = (512 - w) / 2;
    g.fillStyle = 'rgba(6,13,9,0.78)';
    g.beginPath();
    g.roundRect(x, 18, w, 84, 42);
    g.fill();
    g.strokeStyle = accent;
    g.lineWidth = 5;
    g.stroke();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 256, 64);
    // Little pointer.
    g.fillStyle = accent;
    g.beginPath();
    g.moveTo(244, 104); g.lineTo(268, 104); g.lineTo(256, 122);
    g.fill();
  };
  draw();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  try { void document.fonts?.ready.then(() => { draw(); tex.needsUpdate = true; }); } catch { /* noop */ }
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 20;
  sprite.center.set(0.5, 0);
  return { sprite, dispose: () => { tex.dispose(); mat.dispose(); } };
}
