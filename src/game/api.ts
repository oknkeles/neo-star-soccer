/**
 * GAME CONTROLLER — the single entry point the UI uses. Owns the GameState, the weekly
 * loop orchestration across modules, persistence (IndexedDB, 3 slots + autosave), and a
 * tiny external store for React (useSyncExternalStore). Owner: game agent.
 *
 * Rules: every mutating method ends with `commit()` (bumps version → React re-renders,
 * schedules autosave). Async methods (narrator calls) must never leave the state half-applied.
 *
 * Implementation: ./controller.ts (GameController), ./agenda.ts (read-only week views),
 * ./genesis.ts (new career), ./narration.ts (narrator plumbing), ./persist.ts + ./storage.ts (saves).
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type {
  Appearance, CameraMode, Fixture, Foot, GameEvent, GameState, NationCode, PlayablePosition, Settings, TraitId, WeekInfo,
  UserMatchRole,
} from '../core/types';
import type { PressEvaluation, PressOccasion, PressQuestion } from '../core/narrative-types';
import { getSettings, onSettingsChange } from '../core/settings';
import { GameController, type GameNotice } from './controller';
import './strings';

export interface NewCareerOptions {
  firstName: string;
  lastName: string;
  nickname?: string;
  nation: NationCode;
  position: PlayablePosition;
  foot: Foot;
  appearance: Appearance;
  /** One chosen personality trait; genesis adds 1–2 hidden/random ones. */
  trait: TraitId;
  seed?: number;
}

export interface SaveMeta { slot: number; name: string; club: string; season: number; week: number; overall: number; savedAt: number }

export interface Agenda {
  week: WeekInfo;
  fixtures: { fixture: Fixture; role: UserMatchRole; opponent: string; home: boolean; compName: string }[];
  /** Fixtures that still need to be played by the user this week, in order. */
  pendingMatches: string[];
  pendingEvents: GameEvent[];
  unread: number;
  actionsLeft: number;
  canAdvance: boolean;
  /** Localized reasons blocking advance (e.g. 'Choose a club first', 'Play your match'). */
  blockers: string[];
  pressAvailable: PressOccasion | null;
  needsClub: boolean;         // new career: must accept a trial offer first
}

export interface PressSession { id: string; occasion: PressOccasion; questions: PressQuestion[]; answered: Record<string, PressEvaluation> }

export { GameController };
export { GameBlockedError, MAX_PENDING_EVENTS } from './controller';
export type { GameControllerOptions, GameNotice, NoticeKind, NoticeTone } from './controller';
export { memoryStorage, idbStorage, autoStorage, indexedDbAvailable, type SaveStorage } from './storage';
export { SaveError, SAVE_SCHEMA, SAVE_SLOTS, SLOT_COUNT, CAPS, SAVE_CAPS } from './persist';
export { isBigFixture } from './agenda';

export const game = new GameController();

// Stable references for useSyncExternalStore (re-subscribing on every render is wasteful).
const subscribeGame = (fn: () => void) => game.subscribe(fn);
const gameSnapshot = () => game.getSnapshot();
const subscribeSettings = (fn: () => void) => {
  const off = onSettingsChange(() => fn());
  return () => { off(); };
};

/**
 * React: subscribe to game state changes. The state object is mutated in place, so the
 * snapshot is a fresh `{ state, version }` object per committed version.
 */
export function useGame(): { state: GameState | null; version: number } {
  return useSyncExternalStore(subscribeGame, gameSnapshot, gameSnapshot);
}

/** React: current settings (re-renders on change). */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings);
}

/** React: run `handler` for every toast-worthy game notice (offers, call-ups, trophies …). */
export function useGameNotices(handler: (n: GameNotice) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => game.onNotice((n) => ref.current(n)), []);
}

export type { CameraMode };
