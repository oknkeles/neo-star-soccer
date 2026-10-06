/** Procedural canvas textures: pitch, kits, ball, crowd atlas, glows, LED boards. */
import * as THREE from 'three';
import type { Kit } from '../../../core/types';
import { contrastInk, parseColor, shade } from '../palette';

export const DISPLAY_FONT = '"Bebas Neue", "Impact", "Arial Narrow", sans-serif';

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  return g;
}

export function canvasTexture(c: HTMLCanvasElement, color = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Mowing stripes + subtle checker + wear + grain. Covers exactly the 105 × 68 m pitch plus a margin. */
export function pitchTexture(quality: 'low' | 'medium' | 'high', wet: boolean, snow: boolean): THREE.CanvasTexture {
  const W = quality === 'high' ? 2048 : quality === 'medium' ? 1536 : 1024;
  const H = Math.round(W * (76 / 113));
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  const base = wet ? '#2f6a2c' : '#3c7d30';
  const light = wet ? '#3a7a34' : '#4b9139';
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // Pitch spans 113 × 76 m on this canvas (4 m margin each side).
  const mx = W / 113;
  const my = H / 76;
  const stripes = 22;
  const sw = (105 / stripes) * mx;
  for (let i = 0; i < stripes + 2; i++) {
    if (i % 2 === 0) continue;
    g.fillStyle = light;
    g.fillRect(4 * mx + (i - 1) * sw, 0, sw, H);
  }
  // Faint cross stripes for the modern checker look.
  g.globalAlpha = 0.07;
  const cross = 12;
  const ch = (68 / cross) * my;
  for (let j = 0; j < cross; j += 2) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 4 * my + j * ch, W, ch);
  }
  g.globalAlpha = 1;
  // Wear: goalmouths, centre, penalty spots.
  const wear = (x: number, y: number, rx: number, ry: number, a: number) => {
    const px = (x + 56.5) * mx;
    const py = (y + 38) * my;
    const grad = g.createRadialGradient(px, py, 0, px, py, rx * mx);
    grad.addColorStop(0, `rgba(120,105,60,${a})`);
    grad.addColorStop(1, 'rgba(120,105,60,0)');
    g.save();
    g.translate(px, py);
    g.scale(1, ry / rx);
    g.translate(-px, -py);
    g.fillStyle = grad;
    g.fillRect(px - rx * mx, py - rx * mx, rx * 2 * mx, rx * 2 * mx);
    g.restore();
  };
  wear(-50.5, 0, 4.5, 6, snow ? 0.05 : 0.32);
  wear(50.5, 0, 4.5, 6, snow ? 0.05 : 0.32);
  wear(-41.5, 0, 1.5, 1.5, 0.25);
  wear(41.5, 0, 1.5, 1.5, 0.25);
  wear(0, 0, 3, 3, 0.18);
  // Grain.
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    d[i] += n * 0.7;
    d[i + 1] += n;
    d[i + 2] += n * 0.5;
  }
  g.putImageData(img, 0, 0);
  if (snow) {
    g.fillStyle = 'rgba(235,242,255,0.35)';
    g.fillRect(0, 0, W, H);
  }
  const t = canvasTexture(c);
  t.anisotropy = 8;
  return t;
}

/** Small tiling noise used as a bump map for close-up grass detail. */
export function grassDetailTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = ctx2d(c);
  const img = g.createImageData(S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + Math.random() * 145;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // Blades: short vertical strokes.
  g.globalAlpha = 0.35;
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    g.strokeStyle = Math.random() < 0.5 ? '#ffffff' : '#000000';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 2, y + 3 + Math.random() * 4);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/**
 * Shirt texture wrapped around the torso cylinder: u = 0.25 is the chest, 0.75 the back.
 * Number (and surname) on the back, crest on the chest.
 */
export function shirtTexture(kit: Kit, number: number, name: string, size: 'sm' | 'lg'): THREE.CanvasTexture {
  const W = size === 'lg' ? 512 : 256;
  const H = W / 2;
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  const p = kit.primary;
  const s = kit.secondary;
  g.fillStyle = p;
  g.fillRect(0, 0, W, H);
  g.fillStyle = s;
  switch (kit.style) {
    case 'stripes': {
      const n = 12;
      for (let i = 0; i < n; i += 2) g.fillRect((i / n) * W, 0, W / n, H);
      break;
    }
    case 'hoops': {
      const n = 6;
      for (let i = 1; i < n; i += 2) g.fillRect(0, (i / n) * H, W, H / n);
      break;
    }
    case 'halves':
      g.fillRect(W * 0.25, 0, W * 0.5, H);
      break;
    case 'sash': {
      g.save();
      g.beginPath();
      g.moveTo(W * 0.08, 0);
      g.lineTo(W * 0.2, 0);
      g.lineTo(W * 0.44, H);
      g.lineTo(W * 0.32, H);
      g.closePath();
      g.fill();
      g.restore();
      break;
    }
    default: {
      // Plain: side panels + shoulder trim.
      g.globalAlpha = 0.85;
      g.fillRect(W * 0.47, 0, W * 0.06, H);
      g.fillRect(W * 0.97, 0, W * 0.03, H);
      g.fillRect(0, 0, W * 0.03, H);
      g.globalAlpha = 1;
      break;
    }
  }
  // Collar & hem.
  g.fillStyle = kit.style === 'plain' ? s : shade(p, -0.25);
  g.fillRect(0, 0, W, H * 0.06);
  g.fillStyle = shade(p, -0.2);
  g.fillRect(0, H * 0.95, W, H * 0.05);
  // Fabric shading: soft vertical gradient.
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Number plate colour that reads on whatever is behind it.
  const backBg = kit.style === 'halves' ? s : p;
  const ink = kit.style === 'plain' || kit.style === 'sash' ? (parseColorsClose(s, backBg) ? contrastInk(backBg) : s) : contrastInk(backBg);
  const outline = shade(ink, ink === '#ffffff' ? -0.85 : 0.85);
  const cx = W * 0.75;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  // Back panel (keeps the number readable on stripes / hoops).
  if (kit.style === 'stripes' || kit.style === 'hoops') {
    g.fillStyle = p;
    g.globalAlpha = 0.9;
    roundRect(g, cx - W * 0.1, H * 0.12, W * 0.2, H * 0.74, W * 0.02);
    g.fill();
    g.globalAlpha = 1;
  }
  const nameText = name.toLocaleUpperCase('tr-TR').slice(0, 12);
  g.font = `${Math.round(H * 0.13)}px ${DISPLAY_FONT}`;
  g.lineWidth = H * 0.025;
  g.strokeStyle = outline;
  g.strokeText(nameText, cx, H * 0.2);
  g.fillStyle = ink;
  g.fillText(nameText, cx, H * 0.2);
  g.font = `${Math.round(H * 0.56)}px ${DISPLAY_FONT}`;
  g.lineWidth = H * 0.04;
  g.strokeText(String(number), cx, H * 0.58);
  g.fillText(String(number), cx, H * 0.58);
  // Chest: small number + crest.
  g.font = `${Math.round(H * 0.2)}px ${DISPLAY_FONT}`;
  g.lineWidth = H * 0.02;
  g.strokeText(String(number), W * 0.3, H * 0.33);
  g.fillText(String(number), W * 0.3, H * 0.33);
  g.fillStyle = s === p ? contrastInk(p) : s;
  g.beginPath();
  g.arc(W * 0.2, H * 0.3, H * 0.055, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = shade(p, -0.4);
  g.lineWidth = H * 0.012;
  g.stroke();
  // Sponsor bar.
  g.fillStyle = contrastInk(p);
  g.globalAlpha = 0.85;
  g.font = `${Math.round(H * 0.12)}px ${DISPLAY_FONT}`;
  g.fillText('NEO STAR', W * 0.25, H * 0.56);
  g.globalAlpha = 1;
  return canvasTexture(c);
}

function parseColorsClose(a: string, b: string): boolean {
  const x = parseColor(a);
  const y = parseColor(b);
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 90;
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Classic 32-panel ball (truncated icosahedron) as an equirectangular map for SphereGeometry. */
export function ballTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  const img = g.createImageData(W, H);
  const phi = (1 + Math.sqrt(5)) / 2;
  const norm = (v: number[]) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const pent: number[][] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    pent.push(norm([0, a, b * phi]), norm([a, b * phi, 0]), norm([b * phi, 0, a]));
  }
  const hex: number[][] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const d of [-1, 1]) hex.push(norm([a, b, d]));
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    hex.push(norm([0, a / phi, b * phi]), norm([a / phi, b * phi, 0]), norm([b * phi, 0, a / phi]));
  }
  const PENT_BIAS = 0.0775; // rad: makes pentagons their true size (≈16.5° vs 20.9° hexagons)
  for (let r = 0; r < H; r++) {
    const theta = (Math.PI * (r + 0.5)) / H;
    for (let col = 0; col < W; col++) {
      const ph = (2 * Math.PI * (col + 0.5)) / W;
      const dx = -Math.cos(ph) * Math.sin(theta);
      const dy = Math.cos(theta);
      const dz = Math.sin(ph) * Math.sin(theta);
      let best = 9;
      let second = 9;
      let bestPent = false;
      for (const v of pent) {
        const a = Math.acos(Math.max(-1, Math.min(1, v[0] * dx + v[1] * dy + v[2] * dz))) + PENT_BIAS;
        if (a < best) { second = best; best = a; bestPent = true; } else if (a < second) second = a;
      }
      for (const v of hex) {
        const a = Math.acos(Math.max(-1, Math.min(1, v[0] * dx + v[1] * dy + v[2] * dz)));
        if (a < best) { second = best; best = a; bestPent = false; } else if (a < second) second = a;
      }
      const edge = second - best;
      let col3: [number, number, number] = bestPent ? [22, 24, 30] : [246, 246, 242];
      if (!bestPent) {
        // Slight dome shading per panel for a stitched look.
        const k = Math.min(1, best / 0.38);
        const sh = 1 - 0.06 * k * k;
        col3 = [col3[0] * sh, col3[1] * sh, col3[2] * sh];
      }
      if (edge < 0.012) col3 = bestPent ? [12, 12, 16] : [170, 172, 168];
      const i = (r * W + col) * 4;
      img.data[i] = col3[0];
      img.data[i + 1] = col3[1];
      img.data[i + 2] = col3[2];
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(c);
}

/** Soft radial blob (shadows, glows). */
export function radialTexture(inner: string, outer: string, size = 128, stops?: [number, string][]): THREE.CanvasTexture {
  const c = makeCanvas(size, size);
  const g = ctx2d(c);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  for (const [o, col] of stops ?? []) grad.addColorStop(o, col);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return canvasTexture(c);
}

/** Starburst glare used for floodlight bulbs. */
export function flareTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = ctx2d(c);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.08, 'rgba(255,250,235,0.9)');
  grad.addColorStop(0.25, 'rgba(200,220,255,0.25)');
  grad.addColorStop(1, 'rgba(160,190,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  for (const [w, a] of [[S * 0.012, 0.5], [S * 0.004, 0.9]] as const) {
    g.strokeStyle = `rgba(255,255,255,${a})`;
    g.lineWidth = w;
    for (const ang of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
      const len = ang % (Math.PI / 2) === 0 ? S * 0.48 : S * 0.22;
      g.beginPath();
      g.moveTo(S / 2 - Math.cos(ang) * len, S / 2 - Math.sin(ang) * len);
      g.lineTo(S / 2 + Math.cos(ang) * len, S / 2 + Math.sin(ang) * len);
      g.stroke();
    }
  }
  return canvasTexture(c);
}

/**
 * Crowd sprite atlas: 8 figure variants × 2 poses (sitting / arms up), 32 × 64 px cells.
 * Channels are MASKS: R = shirt, G = skin, B = hair/trousers; alpha = coverage.
 */
export function crowdAtlas(): THREE.CanvasTexture {
  const CW = 32;
  const CH = 64;
  const c = makeCanvas(CW * 8, CH * 2);
  const g = ctx2d(c);
  const SHIRT = 'rgb(255,0,0)';
  const SKIN = 'rgb(0,255,0)';
  const DARK = 'rgb(0,0,255)';
  for (let v = 0; v < 8; v++) {
    for (let pose = 0; pose < 2; pose++) {
      const ox = v * CW;
      const oy = pose * CH;
      const cx = ox + CW / 2;
      const wide = v % 3 === 0 ? 1.12 : v % 3 === 1 ? 1 : 0.9;
      const headY = oy + 17 + (v % 2);
      // Legs / trousers (mostly hidden by the row in front).
      g.fillStyle = DARK;
      g.fillRect(cx - 7 * wide, oy + 46, 14 * wide, 18);
      // Torso.
      g.fillStyle = SHIRT;
      g.beginPath();
      g.moveTo(cx - 8.5 * wide, oy + 27);
      g.lineTo(cx + 8.5 * wide, oy + 27);
      g.lineTo(cx + 7.5 * wide, oy + 48);
      g.lineTo(cx - 7.5 * wide, oy + 48);
      g.closePath();
      g.fill();
      // Arms.
      if (pose === 0) {
        g.fillRect(cx - 11 * wide, oy + 28, 3.5, 15);
        g.fillRect(cx + 11 * wide - 3.5, oy + 28, 3.5, 15);
        g.fillStyle = SKIN;
        g.fillRect(cx - 11 * wide, oy + 42, 3.5, 4);
        g.fillRect(cx + 11 * wide - 3.5, oy + 42, 3.5, 4);
        if (v === 5) {
          // Scarf held at chest height.
          g.fillStyle = SHIRT;
          g.fillRect(cx - 12, oy + 33, 24, 4);
        }
      } else {
        const spread = v % 2 === 0 ? 5 : 2;
        g.save();
        g.lineCap = 'round';
        g.strokeStyle = SHIRT;
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(cx - 7 * wide, oy + 29);
        g.lineTo(cx - 8 - spread, oy + 6);
        g.moveTo(cx + 7 * wide, oy + 29);
        g.lineTo(cx + 8 + spread, oy + 6);
        g.stroke();
        g.restore();
        g.fillStyle = SKIN;
        g.beginPath();
        g.arc(cx - 8 - spread, oy + 5, 2.6, 0, Math.PI * 2);
        g.arc(cx + 8 + spread, oy + 5, 2.6, 0, Math.PI * 2);
        g.fill();
        if (v === 5 || v === 2) {
          // Scarf stretched above the head.
          g.fillStyle = SHIRT;
          g.fillRect(cx - 14 - spread, oy + 2, 28 + spread * 2, 4);
        }
      }
      // Neck + head.
      g.fillStyle = SKIN;
      g.fillRect(cx - 2, headY + 5, 4, 6);
      g.beginPath();
      g.ellipse(cx, headY, 5.4, 6.4, 0, 0, Math.PI * 2);
      g.fill();
      // Hair / caps / beanies.
      g.fillStyle = DARK;
      if (v === 1 || v === 6) {
        g.beginPath();
        g.ellipse(cx, headY - 3, 6, 4, 0, Math.PI, 0);
        g.fill();
        g.fillRect(cx - 6, headY - 3, 12, 2);
      } else if (v === 3) {
        g.beginPath();
        g.ellipse(cx, headY - 1, 6.4, 7.4, 0, Math.PI * 0.95, Math.PI * 2.05);
        g.fill();
      } else if (v !== 7) {
        g.beginPath();
        g.ellipse(cx, headY - 2.5, 5.6, 4.2, 0, Math.PI, 0);
        g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}

/** Puffy smoke sprite. */
export function smokeTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = makeCanvas(S, S);
  const g = ctx2d(c);
  for (let i = 0; i < 14; i++) {
    const x = S / 2 + (Math.random() - 0.5) * S * 0.35;
    const y = S / 2 + (Math.random() - 0.5) * S * 0.35;
    const r = S * (0.18 + Math.random() * 0.18);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  }
  return canvasTexture(c);
}
