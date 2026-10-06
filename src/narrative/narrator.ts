/** The procedural narrator: implements the full Narrator contract offline. Every method resolves, never rejects. */
import type { Narrator, NarrativeContext, NewsSeed, PressQuestion } from '../core/narrative-types';
import { templateGenesis } from './genesis';
import { writeNews } from './news';
import { writeSocial } from './social';
import { evaluateAnswer, makePressQuestions } from './press';
import { negotiationReply } from './negotiate';
import { chatReply } from './chat';
import { writeBiography } from './biography';
import { langOf } from './ctxutil';

function plainArticle(seed: NewsSeed) {
  const text = (seed.facts ?? '').slice(0, 400);
  return { outlet: 'Press', headline: text.slice(0, 96), body: text, tags: seed.tags ?? [], importance: seed.importance ?? 0.3, aboutUser: !!seed.aboutUser, ai: false };
}

function fallbackQuestions(ctx: NarrativeContext): PressQuestion[] {
  const tr = langOf(ctx) === 'tr';
  const id = `PQ-${ctx.season}-${ctx.week}-0`;
  return [{
    id, journalist: tr ? 'Muhabir' : 'Reporter', outlet: 'Press', topic: 'form',
    text: tr ? 'Son durum nedir? Kendinizi nasıl hissediyorsunuz?' : 'How are you feeling right now?',
    options: [
      { id: `${id}.humble`, tone: 'humble', text: tr ? 'Çalışmaya devam ediyorum.' : 'I keep working hard.' },
      { id: `${id}.confident`, tone: 'confident', text: tr ? 'Çok iyi hissediyorum, göreceksiniz.' : 'I feel great, you\'ll see.' },
      { id: `${id}.deflect`, tone: 'deflect', text: tr ? 'Yorum yok.' : 'No comment.' },
    ],
  }];
}

export const templateNarrator: Narrator = {
  kind: 'template',

  async genesis(input) {
    return templateGenesis(input);
  },

  async news(ctx, seeds) {
    try { return writeNews(ctx, seeds); } catch { return seeds.map(plainArticle); }
  },

  async social(ctx, trigger, count) {
    try { return writeSocial(ctx, trigger, count); } catch { return []; }
  },

  async pressQuestions(ctx, occasion, facts) {
    try { return makePressQuestions(ctx, occasion, facts); } catch { return fallbackQuestions(ctx); }
  },

  async evaluatePress(ctx, q, answer) {
    try { return evaluateAnswer(ctx, q, answer); } catch {
      return { tone: 'deflect', effects: {}, headline: '', feedback: '' };
    }
  },

  async negotiate(ctx, neg, ask, message) {
    try { return negotiationReply(ctx, neg, ask, message); } catch {
      return { text: '', terms: { ...neg.current }, patienceDelta: 0, walkAway: neg.status === 'collapsed' };
    }
  },

  /** Template events come from `weeklyEvents`; there is nothing bespoke to invent offline. */
  async dynamicEvent() {
    return null;
  },

  async chat(ctx, persona, personaName, history, message) {
    try { return chatReply(ctx, persona, personaName, history, message); } catch {
      return langOf(ctx) === 'tr' ? 'Hmm, anlıyorum.' : 'Hmm, I see.';
    }
  },

  async biography(ctx, careerFacts) {
    try { return writeBiography(ctx, careerFacts); } catch { return careerFacts; }
  },
};

