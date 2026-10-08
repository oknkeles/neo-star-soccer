/**
 * Pure helpers for the match & drill screens (kept DOM-free where possible so they are testable).
 */
import type {
  AttrKey, CameraMode, Fixture, GameState, MatchContext, MatchEvent, MatchEventKind, MomentOutcome, MomentResult,
  MomentSetup, TeamSheet, WeatherKind,
} from '../../../core/types';
import { Rng } from '../../../core/rng';
import { clamp } from '../../../core/util';
import type { DrillType, Period } from '../../../match/flow/api';

export type Grade = 'legend' | 'great' | 'good' | 'ok' | 'poor' | 'awful';

export function ratingGrade(r: number): Grade {
  if (r >= 9) return 'legend';
  if (r >= 8) return 'great';
  if (r >= 7) return 'good';
  if (r >= 6) return 'ok';
  if (r >= 5) return 'poor';
  return 'awful';
}

/** Tailwind text colour for a match rating. */
export function ratingClass(r: number): string {
  const g = ratingGrade(r);
  return g === 'legend' || g === 'great' ? 'text-gold' : g === 'good' ? 'text-accent' : g === 'ok' ? 'text-info' : g === 'poor' ? 'text-ink-dim' : 'text-danger';
}

/** Background chip colour for a match rating. */
export function ratingChip(r: number): string {
  const g = ratingGrade(r);
  return g === 'legend' || g === 'great' ? 'bg-gold text-bg' : g === 'good' ? 'bg-accent text-bg' : g === 'ok' ? 'bg-info/80 text-bg' : g === 'poor' ? 'bg-white/15 text-ink' : 'bg-danger text-white';
}

/** Real milliseconds per simulated minute (~0.35 s at ×1; shoot-out kicks are slower for drama). */
export function tickDelay(speed: number, period: Period): number {
  const s = clamp(Number.isFinite(speed) && speed > 0 ? speed : 1, 0.5, 4);
  if (period === 'pens') return Math.round(1150 / Math.sqrt(s));
  return Math.round(350 / s);
}

/** Crowd bed level 0..1 from momentum (0..1 toward home), stakes and the clock. */
export function crowdLevel(momentum: number, importance: number, minute: number, attendance: number): number {
  const fill = clamp(attendance / 40000, 0.25, 1);
  const tension = Math.abs(momentum - 0.5) * 0.7;
  const late = minute >= 80 ? 0.12 : 0;
  return clamp((0.22 + importance * 0.22 + tension + late) * (0.55 + fill * 0.45), 0.08, 0.95);
}

export const GOAL_KINDS: MatchEventKind[] = ['goal', 'penalty_goal', 'own_goal'];
export const isGoal = (e: MatchEvent) => GOAL_KINDS.includes(e.kind);

export interface ScorerLine { playerId: string; minutes: string[]; pen: boolean; og: boolean }

/** Goal scorers of one side, grouped by player, in order of the first goal. */
export function scorersOf(events: MatchEvent[], side: 'home' | 'away', clock: (e: MatchEvent) => string): ScorerLine[] {
  const out: ScorerLine[] = [];
  for (const e of events) {
    if (!isGoal(e) || e.side !== side || !e.playerId) continue;
    let line = out.find((l) => l.playerId === e.playerId && l.og === (e.kind === 'own_goal'));
    if (!line) {
      line = { playerId: e.playerId, minutes: [], pen: false, og: e.kind === 'own_goal' };
      out.push(line);
    }
    line.minutes.push(clock(e) + (e.kind === 'penalty_goal' ? ' (P)' : e.kind === 'own_goal' ? ' (OG)' : ''));
    if (e.kind === 'penalty_goal') line.pen = true;
  }
  return out;
}

/** XP gains sorted biggest first (positive only). */
export function xpEntries(xp: Partial<Record<AttrKey, number>> | undefined): [AttrKey, number][] {
  return (Object.entries(xp ?? {}) as [AttrKey, number][])
    .filter(([, v]) => typeof v === 'number' && v > 0)
    .sort((a, b) => b[1] - a[1]);
}

/** Shirt numbers for a team sheet (national teams number their squad 1..n). */
export function shirtNumbers(state: GameState | null, sheet: TeamSheet): Record<string, number> {
  const out: Record<string, number> = {};
  const national = !!state?.world.nationalTeams[sheet.teamId];
  [...sheet.xi, ...sheet.bench].forEach((id, i) => {
    out[id] = national ? i + 1 : state?.world.players[id]?.shirtNumber ?? i + 1;
  });
  return out;
}

export type Stakes = 'final' | 'derby' | 'knockout' | 'big' | 'normal';

export function matchStakes(ctx: MatchContext, fixture: Fixture | null | undefined): Stakes {
  const round = (fixture?.roundName ?? '').toLowerCase();
  if (ctx.knockout && /(^|\s)(final|finali|finale)$/.test(round) && !/semi|yarı|quarter|çeyrek/.test(round)) return 'final';
  if (ctx.derby) return 'derby';
  if (ctx.knockout) return 'knockout';
  if (ctx.importance >= 0.7) return 'big';
  return 'normal';
}

export function weatherIcon(kind: WeatherKind, time: 'day' | 'dusk' | 'night'): string {
  if (kind === 'clear') return time === 'night' ? 'moon' : time === 'dusk' ? 'sunset' : 'sun';
  return kind;
}

/** Deterministic but week-dependent seed for a training drill. */
export function drillSeed(state: GameState, type: DrillType, salt = 0): number {
  const idx = type === 'drill_free_kick' ? 1 : type === 'drill_finishing' ? 2 : 3;
  const base = (state.seed ^ Math.imul(state.season * 64 + state.week + 1, 0x9e3779b1)) >>> 0;
  return (base ^ Math.imul(idx * 131 + salt * 7919 + 17, 0x85ebca6b)) >>> 0;
}

/** Rng for resolving a moment from the UI (deterministic per moment). */
export function momentRng(setup: MomentSetup, salt = 0): Rng {
  return new Rng((setup.seed ^ 0x2545f491 ^ Math.imul(salt + 1, 0x27d4eb2d)) >>> 0);
}

export type ResultTone = 'great' | 'good' | 'neutral' | 'bad';

/** How a moment result should feel in the UI. */
export function resultTone(r: Pick<MomentResult, 'outcome' | 'goalFor' | 'goalAgainst' | 'ratingDelta'>): ResultTone {
  if (r.goalAgainst) return 'bad';
  if (r.goalFor) return 'great';
  const good: MomentOutcome[] = ['chance_created', 'foul_won', 'penalty_won', 'tackle_won', 'interception', 'pass_completed', 'cleared', 'woodwork', 'saved'];
  if (good.includes(r.outcome) && r.ratingDelta >= 0) return 'good';
  if (r.ratingDelta < -0.15) return 'bad';
  return 'neutral';
}

export const CAMERAS: CameraMode[] = ['behind', 'broadcast', 'top'];
export const nextCamera = (c: CameraMode): CameraMode => CAMERAS[(CAMERAS.indexOf(c) + 1) % CAMERAS.length];

export const SPEEDS = [1, 2, 4] as const;

/** localStorage flag helpers (never throw). */
export function readFlag(key: string): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1'; } catch { return false; }
}
export function writeFlag(key: string): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, '1'); } catch { /* private mode */ }
}
export const HELP_FLAG = 'nss.momentHelp.v3';

/** Can this browser create a WebGL context? */
export function hasWebGL(): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
