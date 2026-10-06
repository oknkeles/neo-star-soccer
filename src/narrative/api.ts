/**
 * NARRATIVE module — the offline, procedural storyteller. Works with no network and
 * no API key, and must still make every career feel different:
 *  - templateNarrator: implements the Narrator contract with rich, varied template
 *    grammars in TR + EN (genesis/backstory, news articles, social posts, press
 *    conferences, negotiation lines, events, chat replies, biography).
 *  - an event library (60+ events with conditions, choices, risks) and multi-stage
 *    storylines (rival, mentor, hometown return, manager feud, love story, scandal,
 *    injury comeback, wonderkid threat, agent drama, golden generation …).
 *  - match commentary lines for the live ticker and real-time moments.
 * Owner: narrative agent.
 */
import type { MatchEvent, MatchEventKind, MomentEvent } from '../core/types';
import type { Rng } from '../core/rng';
import { getLang } from '../core/i18n';
import { matchCommentary as matchLine, momentCommentary as momentLine } from './commentary';
import './strings';

/** Compact snapshot of the career for narrators (both template and Claude). */
export { buildNarrativeContext } from './context';

/** Procedural narrator (never rejects). */
export { templateNarrator } from './narrator';

/** Pick 0–2 template events for this week (conditions, cooldowns, storylines). Pushes nothing — caller stores. */
export { weeklyEvents } from './events';

/**
 * Resolve an event choice: applies effects (via career.applyEffects; risk rolls), sets
 * flags, advances linked storylines, marks event resolved. Returns localized result text.
 */
export { resolveEvent } from './events';

export type { StoryTrigger } from './storylines';

/** Start/advance storylines. Returns events to present (caller stores them) and news seeds. */
export { updateStorylines } from './storylines';

/** Initial storylines for a new career (rival + mentor + 1–2 random arcs). */
export { initialStorylines } from './storylines';

/** Factual news seeds from the week's results (big wins, upsets, rival exploits, league races, user feats). */
export { newsSeedsForWeek } from './newsseeds';

/** Ticker commentary line for a macro match event (varied templates, localized). */
export function matchCommentary(kind: MatchEventKind, data: { player?: string; team?: string; minute: number; score?: string; extra?: string }, rng: Rng): string {
  return matchLine(kind, data, rng, getLang());
}

/** Short live commentary for a real-time moment event (or null to stay silent). */
export function momentCommentary(e: MomentEvent, nameOf: (id: string) => string, rng: Rng): string | null {
  return momentLine(e, nameOf, rng, getLang());
}

/** Fictional outlets (newspapers/TV) per country. */
export { outletsFor } from './outlets';

// ───────── additions beyond the original contract ─────────

export { EVENT_DEFS, eventDefById } from './events';
export { STORY_KINDS } from './storylines';
export { writeArticle } from './news';
export { detectIntent } from './chat';
export { readFreeText } from './press';
export { allOutlets } from './outlets';
export { templateGenesis, GENESIS_FLAVORS } from './genesis';

export type { MatchEvent };
