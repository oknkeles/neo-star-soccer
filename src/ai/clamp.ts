/**
 * Post-validation for everything Claude returns. Claude is asked to respect limits, but
 * game balance must never depend on that: every number is clamped here and every text
 * is trimmed to a sane length before it reaches game state.
 */
import type { AttrKey, ContractTerms, Effects, Negotiation, RelKey, SquadRole } from '../core/types';
import { ATTR_KEYS } from '../core/ratings';
import { clamp } from '../core/util';
import type { CompactEffects, CompactPressEffects } from './schemas';
import { ICON_NAMES, REL_KEYS } from './schemas';

export const EFFECT_LIMITS = {
  rel: 8,
  fame: 4,
  morale: 6,
  money: 20_000,
  xp: 10,
  injuryWeeks: 2,
  energy: 15,
  form: 8,
} as const;

export const PATIENCE_DELTA: [number, number] = [-30, 10];

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const sym = (v: unknown, lim: number) => Math.round(clamp(num(v), -lim, lim));

/** Follower swing allowed for one effect: ~5 % of the audience, at least 2K, at most 250K. */
export function followersCap(followers?: number): number {
  return Math.round(clamp(num(followers) * 0.05, 2_000, 250_000));
}

/** Clamp an Effects object into the narrator's hard bounds. `flags` are never accepted from the AI. */
export function clampEffects(e: Effects, opts: { followers?: number } = {}): Effects {
  const out: Effects = {};
  const money = sym(e.money, EFFECT_LIMITS.money);
  if (money) out.money = money;
  const fame = sym(e.fame, EFFECT_LIMITS.fame);
  if (fame) out.fame = fame;
  const morale = sym(e.morale, EFFECT_LIMITS.morale);
  if (morale) out.morale = morale;
  const energy = sym(e.energy, EFFECT_LIMITS.energy);
  if (energy) out.energy = energy;
  const form = sym(e.form, EFFECT_LIMITS.form);
  if (form) out.form = form;
  const followers = sym(e.followers, followersCap(opts.followers));
  if (followers) out.followers = followers;
  const injury = Math.round(clamp(num(e.injuryWeeks), 0, EFFECT_LIMITS.injuryWeeks));
  if (injury) out.injuryWeeks = injury;
  if (e.rel) {
    const rel: Partial<Record<RelKey, number>> = {};
    for (const [k, v] of Object.entries(e.rel) as [RelKey, number][]) {
      const d = sym(v, EFFECT_LIMITS.rel);
      if (d) rel[k] = d;
    }
    if (Object.keys(rel).length) out.rel = rel;
  }
  if (e.xp) {
    const xp: Effects['xp'] = {};
    for (const [k, v] of Object.entries(e.xp) as [keyof NonNullable<Effects['xp']>, number][]) {
      const d = sym(v, EFFECT_LIMITS.xp);
      if (d) xp[k] = d;
    }
    if (Object.keys(xp).length) out.xp = xp;
  }
  return out;
}

const REL_LOOKUP = new Map<string, RelKey>(REL_KEYS.map((k) => [k, k]));
const ATTR_LOOKUP = new Map<string, AttrKey>(ATTR_KEYS.map((k) => [k.toLowerCase(), k]));

/** Sum keyed deltas, ignoring keys the game does not know. */
function sumKeyed<K extends string>(items: { key: string; delta: number }[] | undefined, lookup: Map<string, K>): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const it of items ?? []) {
    const k = lookup.get(String(it.key).trim().toLowerCase().replace(/[\s_-]/g, ''));
    if (k) out[k] = (out[k] ?? 0) + num(it.delta);
  }
  return out;
}

const relOf = (c: { rel?: { who: string; delta: number }[] }) =>
  sumKeyed((c.rel ?? []).map((r) => ({ key: r.who, delta: r.delta })), REL_LOOKUP);

/** Compact schema shape → Effects (duplicate keys summed, unknown keys dropped), then clamped. */
export function compactToEffects(c: CompactEffects, opts: { followers?: number } = {}): Effects {
  const rel = relOf(c);
  const xp = sumKeyed((c.xp ?? []).map((x) => ({ key: x.attr, delta: x.delta })), ATTR_LOOKUP);
  return clampEffects({
    money: c.money, fame: c.fame, morale: c.morale, energy: c.energy, form: c.form,
    followers: c.followers, injuryWeeks: c.injuryWeeks, rel, xp,
  }, opts);
}

export function pressToEffects(c: CompactPressEffects, opts: { followers?: number } = {}): Effects {
  const rel = relOf(c);
  return clampEffects({ fame: c.fame, morale: c.morale, followers: c.followers, rel }, opts);
}

// ───────────────────────────── negotiation ─────────────────────────────

/** What the director may concede this round: a narrow band around the club's current proposal. */
export interface Mandate {
  wage: [number, number];
  years: [number, number];
  signingBonus: [number, number];
  goalBonus: [number, number];
  /** null → the clause stays exactly as currently proposed. */
  releaseClause: [number, number] | null;
  roles: SquadRole[];
}

function band(cur: number, ask: number, max: number, step: number): [number, number] {
  const hi = Math.max(0, Math.min(max, Math.max(cur, Math.min(ask, cur + step))));
  const lo = Math.min(hi, Math.max(0, cur - step));
  return [Math.round(lo), Math.round(hi)];
}

export function negotiationMandate(neg: Negotiation, ask: ContractTerms): Mandate {
  const cur = neg.current;
  const L = neg.limits;
  const wage = band(cur.wage, ask.wage, L.maxWage, Math.max(cur.wage * 0.08, 100));
  const maxYears = clamp(Math.round(L.maxYears), 1, 5);
  const years: [number, number] = [clamp(cur.years - 1, 1, maxYears), clamp(cur.years + 1, 1, maxYears)];
  const signingBonus = band(cur.signingBonus, ask.signingBonus, L.maxSigningBonus, Math.max(cur.signingBonus * 0.15, L.maxSigningBonus * 0.1));
  const goalBonus = band(cur.goalBonus, ask.goalBonus, L.maxGoalBonus, Math.max(cur.goalBonus * 0.15, L.maxGoalBonus * 0.1));

  let releaseClause: [number, number] | null = null;
  const floor = L.minReleaseClause ?? 0;
  if (cur.releaseClause !== null) {
    // A lower clause favours the player: never below the board's floor or what the player asked.
    const lo = Math.max(floor, Math.round(cur.releaseClause * 0.85), Math.min(ask.releaseClause ?? 0, cur.releaseClause));
    releaseClause = [lo, Math.max(lo, Math.round(cur.releaseClause * 1.25))];
  } else if (ask.releaseClause !== null) {
    // Club may concede a clause the player asked for, but not a cheaper one.
    const lo = Math.max(floor, ask.releaseClause);
    releaseClause = [lo, Math.round(lo * 1.5)];
  }

  const allowed = L.roles.length ? L.roles : [cur.role];
  const roles = [...new Set([cur.role, ask.role])].filter((r) => allowed.includes(r));
  return { wage, years, signingBonus, goalBonus, releaseClause, roles: roles.length ? roles : [cur.role] };
}

const roundMoney = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v / 100) * 100 : Math.round(v));
const inBand = (v: unknown, [lo, hi]: [number, number]) => clamp(roundMoney(num(v)), lo, hi);

export interface ProposedTerms {
  wage: number; years: number; releaseClause: number; role: string; signingBonus: number; goalBonus: number;
}

/** Clamp Claude's terms into the mandate, which itself lies inside `neg.limits`. */
export function clampTerms(p: ProposedTerms, neg: Negotiation, ask: ContractTerms): ContractTerms {
  const m = negotiationMandate(neg, ask);
  const cur = neg.current;
  let releaseClause = cur.releaseClause;
  if (m.releaseClause && num(p.releaseClause) > 0) releaseClause = inBand(p.releaseClause, m.releaseClause);
  if (releaseClause !== null && neg.limits.minReleaseClause !== null) releaseClause = Math.max(releaseClause, neg.limits.minReleaseClause);
  return {
    wage: Math.min(inBand(p.wage, m.wage), neg.limits.maxWage),
    years: Math.round(clamp(num(p.years) || cur.years, m.years[0], m.years[1])),
    releaseClause,
    role: m.roles.find((r) => r === String(p.role).trim().toLowerCase()) ?? cur.role,
    signingBonus: Math.min(inBand(p.signingBonus, m.signingBonus), neg.limits.maxSigningBonus),
    goalBonus: Math.min(inBand(p.goalBonus, m.goalBonus), neg.limits.maxGoalBonus),
  };
}

export function clampPatience(delta: unknown): number {
  return Math.round(clamp(num(delta), PATIENCE_DELTA[0], PATIENCE_DELTA[1]));
}

// ───────────────────────────── text ─────────────────────────────

/** Trim, normalise whitespace, drop markdown emphasis, cut at a word boundary. */
export function clip(s: unknown, max: number): string {
  const str = typeof s === 'string' ? s : '';
  const clean = str
    .replace(/\r\n?/g, '\n')
    .replace(/\*\*|__/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, '')}…`;
}

/** Single-line variant of clip (headlines, names, labels). Strips wrapping quotes. */
export function line(s: unknown, max: number): string {
  const one = (typeof s === 'string' ? s : '').replace(/\s+/g, ' ').trim().replace(/^["“”«»']+|["“”«»']+$/g, '');
  return clip(one, max);
}

const TR_ASCII: Record<string, string> = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ç: 'c', Ç: 'c', ö: 'o', Ö: 'o', ü: 'u', Ü: 'u' };

/** '@lowercase_handle', ≤ 20 chars after the @, ASCII only. */
export function sanitizeHandle(handle: unknown, fallbackName: string): string {
  const raw = (typeof handle === 'string' && handle.trim() ? handle : fallbackName) || 'fan';
  const ascii = raw
    .replace(/[ıİşŞğĞçÇöÖüÜ]/g, (c) => TR_ASCII[c] ?? c)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20);
  return `@${ascii || 'fan'}`;
}

export function validIcon(name: unknown): string {
  return typeof name === 'string' && ICON_NAMES.includes(name) ? name : 'sparkles';
}

/** Plausible engagement ceiling for a post given the player's audience. */
export function likesCap(followers?: number): number {
  return Math.round(Math.max(300, num(followers) * 0.25));
}
