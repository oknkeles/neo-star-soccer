/**
 * Stadium: four stands (two tiers on higher quality) filled with a shader crowd in team colours,
 * roofs with light strips, LED advertising boards (scrolling canvas texture, goal mode),
 * floodlight towers with lamp grids, glare and light beams, a big screen with the score,
 * dugouts, and a sparkle layer of phone flashes for big moments.
 */
import * as THREE from 'three';
import type { Kit } from '../../../core/types';
import { SKIN_TONES, contrastInk, shade } from '../palette';
import { buildCrowdMesh, crowdMaterial, type CrowdPerson } from './crowd';
import { FLOOD_HEIGHT, FLOOD_TOWERS, type Quality } from './env';
import { DISPLAY_FONT, canvasTexture, crowdAtlas, ctx2d, flareTexture, makeCanvas, radialTexture, roundRect } from './textures';

const ROW_DEPTH = 0.82;
const RISER = 0.42;

export interface StadiumOptions {
  quality: Quality;
  night: boolean;
  /** 0..1 floodlight contribution (beams, glare). */
  flood: number;
  /** Visible beams (rain / fog / night). */
  beams: number;
  home: Kit;
  away: Kit;
  homeName: string;
  awayName: string;
  /** 0..1 how full the stands are. */
  fullness: number;
  /** Text for the big screen header (e.g. the moment type). */
  screenTitle?: string;
}

export interface StadiumView {
  group: THREE.Group;
  /** 0..1 excitement for home ("us") and away ("them") fans. */
  setExcitement(home: number, away: number): void;
  /** Make a section jump (goal). */
  celebrate(side: 'home' | 'away', seconds?: number): void;
  setWave(on: boolean): void;
  setScore(home: number, away: number, minute: number, title?: string): void;
  /** LED boards flash a goal animation for a few seconds. */
  ledGoal(name: string): void;
  /** Home end pyro (flares + smoke). */
  pyro(seconds?: number): void;
  update(dt: number, time: number, camera: THREE.Camera): void;
  /** Positions in the home end stand, used for pyro and celebrations. */
  readonly homeEndX: number;
  dispose(): void;
}

interface StandSpec {
  /** Front-centre on the ground (pitch coords). */
  cx: number; cy: number;
  /** Outward unit vector (pitch coords). */
  ox: number; oy: number;
  length: number;
  section: 0 | 1;
  roof: boolean;
}

type UV = [number, number];

/** Shirt palette for a fan section. */
function fanColors(kit: Kit): THREE.Color[] {
  const c = (s: string) => new THREE.Color(s);
  return [
    c(kit.primary), c(kit.primary), c(kit.primary), c(kit.primary), c(shade(kit.primary, -0.25)),
    c(kit.secondary), c(kit.secondary), c('#e8e8e8'), c('#1c1d22'), c('#2c3e57'), c('#5a5f66'),
  ];
}

function ledTexture(home: Kit, away: Kit, goal: string | null): THREE.CanvasTexture {
  const W = 2048;
  const H = 64;
  const c = makeCanvas(W, H);
  const draw = () => {
    const g = ctx2d(c);
    g.clearRect(0, 0, W, H);
    if (goal) {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const x = (i * W) / n;
        const grad = g.createLinearGradient(x, 0, x + W / n, 0);
        grad.addColorStop(0, home.primary);
        grad.addColorStop(0.5, shade(home.primary, 0.35));
        grad.addColorStop(1, home.primary);
        g.fillStyle = grad;
        g.fillRect(x, 0, W / n, H);
        g.fillStyle = contrastInk(home.primary);
        g.font = `${Math.round(H * 0.82)}px ${DISPLAY_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(goal, x + W / n / 2, H * 0.55);
      }
    } else {
      const ads: { bg: string; fg: string; text: string; accent?: string }[] = [
        { bg: '#0b0f0c', fg: '#b8ff3c', text: 'NEO STAR', accent: '#3cffb0' },
        { bg: '#0d2a6b', fg: '#ffffff', text: 'KUZEYBANK' },
        { bg: '#ffcb47', fg: '#151515', text: 'VOLTAJ ENERJİ' },
        { bg: home.primary, fg: contrastInk(home.primary), text: 'FUTBOL BİZİM' },
        { bg: '#e8002d', fg: '#ffffff', text: 'TURBO KOLA' },
        { bg: '#111111', fg: '#49c6ff', text: 'PİKSEL TV' },
        { bg: '#f2f2f2', fg: '#0f3d2e', text: 'ZEFİR AIR' },
        { bg: away.primary, fg: contrastInk(away.primary), text: 'FAIR PLAY' },
      ];
      const pw = W / ads.length;
      ads.forEach((a, i) => {
        const x = i * pw;
        g.fillStyle = a.bg;
        g.fillRect(x, 0, pw, H);
        if (a.accent) {
          g.fillStyle = a.accent;
          g.fillRect(x, H - 6, pw, 6);
        }
        g.fillStyle = a.fg;
        g.font = `${Math.round(H * 0.7)}px ${DISPLAY_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(a.text, x + pw / 2, H * 0.56, pw * 0.9);
      });
    }
    // LED pixel grid.
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let x = 0; x < W; x += 4) g.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  };
  draw();
  const t = canvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  // Redraw once the display font arrives.
  try {
    void document.fonts?.ready.then(() => { draw(); t.needsUpdate = true; });
  } catch { /* fonts API unavailable */ }
  return t;
}

function lampGridTexture(): THREE.CanvasTexture {
  const c = makeCanvas(256, 128);
  const g = ctx2d(c);
  g.fillStyle = '#20242b';
  g.fillRect(0, 0, 256, 128);
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 8; k++) {
      const x = 16 + k * 32;
      const y = 16 + r * 32;
      const grad = g.createRadialGradient(x, y, 0, x, y, 14);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#f2f6ff');
      grad.addColorStop(1, '#5d6678');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, 13, 0, Math.PI * 2);
      g.fill();
    }
  }
  return canvasTexture(c);
}

function beamTexture(): THREE.CanvasTexture {
  const c = makeCanvas(64, 256);
  const g = ctx2d(c);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  const side = g.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.5, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side;
  g.fillRect(0, 0, 64, 256);
  return canvasTexture(c);
}

export function buildStadium(opts: StadiumOptions): StadiumView {
  const group = new THREE.Group();
  group.name = 'stadium';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => { disposables.push(d); return d; };
  const q = opts.quality;
  const twoTiers = q !== 'low';
  const lowerRows = q === 'low' ? 16 : 20;
  const upperRows = 16;
  const crowdDensity = q === 'high' ? 1 : q === 'medium' ? 0.8 : 0.55;

  // ── stand geometry ──
  const standMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide }));
  const people: CrowdPerson[][] = [[], []];
  const sparkleSeats: THREE.Vector3[] = [];
  const homeSeat = new THREE.Color(opts.home.primary).lerp(new THREE.Color('#222'), 0.35);
  const homeSeatAlt = new THREE.Color(opts.home.secondary).lerp(new THREE.Color('#222'), 0.35);
  const awaySeat = new THREE.Color(opts.away.primary).lerp(new THREE.Color('#222'), 0.35);
  const concrete = new THREE.Color('#2b3036');
  const concreteDark = new THREE.Color('#15181c');
  const fansHome = fanColors(opts.home);
  const fansAway = fanColors(opts.away);
  const skins = SKIN_TONES.map((s) => new THREE.Color(s));
  const rnd = Math.random;

  const stands: StandSpec[] = [
    { cx: 0, cy: 41, ox: 0, oy: 1, length: 124, section: 0, roof: true },
    { cx: 0, cy: -41, ox: 0, oy: -1, length: 124, section: 0, roof: true },
    { cx: 60, cy: 0, ox: 1, oy: 0, length: 80, section: 0, roof: false },
    { cx: -60, cy: 0, ox: -1, oy: 0, length: 80, section: 1, roof: false },
  ];

  const toWorld = (s: StandSpec, u: number, v: number, w: number, out = new THREE.Vector3()) => {
    // along = (−oy, ox)
    const px = s.cx + s.ox * u - s.oy * w;
    const py = s.cy + s.oy * u + s.ox * w;
    return out.set(px, v, -py);
  };

  const fascias: { s: StandSpec; v0: number; v1: number; u: number }[] = [];
  const roofs: { s: StandSpec; u0: number; u1: number; v0: number; v1: number }[] = [];

  for (const s of stands) {
    const pos: number[] = [];
    const col: number[] = [];
    const L = s.length;
    const quad = (a: UV, b: UV, c: THREE.Color, len = L) => {
      // Quad spanning from profile point a to b, across the whole stand length.
      const p0 = toWorld(s, a[0], a[1], -len / 2);
      const p1 = toWorld(s, b[0], b[1], -len / 2);
      const p2 = toWorld(s, b[0], b[1], len / 2);
      const p3 = toWorld(s, a[0], a[1], len / 2);
      for (const p of [p0, p1, p2, p0, p2, p3]) { pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); }
    };
    const profile: UV[] = [];
    const tier = (rows: number, u0: number, v0: number, homeFans: boolean) => {
      quad([u0, v0 - 1.4], [u0, v0], concrete);
      profile.push([u0, v0 - 1.4], [u0, v0]);
      for (let r = 0; r < rows; r++) {
        const u = u0 + r * ROW_DEPTH;
        const v = v0 + r * RISER;
        const seat = s.section === 1 ? awaySeat : r % 5 === 2 ? homeSeatAlt : homeSeat;
        const shadeK = 0.85 + 0.15 * ((r % 2) ? 1 : 0.8);
        quad([u, v], [u + ROW_DEPTH, v], seat.clone().multiplyScalar(shadeK));
        quad([u + ROW_DEPTH, v], [u + ROW_DEPTH, v + RISER], concreteDark);
        profile.push([u + ROW_DEPTH, v], [u + ROW_DEPTH, v + RISER]);
        // Fans in this row.
        const fill = Math.min(1, opts.fullness) * crowdDensity;
        const step = 0.56;
        const n = Math.floor(L / step);
        for (let k = 0; k < n; k++) {
          if (rnd() > fill) continue;
          const w = -L / 2 + (k + 0.5) * step + (rnd() - 0.5) * 0.12;
          const base = toWorld(s, u + ROW_DEPTH * 0.45, v, w);
          const section = s.section;
          const palette = section === 1 ? fansAway : homeFans ? fansHome : fansHome;
          const person: CrowdPerson = {
            x: base.x, y: base.y, z: base.z,
            shirt: palette[Math.floor(rnd() * palette.length)],
            skin: skins[Math.min(skins.length - 1, Math.floor(Math.pow(rnd(), 1.3) * skins.length))],
            variant: Math.floor(rnd() * 8),
            phase: rnd(),
            threshold: 0.15 + rnd() * 0.85,
            section,
            shade: 0.78 + rnd() * 0.3,
          };
          people[section].push(person);
          if (rnd() < 0.02) sparkleSeats.push(base.clone().setY(base.y + 1.2));
        }
      }
      const endU = u0 + rows * ROW_DEPTH;
      const topV = v0 + rows * RISER;
      return { endU, topV };
    };
    const lower = tier(lowerRows, 0, 1.6, true);
    let topV = lower.topV;
    let endU = lower.endU;
    let upperStart = 0;
    if (twoTiers) {
      const u0 = lower.endU - 2.5;
      const v0 = lower.topV + 4.4;
      // Concourse wall between the tiers.
      quad([lower.endU, lower.topV], [lower.endU, v0 - 1.4], concreteDark);
      quad([lower.endU, v0 - 1.4], [u0, v0 - 1.4], concreteDark);
      profile.push([lower.endU, v0 - 1.4], [u0, v0 - 1.4]);
      fascias.push({ s, v0: v0 - 1.35, v1: v0 - 0.1, u: u0 - 0.03 });
      const up = tier(upperRows, u0, v0, true);
      topV = up.topV;
      endU = up.endU;
      upperStart = u0;
    }
    // Back wall.
    quad([endU, topV], [endU, topV + 2.6], concrete);
    quad([endU, topV + 2.6], [endU + 0.4, topV + 2.6], concrete);
    quad([endU + 0.4, topV + 2.6], [endU + 0.4, 0], concreteDark);
    profile.push([endU, topV + 2.6], [endU + 0.4, topV + 2.6], [endU + 0.4, 0]);
    // End caps (side walls).
    const shapePts = [new THREE.Vector2(0, 0), ...profile.map(([u, v]) => new THREE.Vector2(u, v))];
    const tris = THREE.ShapeUtils.triangulateShape(shapePts, []);
    for (const w of [-L / 2, L / 2]) {
      for (const t of tris) {
        for (const idx of t) {
          const p = toWorld(s, shapePts[idx].x, shapePts[idx].y, w);
          pos.push(p.x, p.y, p.z);
          col.push(concrete.r, concrete.g, concrete.b);
        }
      }
    }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, standMat);
    mesh.receiveShadow = q === 'high';
    group.add(mesh);
    if (s.roof) roofs.push({ s, u0: (twoTiers ? upperStart : 0) - 7, u1: endU + 1, v0: topV + 6.5, v1: topV + 4.2 });
  }

  // ── crowd ──
  const atlas = track(crowdAtlas());
  const crowdLight = opts.night ? 0.62 : 0.85;
  const cMat = track(crowdMaterial(atlas, crowdLight));
  cMat.uniforms.uAtlas.value = atlas;
  const crowdMeshes = people.map((list, section) => {
    // Split by stand orientation so each mesh gets a correct "right" vector.
    const byDir = new Map<string, CrowdPerson[]>();
    for (const p of list) {
      // Outward direction from the pitch decides orientation.
      const key = Math.abs(p.z) > 41 - 0.01 && Math.abs(p.x) < 62.5 ? (p.z > 0 ? 'S' : 'N') : (p.x > 0 ? 'E' : 'W');
      if (!byDir.has(key)) byDir.set(key, []);
      byDir.get(key)!.push(p);
    }
    void section;
    return [...byDir.entries()].map(([key, ps]) => {
      // n = direction toward the pitch (three coords); right = up × n = (n.z, 0, −n.x).
      const n = key === 'N' ? new THREE.Vector3(0, 0, 1) : key === 'S' ? new THREE.Vector3(0, 0, -1) : key === 'E' ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(1, 0, 0);
      const right = new THREE.Vector3(n.z, 0, -n.x);
      const cm = buildCrowdMesh(ps, right, cMat);
      track(cm);
      group.add(cm.mesh);
      return cm;
    });
  }).flat();
  void crowdMeshes;

  // ── fascia LED ribbons & roofs ──
  const ledTex = track(ledTexture(opts.home, opts.away, null));
  const goalTex = track(ledTexture(opts.home, opts.away, 'GOOOL'));
  const ledMats: THREE.MeshStandardMaterial[] = [];
  const ledTextures: THREE.Texture[] = [];
  const makeLed = (length: number, height: number, speed: number) => {
    const tex = track(ledTex.clone());
    tex.repeat.set(length / 40, 1);
    const gtex = track(goalTex.clone());
    gtex.repeat.set(length / 30, 1);
    const mat = track(new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: opts.night ? 1.05 : 0.6, roughness: 0.5, color: 0x777777,
    }));
    mat.userData = { tex, gtex, speed };
    ledMats.push(mat);
    ledTextures.push(tex, gtex);
    const m = new THREE.Mesh(track(new THREE.PlaneGeometry(length, height)), mat);
    return m;
  };
  for (const f of fascias) {
    const L = f.s.length - 4;
    const m = makeLed(L, f.v1 - f.v0, 0.6);
    const c = toWorld(f.s, f.u - 0.05, (f.v0 + f.v1) / 2, 0);
    m.position.copy(c);
    m.lookAt(toWorld(f.s, f.u - 10, (f.v0 + f.v1) / 2, 0));
    group.add(m);
  }
  const roofMat = track(new THREE.MeshStandardMaterial({ color: 0x2a2f37, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }));
  const stripMat = track(new THREE.MeshBasicMaterial({ color: opts.night || opts.flood > 0.5 ? new THREE.Color(2.2, 2.3, 2.5) : new THREE.Color(0.8, 0.82, 0.85) }));
  for (const r of roofs) {
    const L = r.s.length + 4;
    const depth = Math.hypot(r.u1 - r.u0, r.v1 - r.v0);
    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(L, 0.35, depth)), roofMat);
    const mid = toWorld(r.s, (r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2, 0);
    roof.position.copy(mid);
    roof.rotation.y = Math.atan2(r.s.ox, -r.s.oy) + 0;
    // Tilt: front edge (u0) is higher.
    const tilt = Math.atan2(r.v0 - r.v1, r.u1 - r.u0);
    roof.rotateX(tilt);
    roof.castShadow = false;
    group.add(roof);
    // Light strip under the front edge.
    const strip = new THREE.Mesh(track(new THREE.BoxGeometry(L - 6, 0.12, 0.5)), stripMat);
    strip.position.copy(toWorld(r.s, r.u0 + 0.6, r.v0 - 0.3, 0));
    strip.rotation.y = roof.rotation.y;
    group.add(strip);
    // Supporting trusses.
    const trussMat = roofMat;
    for (let k = -2; k <= 2; k++) {
      const w = (k / 2) * (L / 2 - 4);
      const a = toWorld(r.s, r.u1 - 0.5, r.v1, w);
      const b = toWorld(r.s, r.u1 - 0.5, 0, w);
      const col = new THREE.Mesh(track(new THREE.CylinderGeometry(0.35, 0.45, a.y - b.y, 8)), trussMat);
      col.position.copy(a).add(b).multiplyScalar(0.5);
      group.add(col);
    }
  }

  // ── pitch-side LED boards ──
  const boardFrameMat = track(new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.7 }));
  const boards: [number, number, number][] = [
    // x, y (pitch), length
    [0, 38.6, 108],
    [0, -38.6, 108],
    [57, 0, 64],
    [-57, 0, 64],
  ];
  for (const [bx, by, len] of boards) {
    const m = makeLed(len, 0.9, 1.4);
    m.position.set(bx, 0.55, -by);
    // PlaneGeometry faces +z; turn it toward the pitch centre.
    m.lookAt(0, 0.55, 0);
    group.add(m);
    const back = new THREE.Mesh(track(new THREE.BoxGeometry(len, 1.0, 0.25)), boardFrameMat);
    back.position.copy(m.position).addScaledVector(new THREE.Vector3(m.position.x, 0, m.position.z).normalize(), 0.14);
    back.position.y = 0.5;
    back.lookAt(0, 0.5, 0);
    group.add(back);
  }

  // ── floodlight towers ──
  const towerMat = track(new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.5, metalness: 0.6 }));
  const lampTex = track(lampGridTexture());
  const lampMat = track(new THREE.MeshStandardMaterial({
    color: 0x222222, map: lampTex, emissiveMap: lampTex, emissive: 0xffffff,
    emissiveIntensity: opts.flood > 0 ? 2.4 : 0.15, roughness: 0.4,
  }));
  const headBackMat = track(new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.6, metalness: 0.4 }));
  const flare = track(flareTexture());
  const flareMat = track(new THREE.SpriteMaterial({ map: flare, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: Math.min(1, opts.flood * 1.1), fog: false }));
  const beamTex = track(beamTexture());
  const beamMat = track(new THREE.MeshBasicMaterial({ map: beamTex, color: 0xdfe8ff, transparent: true, opacity: opts.beams * 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const flareSprites: THREE.Sprite[] = [];
  for (const [tx, ty] of FLOOD_TOWERS) {
    const base = new THREE.Vector3(tx, 0, -ty);
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.55, 1.2, FLOOD_HEIGHT, 8)), towerMat);
    pole.position.set(base.x, FLOOD_HEIGHT / 2, base.z);
    group.add(pole);
    const head = new THREE.Group();
    head.position.set(base.x, FLOOD_HEIGHT + 2.5, base.z);
    head.lookAt(0, 0, 0);
    const back = new THREE.Mesh(track(new THREE.BoxGeometry(11, 6.5, 0.8)), headBackMat);
    head.add(back);
    const face = new THREE.Mesh(track(new THREE.PlaneGeometry(10.4, 5.9)), lampMat);
    face.position.z = 0.42;
    head.add(face);
    group.add(head);
    if (opts.flood > 0) {
      for (let k = -1; k <= 1; k++) {
        const s = new THREE.Sprite(flareMat);
        s.scale.setScalar(k === 0 ? 26 : 16);
        s.position.set(k * 3.6, 0, 1.2);
        head.add(s);
        flareSprites.push(s);
      }
      if (opts.beams > 0) {
        // A soft light beam toward the pitch.
        const len = Math.hypot(tx, ty, FLOOD_HEIGHT) * 0.9;
        const cone = new THREE.Mesh(track(new THREE.ConeGeometry(16, len, 24, 1, true)), beamMat);
        cone.position.set(0, 0, len / 2 + 1);
        cone.rotation.x = -Math.PI / 2;
        head.add(cone);
      }
    }
  }

  // ── big screen above the home end ──
  const screenCanvas = makeCanvas(1024, 384);
  const screenTex = track(canvasTexture(screenCanvas));
  let score = { h: 0, a: 0, minute: 0, title: opts.screenTitle ?? '' };
  const drawScreen = (flash = false) => {
    const g = ctx2d(screenCanvas);
    const W = screenCanvas.width;
    const H = screenCanvas.height;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0c1410');
    bg.addColorStop(1, '#040806');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    if (flash) {
      g.fillStyle = opts.home.primary;
      g.fillRect(0, 0, W, H);
      g.fillStyle = contrastInk(opts.home.primary);
      g.font = `${Math.round(H * 0.62)}px ${DISPLAY_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('GOOOL!', W / 2, H * 0.55);
    } else {
      g.textBaseline = 'middle';
      const box = (x: number, kit: Kit, name: string) => {
        g.fillStyle = kit.primary;
        roundRect(g, x, H * 0.24, W * 0.3, H * 0.4, 18);
        g.fill();
        g.fillStyle = kit.secondary;
        g.fillRect(x + 10, H * 0.58, W * 0.3 - 20, 8);
        g.fillStyle = contrastInk(kit.primary);
        g.font = `${Math.round(H * 0.3)}px ${DISPLAY_FONT}`;
        g.textAlign = 'center';
        g.fillText(name.slice(0, 4).toLocaleUpperCase('tr-TR'), x + W * 0.15, H * 0.45);
      };
      box(W * 0.04, opts.home, opts.homeName);
      box(W * 0.66, opts.away, opts.awayName);
      g.fillStyle = '#ffffff';
      g.font = `${Math.round(H * 0.42)}px ${DISPLAY_FONT}`;
      g.textAlign = 'center';
      g.fillText(`${score.h} - ${score.a}`, W / 2, H * 0.45);
      g.fillStyle = '#b8ff3c';
      g.font = `${Math.round(H * 0.15)}px ${DISPLAY_FONT}`;
      g.fillText(`${score.minute}'`, W / 2, H * 0.78);
      if (score.title) {
        g.fillStyle = '#9db5a7';
        g.font = `${Math.round(H * 0.11)}px ${DISPLAY_FONT}`;
        g.fillText(score.title.toLocaleUpperCase('tr-TR'), W / 2, H * 0.1);
      }
      g.fillStyle = 'rgba(184,255,60,0.85)';
      g.font = `${Math.round(H * 0.09)}px ${DISPLAY_FONT}`;
      g.fillText('NEO STAR', W / 2, H * 0.92);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 0; x < W; x += 3) g.fillRect(x, 0, 1, H);
    screenTex.needsUpdate = true;
  };
  drawScreen();
  try { void document.fonts?.ready.then(() => drawScreen()); } catch { /* noop */ }
  const screenMat = track(new THREE.MeshStandardMaterial({ map: screenTex, emissiveMap: screenTex, emissive: 0xffffff, emissiveIntensity: 1.1, color: 0x333333 }));
  const screenEndX = twoTiers ? 60 + lowerRows * ROW_DEPTH + upperRows * ROW_DEPTH : 60 + lowerRows * ROW_DEPTH;
  const screenTop = twoTiers ? 1.6 + lowerRows * RISER + 4.4 + upperRows * RISER : 1.6 + lowerRows * RISER;
  const screen = new THREE.Mesh(track(new THREE.PlaneGeometry(24, 9)), screenMat);
  screen.position.set(screenEndX - 4, screenTop + 9, 0);
  screen.lookAt(0, screenTop, 0);
  group.add(screen);
  const screenFrame = new THREE.Mesh(track(new THREE.BoxGeometry(1, 10, 25)), headBackMat);
  screenFrame.position.set(screen.position.x + 0.6, screen.position.y, 0);
  group.add(screenFrame);
  for (const z of [-9, 9]) {
    const leg = new THREE.Mesh(track(new THREE.CylinderGeometry(0.3, 0.3, 9, 6)), towerMat);
    leg.position.set(screen.position.x + 0.6, screenTop + 2.5, z);
    group.add(leg);
  }

  // ── dugouts ──
  const dugMat = track(new THREE.MeshStandardMaterial({ color: 0xbfd6e6, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide }));
  const benchMat = track(new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.6 }));
  for (const [x, kit] of [[-12, opts.home], [12, opts.away]] as [number, Kit][]) {
    const shell = new THREE.Mesh(track(new THREE.CylinderGeometry(1.4, 1.4, 9, 16, 1, true, 0, Math.PI)), dugMat);
    shell.rotation.z = Math.PI / 2;
    shell.position.set(x, 0.2, 37.2);
    group.add(shell);
    const bench = new THREE.Mesh(track(new THREE.BoxGeometry(8.5, 0.5, 0.6)), new THREE.MeshStandardMaterial({ color: new THREE.Color(kit.primary), roughness: 0.6 }));
    track(bench.material as THREE.Material);
    bench.position.set(x, 0.45, 37.6);
    group.add(bench);
    const base = new THREE.Mesh(track(new THREE.BoxGeometry(9, 0.2, 2)), benchMat);
    base.position.set(x, 0.1, 37.4);
    group.add(base);
  }

  // ── phone flashes ──
  const sparkN = sparkleSeats.length;
  const sparkPos = new Float32Array(sparkN * 3);
  const sparkSeed = new Float32Array(sparkN);
  sparkleSeats.forEach((p, i) => { sparkPos.set([p.x, p.y, p.z], i * 3); sparkSeed[i] = Math.random() * 100; });
  const sparkGeo = track(new THREE.BufferGeometry());
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('aSeed', new THREE.BufferAttribute(sparkSeed, 1));
  const sparkMat = track(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uRate: { value: 0 }, uScale: { value: 300 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime; uniform float uRate; uniform float uScale;
      varying float vA;
      void main() {
        float t = uTime * (1.5 + fract(aSeed) * 2.0) + aSeed;
        float f = pow(max(0.0, sin(t * 3.1)), 60.0) * step(fract(aSeed * 7.13), uRate);
        vA = f;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = f * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(1.0), a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  group.add(sparks);

  // ── pyro in the home end ──
  const smokeTexCanvas = radialTexture('rgba(255,255,255,0.55)', 'rgba(255,255,255,0)', 64);
  track(smokeTexCanvas);
  const flareGlow = track(radialTexture('rgba(255,230,200,1)', 'rgba(255,40,10,0)', 64, [[0.25, 'rgba(255,120,40,0.9)']]));
  const pyroGroup = new THREE.Group();
  group.add(pyroGroup);
  interface Pyro { glow: THREE.Sprite; smokes: { s: THREE.Sprite; age: number; vy: number; vx: number }[]; base: THREE.Vector3 }
  const pyros: Pyro[] = [];
  const pyroGlowMat = track(new THREE.SpriteMaterial({ map: flareGlow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  const smokeMat = track(new THREE.SpriteMaterial({ map: smokeTexCanvas, color: 0xd9b0a6, depthWrite: false, transparent: true, opacity: 0.4 }));
  let pyroLeft = 0;
  const pyroLight = new THREE.PointLight(0xff4a1a, 0, 60, 1.6);
  pyroLight.position.set(66, 6, 0);
  group.add(pyroLight);
  for (let i = 0; i < (q === 'low' ? 4 : 8); i++) {
    const base = new THREE.Vector3(61 + 1.5 + Math.random() * 5, 3.2 + Math.random() * 2, -26 + (i + 0.5) * (52 / 8) + (Math.random() - 0.5) * 3);
    const glow = new THREE.Sprite(pyroGlowMat);
    glow.scale.setScalar(2.6);
    glow.position.copy(base);
    glow.visible = false;
    pyroGroup.add(glow);
    pyros.push({ glow, smokes: [], base });
  }

  let jumpHome = 0;
  let jumpAway = 0;
  let wave = 0;
  let waveTarget = 0;
  let ledGoalLeft = 0;
  let sparkRate = 0;
  let screenFlash = 0;
  const excite = new THREE.Vector2(0.2, 0.2);
  const exciteTarget = new THREE.Vector2(0.2, 0.2);
  let smokeAcc = 0;

  const view: StadiumView = {
    group,
    homeEndX: 60,
    setExcitement(h, a) {
      exciteTarget.set(Math.max(0, Math.min(1, h)), Math.max(0, Math.min(1, a)));
    },
    celebrate(side, seconds = 6) {
      if (side === 'home') jumpHome = seconds; else jumpAway = seconds;
      sparkRate = 1;
    },
    setWave(on) { waveTarget = on ? 1 : 0; },
    setScore(h, a, minute, title) {
      score = { h, a, minute, title: title ?? score.title };
      drawScreen();
    },
    ledGoal(name) {
      void name;
      ledGoalLeft = 5;
      screenFlash = 3;
    },
    pyro(seconds = 9) { pyroLeft = seconds; },
    update(dt, time, camera) {
      excite.lerp(exciteTarget, Math.min(1, dt * 2.5));
      jumpHome = Math.max(0, jumpHome - dt);
      jumpAway = Math.max(0, jumpAway - dt);
      wave += (waveTarget - wave) * Math.min(1, dt * 0.8);
      const u = cMat.uniforms;
      u.uTime.value = time;
      (u.uExcite.value as THREE.Vector2).copy(excite);
      (u.uJump.value as THREE.Vector2).set(Math.min(1, jumpHome / 2), Math.min(1, jumpAway / 2));
      u.uWave.value = wave;
      u.uFlash.value = Math.min(1, jumpHome / 3) * (0.5 + 0.5 * Math.sin(time * 9));
      // LED boards.
      ledGoalLeft = Math.max(0, ledGoalLeft - dt);
      for (const m of ledMats) {
        const { tex, gtex, speed } = m.userData as { tex: THREE.Texture; gtex: THREE.Texture; speed: number };
        const goal = ledGoalLeft > 0;
        const want = goal ? gtex : tex;
        if (m.map !== want) { m.map = want; m.emissiveMap = want; m.needsUpdate = true; }
        want.offset.x = (want.offset.x + dt * (goal ? 0.35 : speed * 0.012)) % 1;
        m.emissiveIntensity = (opts.night ? 1.05 : 0.6) * (goal ? 0.8 + 0.4 * Math.abs(Math.sin(time * 6)) : 1);
      }
      // Big screen.
      if (screenFlash > 0) {
        const before = screenFlash;
        screenFlash = Math.max(0, screenFlash - dt);
        const phase = Math.floor(before * 3) % 2 === 0;
        const nowPhase = Math.floor(screenFlash * 3) % 2 === 0;
        if (phase !== nowPhase || screenFlash === 0) drawScreen(screenFlash > 0 && nowPhase);
      }
      // Phone flashes.
      sparkRate = Math.max(opts.night ? 0.06 : 0, sparkRate - dt * 0.12);
      sparkMat.uniforms.uTime.value = time;
      sparkMat.uniforms.uRate.value = sparkRate * (opts.night ? 1 : 0.5);
      // Floodlight glare breathes a little.
      for (const s of flareSprites) s.material.opacity = Math.min(1, opts.flood * 1.05) * (0.92 + 0.08 * Math.sin(time * 1.3 + s.id));
      // Pyro.
      pyroLeft = Math.max(0, pyroLeft - dt);
      const burning = pyroLeft > 0;
      pyroLight.intensity = burning ? 40 * (0.7 + 0.3 * Math.sin(time * 23) * Math.sin(time * 7)) * Math.min(1, pyroLeft) : 0;
      smokeAcc += dt;
      const emit = burning && smokeAcc > 0.12;
      if (emit) smokeAcc = 0;
      for (const p of pyros) {
        p.glow.visible = burning;
        if (burning) {
          const f = 0.75 + 0.25 * Math.sin(time * 31 + p.base.z) * Math.sin(time * 13 + p.base.x);
          p.glow.scale.setScalar(2.2 + f * 1.4);
          p.glow.position.set(p.base.x, p.base.y + Math.sin(time * 5 + p.base.z) * 0.2, p.base.z);
          if (emit && p.smokes.length < 14) {
            const s = new THREE.Sprite(smokeMat);
            s.position.copy(p.base);
            s.scale.setScalar(1.5);
            pyroGroup.add(s);
            p.smokes.push({ s, age: 0, vy: 1.2 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 0.6 });
          }
        }
        for (let i = p.smokes.length - 1; i >= 0; i--) {
          const sm = p.smokes[i];
          sm.age += dt;
          sm.s.position.y += sm.vy * dt;
          sm.s.position.x -= 0.8 * dt;
          sm.s.position.z += sm.vx * dt;
          sm.s.scale.setScalar(1.5 + sm.age * 2.2);
          if (sm.age > 4.5) {
            pyroGroup.remove(sm.s);
            p.smokes.splice(i, 1);
          }
        }
      }
      void camera;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      pyroLight.dispose();
      ledTextures.length = 0;
    },
  };
  return view;
}
