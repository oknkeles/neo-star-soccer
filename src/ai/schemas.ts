/**
 * Zod schemas for Claude's structured outputs, one per Narrator method.
 *
 * They deliberately carry NO numeric/length constraints: the SDK would strip those from
 * the JSON schema and enforce them client-side, turning a slightly-too-long headline into
 * a failed call. For the same reason enums are either `.catch()`-ed to a safe default or
 * plain described strings filtered later (the SDK moves `enum` into the description, so
 * the API does not hard-enforce it). Bounds are applied afterwards in clamp.ts. Effects
 * use a compact, all-required shape (zeros = no change, arrays for keyed deltas) instead
 * of many optional fields, which keeps the schema small and union-free.
 */
import { z } from 'zod';
import type { AttrKey, RelKey, SquadRole } from '../core/types';
import type { PressTone } from '../core/narrative-types';
import { ATTR_KEYS } from '../core/ratings';
import { ICONS } from '../ui/components/icons';

export const REL_KEYS = ['manager', 'teammates', 'fans', 'media', 'family', 'partner', 'agent', 'sponsors'] as const satisfies readonly RelKey[];
export const TONES = ['humble', 'confident', 'provocative', 'diplomatic', 'emotional', 'deflect'] as const satisfies readonly PressTone[];
export const SQUAD_ROLES = ['prospect', 'rotation', 'starter', 'star'] as const satisfies readonly SquadRole[];
/** Social authors Claude may write as (never 'user': the player's own posts come from the game). */
export const AUTHOR_KINDS = ['fan', 'journalist', 'player', 'club', 'rival', 'partner', 'pundit', 'brand'] as const;
export const FAMILY_ROLES = ['father', 'mother', 'sibling'] as const;
export const ICON_NAMES = Object.keys(ICONS) as [string, ...string[]];
const ATTRS: readonly AttrKey[] = ATTR_KEYS;
const tone = () => z.enum(TONES).catch('diplomatic');

const relDelta = z.object({ who: z.string().describe(`One of: ${REL_KEYS.join(', ')}`), delta: z.number() });

export const EffectsSchema = z.object({
  money: z.number(),
  fame: z.number(),
  morale: z.number(),
  energy: z.number(),
  form: z.number(),
  followers: z.number(),
  injuryWeeks: z.number(),
  rel: z.array(relDelta),
  xp: z.array(z.object({ attr: z.string().describe(`One of: ${ATTRS.join(', ')}`), delta: z.number() })),
});
export type CompactEffects = z.infer<typeof EffectsSchema>;

/** Press answers only move reputation-type meters. */
export const PressEffectsSchema = z.object({
  fame: z.number(),
  morale: z.number(),
  followers: z.number(),
  rel: z.array(relDelta),
});
export type CompactPressEffects = z.infer<typeof PressEffectsSchema>;

export const GenesisSchema = z.object({
  backstory: z.string(),
  motto: z.string(),
  dream: z.string(),
  theme: z.string(),
  destinyHint: z.string(),
  rivalBlurb: z.string(),
  mentorBlurb: z.string(),
  family: z.array(z.object({ name: z.string(), role: z.enum(FAMILY_ROLES).catch('sibling'), personality: z.string(), bio: z.string() })),
  agent: z.object({ name: z.string(), personality: z.string(), bio: z.string() }),
});

export const NewsSchema = z.object({
  articles: z.array(z.object({ index: z.number(), outlet: z.string(), headline: z.string(), body: z.string() })),
});

export const SocialSchema = z.object({
  posts: z.array(z.object({
    authorName: z.string(),
    handle: z.string(),
    kind: z.enum(AUTHOR_KINDS).catch('fan'),
    verified: z.boolean(),
    text: z.string(),
    likes: z.number(),
    reposts: z.number(),
    sentiment: z.number(),
  })),
});

export const PressQuestionsSchema = z.object({
  questions: z.array(z.object({
    journalist: z.string(),
    outlet: z.string(),
    topic: z.string(),
    text: z.string(),
    options: z.array(z.object({ tone: tone(), text: z.string() })),
  })),
});

export const PressEvalSchema = z.object({
  tone: tone(),
  effects: PressEffectsSchema,
  headline: z.string(),
  feedback: z.string(),
});

export const NegotiationSchema = z.object({
  text: z.string(),
  wage: z.number(),
  years: z.number(),
  /** 0 = keep the current clause. */
  releaseClause: z.number(),
  role: z.string().describe(`One of: ${SQUAD_ROLES.join(', ')}`),
  signingBonus: z.number(),
  goalBonus: z.number(),
  patienceDelta: z.number(),
  walkAway: z.boolean(),
});

const eventChoice = z.object({
  label: z.string(),
  resultText: z.string(),
  effects: EffectsSchema,
  /** 0 or 1 entries: an optional gamble on this choice. */
  gamble: z.array(z.object({ chance: z.number(), text: z.string(), effects: EffectsSchema })),
});

export const EventSchema = z.object({
  event: z.object({
    title: z.string(),
    body: z.string(),
    icon: z.enum(ICON_NAMES).catch('sparkles'),
    persona: z.string(),
    choices: z.array(eventChoice),
  }).nullable(),
});

export const ChatSchema = z.object({ reply: z.string() });

export const BiographySchema = z.object({ paragraphs: z.array(z.string()) });
