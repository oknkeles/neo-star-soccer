/** Colour helpers for kits, skin tones and crowd (pure). */
import type { Kit } from '../../core/types';

export const SKIN_TONES = ['#f3d2b8', '#e2b48f', '#c99168', '#a36e46', '#7a4b2c', '#4f2f1c'] as const;

export function skinColor(index: number): string {
  const i = Math.max(0, Math.min(SKIN_TONES.length - 1, Math.round(Number.isFinite(index) ? index : 1)));
  return SKIN_TONES[i];
}

export type RGB = [number, number, number];

/** Parses #rgb / #rrggbb / rgb(...) into 0..255 components; falls back to grey. */
export function parseColor(c: string): RGB {
  const s = (c || '').trim();
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
    if (h.length >= 6) {
      const n = parseInt(h.slice(0, 6), 16);
      if (Number.isFinite(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map((x) => parseFloat(x));
    if (parts.length >= 3 && parts.every((x) => Number.isFinite(x))) return [parts[0], parts[1], parts[2]];
  }
  return [128, 128, 128];
}

export function toHex([r, g, b]: RGB): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Lighten (amount > 0) or darken (amount < 0) a colour, amount in −1..1. */
export function shade(c: string, amount: number): string {
  const [r, g, b] = parseColor(c);
  const f = (v: number) => (amount >= 0 ? v + (255 - v) * amount : v * (1 + amount));
  return toHex([f(r), f(g), f(b)]);
}

export function luminance(c: string): number {
  const [r, g, b] = parseColor(c).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Perceptual-ish colour distance ("redmean"), 0..~765. */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = parseColor(a);
  const [r2, g2, b2] = parseColor(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/** Readable text colour (black/white) on a background. */
export function contrastInk(bg: string): string {
  return luminance(bg) > 0.42 ? '#0b0f0d' : '#ffffff';
}

/** If the two kits are too similar on the pitch, return a contrasting alternative for `them`. */
export function resolveKitClash(us: Kit, them: Kit): Kit {
  if (colorDistance(us.primary, them.primary) > 140) return them;
  if (colorDistance(us.primary, them.secondary) > 180) {
    return { primary: them.secondary, secondary: them.primary, style: them.style };
  }
  const usLight = luminance(us.primary) > 0.4;
  return usLight
    ? { primary: '#1a1f2e', secondary: '#e8e8e8', style: 'plain' }
    : { primary: '#f2f2f2', secondary: '#1a1f2e', style: 'plain' };
}

const GK_COLORS = ['#d4ff00', '#ff7a00', '#00e5ff', '#ff2fa3', '#7c4dff', '#1de9b6', '#ffd600', '#222222'];

/** A goalkeeper colour that stands out from both outfield kits. */
export function goalkeeperColor(a: Kit, b: Kit, salt = 0): string {
  let best = GK_COLORS[0];
  let bestScore = -1;
  GK_COLORS.forEach((c, i) => {
    const score = Math.min(colorDistance(c, a.primary), colorDistance(c, b.primary), colorDistance(c, a.secondary) * 1.3)
      + ((i + salt) % GK_COLORS.length === 0 ? 5 : 0);
    if (score > bestScore) { bestScore = score; best = c; }
  });
  return best;
}

/** Shorts colour for a kit: the secondary unless it is nearly identical to the shirt. */
export function shortsColor(kit: Kit): string {
  return colorDistance(kit.primary, kit.secondary) < 60 ? shade(kit.primary, -0.5) : kit.secondary;
}
