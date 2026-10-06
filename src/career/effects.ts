/**
 * Bounded side effects on the user's life. Every meter is clamped; untrusted effects
 * (LLM events, press answers) are sanitized first.
 */
import type { AttrKey, Effects, GameState, RelKey } from '../core/types';
import { getLang, t } from '../core/i18n';
import { clamp, formatMoney, formatNumber } from '../core/util';
import { ATTR_KEYS } from '../core/ratings';
import { MONEY_FLOOR, REL_KEYS } from './model';
import { round1, userPlayer } from './helpers';
import { applyXp } from './xp';
import { injuryForWeeks } from './injuries';

const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

function meterNote(delta: number, label: string, decimals = 0): string | null {
  const v = decimals ? round1(delta) : Math.round(delta);
  if (v === 0) return null;
  return `${signed(v)} ${label}`;
}

/** Keep the partner/agent Person records in sync with the relationship meters. */
function syncPeople(state: GameState): void {
  const c = state.career;
  for (const person of c.people) {
    if (c.partnerId && person.id === c.partnerId) person.relationship = Math.round(c.relationships.partner);
    else if (person.role === 'agent') person.relationship = Math.round(c.relationships.agent);
  }
}

export function applyEffects(state: GameState, effects: Effects): string[] {
  const c = state.career;
  const p = userPlayer(state);
  const notes: string[] = [];
  const lang = getLang();

  if (effects.money && Number.isFinite(effects.money)) {
    const before = c.money;
    let next = before + effects.money;
    // debts stop at the floor (and never deepen if somehow already below it)
    if (effects.money < 0) next = Math.max(Math.min(before, MONEY_FLOOR), next);
    c.money = Math.round(next);
    const d = c.money - before;
    if (d !== 0) notes.push(`${d > 0 ? '+' : '-'}${formatMoney(Math.abs(d), lang)}`);
  }
  if (effects.fame && Number.isFinite(effects.fame)) {
    const before = c.fame;
    c.fame = round1(clamp(c.fame + effects.fame, 0, 100));
    const n = meterNote(c.fame - before, t('common.fame'), 1);
    if (n) notes.push(n);
  }
  if (effects.followers && Number.isFinite(effects.followers)) {
    const before = c.followers;
    c.followers = Math.max(0, Math.round(c.followers + effects.followers));
    const d = c.followers - before;
    if (d !== 0) notes.push(`${d > 0 ? '+' : '-'}${formatNumber(Math.abs(d), lang)} ${t('common.followers')}`);
  }
  if (effects.energy && Number.isFinite(effects.energy)) {
    const before = c.energy;
    c.energy = round1(clamp(c.energy + effects.energy, 0, 100));
    const n = meterNote(c.energy - before, t('common.energy'));
    if (n) notes.push(n);
  }
  if (effects.morale && Number.isFinite(effects.morale)) {
    const before = p.morale;
    p.morale = round1(clamp(p.morale + effects.morale, 0, 100));
    const n = meterNote(p.morale - before, t('common.morale'));
    if (n) notes.push(n);
  }
  if (effects.form && Number.isFinite(effects.form)) {
    const before = p.form;
    p.form = round1(clamp(p.form + effects.form, 0, 100));
    const n = meterNote(p.form - before, t('common.form'));
    if (n) notes.push(n);
  }
  if (effects.rel) {
    for (const k of REL_KEYS) {
      const d = effects.rel[k];
      if (!d || !Number.isFinite(d)) continue;
      if (k === 'partner' && !c.partnerId) continue;
      const before = c.relationships[k];
      c.relationships[k] = round1(clamp(before + d, 0, 100));
      const n = meterNote(c.relationships[k] - before, t(`common.rel.${k}`));
      if (n) notes.push(n);
    }
    syncPeople(state);
  }
  if (effects.xp) {
    for (const pn of applyXp(state, effects.xp)) notes.push(`+${pn.delta} ${t(`common.attr.${pn.attr}`)}`);
  }
  if (effects.injuryWeeks && Number.isFinite(effects.injuryWeeks)) {
    const w = Math.round(effects.injuryWeeks);
    if (w > 0) {
      if (p.injury) p.injury.weeksLeft += w;
      else p.injury = injuryForWeeks(w);
      notes.push(t('career.note.injury', { n: p.injury.weeksLeft }));
    } else if (w < 0 && p.injury) {
      const cut = Math.min(-w, p.injury.weeksLeft);
      p.injury.weeksLeft -= cut;
      if (p.injury.weeksLeft <= 0) p.injury = null;
      notes.push(t('career.note.injuryShorter', { n: cut }));
    }
  }
  if (effects.flags) {
    for (const [k, v] of Object.entries(effects.flags)) state.flags[k] = v;
  }
  return notes;
}

// ───────── sanitizing untrusted effects ─────────

const LIMITS = { rel: 10, fame: 5, energy: 30, morale: 15, form: 15, followers: 250_000, xp: 15, injuryMax: 4, injuryMin: -2 };

function lim(v: unknown, max: number, min = -max): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const out = clamp(v, min, max);
  return out === 0 ? undefined : out;
}

/**
 * Clamp untrusted effects. `scale` multiplies every numeric value before clamping.
 * Money is bounded to ±€50K here; use `sanitizeEffectsFor` to allow 5% of current money.
 */
export function sanitizeEffects(effects: Effects, scale = 1, moneyLimit = 50_000): Effects {
  const s = Number.isFinite(scale) ? clamp(scale, 0, 3) : 1;
  const e = (effects ?? {}) as Effects;
  const out: Effects = {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v * s : undefined);

  const money = lim(num(e.money), moneyLimit);
  if (money !== undefined) out.money = Math.round(money);
  const fame = lim(num(e.fame), LIMITS.fame);
  if (fame !== undefined) out.fame = round1(fame);
  const followers = lim(num(e.followers), LIMITS.followers);
  if (followers !== undefined) out.followers = Math.round(followers);
  const energy = lim(num(e.energy), LIMITS.energy);
  if (energy !== undefined) out.energy = Math.round(energy);
  const morale = lim(num(e.morale), LIMITS.morale);
  if (morale !== undefined) out.morale = Math.round(morale);
  const form = lim(num(e.form), LIMITS.form);
  if (form !== undefined) out.form = Math.round(form);

  if (e.rel && typeof e.rel === 'object') {
    const rel: Partial<Record<RelKey, number>> = {};
    for (const k of REL_KEYS) {
      const v = lim(num(e.rel[k]), LIMITS.rel);
      if (v !== undefined) rel[k] = Math.round(v);
    }
    if (Object.keys(rel).length) out.rel = rel;
  }
  if (e.xp && typeof e.xp === 'object') {
    const xp: Partial<Record<AttrKey, number>> = {};
    for (const k of ATTR_KEYS) {
      const v = lim(num(e.xp[k]), LIMITS.xp);
      if (v !== undefined) xp[k] = Math.round(v);
    }
    if (Object.keys(xp).length) out.xp = xp;
  }
  const inj = lim(num(e.injuryWeeks), LIMITS.injuryMax, LIMITS.injuryMin);
  if (inj !== undefined && Math.round(inj) !== 0) out.injuryWeeks = Math.round(inj);

  if (e.flags && typeof e.flags === 'object') {
    const flags: Record<string, string | number | boolean> = {};
    let n = 0;
    for (const [k, v] of Object.entries(e.flags)) {
      if (n >= 8 || typeof k !== 'string' || k.length > 48) continue;
      if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) flags[k] = v;
      else if (typeof v === 'string') flags[k] = v.slice(0, 64);
      else continue;
      n++;
    }
    if (n) out.flags = flags;
  }
  return out;
}

/** Like `sanitizeEffects` but money may reach max(€50K, 5% of the current balance). */
export function sanitizeEffectsFor(state: GameState, effects: Effects, scale = 1): Effects {
  return sanitizeEffects(effects, scale, Math.max(50_000, Math.abs(state.career.money) * 0.05));
}

export function relationshipLabel(value: number): string {
  const v = Number.isFinite(value) ? value : 50;
  const key = v < 15 ? 'hostile' : v < 30 ? 'strained' : v < 45 ? 'distant' : v < 60 ? 'neutral' : v < 75 ? 'good' : v < 90 ? 'close' : 'inseparable';
  return t(`career.rel.${key}`);
}
