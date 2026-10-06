/**
 * Event kit: the data shape of template events, how a definition becomes a concrete
 * GameEvent for this career, and a defensive effects bridge to the career module.
 */
import type { Effects, EventChoice, GameEvent, GameState, Lang, RelKey, Storyline } from '../core/types';
import type { Rng } from '../core/rng';
import { clamp, formatMoney, nextId } from '../core/util';
import * as career from '../career/api';
import { fill, type Loc, type Slots } from './grammar';
import { baseSlots, type Facts } from './facts';
import { userOf } from './safe';

export type Fx = Effects | ((f: Facts) => Effects);

export interface ResolveCtx {
  state: GameState;
  rng: Rng;
  facts: Facts;
  event: GameEvent;
  choiceId: string;
  storyline: Storyline | null;
  riskHit: boolean;
}

export interface ChoiceDef {
  id: string;
  label: Loc;
  result: Loc;
  fx: Fx;
  risk?: { chance: number | ((f: Facts) => number); fx: Fx; text: Loc };
  /** Only offer this choice when true (e.g. needs money). */
  when?: (f: Facts) => boolean;
  /** Extra state changes after the effects (storyline steps, flags, people). */
  then?: (ctx: ResolveCtx) => void;
}

export interface EventDef {
  id: string;
  icon: string;
  title: Loc;
  body: Loc;
  choices: ChoiceDef[];
  when: (f: Facts) => boolean;
  /** Base weight (or a function of the facts). */
  weight: number | ((f: Facts) => number);
  /** Weeks before this event may appear again. */
  cooldown: number;
  persona?: (f: Facts) => string;
  slots?: (f: Facts, rng: Rng) => Slots;
  /** Storyline kind this event belongs to (attached as storylineId when active). */
  story?: string;
}

export const L = (tr: string, en: string): Loc => ({ tr, en });

export function choice(id: string, label: Loc, result: Loc, fx: Fx, extra: Partial<ChoiceDef> = {}): ChoiceDef {
  return { id, label, result, fx, ...extra };
}

export const money = (f: Facts, v: number) => formatMoney(Math.abs(v), f.lang);

const resolveFx = (fx: Fx, f: Facts): Effects => {
  try {
    return typeof fx === 'function' ? fx(f) : fx;
  } catch {
    return {};
  }
};

/** Concrete, serializable event for this career from a definition. */
export function makeEvent(state: GameState, def: EventDef, f: Facts, rng: Rng, storylineId?: string, extraSlots: Slots = {}): GameEvent {
  const lang: Lang = f.lang;
  let own: Slots = {};
  try { own = def.slots ? def.slots(f, rng) : {}; } catch { own = {}; }
  const slots: Slots = { ...baseSlots(f), ...own, ...extraSlots };
  const text = (loc: Loc) => fill(loc[lang] || loc.en, slots, rng, lang);
  const choices: EventChoice[] = def.choices
    .filter((c) => { try { return !c.when || c.when(f); } catch { return false; } })
    .map((c) => {
      const out: EventChoice = { id: c.id, label: text(c.label), effects: resolveFx(c.fx, f), resultText: text(c.result) };
      if (c.risk) {
        const chance = typeof c.risk.chance === 'function' ? c.risk.chance(f) : c.risk.chance;
        out.risk = { chance: clamp(chance, 0, 1), effects: resolveFx(c.risk.fx, f), text: text(c.risk.text) };
      }
      return out;
    });
  let persona: string | undefined;
  try { persona = def.persona?.(f) || undefined; } catch { persona = undefined; }
  const ev: GameEvent = {
    id: nextId(state, 'EV'),
    defId: def.id,
    season: f.season,
    week: f.week,
    title: text(def.title),
    body: text(def.body),
    icon: def.icon,
    choices,
    source: 'template',
  };
  if (persona) ev.persona = persona;
  if (storylineId) ev.storylineId = storylineId;
  return ev;
}

// ───────── effects bridge ─────────

const REL_KEYS: RelKey[] = ['manager', 'teammates', 'fans', 'media', 'family', 'partner', 'agent', 'sponsors'];

/** Minimal local application, used only if the career module is unavailable. */
function applyLocally(state: GameState, e: Effects): string[] {
  const c = state.career;
  const p = userOf(state);
  const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (fin(e.money)) c.money = Math.round(c.money + e.money);
  if (fin(e.fame)) c.fame = clamp(c.fame + e.fame, 0, 100);
  if (fin(e.followers)) c.followers = Math.max(0, Math.round(c.followers + e.followers));
  if (fin(e.energy)) c.energy = clamp(c.energy + e.energy, 0, 100);
  if (p && fin(e.morale)) p.morale = clamp(p.morale + e.morale, 0, 100);
  if (p && fin(e.form)) p.form = clamp(p.form + e.form, 0, 100);
  if (e.rel) {
    for (const k of REL_KEYS) {
      const d = e.rel[k];
      if (!fin(d) || (k === 'partner' && !c.partnerId)) continue;
      c.relationships[k] = clamp(c.relationships[k] + d, 0, 100);
    }
  }
  if (p && fin(e.injuryWeeks) && e.injuryWeeks > 0) {
    if (p.injury) p.injury.weeksLeft += Math.round(e.injuryWeeks);
    else p.injury = { key: 'knock', weeksLeft: Math.round(e.injuryWeeks), severity: 1 };
  }
  if (e.flags) for (const [k, v] of Object.entries(e.flags)) state.flags[k] = v;
  return [];
}

/** Apply effects through career.applyEffects (which clamps), falling back to a local version. */
export function applyFx(state: GameState, e: Effects): string[] {
  if (!e || Object.keys(e).length === 0) return [];
  try {
    return career.applyEffects(state, e) ?? [];
  } catch {
    try { return applyLocally(state, e); } catch { return []; }
  }
}
