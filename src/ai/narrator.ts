/**
 * The Claude narrator: implements the Narrator contract over an injectable transport.
 * Per call: feature gate → circuit breaker → queue (max N in flight, bounded wait) →
 * timeout → refusal check → schema validation → clamping. Any failure records a localized
 * error and falls back to the template narrator (and, if even that throws, to
 * fallback.ts). Never rejects.
 */
import type { z } from 'zod';
import type { AIFeature, ContractTerms, GameEvent, Negotiation, NewsArticle, SocialPost } from '../core/types';
import type {
  ChatMessage, GenesisInput, NarrativeContext, Narrator, NegotiationReply, NewsSeed, PersonaKind, PressEvaluation,
  PressOccasion, PressQuestion, SocialTrigger,
} from '../core/narrative-types';
import { aiEnabled, getSettings } from '../core/settings';
import { clamp } from '../core/util';
import { templateNarrator } from '../narrative/api';
import {
  clampPatience, clampTerms, clip, compactToEffects, likesCap, line, pressToEffects, sanitizeHandle, validIcon,
} from './clamp';
import { AIError, describeAIError, toAIError } from './errors';
import { lastResort } from './fallback';
import {
  SYSTEM_PROMPT, biographyPrompt, chatPrompt, dynamicEventPrompt, evaluatePressPrompt, genesisPrompt, hashString,
  houseOutlets, negotiatePrompt, newsPrompt, pressQuestionsPrompt, socialPrompt, type TaskPrompt,
} from './prompts';
import { Breaker, Limiter, StatusTracker, withTimeout } from './runtime';
import {
  BiographySchema, ChatSchema, EventSchema, GenesisSchema, ICON_NAMES, NegotiationSchema, NewsSchema, PressEvalSchema,
  PressQuestionsSchema, SocialSchema, TONES,
} from './schemas';

/** One structured request to Claude, transport-agnostic. */
export interface ClaudeRequest {
  feature: AIFeature;
  system: string;
  prompt: string;
  schema: z.ZodType;
  maxTokens: number;
  timeoutMs: number;
  signal: AbortSignal;
}

/** What a transport returns: the stop reason and either the parsed object or raw text. */
export interface ClaudeResponse {
  stopReason: string | null;
  parsed: unknown;
  text?: string | null;
}

export type ClaudeTransport = (req: ClaudeRequest) => Promise<ClaudeResponse>;

export interface ClaudeNarratorOptions {
  call: ClaudeTransport;
  /** Used when a feature is off or Claude fails. Defaults to narrative's templateNarrator. */
  fallback?: Narrator;
  /** Feature gate. Defaults to core/settings aiEnabled. */
  isEnabled?: (feature: AIFeature) => boolean;
  /** Reported `kind`. Defaults to 'claude'. */
  kind?: () => 'claude' | 'template';
  timeoutMs?: number;
  maxConcurrent?: number;
  status?: StatusTracker;
  limiter?: Limiter;
  /** Pauses Claude after hard failures (bad key, rate limit, offline…). */
  breaker?: Breaker;
  /** Identifies the key + model in use; a change closes the breaker. Defaults to the settings. */
  configKey?: () => string;
  /** A request that waited longer than this in the queue is answered by the fallback instead. */
  maxQueueWaitMs?: number;
  /** News seeds per request (larger weeks are split). */
  newsBatchSize?: number;
  /** Clock (tests). */
  now?: () => number;
}

export interface ClaudeNarrator extends Narrator {
  readonly status: StatusTracker;
  configure(o: AITuning): void;
}

export interface AITuning { timeoutMs?: number; maxConcurrent?: number; maxQueueWaitMs?: number }

export const DEFAULT_TIMEOUT_MS = 25_000;
export const DEFAULT_MAX_CONCURRENT = 2;
/** Queue wait + call timeout stays below the game's own 45 s guard around narrator calls. */
export const DEFAULT_MAX_QUEUE_WAIT_MS = 15_000;

/** Key + model fingerprint from the settings (the key itself is never stored). */
export function settingsConfigKey(): string {
  const ai = getSettings().ai;
  return `${hashString(ai.apiKey.trim()).toString(36)}|${ai.model}`;
}

/** Thrown inside the queue to leave without sending (paused or waited too long). */
const SKIP = Symbol('skip');

type GenesisResult = Awaited<ReturnType<Narrator['genesis']>>;
type Article = Omit<NewsArticle, 'id' | 'season' | 'week'>;
type Post = Omit<SocialPost, 'id' | 'season' | 'week'>;
type EventDraft = Omit<GameEvent, 'id' | 'season' | 'week' | 'defId' | 'source'>;

const stripFences = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

function extract<S extends z.ZodType>(schema: S, res: ClaudeResponse): z.infer<S> {
  let candidate: unknown = res.parsed;
  if ((candidate === null || candidate === undefined) && typeof res.text === 'string' && res.text.trim()) {
    try {
      candidate = JSON.parse(stripFences(res.text));
    } catch {
      throw new AIError('invalid_output', 'json');
    }
  }
  if (candidate === null || candidate === undefined) {
    throw new AIError('invalid_output', res.stopReason === 'max_tokens' ? 'truncated' : 'empty');
  }
  const r = schema.safeParse(candidate);
  if (!r.success) throw new AIError('invalid_output', 'schema');
  return r.data;
}

/** Run a fallback that must not throw; if it does, use the last resort. */
async function safe<T>(primary: () => Promise<T> | T, last: () => T): Promise<T> {
  try {
    const v = await primary();
    if (v !== undefined) return v;
  } catch {
    /* fall through */
  }
  return last();
}

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export function createClaudeNarrator(opts: ClaudeNarratorOptions): ClaudeNarrator {
  const call = opts.call;
  const fallback = opts.fallback ?? templateNarrator;
  const isEnabled = opts.isEnabled ?? aiEnabled;
  const kindFn = opts.kind ?? (() => 'claude' as const);
  const status = opts.status ?? new StatusTracker();
  const limiter = opts.limiter ?? new Limiter(opts.maxConcurrent ?? DEFAULT_MAX_CONCURRENT);
  const now = opts.now ?? Date.now;
  const breaker = opts.breaker ?? new Breaker(now);
  const configKey = opts.configKey ?? settingsConfigKey;
  const cfg = {
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxQueueWaitMs: opts.maxQueueWaitMs ?? DEFAULT_MAX_QUEUE_WAIT_MS,
    newsBatch: Math.max(1, opts.newsBatchSize ?? 8),
  };
  let salt = 0;
  let pressBatch = 0;

  const enabled = (f: AIFeature) => {
    try { return isEnabled(f); } catch { return false; }
  };

  const key = () => {
    try { return configKey(); } catch { return ''; }
  };

  /** True while the breaker pauses Claude; keeps the status' cooldown in sync. */
  function paused(): boolean {
    const open = breaker.isOpen(key());
    status.setCooldown(open ? breaker.openUntil() : null);
    return open;
  }

  /** One Claude round-trip. Resolves to the post-processed value, or null on any failure. */
  async function ask<S extends z.ZodType, R>(
    feature: AIFeature, schema: S, task: TaskPrompt, post: (data: z.infer<S>) => R | null,
  ): Promise<R | null> {
    if (paused()) return null;
    status.enqueue(feature);
    const queuedAt = now();
    let sent = false;
    let error: string | null = null;
    try {
      return await limiter.run(async () => {
        // Another request may have tripped the breaker while this one waited, or the
        // queue was so slow that the game would give up first: answer from the fallback.
        if (paused() || now() - queuedAt > cfg.maxQueueWaitMs) throw SKIP;
        sent = true;
        status.start();
        try {
          const timeoutMs = cfg.timeoutMs;
          const res = await withTimeout((signal) => call({
            feature, system: SYSTEM_PROMPT, prompt: task.prompt, schema, maxTokens: task.maxTokens, timeoutMs, signal,
          }), timeoutMs);
          if (res.stopReason === 'refusal') throw new AIError('refusal');
          const out = post(extract(schema, res));
          if (out === null || out === undefined) throw new AIError('invalid_output', 'post-validation');
          return out;
        } catch (e) {
          // Trip the breaker while still holding the slot, so queued requests see it.
          const err = toAIError(e);
          const until = breaker.trip(err.kind, key());
          if (until !== null) status.setCooldown(until);
          throw err;
        }
      });
    } catch (e) {
      if (e === SKIP) return null;
      error = describeAIError(toAIError(e));
      return null;
    } finally {
      if (!sent) status.drop();
      else if (error === null) status.succeed();
      else status.fail(error);
    }
  }

  // ───────────────────────────── genesis ─────────────────────────────

  async function genesis(input: GenesisInput): Promise<GenesisResult> {
    if (enabled('genesis')) {
      const res = await ask('genesis', GenesisSchema, genesisPrompt(input, salt++), (g): GenesisResult | null => {
        const seen = new Set<string>();
        const family = g.family
          .map((m) => ({ name: line(m.name, 40), role: m.role, personality: line(m.personality, 50), bio: clip(m.bio, 220) }))
          .filter((m) => {
            if (!m.name || !m.bio) return false;
            if (m.role !== 'sibling') {
              if (seen.has(m.role)) return false;
              seen.add(m.role);
            }
            return true;
          })
          .slice(0, 4);
        const out: GenesisResult = {
          hometown: input.hometownHint,
          backstory: clip(g.backstory, 900),
          motto: line(g.motto, 80),
          dream: line(g.dream, 200),
          theme: line(g.theme, 60),
          destinyHint: line(g.destinyHint, 160),
          rivalBlurb: clip(g.rivalBlurb, 320),
          mentorBlurb: input.mentorName ? clip(g.mentorBlurb, 320) : '',
          family,
          agent: { name: line(g.agent.name, 40), personality: line(g.agent.personality, 50), bio: clip(g.agent.bio, 240) },
          ai: true,
        };
        const required = [out.backstory, out.motto, out.dream, out.theme, out.destinyHint, out.rivalBlurb, out.agent.name];
        return required.every(Boolean) && family.length > 0 ? out : null;
      });
      if (res) return res;
    }
    return safe(() => fallback.genesis(input), () => lastResort.genesis(input));
  }

  // ───────────────────────────── news ─────────────────────────────

  async function news(ctx: NarrativeContext, seeds: NewsSeed[]): Promise<Article[]> {
    if (!seeds.length) return [];
    const out: (Article | null)[] = seeds.map(() => null);
    if (enabled('news')) {
      const outlets = houseOutlets(ctx.lang);
      const groups = chunk(seeds.map((seed, index) => ({ index, seed })), cfg.newsBatch);
      await Promise.all(groups.map(async (group) => {
        const articles = await ask('news', NewsSchema, newsPrompt(ctx, group), (d) => (d.articles.length ? d.articles : null));
        if (!articles) return;
        const wanted = new Set(group.map((g) => g.index));
        const returned = new Set(articles.map((a) => Math.round(a.index)));
        // Map by declared index; if the count matches but Claude renumbered (e.g. 1-based), map by position.
        const renumbered = articles.length === group.length && group.some((g) => !returned.has(g.index));
        const mapped = renumbered
          ? articles.map((a, k) => ({ a, i: group[k].index }))
          : articles.filter((a) => wanted.has(Math.round(a.index))).map((a) => ({ a, i: Math.round(a.index) }));
        for (const { a, i } of mapped) {
          if (out[i]) continue;
          const headline = line(a.headline, 110);
          const body = clip(a.body, 650);
          if (!headline || !body) continue;
          const s = seeds[i];
          out[i] = {
            outlet: line(a.outlet, 40) || outlets[i % outlets.length],
            headline, body, tags: [...s.tags], importance: clamp(s.importance, 0, 1), aboutUser: s.aboutUser, ai: true,
          };
        }
      }));
    }
    const missing = out.flatMap((a, i) => (a ? [] : [i]));
    if (missing.length) {
      const subset = missing.map((i) => seeds[i]);
      const fill = await safe(() => fallback.news(ctx, subset), () => lastResort.news(ctx, subset));
      missing.forEach((i, k) => { out[i] = fill[k] ?? lastResort.news(ctx, [seeds[i]])[0]; });
    }
    return out as Article[];
  }

  // ───────────────────────────── social ─────────────────────────────

  async function social(ctx: NarrativeContext, trigger: SocialTrigger, count: number): Promise<Post[]> {
    const n = Math.round(clamp(count, 0, 8));
    if (n === 0) return [];
    if (enabled('social')) {
      const cap = likesCap(ctx.player.followers);
      const res = await ask('social', SocialSchema, socialPrompt(ctx, trigger, n), (d) => {
        const posts = d.posts.slice(0, n).map((p): Post => {
          const likes = Math.round(clamp(p.likes, 0, cap));
          const name = line(p.authorName, 40);
          return {
            author: { name: name || sanitizeHandle(p.handle, 'fan').slice(1), handle: sanitizeHandle(p.handle, name), kind: p.kind, verified: !!p.verified },
            text: clip(p.text, 280),
            likes,
            reposts: Math.round(clamp(p.reposts, 0, likes)),
            sentiment: Math.round(clamp(p.sentiment, -1, 1) * 100) / 100,
            ai: true,
          };
        }).filter((p) => p.text);
        return posts.length ? posts : null;
      });
      if (res) return res;
    }
    return safe(() => fallback.social(ctx, trigger, count), () => []);
  }

  // ───────────────────────────── press ─────────────────────────────

  async function pressQuestions(ctx: NarrativeContext, occasion: PressOccasion, facts: string): Promise<PressQuestion[]> {
    if (enabled('press')) {
      const batch = (++pressBatch).toString(36);
      const res = await ask('press', PressQuestionsSchema, pressQuestionsPrompt(ctx, occasion, facts), (d) => {
        const qs = d.questions.slice(0, 4).map((q, i): PressQuestion | null => {
          const id = `ai-${ctx.season}-${ctx.week}-${batch}-${i + 1}`;
          const tones = new Set<string>();
          const options = q.options
            .filter((o) => TONES.includes(o.tone) && !tones.has(o.tone) && tones.add(o.tone))
            .map((o) => ({ tone: o.tone, text: clip(o.text, 220) }))
            .filter((o) => o.text)
            .slice(0, 4)
            .map((o, j) => ({ id: `${id}-${'abcd'[j]}`, ...o }));
          const text = clip(q.text, 280);
          if (!text || options.length < 2) return null;
          return {
            id, text, options,
            journalist: line(q.journalist, 40) || '—',
            outlet: line(q.outlet, 40) || houseOutlets(ctx.lang)[i % 8],
            topic: line(q.topic, 20).toLowerCase() || 'form',
          };
        }).filter((q): q is PressQuestion => q !== null);
        return qs.length ? qs : null;
      });
      if (res) return res;
    }
    return safe(() => fallback.pressQuestions(ctx, occasion, facts), () => lastResort.pressQuestions(ctx));
  }

  async function evaluatePress(
    ctx: NarrativeContext, q: PressQuestion, answer: { optionId?: string; text?: string },
  ): Promise<PressEvaluation> {
    const typed = answer.text?.trim() ?? '';
    const option = answer.optionId ? q.options.find((o) => o.id === answer.optionId) : undefined;
    if (enabled('press') && (typed || option)) {
      const fixedTone = typed ? null : option!.tone;
      const res = await ask('press', PressEvalSchema, evaluatePressPrompt(ctx, q, typed || option!.text, fixedTone), (e) => {
        const headline = line(e.headline, 110);
        const feedback = clip(e.feedback, 240);
        if (!headline || !feedback) return null;
        return { tone: fixedTone ?? e.tone, effects: pressToEffects(e.effects, { followers: ctx.player.followers }), headline, feedback };
      });
      if (res) return res;
    }
    return safe(() => fallback.evaluatePress(ctx, q, answer), () => lastResort.evaluatePress(ctx, q, answer));
  }

  // ───────────────────────────── negotiation ─────────────────────────────

  async function negotiate(ctx: NarrativeContext, neg: Negotiation, askTerms: ContractTerms, message: string | null): Promise<NegotiationReply> {
    if (enabled('negotiation')) {
      const res = await ask('negotiation', NegotiationSchema, negotiatePrompt(ctx, neg, askTerms, message), (r): NegotiationReply | null => {
        const text = clip(r.text, 420);
        if (!text) return null;
        const patienceDelta = clampPatience(r.patienceDelta);
        return {
          text,
          terms: clampTerms(r, neg, askTerms),
          patienceDelta,
          walkAway: !!r.walkAway && neg.patience + patienceDelta <= 30,
        };
      });
      if (res) return res;
    }
    return safe(() => fallback.negotiate(ctx, neg, askTerms, message), () => lastResort.negotiate(ctx, neg, askTerms));
  }

  // ───────────────────────────── events ─────────────────────────────

  async function dynamicEvent(ctx: NarrativeContext): Promise<EventDraft | null> {
    if (enabled('events')) {
      const res = await ask('events', EventSchema, dynamicEventPrompt(ctx, salt++, ICON_NAMES), (d): { event: EventDraft | null } | null => {
        if (d.event === null) return { event: null };
        const ev = d.event;
        const opts = { followers: ctx.player.followers };
        let riskUsed = false;
        const choices = ev.choices.slice(0, 3).map((c, j) => {
          const label = line(c.label, 60);
          if (!label) return null;
          const choice: EventDraft['choices'][number] = {
            id: 'abc'[j], label, effects: compactToEffects(c.effects, opts),
          };
          const resultText = clip(c.resultText, 260);
          if (resultText) choice.resultText = resultText;
          const g = c.gamble[0];
          const gText = g ? clip(g.text, 260) : '';
          if (g && gText && !riskUsed) {
            riskUsed = true;
            choice.risk = { chance: Math.round(clamp(g.chance, 0.05, 0.6) * 100) / 100, effects: compactToEffects(g.effects, opts), text: gText };
          }
          return choice;
        }).filter((c): c is NonNullable<typeof c> => c !== null);
        const title = line(ev.title, 70);
        const body = clip(ev.body, 520);
        if (!title || !body || choices.length < 2) return null;
        // Re-letter ids after filtering so they stay a, b, c.
        choices.forEach((c, j) => { c.id = 'abc'[j]; });
        const draft: EventDraft = { title, body, icon: validIcon(ev.icon), choices };
        const persona = line(ev.persona, 40);
        if (persona) draft.persona = persona;
        return { event: draft };
      });
      if (res) return res.event;
    }
    return safe(() => fallback.dynamicEvent(ctx), () => null);
  }

  // ───────────────────────────── chat & biography ─────────────────────────────

  async function chat(
    ctx: NarrativeContext, persona: PersonaKind, personaName: string, history: ChatMessage[], message: string,
  ): Promise<string> {
    if (enabled('chat')) {
      const res = await ask('chat', ChatSchema, chatPrompt(ctx, persona, personaName, history, message), (r) => clip(r.reply, 420) || null);
      if (res) return res;
    }
    return safe(() => fallback.chat(ctx, persona, personaName, history, message), () => lastResort.chat(ctx));
  }

  async function biography(ctx: NarrativeContext, careerFacts: string): Promise<string> {
    if (enabled('biography')) {
      const res = await ask('biography', BiographySchema, biographyPrompt(ctx, careerFacts), (b) => {
        const paras = b.paragraphs.map((p) => clip(p, 700)).filter(Boolean).slice(0, 8);
        return paras.length >= 2 ? clip(paras.join('\n\n'), 3600) : null;
      });
      if (res) return res;
    }
    return safe(() => fallback.biography(ctx, careerFacts), () => careerFacts);
  }

  return {
    get kind() {
      try { return kindFn(); } catch { return 'template'; }
    },
    status,
    configure(o) {
      if (o.timeoutMs !== undefined && o.timeoutMs > 0) cfg.timeoutMs = o.timeoutMs;
      if (o.maxQueueWaitMs !== undefined && o.maxQueueWaitMs >= 0) cfg.maxQueueWaitMs = o.maxQueueWaitMs;
      if (o.maxConcurrent !== undefined && o.maxConcurrent >= 1) limiter.max = Math.round(o.maxConcurrent);
    },
    genesis, news, social, pressQuestions, evaluatePress, negotiate, dynamicEvent, chat, biography,
  };
}
