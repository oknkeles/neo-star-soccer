/**
 * Predicted kick trajectory: a glowing animated tube that fades along its length, its shadow
 * line on the grass (height readability), and a pulsing target ring where the visible part ends.
 * Plus the user's glowing ring.
 */
import * as THREE from 'three';
import type { Vec3 } from '../../../core/types';

export interface AimView {
  group: THREE.Group;
  /** Pitch-frame path (already truncated to what the player can "see"); null hides it. */
  setPath(path: readonly Vec3[] | null, power: number): void;
  update(time: number): void;
  dispose(): void;
}

const TUBE_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uTime; uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float along = vUv.x;
    float fade = pow(1.0 - along, 0.7);
    float dash = 0.55 + 0.45 * smoothstep(0.2, 0.8, sin((along * 40.0 - uTime * 6.0)));
    float edge = 1.0 - abs(vUv.y - 0.5) * 1.2;
    gl_FragColor = vec4(uColor * (1.2 + 0.8 * dash), fade * dash * edge * uOpacity);
  }
`;
const TUBE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export function buildAim(): AimView {
  const group = new THREE.Group();
  group.name = 'aim';
  const color = new THREE.Color('#b8ff3c');
  const tubeMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  let tubeGeo: THREE.BufferGeometry | null = null;
  const tube = new THREE.Mesh(new THREE.BufferGeometry(), tubeMat);
  tube.frustumCulled = false;
  tube.renderOrder = 6;
  tube.visible = false;
  group.add(tube);

  const shadowMat = new THREE.LineDashedMaterial({ color: 0x000000, transparent: true, opacity: 0.45, dashSize: 0.5, gapSize: 0.35, depthWrite: false });
  const shadowGeo = new THREE.BufferGeometry();
  const shadow = new THREE.Line(shadowGeo, shadowMat);
  shadow.frustumCulled = false;
  shadow.visible = false;
  shadow.renderOrder = 4;
  group.add(shadow);

  const targetMat = new THREE.MeshBasicMaterial({ color: color.clone(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const targetGeo = new THREE.RingGeometry(0.42, 0.56, 40);
  const target = new THREE.Mesh(targetGeo, targetMat);
  target.visible = false;
  target.renderOrder = 6;
  group.add(target);

  const powerColor = (p: number, out: THREE.Color) => {
    const a = new THREE.Color('#b8ff3c');
    const b = new THREE.Color('#ffcb47');
    const c = new THREE.Color('#ff4f64');
    return p < 0.6 ? out.copy(a).lerp(b, p / 0.6) : out.copy(b).lerp(c, (p - 0.6) / 0.4);
  };

  const view: AimView = {
    group,
    setPath(path, power) {
      const show = !!path && path.length >= 2;
      tube.visible = show;
      shadow.visible = show;
      target.visible = show;
      if (!show || !path) return;
      const pts = path.map((p) => new THREE.Vector3(p.x, Math.max(0.12, p.z), -p.y));
      // Remove consecutive duplicates (a resting ball) which break the curve's tangents.
      const clean: THREE.Vector3[] = [pts[0]];
      for (let i = 1; i < pts.length; i++) if (pts[i].distanceToSquared(clean[clean.length - 1]) > 1e-4) clean.push(pts[i]);
      if (clean.length < 2) { tube.visible = shadow.visible = target.visible = false; return; }
      const curve = new THREE.CatmullRomCurve3(clean, false, 'centripetal');
      tubeGeo?.dispose();
      tubeGeo = new THREE.TubeGeometry(curve, Math.min(120, clean.length * 3), 0.07, 6, false);
      tube.geometry = tubeGeo;
      shadowGeo.setFromPoints(clean.map((p) => new THREE.Vector3(p.x, 0.03, p.z)));
      shadow.computeLineDistances();
      const end = clean[clean.length - 1];
      target.position.set(end.x, Math.max(0.04, end.y), end.z);
      powerColor(power, tubeMat.uniforms.uColor.value as THREE.Color);
      targetMat.color.copy(tubeMat.uniforms.uColor.value as THREE.Color);
    },
    update(time) {
      tubeMat.uniforms.uTime.value = time;
      if (target.visible) {
        const s = 1 + 0.18 * Math.sin(time * 7);
        target.scale.setScalar(s);
        // Face the ring up when on the ground, toward the camera-ish (−x) when in the air.
        if (target.position.y < 0.3) target.rotation.set(-Math.PI / 2, 0, 0);
        else target.rotation.set(0, -Math.PI / 2, 0);
      }
    },
    dispose() {
      tubeGeo?.dispose();
      tube.geometry.dispose();
      tubeMat.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      targetGeo.dispose();
      targetMat.dispose();
    },
  };
  return view;
}

export interface UserMarker {
  group: THREE.Group;
  update(time: number, x: number, y: number, hasBall: boolean, visible: boolean): void;
  dispose(): void;
}

/** Glowing ring under the user's player (brighter + spinning arcs when he has the ball). */
export function buildUserMarker(rgb = '184,255,60', size = 1.9): UserMarker {
  const group = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (g) {
    const cx = 128;
    const grad = g.createRadialGradient(cx, cx, 70, cx, cx, 126);
    grad.addColorStop(0, `rgba(${rgb},0)`);
    grad.addColorStop(0.55, `rgba(${rgb},0.95)`);
    grad.addColorStop(0.7, `rgba(${rgb},0.35)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 6;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(cx, cx, 116, i * (Math.PI * 2 / 3), i * (Math.PI * 2 / 3) + 0.7);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const geo = new THREE.PlaneGeometry(size, size);
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.renderOrder = 3;
  group.add(ring);
  return {
    group,
    update(time, x, y, hasBall, visible) {
      group.visible = visible;
      group.position.set(x, 0, -y);
      ring.rotation.z = time * (hasBall ? 2.2 : 0.8);
      const s = (hasBall ? 1.08 : 0.92) + Math.sin(time * 4) * 0.05;
      ring.scale.set(s, s, 1);
      mat.opacity = hasBall ? 1 : 0.7;
    },
    dispose() { tex.dispose(); mat.dispose(); geo.dispose(); },
  };
}
