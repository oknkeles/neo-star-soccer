/**
 * Canvas 2D drawing for the top-down match view (HaxBall / ballball.club style):
 * striped pitch, crisp lines, goals with nets, players as numbered discs, ball with a
 * height shadow and trail, aim overlays, minimap, banner, hint pill and confetti.
 * Pure drawing — no engine access. World frame: metres, +x = our attack (screen right),
 * +y = screen up.
 */
import type { AnimState, Kit, Vec2, Vec3 } from '../../core/types';

export const HL = 52.5;
export const HW = 34;
export const GW = 3.66;
const BR = 0.11;

export interface Cam {
  x: number;
  y: number;
  /** CSS pixels per metre. */
  ppm: number;
  W: number;
  H: number;
  dpr: number;
  shakeX: number;
  shakeY: number;
}

export interface TeamLook { fill: string; ring: string; text: string }

export interface PlayerMeta {
  side: 'us' | 'them';
  num: number;
  gk: boolean;
  user: boolean;
  look: TeamLook;
}

export interface SnapPlayer { id: string; x: number; y: number; facing: number; anim: AnimState }
export interface Snap { players: SnapPlayer[]; ball: Vec3 }

export const sx = (c: Cam, x: number) => c.W / 2 + (x - c.x) * c.ppm + c.shakeX;
export const sy = (c: Cam, y: number) => c.H / 2 - (y - c.y) * c.ppm + c.shakeY;

const GRASS_A = '#4f9d47';
const GRASS_B = '#479341';
const SURROUND = '#3b7f37';
const LINE = 'rgba(255,255,255,0.92)';
export const ACCENT = '#c6ff3d';
const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const DISPLAY = '"Bebas Neue", Impact, "Arial Narrow", sans-serif';

// ───────────────────────── colours ─────────────────────────

function rgb(c: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function cdist(a: string, b: string): number {
  const p = rgb(a);
  const q = rgb(b);
  if (!p || !q) return 999;
  const dr = p[0] - q[0];
  const dg = p[1] - q[1];
  const db = p[2] - q[2];
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

function luminance(c: string): number {
  const p = rgb(c);
  if (!p) return 0.5;
  return (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255;
}

const textOn = (fill: string) => (luminance(fill) > 0.6 ? '#0b1210' : '#ffffff');

function ringFor(fill: string, secondary: string): string {
  if (cdist(fill, secondary) > 110) return secondary;
  return luminance(fill) > 0.55 ? '#0b1210' : '#ffffff';
}

const FALLBACKS = ['#2563eb', '#f97316', '#e11d48', '#7c3aed', '#0f172a', '#f8fafc'];

function distinct(want: string[], avoid: string[]): string {
  const ok = (c: string) => avoid.every((a) => cdist(c, a) > 150) && cdist(c, GRASS_A) > 130;
  for (const c of want) if (rgb(c) && ok(c)) return c;
  for (const c of FALLBACKS) if (ok(c)) return c;
  return FALLBACKS[0];
}

export function teamLooks(us: Kit, them: Kit): { us: TeamLook; them: TeamLook; gkUs: TeamLook; gkThem: TeamLook } {
  const usFill = distinct([us.primary, us.secondary], []);
  const themFill = distinct([them.primary, them.secondary], [usFill]);
  const gkUsFill = distinct(['#facc15', '#f472b6', '#a3e635'], [usFill, themFill]);
  const gkThemFill = distinct(['#22d3ee', '#fb923c', '#e879f9'], [usFill, themFill, gkUsFill]);
  const look = (fill: string, sec: string): TeamLook => ({ fill, ring: ringFor(fill, sec), text: textOn(fill) });
  return {
    us: look(usFill, usFill === us.primary ? us.secondary : us.primary),
    them: look(themFill, themFill === them.primary ? them.secondary : them.primary),
    gkUs: look(gkUsFill, '#111111'),
    gkThem: look(gkThemFill, '#111111'),
  };
}

// ───────────────────────── helpers ─────────────────────────

function worldT(ctx: CanvasRenderingContext2D, c: Cam): void {
  const k = c.ppm * c.dpr;
  ctx.setTransform(k, 0, 0, -k, c.dpr * (c.W / 2 - c.x * c.ppm + c.shakeX), c.dpr * (c.H / 2 + c.y * c.ppm + c.shakeY));
}

export function screenT(ctx: CanvasRenderingContext2D, c: Cam): void {
  ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
}

export function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (!(w > 0 && h > 0)) return;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function polyArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, a0: number, a1: number, n = 24): void {
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

// ───────────────────────── pitch & goals ─────────────────────────

export function drawPitch(ctx: CanvasRenderingContext2D, c: Cam): void {
  screenT(ctx, c);
  ctx.fillStyle = SURROUND;
  ctx.fillRect(0, 0, c.W, c.H);
  worldT(ctx, c);
  const band = (2 * HL) / 20;
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = i % 2 ? GRASS_A : GRASS_B;
    ctx.fillRect(-HL + i * band, -HW, band + 0.01, 2 * HW);
  }
  ctx.strokeStyle = LINE;
  ctx.lineWidth = Math.max(0.12, 1.6 / c.ppm);
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.rect(-HL, -HW, 2 * HL, 2 * HW);
  ctx.moveTo(0, -HW);
  ctx.lineTo(0, HW);
  ctx.moveTo(9.15, 0);
  polyArc(ctx, 0, 0, 9.15, 0, Math.PI * 2, 64);
  for (const s of [-1, 1]) {
    const gx = s * HL;
    ctx.moveTo(gx, -20.16);
    ctx.lineTo(gx - s * 16.5, -20.16);
    ctx.lineTo(gx - s * 16.5, 20.16);
    ctx.lineTo(gx, 20.16);
    ctx.moveTo(gx, -9.16);
    ctx.lineTo(gx - s * 5.5, -9.16);
    ctx.lineTo(gx - s * 5.5, 9.16);
    ctx.lineTo(gx, 9.16);
    // penalty arc outside the box
    const spot = gx - s * 11;
    const a0 = Math.acos(5.5 / 9.15);
    const base = s > 0 ? Math.PI : 0;
    const first = { x: spot + Math.cos(base - a0) * 9.15, y: Math.sin(base - a0) * 9.15 };
    ctx.moveTo(first.x, first.y);
    polyArc(ctx, spot, 0, 9.15, base - a0, base + a0, 20);
    // corner arcs
    for (const t of [-1, 1]) {
      const cx = gx;
      const cy = t * HW;
      const start = Math.atan2(-t, -s);
      ctx.moveTo(cx + Math.cos(start - Math.PI / 4) * 1, cy + Math.sin(start - Math.PI / 4) * 1);
      polyArc(ctx, cx, cy, 1, start - Math.PI / 4, start + Math.PI / 4, 8);
    }
  }
  ctx.stroke();
  ctx.fillStyle = LINE;
  for (const x of [0, -HL + 11, HL - 11]) {
    ctx.beginPath();
    ctx.arc(x, 0, Math.max(0.22, 2 / c.ppm), 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawGoals(ctx: CanvasRenderingContext2D, c: Cam): void {
  worldT(ctx, c);
  const depth = 2;
  for (const s of [-1, 1]) {
    const x0 = s * HL;
    const x1 = s * (HL + depth);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(Math.min(x0, x1), -GW, depth, 2 * GW);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = Math.max(0.03, 0.8 / c.ppm);
    ctx.beginPath();
    for (let y = -GW + 0.5; y < GW; y += 0.5) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    for (let k = 0.5; k < depth; k += 0.5) { ctx.moveTo(s * (HL + k), -GW); ctx.lineTo(s * (HL + k), GW); }
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(0.14, 2.2 / c.ppm);
    ctx.beginPath();
    ctx.moveTo(x0, -GW);
    ctx.lineTo(x1, -GW);
    ctx.lineTo(x1, GW);
    ctx.lineTo(x0, GW);
    ctx.stroke();
    for (const t of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x0, t * GW, Math.max(0.16, 3 / c.ppm), 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = Math.max(0.04, 1 / c.ppm);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.stroke();
    }
  }
}

// ───────────────────────── players ─────────────────────────

export function playerRadius(c: Cam, user: boolean): number {
  return Math.max(user ? 9 : 7.5, (user ? 0.86 : 0.72) * c.ppm);
}

export function drawPlayers(
  ctx: CanvasRenderingContext2D, c: Cam, snap: Snap, metas: Map<string, PlayerMeta>, clock: number,
  opts: { highlightId?: string | null; highlightKey?: string },
): void {
  screenT(ctx, c);
  const list = snap.players.slice().sort((a, b) => Number(metas.get(a.id)?.user ?? 0) - Number(metas.get(b.id)?.user ?? 0));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of list) {
    const m = metas.get(p.id);
    if (!m) continue;
    const x = sx(c, p.x);
    const y = sy(c, p.y);
    const R = playerRadius(c, m.user);
    if (x < -R * 3 || x > c.W + R * 3 || y < -R * 3 || y > c.H + R * 3) continue;
    const down = p.anim === 'fall' || p.anim === 'slide' || p.anim === 'dive_left' || p.anim === 'dive_right';
    ctx.globalAlpha = p.anim === 'fall' ? 0.6 : 1;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.arc(x + R * 0.14, y + R * 0.2, R, 0, Math.PI * 2);
    ctx.fill();
    if (m.user) {
      const pulse = 0.5 + 0.5 * Math.sin(clock * 6);
      ctx.fillStyle = `rgba(198,255,61,${0.16 + 0.12 * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, R + 6 + 3 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    if (down) {
      // stretched along the facing direction
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-p.facing);
      ctx.scale(1.25, 0.85);
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
    }
    ctx.fillStyle = m.look.fill;
    ctx.fill();
    ctx.lineWidth = Math.max(2, R * 0.17);
    ctx.strokeStyle = m.user ? ACCENT : m.look.ring;
    ctx.stroke();
    // facing notch
    const fx = Math.cos(p.facing);
    const fy = -Math.sin(p.facing);
    ctx.fillStyle = m.look.text === '#ffffff' ? 'rgba(255,255,255,0.9)' : 'rgba(10,18,16,0.75)';
    ctx.beginPath();
    ctx.arc(x + fx * R * 0.66, y + fy * R * 0.66, Math.max(1.6, R * 0.15), 0, Math.PI * 2);
    ctx.fill();
    // number
    ctx.fillStyle = m.look.text;
    ctx.font = `800 ${Math.round(R * (m.num > 9 ? 0.82 : 0.95))}px ${FONT}`;
    ctx.fillText(String(m.num), x - fx * R * 0.08, y + R * 0.06 - fy * R * 0.08);
    ctx.globalAlpha = 1;
    if (m.user) {
      // marker above the user
      const ty = y - R - 9 - 2 * Math.sin(clock * 5);
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.moveTo(x - 6, ty - 7);
      ctx.lineTo(x + 6, ty - 7);
      ctx.lineTo(x, ty);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (opts.highlightId === p.id) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -clock * 18;
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, R + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (opts.highlightKey) keycap(ctx, x, y - R - 16, opts.highlightKey);
    }
  }
}

export function keycap(ctx: CanvasRenderingContext2D, x: number, y: number, label: string): void {
  ctx.font = `800 11px ${FONT}`;
  const w = Math.max(18, ctx.measureText(label).width + 10);
  rrect(ctx, x - w / 2, y - 9, w, 18, 5);
  ctx.fillStyle = 'rgba(8,14,10,0.82)';
  ctx.fill();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = ACCENT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 0.5);
}

/** Arrow at the screen edge pointing at an off-screen point. */
export function drawOffscreenArrow(ctx: CanvasRenderingContext2D, c: Cam, p: Vec2): void {
  const x = sx(c, p.x);
  const y = sy(c, p.y);
  const pad = 22;
  if (x > pad && x < c.W - pad && y > pad && y < c.H - pad) return;
  screenT(ctx, c);
  const cx = c.W / 2;
  const cy = c.H / 2;
  const dx = x - cx;
  const dy = y - cy;
  const k = Math.min((c.W / 2 - pad) / Math.abs(dx || 1e-6), (c.H / 2 - pad) / Math.abs(dy || 1e-6));
  const ax = cx + dx * k;
  const ay = cy + dy * k;
  const a = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(a);
  ctx.fillStyle = ACCENT;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(-8, -9);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-8, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ───────────────────────── ball ─────────────────────────

/** Screen position of the ball (lifted with height), its ground point and drawn radius. */
export function ballScreen(c: Cam, b: Vec3): { x: number; y: number; gx: number; gy: number; r: number; h: number } {
  const h = Math.max(0, b.z - BR);
  const gx = sx(c, b.x);
  const gy = sy(c, b.y);
  const r = Math.max(5, 0.36 * c.ppm) * (1 + Math.min(h, 6) * 0.07);
  return { x: gx, y: gy - h * c.ppm * 0.45, gx, gy, r, h };
}

export function drawBall(ctx: CanvasRenderingContext2D, c: Cam, b: Vec3, trail: Vec3[], roll: number): void {
  screenT(ctx, c);
  // trail
  if (trail.length > 1) {
    ctx.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      const p = ballScreen(c, trail[i - 1]);
      const q = ballScreen(c, trail[i]);
      const k = i / trail.length;
      ctx.strokeStyle = `rgba(255,255,255,${0.32 * k})`;
      ctx.lineWidth = q.r * 1.6 * k;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
  }
  const s = ballScreen(c, b);
  ctx.fillStyle = `rgba(0,0,0,${Math.max(0.12, 0.38 - s.h * 0.05)})`;
  ctx.beginPath();
  ctx.ellipse(s.gx + s.h * c.ppm * 0.18, s.gy + 1.5, s.r * (1 + s.h * 0.04), s.r * 0.8 * (1 + s.h * 0.04), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(10,15,12,0.7)';
  ctx.stroke();
  ctx.fillStyle = '#1f2421';
  ctx.beginPath();
  ctx.arc(s.x + Math.cos(roll) * s.r * 0.42, s.y + Math.sin(roll) * s.r * 0.42, s.r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

// ───────────────────────── aim overlays ─────────────────────────

export function drawPath(ctx: CanvasRenderingContext2D, c: Cam, path: Vec3[], color = ACCENT): void {
  if (path.length < 2) return;
  screenT(ctx, c);
  ctx.save();
  ctx.setLineDash([7, 6]);
  ctx.lineCap = 'round';
  const n = path.length;
  for (let i = 1; i < n; i++) {
    const p = ballScreen(c, path[i - 1]);
    const q = ballScreen(c, path[i]);
    ctx.globalAlpha = 0.95 * (1 - i / n) + 0.1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawTarget(ctx: CanvasRenderingContext2D, c: Cam, p: Vec2, strong: boolean, clock: number): void {
  screenT(ctx, c);
  const x = sx(c, p.x);
  const y = sy(c, p.y);
  const r = strong ? 9 + 1.5 * Math.sin(clock * 8) : 7;
  ctx.strokeStyle = strong ? ACCENT : 'rgba(255,255,255,0.55)';
  ctx.lineWidth = strong ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x - r - 4, y);
  ctx.lineTo(x - r + 3, y);
  ctx.moveTo(x + r - 3, y);
  ctx.lineTo(x + r + 4, y);
  ctx.moveTo(x, y - r - 4);
  ctx.lineTo(x, y - r + 3);
  ctx.moveTo(x, y + r - 3);
  ctx.lineTo(x, y + r + 4);
  ctx.stroke();
}

/** Power bar (+ curl arrow) under the user while a shot is charging. */
export function drawPowerBar(ctx: CanvasRenderingContext2D, c: Cam, at: Vec2, charge: number, curl: number, chip: boolean, labels: { power: string; chip: string }): void {
  screenT(ctx, c);
  const x = sx(c, at.x);
  const y = sy(c, at.y) + playerRadius(c, true) + 14;
  const w = 62;
  const h = 8;
  rrect(ctx, x - w / 2 - 2, y - 2, w + 4, h + 4, 5);
  ctx.fillStyle = 'rgba(6,12,8,0.75)';
  ctx.fill();
  const col = charge < 0.5 ? ACCENT : charge < 0.85 ? '#ffcb47' : '#ff4f64';
  rrect(ctx, x - w / 2, y, Math.max(3, w * charge), h, 4);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.font = `800 10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(chip ? labels.chip : labels.power, x, y + h + 4);
  if (Math.abs(curl) > 0.05) {
    // curved arrow: + curl bends to the left of travel (screen up when attacking right)
    const s = curl > 0 ? -1 : 1;
    const cx = x + w / 2 + 16;
    const cy = y + h / 2;
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy);
    ctx.quadraticCurveTo(cx + 2, cy, cx + 6, cy + s * 9 * Math.min(1, Math.abs(curl) + 0.3));
    ctx.stroke();
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    const tx = cx + 6;
    const ty = cy + s * 9 * Math.min(1, Math.abs(curl) + 0.3);
    ctx.moveTo(tx, ty + s * 3);
    ctx.lineTo(tx - 5, ty - s * 3);
    ctx.lineTo(tx + 4, ty - s * 3);
    ctx.closePath();
    ctx.fill();
  }
}

// ───────────────────────── HUD bits ─────────────────────────

export function drawMinimap(ctx: CanvasRenderingContext2D, c: Cam, snap: Snap, metas: Map<string, PlayerMeta>, top: number): void {
  if (c.H < 380 || c.W < 420) return;
  screenT(ctx, c);
  const mw = Math.round(Math.min(170, Math.max(110, c.W * 0.16)));
  const mh = Math.round((mw * 68) / 105);
  const x0 = 12;
  const y0 = top;
  const k = mw / (2 * HL);
  const mx = (x: number) => x0 + (x + HL) * k;
  const my = (y: number) => y0 + (HW - y) * k;
  rrect(ctx, x0 - 4, y0 - 4, mw + 8, mh + 8, 8);
  ctx.fillStyle = 'rgba(8,20,12,0.62)';
  ctx.fill();
  ctx.fillStyle = 'rgba(79,157,71,0.55)';
  ctx.fillRect(x0, y0, mw, mh);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, mw - 1, mh - 1);
  ctx.beginPath();
  ctx.moveTo(mx(0), y0);
  ctx.lineTo(mx(0), y0 + mh);
  ctx.stroke();
  // camera view
  const hw = c.W / 2 / c.ppm;
  const hh = c.H / 2 / c.ppm;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.strokeRect(mx(c.x - hw), my(c.y + hh), 2 * hw * k, 2 * hh * k);
  let user: SnapPlayer | null = null;
  for (const p of snap.players) {
    const m = metas.get(p.id);
    if (!m) continue;
    if (m.user) { user = p; continue; }
    ctx.fillStyle = m.look.fill;
    ctx.beginPath();
    ctx.arc(mx(p.x), my(p.y), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (user) {
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(mx(user.x), my(user.y), 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.beginPath();
  ctx.arc(mx(snap.ball.x), my(snap.ball.y), 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

export function drawTimeBar(ctx: CanvasRenderingContext2D, c: Cam, frac: number): void {
  screenT(ctx, c);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, c.W, 4);
  ctx.fillStyle = frac > 0.35 ? ACCENT : frac > 0.15 ? '#ffcb47' : '#ff4f64';
  ctx.fillRect(0, 0, c.W * Math.max(0, Math.min(1, frac)), 4);
}

export function drawHint(ctx: CanvasRenderingContext2D, c: Cam, text: string, alpha: number, bottom: number): void {
  if (alpha <= 0.01 || !text) return;
  screenT(ctx, c);
  const size = c.W < 560 ? 11 : 13;
  ctx.font = `600 ${size}px ${FONT}`;
  const tw = Math.min(c.W - 24, ctx.measureText(text).width + 28);
  const x = c.W / 2 - tw / 2;
  const y = c.H - bottom - 30;
  ctx.globalAlpha = alpha;
  rrect(ctx, x, y, tw, 30, 15);
  ctx.fillStyle = 'rgba(6,12,8,0.72)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(198,255,61,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#eef6ee';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.W / 2, y + 15.5, c.W - 40);
  ctx.globalAlpha = 1;
}

export function drawBanner(ctx: CanvasRenderingContext2D, c: Cam, text: string, age: number, tone: 'great' | 'good' | 'bad' | 'neutral'): void {
  screenT(ctx, c);
  const size = Math.round(Math.min(c.W * 0.15, 128));
  const pop = 1 + 0.6 * Math.max(0, 1 - age * 5);
  ctx.save();
  ctx.translate(c.W / 2, c.H * 0.4);
  ctx.scale(pop, pop);
  ctx.font = `400 ${size}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size * 0.08);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeText(text, 0, 0, c.W * 0.92);
  ctx.fillStyle = tone === 'great' ? ACCENT : tone === 'good' ? '#7dd3fc' : tone === 'bad' ? '#ff4f64' : '#ffffff';
  ctx.fillText(text, 0, 0, c.W * 0.92);
  ctx.restore();
}

export function drawLabel(ctx: CanvasRenderingContext2D, c: Cam, text: string, sub: string): void {
  screenT(ctx, c);
  ctx.font = `400 28px ${DISPLAY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffcb47';
  ctx.fillText(text, 16, 56);
  ctx.font = `600 12px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(sub, 16, 88);
}

// ───────────────────────── confetti / flash ─────────────────────────

export interface Confetto { x: number; y: number; vx: number; vy: number; r: number; vr: number; s: number; color: string; life: number }

export function spawnConfetti(list: Confetto[], c: Cam, colors: string[], n = 150): void {
  for (let i = 0; i < n; i++) {
    list.push({
      x: Math.random() * c.W, y: -20 - Math.random() * c.H * 0.4,
      vx: (Math.random() - 0.5) * 120, vy: 80 + Math.random() * 160,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 10, s: 5 + Math.random() * 6,
      color: colors[i % colors.length], life: 2.6 + Math.random() * 1.2,
    });
  }
}

export function stepConfetti(ctx: CanvasRenderingContext2D, c: Cam, list: Confetto[], dt: number): void {
  if (!list.length) return;
  screenT(ctx, c);
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0 || p.y > c.H + 20) { list.splice(i, 1); continue; }
    p.vy += 90 * dt;
    p.vx *= 1 - 0.8 * dt;
    p.x += p.vx * dt + Math.sin(p.r * 2) * 0.6;
    p.y += p.vy * dt;
    p.r += p.vr * dt;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    ctx.globalAlpha = Math.min(1, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export function drawFlash(ctx: CanvasRenderingContext2D, c: Cam, color: string, a: number): void {
  if (a <= 0.01) return;
  screenT(ctx, c);
  ctx.globalAlpha = a;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.W, c.H);
  ctx.globalAlpha = 1;
}
