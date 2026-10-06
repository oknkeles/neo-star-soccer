import type { ContractTerms, Negotiation } from '../../core/types';
import type { GenesisInput, NarrativeContext, Narrator, PressQuestion } from '../../core/narrative-types';
import type { ClaudeRequest, ClaudeResponse, ClaudeTransport } from '../narrator';
import type { CompactEffects } from '../schemas';

export function makeCtx(over: Partial<NarrativeContext> = {}): NarrativeContext {
  return {
    lang: 'tr', season: 2026, week: 7,
    player: {
      name: 'Deniz Yıldız', age: 17, nation: 'Türkiye', position: 'Forvet', overall: 58, potentialHint: 'world-class',
      traits: ['showman', 'big_game'], fame: 12, followers: 40_000, morale: 64, form: 60, value: 1_200_000, wage: 2_500, injured: false,
    },
    club: { name: 'Ege Yıldızları', city: 'İzmir', league: 'Süper Lig', leaguePos: 4, reputation: 66, managerName: 'Coach No0', managerTemperament: 'calm' },
    seasonStats: { apps: 6, goals: 3, assists: 1, avgRating: 6.9 },
    careerStats: { apps: 6, goals: 3, assists: 1, trophies: 0, caps: 0 },
    relationships: { manager: 55, teammates: 60, fans: 48, media: 40, family: 72, partner: 0, agent: 61, sponsors: 20 },
    rival: { name: 'Kaan Demir', club: 'Boğaziçi FK', goals: 4, overall: 60 },
    mentor: { name: 'Ozan Akın' }, partner: null, agent: { name: 'Kemal Usta', personality: 'shrewd' },
    recentResults: ['W 2-1 vs Anadolu (G, 7.8)'], storylines: [{ kind: 'rival', stage: 1 }],
    hometown: 'İzmir', backstory: 'Grew up by the sea.', dream: 'World Cup.', recentHeadlines: ['Genç forvet parladı'],
    ...over,
  };
}

export const genesisInput: GenesisInput = {
  lang: 'tr', firstName: 'Deniz', lastName: 'Yıldız', nation: 'TUR', nationName: 'Türkiye', position: 'ST', positionName: 'Forvet',
  foot: 'L', traits: ['showman'], hometownHint: 'İzmir', rivalName: 'Kaan Demir', rivalClub: 'Boğaziçi FK', mentorName: 'Ozan Akın',
  startingClubName: 'Ege Yıldızları', seedFlavor: 'prodigy',
};

export const terms = (o: Partial<ContractTerms> = {}): ContractTerms => ({
  wage: 10_000, years: 3, releaseClause: 20_000_000, role: 'rotation', signingBonus: 50_000, goalBonus: 1_000, ...o,
});

export function makeNegotiation(o: Partial<Negotiation> = {}): Negotiation {
  return {
    offerId: 'OF-1', clubId: 'ENG-1-02', round: 2, maxRounds: 5, patience: 70, current: terms(),
    limits: { maxWage: 12_000, maxYears: 4, minReleaseClause: 15_000_000, maxSigningBonus: 100_000, maxGoalBonus: 3_000, roles: ['rotation', 'starter'] },
    lines: [{ from: 'club', text: 'Teklifimiz bu.' }], status: 'open', ...o,
  };
}

export const question: PressQuestion = {
  id: 'q1', journalist: 'Ayşe Er', outlet: 'Gol Postası', text: 'Rakibin Kaan hakkında ne düşünüyorsun?', topic: 'rival',
  options: [
    { id: 'q1-a', tone: 'humble', text: 'Kaan iyi oyuncu.' },
    { id: 'q1-b', tone: 'provocative', text: 'Kaan kim?' },
  ],
};

export const zeroEffects = (): CompactEffects => ({ money: 0, fame: 0, morale: 0, energy: 0, form: 0, followers: 0, injuryWeeks: 0, rel: [], xp: [] });

/** Fake transport: answers from a per-feature table, records every request. */
export function fakeTransport(answers: Partial<Record<string, ClaudeResponse | ((req: ClaudeRequest) => ClaudeResponse | Promise<ClaudeResponse>) | Error>>) {
  const calls: ClaudeRequest[] = [];
  const call: ClaudeTransport = async (req) => {
    calls.push(req);
    const a = answers[req.feature];
    if (a === undefined) throw new Error(`no fake answer for ${req.feature}`);
    if (a instanceof Error) throw a;
    return typeof a === 'function' ? a(req) : a;
  };
  return { call, calls };
}

export const ok = (parsed: unknown): ClaudeResponse => ({ stopReason: 'end_turn', parsed, text: JSON.stringify(parsed) });

/** A template narrator stand-in that tags its output so tests can see the fallback ran. */
export function fakeTemplate(): Narrator & { used: string[] } {
  const used: string[] = [];
  return {
    kind: 'template',
    used,
    async genesis(input) {
      used.push('genesis');
      return {
        hometown: input.hometownHint, backstory: 'TEMPLATE', motto: 'm', dream: 'd', theme: 't', destinyHint: 'h', rivalBlurb: 'r',
        mentorBlurb: '', family: [], agent: { name: 'A', personality: 'p', bio: 'b' }, ai: false,
      };
    },
    async news(_ctx, seeds) {
      used.push('news');
      return seeds.map((s) => ({ outlet: 'T', headline: `TEMPLATE ${s.facts}`, body: s.facts, tags: s.tags, importance: s.importance, aboutUser: s.aboutUser, ai: false }));
    },
    async social() { used.push('social'); return []; },
    async pressQuestions() { used.push('pressQuestions'); return [question]; },
    async evaluatePress() { used.push('evaluatePress'); return { tone: 'diplomatic', effects: {}, headline: 'TEMPLATE', feedback: 'f' }; },
    async negotiate(_ctx, neg) { used.push('negotiate'); return { text: 'TEMPLATE', terms: neg.current, patienceDelta: 0, walkAway: false }; },
    async dynamicEvent() { used.push('dynamicEvent'); return null; },
    async chat() { used.push('chat'); return 'TEMPLATE'; },
    async biography() { used.push('biography'); return 'TEMPLATE'; },
  };
}
