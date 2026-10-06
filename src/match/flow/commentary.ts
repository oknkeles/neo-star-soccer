import type { MatchEventKind } from '../../core/types';
import type { Rng } from '../../core/rng';
import { hasKey, t } from '../../core/i18n';
import { matchCommentary } from '../../narrative/api';
import './strings';

export interface CommentaryData { player?: string; team?: string; minute: number; score?: string; extra?: string }
export type CommentaryFn = (kind: MatchEventKind, data: CommentaryData, rng: Rng) => string;

/** Pick one of the numbered variants `match.<prefix>.0..n` and fill params. */
export function variant(prefix: string, data: CommentaryData, rng: Rng): string {
  let n = 0;
  while (hasKey(`match.${prefix}.${n}`)) n++;
  const key = n > 0 ? `match.${prefix}.${rng.int(0, n - 1)}` : `match.${prefix}`;
  return t(key, toParams(data));
}

export function toParams(data: CommentaryData): Record<string, string | number> {
  return {
    player: data.player ?? '',
    team: data.team ?? '',
    minute: data.minute,
    score: data.score ?? '',
    extra: data.extra ?? '',
  };
}

/** Local templates used when the narrative module is unavailable or returns nothing. */
export const fallbackCommentary: CommentaryFn = (kind, data, rng) => variant(`c.${kind}`, data, rng);

const broken = new Set<MatchEventKind>();

/**
 * Commentary through narrative.matchCommentary with a local fallback. Never throws.
 * A kind whose narrative call throws is served locally for the rest of the session.
 */
export const defaultCommentary: CommentaryFn = (kind, data, rng) => {
  if (!broken.has(kind)) {
    try {
      const line = matchCommentary(kind, data, rng);
      if (typeof line === 'string' && line.trim().length > 0) return line;
    } catch {
      broken.add(kind);
    }
  }
  return fallbackCommentary(kind, data, rng);
};
