import type { Footballer, GameState, Lang, Vec2, Vec3 } from './types';

export const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (a === b ? 0 : (v - a) / (b - a));
export const round1 = (v: number) => Math.round(v * 10) / 10;
export const sum = (arr: readonly number[]) => arr.reduce((a, b) => a + b, 0);
export const avg = (arr: readonly number[]) => (arr.length ? sum(arr) / arr.length : 0);

export const v2 = (x = 0, y = 0): Vec2 => ({ x, y });
export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const len2 = (v: Vec2) => Math.hypot(v.x, v.y);
export const dist2 = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm2 = (v: Vec2): Vec2 => {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
};

/** Next unique id inside a save: `${prefix}-${n}`. Mutates state.idCounter. */
export function nextId(state: Pick<GameState, 'idCounter'>, prefix: string): string {
  state.idCounter += 1;
  return `${prefix}-${state.idCounter.toString(36)}`;
}

/** Absolute week index used for expiries: season * 100 + week. */
export const absWeek = (season: number, week: number) => season * 100 + week;

export function age(p: Pick<Footballer, 'birthYear'>, season: number): number {
  return season - p.birthYear;
}

export function fullName(p: Pick<Footballer, 'firstName' | 'lastName' | 'nickname'>): string {
  return p.nickname ? p.nickname : `${p.firstName} ${p.lastName}`;
}

const MONEY_UNITS: Record<Lang, [string, string, string]> = {
  tr: ['B', 'M', 'Mr'], // bin, milyon, milyar
  en: ['K', 'M', 'B'],
};

/** €1.2M / €850K style. */
export function formatMoney(v: number, lang: Lang = 'tr'): string {
  const [k, m, b] = MONEY_UNITS[lang];
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}€${round1(a / 1e9)}${b}`;
  if (a >= 1e6) return `${sign}€${round1(a / 1e6)}${m}`;
  if (a >= 1e3) return `${sign}€${Math.round(a / 1e3)}${k}`;
  return `${sign}€${Math.round(a)}`;
}

export function formatNumber(v: number, lang: Lang = 'tr'): string {
  return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-GB').format(Math.round(v));
}

/** Deep clone for plain JSON data (state snapshots, saves). */
export function cloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
