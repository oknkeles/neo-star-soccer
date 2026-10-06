/**
 * Save format, trimming, migration and validation. Pure functions — no storage access.
 */
import type { GameEvent, GameState, InboxMessage } from '../core/types';
import { overall } from '../core/ratings';
import { fullName } from '../core/util';
import { t } from '../core/i18n';
import type { SaveMeta } from './api';

/** Current save schema. Bump + add a step in `migrateState` when the shape changes. */
export const SAVE_SCHEMA = 1;
export const SAVE_FORMAT = 'nss-save';

/** Slots are 0-based. */
export const SAVE_SLOTS = [0, 1, 2] as const;
export const SLOT_COUNT = SAVE_SLOTS.length;

export const saveKey = (slot: number) => `nss.save.${slot}`;
export const INDEX_KEY = 'nss.saves.index';

/** In-state caps (enforced weekly) and leaner caps for what goes to disk. */
export const CAPS = { news: 150, social: 200, inbox: 200, resolvedEvents: 30, matches: 200, chat: 40, offers: 40 } as const;
export const SAVE_CAPS = { news: 80, social: 100, inbox: 120, resolvedEvents: 15, matches: 200, chat: 40, offers: 30 } as const;

export interface SaveEnvelope { format: typeof SAVE_FORMAT; schema: number; savedAt: number; state: GameState }

export class SaveError extends Error {
  constructor(public code: 'invalid_json' | 'invalid' | 'newer' | 'missing', detail?: string) {
    super(t(`game.err.${code}`) + (detail ? ` (${detail})` : ''));
    this.name = 'SaveError';
  }
}

// ───────── trimming ─────────

/** Pending sponsor proposals live in flags under this prefix (JSON payload). */
export const SPONSOR_FLAG = 'game.sponsor:';

function isActionable(state: GameState, m: InboxMessage): boolean {
  if (!m.ref) return false;
  switch (m.ref.type) {
    case 'offer': {
      const o = state.offers.find((x) => x.id === m.ref!.id);
      return !!o && (o.status === 'pending' || o.status === 'negotiating');
    }
    case 'event': {
      const e = state.events.find((x) => x.id === m.ref!.id);
      return !!e && !e.resolved;
    }
    case 'sponsor':
      return typeof state.flags[SPONSOR_FLAG + m.ref.id] === 'string';
    case 'negotiation':
      return !!state.negotiation && state.negotiation.status === 'open';
    default:
      return false;
  }
}

/** Keep the inbox under `cap`: drop oldest read/non-actionable first, never actionable ones. */
export function trimInbox(state: GameState, list: InboxMessage[], cap: number): InboxMessage[] {
  if (list.length <= cap) return list;
  const keep = new Set<InboxMessage>(list);
  let excess = list.length - cap;
  const passes: ((m: InboxMessage) => boolean)[] = [
    (m) => m.read && !isActionable(state, m),
    (m) => !isActionable(state, m),
  ];
  for (const pass of passes) {
    for (const m of list) {
      if (excess <= 0) break;
      if (keep.has(m) && pass(m)) { keep.delete(m); excess--; }
    }
  }
  return list.filter((m) => keep.has(m));
}

/** Pending events + the most recent `resolvedCap` resolved ones (original order kept). */
export function trimEvents(list: GameEvent[], resolvedCap: number): GameEvent[] {
  const resolved = list.filter((e) => e.resolved);
  const drop = new Set(resolved.slice(0, Math.max(0, resolved.length - resolvedCap)));
  return list.filter((e) => !drop.has(e));
}

const tail = <T>(arr: T[] | undefined, n: number): T[] => (arr ? (arr.length > n ? arr.slice(arr.length - n) : arr) : []);

/** Enforce the in-memory caps on the live state (mutates). */
export function enforceCaps(state: GameState, caps: typeof CAPS | typeof SAVE_CAPS = CAPS): void {
  state.news = tail(state.news, caps.news);
  state.social = tail(state.social, caps.social);
  state.inbox = trimInbox(state, state.inbox, caps.inbox);
  state.events = trimEvents(state.events, caps.resolvedEvents);
  state.career.matches = tail(state.career.matches, caps.matches);
  const negId = state.negotiation?.offerId;
  const live = state.offers.filter((o) => o.status === 'pending' || o.status === 'negotiating' || o.id === negId);
  const done = state.offers.filter((o) => !live.includes(o));
  if (state.offers.length > caps.offers) state.offers = [...tail(done, Math.max(0, caps.offers - live.length)), ...live];
  if (state.chats) for (const k of Object.keys(state.chats)) state.chats[k] = tail(state.chats[k], caps.chat);
}

/**
 * Lean copy for disk: trims feeds (the world is kept whole). Shallow — nested objects are
 * shared with the live state, which is fine because storage serializes immediately.
 */
export function trimForSave(state: GameState): GameState {
  const copy: GameState = {
    ...state,
    news: tail(state.news, SAVE_CAPS.news),
    social: tail(state.social, SAVE_CAPS.social),
    inbox: trimInbox(state, state.inbox, SAVE_CAPS.inbox),
    events: trimEvents(state.events, SAVE_CAPS.resolvedEvents),
    career: { ...state.career, matches: tail(state.career.matches, SAVE_CAPS.matches) },
  };
  if (state.chats) copy.chats = Object.fromEntries(Object.entries(state.chats).map(([k, v]) => [k, tail(v, SAVE_CAPS.chat)]));
  return copy;
}

export function makeMeta(state: GameState, slot: number): SaveMeta {
  const p = state.world.players[state.career.playerId];
  const club = p?.clubId ? state.world.clubs[p.clubId] : null;
  return {
    slot,
    name: p ? fullName(p) : '?',
    club: club ? club.name : state.career.retired ? t('game.meta.retired') : t('game.meta.freeAgent'),
    season: state.season,
    week: state.week,
    overall: p ? overall(p) : 0,
    savedAt: state.savedAt || Date.now(),
  };
}

export function envelope(state: GameState): SaveEnvelope {
  return { format: SAVE_FORMAT, schema: SAVE_SCHEMA, savedAt: state.savedAt || Date.now(), state };
}

// ───────── migration & validation ─────────

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Accept an envelope or a bare GameState (older exports). */
export function unwrapSave(raw: unknown): unknown {
  if (isObj(raw) && raw.format === SAVE_FORMAT && 'state' in raw) return raw.state;
  return raw;
}

/** Bring any older state up to SAVE_SCHEMA. Mutates and returns it. Throws SaveError('newer'). */
export function migrateState(raw: unknown): GameState {
  if (!isObj(raw)) throw new SaveError('invalid', 'not an object');
  const s = raw as Loose;
  const schema = typeof s.schema === 'number' ? s.schema : 0;
  if (schema > SAVE_SCHEMA) throw new SaveError('newer', `schema ${schema}`);

  // v0 → v1: collections that early builds could omit.
  if (schema < 1) {
    for (const k of ['inbox', 'news', 'social', 'events', 'offers', 'storylines', 'seasons'] as const) {
      if (!Array.isArray(s[k])) s[k] = [];
    }
    if (!isObj(s.flags)) s.flags = {};
    if (!isObj(s.chats)) s.chats = {};
    if (!('negotiation' in s)) s.negotiation = null;
    if (typeof s.idCounter !== 'number') s.idCounter = 1;
    if (typeof s.lang !== 'string') s.lang = 'tr';
    if (typeof s.savedAt !== 'number') s.savedAt = 0;
    if (typeof s.createdAt !== 'number') s.createdAt = 0;
    const c = s.career;
    if (isObj(c)) {
      for (const k of ['inventory', 'sponsors', 'trophies', 'awards', 'history', 'matches', 'people'] as const) {
        if (!Array.isArray(c[k])) c[k] = [];
      }
      if (!isObj(c.xp)) c.xp = {};
      if (!isObj(c.setPieces)) c.setPieces = { freeKicks: false, penalties: false, corners: false };
    }
  }
  s.schema = SAVE_SCHEMA;
  return s as unknown as GameState;
}

/** Structural validation of a (migrated) state. Throws SaveError('invalid', reason). */
export function validateState(s: GameState): GameState {
  const fail = (why: string): never => { throw new SaveError('invalid', why); };
  if (!isObj(s)) fail('state');
  if (typeof s.id !== 'string') fail('id');
  if (typeof s.season !== 'number' || !Number.isFinite(s.season)) fail('season');
  if (typeof s.week !== 'number' || s.week < 0 || s.week > 52) fail('week');
  if (!Array.isArray(s.rng) || s.rng.length !== 4 || !s.rng.every((n) => typeof n === 'number' && Number.isFinite(n))) fail('rng');
  if (!isObj(s.world) || !isObj(s.world.players) || !isObj(s.world.clubs) || !Array.isArray(s.world.leagues)) fail('world');
  if (!isObj(s.competitions)) fail('competitions');
  if (!isObj(s.career) || typeof s.career.playerId !== 'string') fail('career');
  if (!s.world.players[s.career.playerId]) fail('user player');
  if (typeof s.career.money !== 'number' || !Number.isFinite(s.career.money)) fail('money');
  if (!isObj(s.career.relationships)) fail('relationships');
  if (!isObj(s.career.genesis)) fail('genesis');
  for (const k of ['inbox', 'news', 'social', 'events', 'offers', 'storylines', 'seasons'] as const) {
    if (!Array.isArray(s[k])) fail(k);
  }
  if (!isObj(s.flags)) fail('flags');
  return s;
}

/** Envelope/raw → migrated + validated GameState. */
export function parseSave(raw: unknown): GameState {
  return validateState(migrateState(unwrapSave(raw)));
}

export function parseSaveJson(json: string): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SaveError('invalid_json');
  }
  return parseSave(raw);
}

export function isSaveMeta(v: unknown): v is SaveMeta {
  return isObj(v) && typeof v.slot === 'number' && typeof v.name === 'string' && typeof v.season === 'number';
}
