/** Shared helpers for the shell module: language hook, safe selectors, formatting, event-modal store. */
import { useMemo, useSyncExternalStore } from 'react';
import type { Club, Footballer, GameState, InboxKind, Kit, Lang, Position } from '../../../core/types';
import { getLang, onLangChange, t } from '../../../core/i18n';
import { formatMoney, formatNumber } from '../../../core/util';
import { game, useGame, type Agenda } from '../../../game/api';

// ───────── language ─────────

/** Re-render when the UI language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => onLangChange(() => cb()),
    getLang,
    getLang,
  );
}

/** Compact money. Turkish spells the units out ("€850 bin", "€1,2 Mn") — a bare "B" reads as billion. */
export function money(v: number): string {
  const lang = getLang();
  if (lang !== 'tr') return formatMoney(v, lang);
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  const f = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
  if (a >= 1e9) return `${sign}€${f(a / 1e9)} Mr`;
  if (a >= 1e6) return `${sign}€${f(a / 1e6)} Mn`;
  if (a >= 1e4) return `${sign}€${Math.round(a / 1e3)} bin`;
  if (a >= 1e3) return `${sign}€${f(a / 1e3)} bin`;
  return `${sign}€${Math.round(a)}`;
}
export const num = (v: number) => formatNumber(v, getLang());

export function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : t('shell.err.generic');
}

/** Run `fn`; return `fallback` when it throws (other modules may still be settling). */
export function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(getLang() === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat(getLang() === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

// ───────── state selectors ─────────

export const DEFAULT_KIT: Kit = { primary: '#2a4436', secondary: '#b8ff3c', style: 'plain' };

export interface TeamView { name: string; shortName: string; kit: Kit; reputation: number }

/** Name / kit of a club or national team id, straight from the world (no module calls). */
export function teamView(state: GameState, id: string): TeamView {
  const c = state.world.clubs[id];
  if (c) return { name: c.name, shortName: c.shortName, kit: c.kit, reputation: c.reputation };
  const nt = state.world.nationalTeams[id];
  if (nt) {
    const name = nt.name[getLang()] ?? nt.name.en;
    return { name, shortName: nt.nation.slice(0, 3).toUpperCase(), kit: nt.kit, reputation: nt.reputation };
  }
  return { name: id, shortName: id.slice(0, 3).toUpperCase(), kit: DEFAULT_KIT, reputation: 50 };
}

export interface UserView { player: Footballer; club: Club | null }

export function userView(state: GameState | null): UserView | null {
  if (!state) return null;
  const player = state.world.players[state.career.playerId];
  if (!player) return null;
  return { player, club: player.clubId ? state.world.clubs[player.clubId] ?? null : null };
}

export function leagueNameOf(state: GameState, club: Club | null): string {
  if (!club) return '';
  return state.world.leagues.find((l) => l.country === club.country && l.tier === club.tier)?.name ?? '';
}

export const posName = (pos: Position) => t(`shell.pos.${pos}`);
export const posShort = (pos: Position) => t(`shell.posShort.${pos}`);

/** The Agenda for the current state (recomputed per committed version; never throws). */
export function useAgenda(): Agenda | null {
  const { state, version } = useGame();
  return useMemo(() => {
    if (!state) return null;
    try {
      return game.agenda();
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, version]);
}

/** True when an icon string is an emoji / non-identifier (events may carry emoji instead of a lucide key). */
export const isEmoji = (s: string) => /[^\x00-\x7f]/.test(s);

export function relativeWeek(state: GameState, season: number, week: number): string {
  const diff = (state.season - season) * 52 + (state.week - week);
  if (diff <= 0) return t('shell.time.now');
  if (diff === 1) return t('shell.time.week1');
  if (diff < 52) return t('shell.time.weeks', { n: diff });
  return t('shell.time.season', { s: `${season}/${String((season + 1) % 100).padStart(2, '0')}` });
}

// ───────── event modal store (who opens the choice modal) ─────────

let focusedEvent: string | null = null;
const snoozed = new Set<string>();
let evVersion = 0;
const evListeners = new Set<() => void>();
const emitEv = () => { evVersion++; evListeners.forEach((l) => l()); };

/** Open the choice modal for a specific pending event (Hub banner, Inbox). */
export function openEvent(id: string): void {
  snoozed.delete(id);
  focusedEvent = id;
  emitEv();
}
/** Hide the modal for now ("decide later"); the event stays pending. */
export function snoozeEvent(id: string): void {
  snoozed.add(id);
  if (focusedEvent === id) focusedEvent = null;
  emitEv();
}
export function clearFocusedEvent(): void {
  if (focusedEvent !== null) { focusedEvent = null; emitEv(); }
}
/** Un-snooze everything (new week). */
export function resetEventSnooze(): void {
  if (snoozed.size) { snoozed.clear(); emitEv(); }
}

export function useEventFocus(): { focused: string | null; snoozed: ReadonlySet<string> } {
  useSyncExternalStore((cb) => { evListeners.add(cb); return () => { evListeners.delete(cb); }; }, () => evVersion, () => evVersion);
  return { focused: focusedEvent, snoozed };
}

// ───────── inbox kinds ─────────


export const KIND_ICON: Record<InboxKind, string> = {
  offer: 'handshake', event: 'sparkles', info: 'info', sponsor: 'dollar_badge', callup: 'flag', award: 'trophy',
  contract: 'briefcase', manager: 'user', press: 'mic', injury: 'hospital', story: 'book_open',
};
export const KIND_TONE: Record<InboxKind, 'accent' | 'gold' | 'danger' | 'info' | 'violet'> = {
  offer: 'gold', event: 'violet', info: 'info', sponsor: 'gold', callup: 'accent', award: 'gold',
  contract: 'gold', manager: 'info', press: 'violet', injury: 'danger', story: 'accent',
};
export const TONE_TEXT = { accent: 'text-accent', gold: 'text-gold', danger: 'text-danger', info: 'text-info', violet: 'text-violet' } as const;
export const TONE_BG = { accent: 'bg-accent/12', gold: 'bg-gold/12', danger: 'bg-danger/12', info: 'bg-info/12', violet: 'bg-violet/12' } as const;
