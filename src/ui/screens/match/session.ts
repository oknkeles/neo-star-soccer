/**
 * Keeps the running LiveMatch per fixture for the lifetime of the page, so a remount of the
 * match screen (StrictMode, navigating away and back) resumes the same match instead of
 * starting a new one, and the post-match application happens exactly once.
 */
import type { MatchContext } from '../../../core/types';
import type { LiveMatch } from '../../../match/flow/api';
import { game } from '../../../game/api';

export interface MatchSession {
  fixtureId: string;
  ctx: MatchContext;
  live: LiveMatch;
  /** game.finishMatch() promise (created once). */
  applied: Promise<string[]> | null;
}

const sessions = new Map<string, MatchSession>();

export function openSession(fixtureId: string): MatchSession {
  const existing = sessions.get(fixtureId);
  if (existing) return existing;
  const { ctx, live } = game.startMatch(fixtureId);
  const s: MatchSession = { fixtureId, ctx, live, applied: null };
  sessions.set(fixtureId, s);
  return s;
}

/** Apply the finished match once; later calls return the same promise. */
export function applySession(s: MatchSession): Promise<string[]> {
  if (!s.applied) {
    const summary = s.live.summary();
    s.applied = game.finishMatch(s.fixtureId, summary).catch((e: unknown) => {
      s.applied = null; // allow a retry
      throw e;
    });
  }
  return s.applied;
}

export function closeSession(fixtureId: string): void {
  sessions.delete(fixtureId);
}
