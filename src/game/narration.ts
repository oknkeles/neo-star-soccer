/**
 * Narrator plumbing: picks the active narrator (Claude or templates), guards every call with
 * a timeout + template fallback + hard-coded fallback, and sanitizes untrusted output.
 */
import type {
  ContractTerms, Effects, EventChoice, GameEvent, GameState, NewsArticle, SocialPost,
} from '../core/types';
import type {
  NarrativeContext, Narrator, NegotiationReply, NewsSeed, PressEvaluation, PressQuestion, PressTone,
} from '../core/narrative-types';
import { t } from '../core/i18n';
import { age, clamp, fullName } from '../core/util';
import { overall } from '../core/ratings';
import * as career from '../career/api';
import * as narrative from '../narrative/api';
import { getNarrator } from '../ai/api';

export type NarratorSource = 'claude' | 'template' | 'fallback';

export function activeNarrator(): Narrator {
  try {
    return getNarrator();
  } catch {
    return narrative.templateNarrator;
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`narrator timeout after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

/**
 * Run a narrator call: active narrator → template narrator → `fallback()`.
 * `accept` validates the shape (untrusted output); a rejected value counts as a failure.
 */
export async function callNarrator<T>(
  call: (n: Narrator) => Promise<T>,
  fallback: () => T,
  accept: (v: T) => boolean = (v) => v !== undefined && v !== null,
  timeoutMs = 45_000,
): Promise<{ value: T; source: NarratorSource }> {
  const primary = activeNarrator();
  const chain: Narrator[] = primary === narrative.templateNarrator ? [primary] : [primary, narrative.templateNarrator];
  for (const n of chain) {
    try {
      const v = await withTimeout(Promise.resolve().then(() => call(n)), n === primary ? timeoutMs : 8_000);
      if (accept(v)) return { value: v, source: n.kind === 'claude' ? 'claude' : 'template' };
    } catch (e) {
      console.warn('[game] narrator call failed', e);
    }
  }
  return { value: fallback(), source: 'fallback' };
}

// ───────── narrative context ─────────

/** narrative.buildNarrativeContext with a minimal local fallback (keeps narrators usable). */
export function narrativeContext(state: GameState): NarrativeContext {
  try {
    return narrative.buildNarrativeContext(state);
  } catch {
    return minimalContext(state);
  }
}

export function minimalContext(state: GameState): NarrativeContext {
  const p = state.world.players[state.career.playerId];
  const club = p?.clubId ? state.world.clubs[p.clubId] : null;
  const mgr = club ? state.world.managers[club.managerId] : null;
  const rival = state.world.players[state.career.rivalId];
  const rivalClub = rival?.clubId ? state.world.clubs[rival.clubId] : null;
  const mentor = state.career.mentorId ? state.world.players[state.career.mentorId] : null;
  const partner = state.career.people.find((x) => x.id === state.career.partnerId) ?? null;
  const agent = state.career.people.find((x) => x.role === 'agent') ?? null;
  const g = state.career.genesis;
  return {
    lang: state.lang,
    season: state.season,
    week: state.week,
    player: {
      name: p ? `${p.firstName} ${p.lastName}` : '?',
      nickname: p?.nickname,
      age: p ? age(p, state.season) : 17,
      nation: p?.nation ?? '',
      position: p?.position ?? '',
      overall: p ? overall(p) : 50,
      potentialHint: g?.destinyHint ?? '',
      traits: p?.traits ?? [],
      fame: state.career.fame,
      followers: state.career.followers,
      morale: p?.morale ?? 50,
      form: p?.form ?? 50,
      value: p?.value ?? 0,
      wage: p?.contract?.wage ?? 0,
      injured: !!p?.injury,
    },
    club: club ? {
      name: club.name, city: club.city, league: `${club.country}-${club.tier}`, leaguePos: null,
      reputation: club.reputation, managerName: mgr ? `${mgr.firstName} ${mgr.lastName}` : '', managerTemperament: mgr?.temperament ?? '',
    } : null,
    seasonStats: {
      apps: p?.season.apps ?? 0, goals: p?.season.goals ?? 0, assists: p?.season.assists ?? 0,
      avgRating: p && p.season.apps ? Math.round((p.season.ratingSum / p.season.apps) * 10) / 10 : 0,
    },
    careerStats: {
      apps: p?.career.apps ?? 0, goals: p?.career.goals ?? 0, assists: p?.career.assists ?? 0,
      trophies: state.career.trophies.length, caps: p?.intlCaps ?? 0,
    },
    relationships: { ...state.career.relationships },
    rival: rival ? { name: fullName(rival), club: rivalClub?.name ?? '', goals: rival.season.goals, overall: overall(rival) } : null,
    mentor: mentor ? { name: fullName(mentor) } : null,
    partner: partner ? { name: partner.name } : null,
    agent: agent ? { name: agent.name, personality: agent.personality } : null,
    recentResults: state.career.matches.slice(-5).map((m) => `${m.goalsFor}-${m.goalsAgainst} ${m.opponent} (${m.rating})`),
    storylines: state.storylines.filter((s) => s.active).map((s) => ({ kind: s.kind, stage: s.stage })),
    hometown: g?.hometown ?? '',
    backstory: g?.backstory ?? '',
    dream: g?.dream ?? '',
    recentHeadlines: state.news.slice(-5).map((n) => n.headline),
  };
}

// ───────── fallbacks & sanitizers ─────────

export function defaultOutlet(state: GameState): string {
  const p = state.world.players[state.career.playerId];
  const country = (p?.clubId && state.world.clubs[p.clubId]?.country) || (p?.nation ?? 'TUR');
  try {
    const list = narrative.outletsFor(country);
    if (list.length) return list[0];
  } catch { /* narrative not ready */ }
  return t('game.outlet.default');
}

export function fallbackArticle(state: GameState, seed: NewsSeed): Omit<NewsArticle, 'id' | 'season' | 'week'> {
  const first = seed.facts.split(/(?<=[.!?])\s/)[0] ?? seed.facts;
  return {
    outlet: defaultOutlet(state),
    headline: first.length > 96 ? `${first.slice(0, 93)}…` : first,
    body: seed.facts,
    tags: seed.tags,
    importance: clamp(seed.importance, 0, 1),
    aboutUser: seed.aboutUser,
    ai: false,
  };
}

export function isArticleList(v: unknown, n: number): boolean {
  return Array.isArray(v) && v.length >= Math.min(1, n) && v.every((a) => a && typeof a.headline === 'string');
}

/** Normalize narrator article output into storable articles (one per seed, same order). */
export function articlesFromSeeds(
  state: GameState, seeds: NewsSeed[], out: Omit<NewsArticle, 'id' | 'season' | 'week'>[], ai: boolean,
): Omit<NewsArticle, 'id' | 'season' | 'week'>[] {
  return seeds.map((seed, i) => {
    const a = out[i];
    if (!a || typeof a.headline !== 'string' || !a.headline.trim()) return fallbackArticle(state, seed);
    return {
      outlet: typeof a.outlet === 'string' && a.outlet ? a.outlet : defaultOutlet(state),
      headline: a.headline.trim().slice(0, 140),
      body: typeof a.body === 'string' ? a.body.trim().slice(0, 2400) : seed.facts,
      tags: Array.isArray(a.tags) && a.tags.length ? a.tags.filter((x) => typeof x === 'string').slice(0, 6) : seed.tags,
      importance: clamp(Number.isFinite(a.importance) ? a.importance : seed.importance, 0, 1),
      aboutUser: typeof a.aboutUser === 'boolean' ? a.aboutUser : seed.aboutUser,
      ai: ai && a.ai !== false,
    };
  });
}

export function sanitizePosts(list: unknown): Omit<SocialPost, 'id' | 'season' | 'week'>[] {
  if (!Array.isArray(list)) return [];
  const kinds = ['fan', 'journalist', 'player', 'club', 'rival', 'partner', 'user', 'pundit', 'brand'] as const;
  const out: Omit<SocialPost, 'id' | 'season' | 'week'>[] = [];
  for (const raw of list.slice(0, 12)) {
    const p = raw as Partial<SocialPost> | null;
    if (!p || typeof p.text !== 'string' || !p.text.trim() || !p.author) continue;
    const kind = kinds.includes(p.author.kind as (typeof kinds)[number]) ? p.author.kind : 'fan';
    out.push({
      author: {
        name: String(p.author.name ?? '?').slice(0, 60),
        handle: String(p.author.handle ?? '@fan').slice(0, 40),
        kind,
        verified: !!p.author.verified,
      },
      text: p.text.trim().slice(0, 400),
      likes: Math.max(0, Math.round(Number(p.likes) || 0)),
      reposts: Math.max(0, Math.round(Number(p.reposts) || 0)),
      sentiment: clamp(Number(p.sentiment) || 0, -1, 1),
      ai: !!p.ai,
    });
  }
  return out;
}

function safeSanitize(e: Effects | undefined, scale?: number): Effects {
  if (!e || typeof e !== 'object') return {};
  try {
    return career.sanitizeEffects(e, scale);
  } catch {
    return localSanitize(e);
  }
}

/** Conservative local clamp used only if career.sanitizeEffects is unavailable. */
export function localSanitize(e: Effects): Effects {
  const n = (v: unknown, lim: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), -lim, lim) : undefined);
  const out: Effects = {};
  const money = n(e.money, 50_000); if (money) out.money = money;
  const fame = n(e.fame, 4); if (fame) out.fame = fame;
  const followers = n(e.followers, 20_000); if (followers) out.followers = followers;
  const energy = n(e.energy, 20); if (energy) out.energy = energy;
  const morale = n(e.morale, 8); if (morale) out.morale = morale;
  const form = n(e.form, 8); if (form) out.form = form;
  if (e.rel && typeof e.rel === 'object') {
    const rel: Effects['rel'] = {};
    for (const [k, v] of Object.entries(e.rel)) { const c = n(v, 8); if (c) (rel as Record<string, number>)[k] = c; }
    if (Object.keys(rel).length) out.rel = rel;
  }
  return out;
}

export function sanitizeEffectsSafe(e: Effects | undefined, scale?: number): Effects {
  return safeSanitize(e, scale);
}

/** Turn an untrusted dynamic event (LLM) into a safe GameEvent body, or null if unusable. */
export function sanitizeDynamicEvent(
  raw: Omit<GameEvent, 'id' | 'season' | 'week' | 'defId' | 'source'> | null,
): Omit<GameEvent, 'id' | 'season' | 'week' | 'defId' | 'source'> | null {
  if (!raw || typeof raw.title !== 'string' || typeof raw.body !== 'string' || !Array.isArray(raw.choices)) return null;
  const choices: EventChoice[] = raw.choices.slice(0, 4).filter((c) => c && typeof c.label === 'string' && c.label.trim()).map((c, i) => {
    const choice: EventChoice = { id: `c${i + 1}`, label: c.label.trim().slice(0, 120), effects: safeSanitize(c.effects) };
    if (typeof c.resultText === 'string') choice.resultText = c.resultText.slice(0, 400);
    if (c.risk && typeof c.risk === 'object' && typeof c.risk.text === 'string') {
      choice.risk = { chance: clamp(Number(c.risk.chance) || 0, 0, 0.85), effects: safeSanitize(c.risk.effects), text: c.risk.text.slice(0, 300) };
    }
    return choice;
  });
  if (choices.length < 2) return null;
  const ev: Omit<GameEvent, 'id' | 'season' | 'week' | 'defId' | 'source'> = {
    title: raw.title.trim().slice(0, 100),
    body: raw.body.trim().slice(0, 1200),
    icon: typeof raw.icon === 'string' && raw.icon ? raw.icon : 'sparkles',
    choices,
  };
  if (typeof raw.persona === 'string') ev.persona = raw.persona.slice(0, 60);
  return ev;
}

const TONE_EFFECTS: Record<PressTone, Effects> = {
  humble: { rel: { media: 2, fans: 1, teammates: 1 }, morale: 1 },
  confident: { fame: 1, rel: { fans: 2, media: 1 }, morale: 2 },
  provocative: { fame: 2, rel: { media: -2, fans: 2, manager: -2 } },
  diplomatic: { rel: { media: 1, manager: 1 } },
  emotional: { rel: { fans: 3, media: 1 }, morale: 1 },
  deflect: { rel: { media: -1 } },
};

export function fallbackEvaluation(q: PressQuestion, answer: { optionId?: string; text?: string }, playerName: string): PressEvaluation {
  const opt = q.options.find((o) => o.id === answer.optionId);
  const tone: PressTone = opt?.tone ?? 'diplomatic';
  return {
    tone,
    effects: TONE_EFFECTS[tone],
    headline: t(`game.press.headline.${tone}`, { name: playerName }),
    feedback: t(`game.press.feedback.${tone}`),
  };
}

export function isEvaluation(v: PressEvaluation | null | undefined): boolean {
  return !!v && typeof v.headline === 'string' && typeof v.tone === 'string' && typeof v.effects === 'object';
}

export function fallbackQuestions(occasion: string, facts: string, outlet: string): PressQuestion[] {
  const tones: PressTone[] = ['humble', 'confident', 'provocative'];
  return [1, 2, 3].map((i) => ({
    id: `fq${i}`,
    journalist: t(`game.press.fallback.journalist${i}`),
    outlet,
    text: t(`game.press.fallback.q${i}.${occasion === 'transfer' || occasion === 'unveiling' ? 'transfer' : 'match'}`, { facts }),
    topic: i === 3 ? 'personal' : occasion === 'transfer' || occasion === 'unveiling' ? 'transfer' : 'form',
    options: [...tones, i === 2 ? 'diplomatic' : 'deflect'].map((tone, j) => ({
      id: `fq${i}o${j + 1}`, tone: tone as PressTone, text: t(`game.press.fallback.a.${tone}`),
    })),
  }));
}

export function isQuestionList(v: PressQuestion[] | null | undefined): boolean {
  return Array.isArray(v) && v.length > 0 && v.every((q) => q && typeof q.text === 'string' && typeof q.id === 'string' && Array.isArray(q.options));
}

export function validTerms(x: unknown): x is ContractTerms {
  const o = x as ContractTerms | null;
  return !!o && typeof o === 'object' && Number.isFinite(o.wage) && Number.isFinite(o.years) && typeof o.role === 'string'
    && Number.isFinite(o.signingBonus) && Number.isFinite(o.goalBonus) && (o.releaseClause === null || Number.isFinite(o.releaseClause));
}

export function isNegotiationReply(v: NegotiationReply | null | undefined): boolean {
  return !!v && typeof v.text === 'string';
}
