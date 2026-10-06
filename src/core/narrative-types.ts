import type {
  AIFeature, CareerGenesis, ContractTerms, Effects, GameEvent, Lang, NationCode, Negotiation, NewsArticle,
  PlayablePosition, SocialPost, TraitId,
} from './types';

/**
 * Contract between the game, the procedural narrator (narrative/) and the
 * Claude-powered narrator (ai/). Every method MUST resolve (never reject) — the AI
 * implementation falls back to the template implementation on any error/timeout.
 * All returned text is in `ctx.lang`.
 */

/** Compact, JSON-serializable snapshot of the career used as narrative context. */
export interface NarrativeContext {
  lang: Lang;
  season: number;
  week: number;
  player: {
    name: string;
    nickname?: string;
    age: number;
    nation: string;           // localized nation name
    position: string;         // localized position name
    overall: number;
    potentialHint: string;    // e.g. 'world-class' — never the raw number
    traits: TraitId[];
    fame: number;
    followers: number;
    morale: number;
    form: number;
    value: number;
    wage: number;
    injured: boolean;
  };
  club: { name: string; city: string; league: string; leaguePos: number | null; reputation: number; managerName: string; managerTemperament: string } | null;
  seasonStats: { apps: number; goals: number; assists: number; avgRating: number };
  careerStats: { apps: number; goals: number; assists: number; trophies: number; caps: number };
  relationships: Record<string, number>;
  rival: { name: string; club: string; goals: number; overall: number } | null;
  mentor: { name: string } | null;
  partner: { name: string } | null;
  agent: { name: string; personality: string } | null;
  recentResults: string[];    // e.g. ['W 2-1 vs Ankara (G, A, 8.1)']
  storylines: { kind: string; stage: number }[];
  hometown: string;
  backstory: string;
  dream: string;
  recentHeadlines: string[];
}

export interface GenesisInput {
  lang: Lang;
  firstName: string;
  lastName: string;
  nation: NationCode;
  nationName: string;
  position: PlayablePosition;
  positionName: string;
  foot: 'L' | 'R';
  traits: TraitId[];
  hometownHint: string;       // a city of the nation (from world data)
  rivalName: string;
  rivalClub: string;
  mentorName: string | null;
  startingClubName: string;
  seedFlavor: string;         // random theme word to push variety, e.g. 'redemption', 'prodigy', 'outsider'
}

export interface NewsSeed {
  kind: 'match' | 'transfer_rumour' | 'transfer_done' | 'rival' | 'injury' | 'milestone' | 'award' | 'league' | 'scandal' | 'callup' | 'manager' | 'story';
  facts: string;              // terse factual summary the writer must stay faithful to
  aboutUser: boolean;
  importance: number;         // 0..1
  tags: string[];
}

export type SocialTrigger =
  | { kind: 'match'; facts: string; rating: number; goals: number; won: boolean | null }
  | { kind: 'transfer'; facts: string }
  | { kind: 'user_post'; text: string; tone: string }
  | { kind: 'event'; facts: string }
  | { kind: 'idle' };

export type PressOccasion = 'pre_match' | 'post_match' | 'transfer' | 'scandal' | 'milestone' | 'unveiling';

export interface PressQuestion {
  id: string;
  journalist: string;
  outlet: string;
  text: string;
  topic: string;              // 'rival' | 'manager' | 'transfer' | 'form' | 'fans' | 'personal' | ...
  /** Prepared answers (always provided so the game works offline). */
  options: { id: string; tone: PressTone; text: string }[];
}

export type PressTone = 'humble' | 'confident' | 'provocative' | 'diplomatic' | 'emotional' | 'deflect';

export interface PressEvaluation {
  tone: PressTone;
  effects: Effects;           // bounded: |rel| ≤ 8, |fame| ≤ 4, |morale| ≤ 6 — callers clamp again
  headline: string;           // the headline the answer generates
  feedback: string;           // one sentence on how it landed
}

export interface NegotiationReply {
  text: string;               // director's line
  /** Proposed terms. Game logic CLAMPS to negotiation.limits before showing. */
  terms: ContractTerms;
  patienceDelta: number;      // −30..+10
  walkAway: boolean;
}

export type PersonaKind = 'agent' | 'manager' | 'mentor' | 'partner' | 'family' | 'rival';
export interface ChatMessage { from: 'user' | 'persona'; text: string }

export interface Narrator {
  readonly kind: 'template' | 'claude';
  genesis(input: GenesisInput): Promise<Omit<CareerGenesis, 'family' | 'agent' | 'goals' | 'hometownClubId'> & {
    family: { name: string; role: 'father' | 'mother' | 'sibling'; personality: string; bio: string }[];
    agent: { name: string; personality: string; bio: string };
  }>;
  /** Turn factual seeds into articles (1 per seed, same order). */
  news(ctx: NarrativeContext, seeds: NewsSeed[]): Promise<Omit<NewsArticle, 'id' | 'season' | 'week'>[]>;
  social(ctx: NarrativeContext, trigger: SocialTrigger, count: number): Promise<Omit<SocialPost, 'id' | 'season' | 'week'>[]>;
  pressQuestions(ctx: NarrativeContext, occasion: PressOccasion, facts: string): Promise<PressQuestion[]>;
  /** `answer` is either a prepared option id or free text typed by the player. */
  evaluatePress(ctx: NarrativeContext, q: PressQuestion, answer: { optionId?: string; text?: string }): Promise<PressEvaluation>;
  negotiate(ctx: NarrativeContext, neg: Negotiation, ask: ContractTerms, message: string | null): Promise<NegotiationReply>;
  /** Bespoke event for this career; null when nothing fits. Effects are clamped by the caller. */
  dynamicEvent(ctx: NarrativeContext): Promise<Omit<GameEvent, 'id' | 'season' | 'week' | 'defId' | 'source'> | null>;
  chat(ctx: NarrativeContext, persona: PersonaKind, personaName: string, history: ChatMessage[], message: string): Promise<string>;
  biography(ctx: NarrativeContext, careerFacts: string): Promise<string>;
}

export type { AIFeature };
