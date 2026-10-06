/**
 * Last line of defence: minimal, always-valid outputs used only if BOTH Claude and the
 * template narrator fail. Keeps the "never rejects" promise of the Narrator contract.
 */
import type { ContractTerms, Negotiation } from '../core/types';
import type {
  GenesisInput, NarrativeContext, Narrator, NegotiationReply, NewsSeed, PressEvaluation, PressQuestion,
} from '../core/narrative-types';
import { t } from '../core/i18n';
import { line } from './clamp';
import './strings';

type GenesisResult = Awaited<ReturnType<Narrator['genesis']>>;
type NewsResult = Awaited<ReturnType<Narrator['news']>>;

export const lastResort = {
  genesis(input: GenesisInput): GenesisResult {
    const lang = input.lang;
    const name = `${input.firstName} ${input.lastName}`;
    return {
      hometown: input.hometownHint,
      backstory: t('ai.lr.backstory', { name, hometown: input.hometownHint }, lang),
      motto: t('ai.lr.motto', undefined, lang),
      dream: t('ai.lr.dream', undefined, lang),
      theme: t('ai.lr.theme', undefined, lang),
      destinyHint: t('ai.lr.destiny', undefined, lang),
      rivalBlurb: t('ai.lr.rival', { rival: input.rivalName }, lang),
      mentorBlurb: input.mentorName ? t('ai.lr.mentor', { mentor: input.mentorName }, lang) : '',
      family: [],
      agent: {
        name: t('ai.lr.agentName', undefined, lang),
        personality: t('ai.lr.agentPersonality', undefined, lang),
        bio: t('ai.lr.agentBio', undefined, lang),
      },
      ai: false,
    };
  },

  news(ctx: NarrativeContext, seeds: NewsSeed[]): NewsResult {
    return seeds.map((s) => ({
      outlet: t('ai.lr.outlet', undefined, ctx.lang),
      headline: line(s.facts.split(/[.!?]/)[0] || s.facts, 90),
      body: s.facts,
      tags: [...s.tags],
      importance: s.importance,
      aboutUser: s.aboutUser,
      ai: false,
    }));
  },

  pressQuestions(ctx: NarrativeContext): PressQuestion[] {
    const L = ctx.lang;
    const name = ctx.player.name;
    const journalist = t('ai.lr.journalist', undefined, L);
    const outlet = t('ai.lr.outlet', undefined, L);
    return [
      {
        id: 'lr-q1', journalist, outlet, topic: 'form', text: t('ai.lr.q1', { name }, L),
        options: [
          { id: 'lr-q1-a', tone: 'humble', text: t('ai.lr.q1.humble', undefined, L) },
          { id: 'lr-q1-b', tone: 'confident', text: t('ai.lr.q1.confident', undefined, L) },
          { id: 'lr-q1-c', tone: 'deflect', text: t('ai.lr.q1.deflect', undefined, L) },
        ],
      },
      {
        id: 'lr-q2', journalist, outlet, topic: 'manager', text: t('ai.lr.q2', undefined, L),
        options: [
          { id: 'lr-q2-a', tone: 'diplomatic', text: t('ai.lr.q2.diplomatic', undefined, L) },
          { id: 'lr-q2-b', tone: 'emotional', text: t('ai.lr.q2.emotional', undefined, L) },
          { id: 'lr-q2-c', tone: 'provocative', text: t('ai.lr.q2.provocative', undefined, L) },
        ],
      },
    ];
  },

  evaluatePress(ctx: NarrativeContext, q: PressQuestion, answer: { optionId?: string }): PressEvaluation {
    const tone = q.options.find((o) => o.id === answer.optionId)?.tone ?? 'diplomatic';
    return {
      tone,
      effects: {},
      headline: t('ai.lr.pressHeadline', { name: ctx.player.name }, ctx.lang),
      feedback: t('ai.lr.pressFeedback', undefined, ctx.lang),
    };
  },

  negotiate(ctx: NarrativeContext, neg: Negotiation, _ask: ContractTerms): NegotiationReply {
    return { text: t('ai.lr.negotiation', undefined, ctx.lang), terms: { ...neg.current }, patienceDelta: 0, walkAway: false };
  },

  chat(ctx: NarrativeContext): string {
    return t('ai.lr.chat', undefined, ctx.lang);
  },
};
