/**
 * Sky, lighting and weather: gradient sky dome (sun glow, procedural clouds, stars), a key light
 * whose shadow frustum follows the action, floodlight fills at dusk/night, fog per weather kind,
 * and rain / snow particles that wrap around the camera target.
 */
import * as THREE from 'three';
import type { Weather } from '../../../core/types';

export type Quality = 'low' | 'medium' | 'high';

/** Floodlight tower bases in pitch coordinates (x, y) and the lamp height. */
export const FLOOD_TOWERS: [number, number][] = [[-70, 52], [70, 52], [-70, -52], [70, -52]];
export const FLOOD_HEIGHT = 46;

interface Palette {
  top: string; horizon: string; bottom: string; fog: string;
  sun: string; sunIntensity: number; sunDir: [number, number, number];
  hemiSky: string; hemiGround: string; hemi: number;
  flood: number; exposure: number; stars: number; clouds: number;
}

function palette(w: Weather): Palette {
  const base: Record<Weather['time'], Palette> = {
    day: {
      top: '#2a64c4', horizon: '#b6d8f5', bottom: '#5d7f62', fog: '#b9cfe2',
      sun: '#fff1da', sunIntensity: 3.1, sunDir: [-0.45, 0.78, 0.42],
      hemiSky: '#d4e8ff', hemiGround: '#3b5a2c', hemi: 0.95, flood: 0, exposure: 1.0, stars: 0, clouds: 0.18,
    },
    dusk: {
      top: '#18214e', horizon: '#ff8a52', bottom: '#2a2620', fog: '#6b5a66',
      sun: '#ffb27a', sunIntensity: 1.7, sunDir: [-0.82, 0.22, 0.52],
      hemiSky: '#8a96d0', hemiGround: '#2b2a1f', hemi: 0.6, flood: 0.75, exposure: 1.05, stars: 0.15, clouds: 0.25,
    },
    night: {
      top: '#01030b', horizon: '#0d1b36', bottom: '#05080a', fog: '#0b1424',
      sun: '#e8f0ff', sunIntensity: 0, sunDir: [0.3, 0.9, 0.2],
      hemiSky: '#46588c', hemiGround: '#0c130e', hemi: 0.42, flood: 1, exposure: 1.12, stars: 1, clouds: 0.1,
    },
  };
  const p = { ...base[w.time] };
  const grey = (c: string, g: string, k: number) => '#' + new THREE.Color(c).lerp(new THREE.Color(g), k).getHexString();
  switch (w.kind) {
    case 'cloudy':
      p.top = grey(p.top, w.time === 'night' ? '#0c0f14' : '#7f8a98', 0.65);
      p.horizon = grey(p.horizon, w.time === 'night' ? '#141a22' : '#c4c9cf', 0.6);
      p.sunIntensity *= 0.45; p.hemi *= 1.15; p.clouds = 0.75; p.stars *= 0.2;
      break;
    case 'rain':
      p.top = grey(p.top, w.time === 'night' ? '#07090d' : '#4b545f', 0.8);
      p.horizon = grey(p.horizon, w.time === 'night' ? '#10151c' : '#8b939b', 0.75);
      p.fog = grey(p.fog, '#5d6670', 0.6);
      p.sunIntensity *= 0.28; p.hemi *= 1.1; p.clouds = 0.95; p.stars = 0;
      break;
    case 'snow':
      p.top = grey(p.top, w.time === 'night' ? '#0e1218' : '#8a96a5', 0.75);
      p.horizon = grey(p.horizon, w.time === 'night' ? '#1b222c' : '#dde3ea', 0.75);
      p.fog = grey(p.fog, '#c9d2dc', 0.6);
      p.sunIntensity *= 0.4; p.hemi *= 1.25; p.clouds = 0.9; p.stars = 0;
      p.hemiGround = '#9aa6a0';
      break;
    case 'fog':
      p.top = grey(p.top, w.time === 'night' ? '#10141a' : '#a9b2ba', 0.7);
      p.horizon = grey(p.horizon, w.time === 'night' ? '#1a2029' : '#c8cdd2', 0.85);
      p.fog = p.horizon;
      p.sunIntensity *= 0.35; p.clouds = 0.6; p.stars = 0;
      break;
    default: break;
  }
  return p;
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform float uSunAmt;
  uniform float uStars;
  uniform float uClouds;
  uniform float uTime;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(vec3(i, 0.0)); float b = hash(vec3(i + vec2(1.0, 0.0), 0.0));
    float c = hash(vec3(i + vec2(0.0, 1.0), 0.0)); float d = hash(vec3(i + vec2(1.0, 1.0), 0.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h >= 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.62, h), 0.65)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.18, h));
    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSun * uSunAmt * (pow(sd, 900.0) * 6.0 + pow(sd, 24.0) * 0.35 + pow(sd, 4.0) * 0.08);
    if (uClouds > 0.0 && h > 0.0) {
      vec2 uv = d.xz / (h + 0.18) * 1.6 + vec2(uTime * 0.004, uTime * 0.002);
      float c = smoothstep(0.55 - uClouds * 0.35, 0.95, fbm(uv));
      vec3 cloudCol = mix(uHorizon * 1.08, vec3(dot(uTop + uHorizon, vec3(0.25))), 0.5) + uSun * uSunAmt * 0.06;
      col = mix(col, cloudCol, c * smoothstep(0.0, 0.12, h) * 0.85);
    }
    if (uStars > 0.0 && h > 0.04) {
      vec3 p = floor(d * 380.0);
      float s = step(0.9978, hash(p));
      float tw = 0.65 + 0.35 * sin(uTime * 2.0 + hash(p + 3.1) * 40.0);
      col += vec3(0.85, 0.9, 1.0) * s * tw * uStars * smoothstep(0.04, 0.35, h) * (1.0 - uClouds);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface EnvView {
  readonly night: boolean;
  /** 0..1 how much the floodlights carry the lighting. */
  readonly flood: number;
  readonly key: THREE.DirectionalLight;
  /** Move the key light's shadow frustum to follow the action (three coordinates). */
  setFocus(p: THREE.Vector3): void;
  update(dt: number, time: number, cameraTarget: THREE.Vector3): void;
  dispose(): void;
}

export function buildEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer, weather: Weather, opts: { quality: Quality; shadows: boolean }): EnvView {
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => { disposables.push(d); return d; };
  const added: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(o: T): T => { scene.add(o); added.push(o); return o; };
  const pal = palette(weather);
  const night = weather.time === 'night';
  renderer.toneMappingExposure = pal.exposure;

  // ── sky ──
  const sunDir = new THREE.Vector3(...pal.sunDir).normalize();
  const skyUniforms = {
    uTop: { value: new THREE.Color(pal.top) },
    uHorizon: { value: new THREE.Color(pal.horizon) },
    uBottom: { value: new THREE.Color(pal.bottom) },
    uSun: { value: new THREE.Color(pal.sun) },
    uSunDir: { value: sunDir.clone() },
    uSunAmt: { value: pal.sunIntensity > 0 ? Math.min(1, pal.sunIntensity / 2) : 0 },
    uStars: { value: pal.stars },
    uClouds: { value: pal.clouds },
    uTime: { value: 0 },
  };
  const skyMat = track(new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyUniforms,
    side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false,
  }));
  const skyGeo = track(new THREE.SphereGeometry(900, 48, 24));
  const sky = add(new THREE.Mesh(skyGeo, skyMat));
  sky.renderOrder = -10;
  sky.frustumCulled = false;

  // Environment map from the sky (reflections on wet grass, goal frames, boots).
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(skyGeo, skyMat);
    envScene.add(envSky);
    if (pal.flood > 0) {
      // Bright floodlight "windows" so metal and wet grass catch highlights.
      const lampGeo = new THREE.PlaneGeometry(40, 10);
      const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 3.6), side: THREE.DoubleSide });
      for (const [x, y] of FLOOD_TOWERS) {
        const m = new THREE.Mesh(lampGeo, lampMat);
        m.position.set(x * 3, FLOOD_HEIGHT * 3, -y * 3);
        m.lookAt(0, 0, 0);
        envScene.add(m);
      }
      const rt = pmrem.fromScene(envScene, 0.02);
      lampGeo.dispose();
      lampMat.dispose();
      scene.environment = track(rt).texture;
    } else {
      scene.environment = track(pmrem.fromScene(envScene, 0.02)).texture;
    }
    scene.environmentIntensity = night ? 0.35 : 0.55;
    pmrem.dispose();
  } catch {
    /* PMREM unsupported: plain lighting still works */
  }

  // ── fog ──
  const fogCol = new THREE.Color(pal.fog);
  const fogFar = weather.kind === 'fog' ? 135 : weather.kind === 'snow' ? 330 : weather.kind === 'rain' ? 380 : 900;
  const fogNear = weather.kind === 'fog' ? 12 : weather.kind === 'snow' ? 40 : weather.kind === 'rain' ? 60 : 260;
  scene.fog = new THREE.Fog(fogCol, fogNear, fogFar);
  scene.background = null;

  // ── lights ──
  const hemi = add(new THREE.HemisphereLight(new THREE.Color(pal.hemiSky), new THREE.Color(pal.hemiGround), pal.hemi));
  void hemi;
  const flood = pal.flood;
  const key = new THREE.DirectionalLight();
  // Daytime: the sun is the key. Floodlit: the strongest tower is the key.
  const keyDir = new THREE.Vector3();
  if (pal.sunIntensity >= 1.2 && flood < 0.9) {
    keyDir.copy(sunDir);
    key.color.set(pal.sun);
    key.intensity = pal.sunIntensity;
  } else {
    const [tx, ty] = FLOOD_TOWERS[0];
    keyDir.set(tx, FLOOD_HEIGHT, -ty).normalize();
    key.color.set('#f4f7ff');
    key.intensity = 1.5 + 1.4 * flood + pal.sunIntensity * 0.4;
  }
  add(key);
  add(key.target);
  const shadowSize = opts.quality === 'high' ? 2048 : 1024;
  const shadowsOn = opts.shadows && opts.quality !== 'low';
  key.castShadow = shadowsOn;
  if (shadowsOn) {
    key.shadow.mapSize.set(shadowSize, shadowSize);
    const ext = 34;
    const cam = key.shadow.camera;
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
    cam.near = 20; cam.far = 260;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 2.5;
  }
  const fills: THREE.DirectionalLight[] = [];
  if (flood > 0) {
    FLOOD_TOWERS.slice(1).forEach(([tx, ty], i) => {
      const l = new THREE.DirectionalLight('#eef3ff', (0.55 + 0.35 * flood) * (i === 2 ? 1.1 : 0.85));
      l.position.set(tx, FLOOD_HEIGHT, -ty);
      add(l);
      fills.push(l);
    });
  } else {
    // Soft bounce from the opposite side.
    const l = new THREE.DirectionalLight('#bcd2ff', 0.35);
    l.position.set(-sunDir.x * 100, 40, -sunDir.z * 100);
    add(l);
    fills.push(l);
  }

  const focus = new THREE.Vector3();
  const setFocus = (p: THREE.Vector3) => {
    focus.set(p.x, 0, p.z);
    key.target.position.copy(focus);
    key.position.copy(focus).addScaledVector(keyDir, 140);
    key.target.updateMatrixWorld();
  };
  setFocus(new THREE.Vector3());

  // ── precipitation ──
  let precip: THREE.Object3D | null = null;
  let updatePrecip: ((dt: number, c: THREE.Vector3) => void) | null = null;
  const area = { x: 70, y: 34, z: 70 };
  const mult = opts.quality === 'high' ? 1 : opts.quality === 'medium' ? 0.65 : 0.35;
  const wind = weather.wind;
  if (weather.kind === 'rain') {
    const n = Math.round(5200 * mult);
    const pos = new Float32Array(n * 6);
    const seeds = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      seeds[i * 3] = Math.random() * area.x - area.x / 2;
      seeds[i * 3 + 1] = Math.random() * area.y;
      seeds[i * 3 + 2] = Math.random() * area.z - area.z / 2;
    }
    const geo = track(new THREE.BufferGeometry());
    const attr = new THREE.BufferAttribute(pos, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr);
    const mat = track(new THREE.LineBasicMaterial({ color: night ? 0xb8cbe6 : 0xc9d6e4, transparent: true, opacity: night ? 0.42 : 0.32, depthWrite: false }));
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    precip = add(lines);
    const vy = 17;
    const vx = wind.x * 0.9;
    const vz = -wind.y * 0.9;
    const streak = 0.045;
    updatePrecip = (dt, c) => {
      for (let i = 0; i < n; i++) {
        let y = seeds[i * 3 + 1] - vy * dt;
        let x = seeds[i * 3] + vx * dt;
        let z = seeds[i * 3 + 2] + vz * dt;
        if (y < 0) y += area.y;
        if (x < -area.x / 2) x += area.x; else if (x > area.x / 2) x -= area.x;
        if (z < -area.z / 2) z += area.z; else if (z > area.z / 2) z -= area.z;
        seeds[i * 3] = x; seeds[i * 3 + 1] = y; seeds[i * 3 + 2] = z;
        const px = c.x + x, pz = c.z + z;
        pos[i * 6] = px; pos[i * 6 + 1] = y; pos[i * 6 + 2] = pz;
        pos[i * 6 + 3] = px - vx * streak; pos[i * 6 + 4] = y + vy * streak; pos[i * 6 + 5] = pz - vz * streak;
      }
      attr.needsUpdate = true;
    };
  } else if (weather.kind === 'snow') {
    const n = Math.round(4200 * mult);
    const pos = new Float32Array(n * 3);
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      seeds[i * 4] = Math.random() * area.x - area.x / 2;
      seeds[i * 4 + 1] = Math.random() * area.y;
      seeds[i * 4 + 2] = Math.random() * area.z - area.z / 2;
      seeds[i * 4 + 3] = Math.random() * 10;
    }
    const geo = track(new THREE.BufferGeometry());
    const attr = new THREE.BufferAttribute(pos, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr);
    const flake = document.createElement('canvas');
    flake.width = flake.height = 32;
    const g = flake.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.7)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
    }
    const tex = track(new THREE.CanvasTexture(flake));
    const mat = track(new THREE.PointsMaterial({ size: 0.16, map: tex, transparent: true, depthWrite: false, opacity: 0.9, color: 0xffffff }));
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    precip = add(pts);
    let t = 0;
    updatePrecip = (dt, c) => {
      t += dt;
      for (let i = 0; i < n; i++) {
        const ph = seeds[i * 4 + 3];
        let y = seeds[i * 4 + 1] - (0.9 + (ph % 1) * 0.6) * dt;
        let x = seeds[i * 4] + (wind.x * 0.35 + Math.sin(t * 0.9 + ph) * 0.35) * dt;
        let z = seeds[i * 4 + 2] + (-wind.y * 0.35 + Math.cos(t * 0.7 + ph) * 0.35) * dt;
        if (y < 0) y += area.y;
        if (x < -area.x / 2) x += area.x; else if (x > area.x / 2) x -= area.x;
        if (z < -area.z / 2) z += area.z; else if (z > area.z / 2) z -= area.z;
        seeds[i * 4] = x; seeds[i * 4 + 1] = y; seeds[i * 4 + 2] = z;
        pos[i * 3] = c.x + x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = c.z + z;
      }
      attr.needsUpdate = true;
    };
  }
  void precip;

  return {
    night,
    flood,
    key,
    setFocus,
    update(dt, time, target) {
      skyUniforms.uTime.value = time;
      updatePrecip?.(Math.min(dt, 0.05), target);
    },
    dispose() {
      added.forEach((o) => scene.remove(o));
      if (scene.environment) scene.environment = null;
      scene.fog = null;
      key.dispose();
      fills.forEach((l) => l.dispose());
      disposables.forEach((d) => d.dispose());
    },
  };
}
