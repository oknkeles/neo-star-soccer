/**
 * The event library in motion: which events can happen this week (conditions, cooldowns, weights) and what
 * happens when the player picks a choice (effects, risk roll, flags, storyline advance).
 */
import type { GameEvent, GameState } from '../core/types';
import type { Rng } from '../core/rng';
import { t } from '../core/i18n';
import { applyFx, makeEvent, type EventDef } from './eventkit';
import { buildFacts, type Facts } from './facts';
import { CULTURE_EVENTS } from './data/events_culture';
import { CAREER_EVENTS } from './data/events_career';
import { LIFE_EVENTS } from './data/events_life';
import { STORY_BEATS } from './data/story_beats';
import { onStoryEvent } from './storylines';
import './strings';

/** Everything the weekly lottery may draw from. */
export const EVENT_DEFS: EventDef[] = [...LIFE_EVENTS, ...CAREER_EVENTS, ...CULTURE_EVENTS];
const ALL_DEFS: EventDef[] = [...EVENT_DEFS, ...STORY_BEATS];
const BY_ID = new Map(ALL_DEFS.map((d) => [d.id, d]));
export const eventDefById = (id: string): EventDef | undefined => BY_ID.get(id);

const MAX_PENDING = 3;
const cdKey = (id: string) => `narr.cd.${id}`;

function eligible(def: EventDef, f: Facts, taken: Set<string>): boolean {
  if (taken.has(def.id)) return false;
  if (f.weeksSince(cdKey(def.id)) < def.cooldown) return false;
  try { return !!def.when(f); } catch { return false; }
}

function weightOf(def: EventDef, f: Facts): number {
  try {
    const w = typeof def.weight === 'function' ? def.weight(f) : def.weight;
    return Number.isFinite(w) && w > 0 ? w : 0;
  } catch { return 0; }
}

/** Pick 0–2 template events for this week (conditions, cooldowns, storylines). Pushes nothing — caller stores. */
export function weeklyEvents(state: GameState, rng: Rng): GameEvent[] {
  if (state.career?.retired) return [];
  const f = buildFacts(state);
  const pending = (state.events ?? []).filter((e) => !e.resolved);
  if (pending.length >= MAX_PENDING) return [];
  const roll = rng.next();
  const want = Math.min(roll < 0.3 ? 0 : roll < 0.88 ? 1 : 2, MAX_PENDING - pending.length);
  const taken = new Set(pending.map((e) => e.defId));
  const out: GameEvent[] = [];
  for (let i = 0; i < want; i++) {
    const pool = EVENT_DEFS.filter((d) => eligible(d, f, taken));
    if (!pool.length) break;
    const def = rng.weighted(pool, (d) => weightOf(d, f));
    taken.add(def.id);
    const story = def.story ? (state.storylines ?? []).find((s) => s.active && s.kind === def.story) : undefined;
    const ev = makeEvent(state, def, f, rng, story?.id);
    if (!ev.choices.length) continue;
    state.flags[cdKey(def.id)] = f.abs;
    out.push(ev);
  }
  return out;
}

/**
 * Resolve an event choice: applies effects (via career.applyEffects; risk rolls), sets
 * flags, advances linked storylines, marks event resolved. Returns localized result text.
 */
export function resolveEvent(state: GameState, eventId: string, choiceId: string, rng: Rng): string {
  const lang = state.lang === 'en' ? 'en' : 'tr';
  const ev = (state.events ?? []).find((e) => e.id === eventId);
  if (!ev) return t('narr.ev.missing', undefined, lang);
  if (ev.resolved) return ev.resolved.text;
  const ch = ev.choices.find((c) => c.id === choiceId);
  if (!ch) return t('narr.ev.missing', undefined, lang);

  applyFx(state, ch.effects ?? {});
  let text = ch.resultText ?? '';
  let riskHit = false;
  if (ch.risk && rng.chance(ch.risk.chance)) {
    riskHit = true;
    applyFx(state, ch.risk.effects ?? {});
    text = [text, ch.risk.text].filter(Boolean).join(' ');
  }

  const f = buildFacts(state);
  state.flags[cdKey(ev.defId)] = f.abs;
  const story = ev.storylineId ? (state.storylines ?? []).find((s) => s.id === ev.storylineId) ?? null : null;
  const def = eventDefById(ev.defId);
  try {
    def?.choices.find((c) => c.id === choiceId)?.then?.({ state, rng, facts: f, event: ev, choiceId, storyline: story, riskHit });
  } catch { /* a faulty hook must not eat the player's choice */ }
  try { onStoryEvent(state, rng, story, ev.defId, choiceId); } catch { /* same */ }

  ev.resolved = { choiceId, text };
  return text;
}
