/**
 * Deterministic stand-ins for the modules the controller orchestrates. Test files wire
 * them with `vi.mock('../../x/api', async () => (await import('./mocks')).xMock)` so the
 * controller's own logic is tested independently of the other modules' progress.
 * `env` is mutable per test (call `resetEnv()` in beforeEach).
 */
import { vi } from 'vitest';
import type {
  ContractTerms, Effects, Fixture, GameEvent, GameState, MatchContext, MatchSummary, Negotiation, SeasonSummary,
  SponsorDeal, TransferOffer, UserMatchRole, WeekInfo,
} from '../../core/types';
import type { Narrator, NewsSeed } from '../../core/narrative-types';
import type { Rng } from '../../core/rng';

type Step = { accepted: boolean; collapsed: boolean; terms: ContractTerms; patienceDelta: number };

export interface Env {
  fixtures: Fixture[];
  role: UserMatchRole;
  window: boolean | null;
  breaks: number[];
  weeklyEvents: () => GameEvent[];
  seeds: () => NewsSeed[];
  simulateWeekThrows: boolean;
  step: ((ask: ContractTerms, neg: Negotiation) => Step) | null;
  sponsor: SponsorDeal | null;
  narratorKind: 'template' | 'claude';
  narrator: Partial<Narrator>;
  order: string[];
  resolveThrows: boolean;
  calls: Record<string, number>;
}

export const env: Env = {} as Env;

export function resetEnv(): void {
  Object.assign(env, {
    fixtures: [], role: 'starter', window: null, breaks: [], weeklyEvents: () => [], seeds: () => [], simulateWeekThrows: false,
    step: null, sponsor: null, narratorKind: 'template', narrator: {}, order: [], resolveThrows: false, calls: {},
  } satisfies Env);
}
resetEnv();

const count = (k: string) => { env.calls[k] = (env.calls[k] ?? 0) + 1; };

export function fixture(id: string, homeId: string, awayId: string, week = 0, extra: Partial<Fixture> = {}): Fixture {
  return { id, compId: 'ENG-1-2026', season: 2026, week, slot: 'weekend', round: week + 1, homeId, awayId, played: false, ...extra };
}

export function summary(fixtureId: string, homeGoals: number, awayGoals: number, userId = 'USER', userGoals = 0): MatchSummary {
  return {
    fixtureId, homeGoals, awayGoals, events: [], possession: 50, shots: { home: 5, away: 5 }, xg: { home: 1, away: 1 },
    ratings: { [userId]: 7.2 }, motmId: null,
    user: {
      rating: 7.2, xp: {}, highlights: 2,
      stats: {
        minutes: 90, goals: userGoals, assists: 0, shots: 2, shotsOnTarget: 1, passes: 20, passesCompleted: 17, keyPasses: 1, dribbles: 1,
        tackles: 1, interceptions: 0, foulsWon: 1, foulsConceded: 0, moments: 4,
      },
    },
    minutes: { [userId]: 90 },
  };
}

// ───────── competition ─────────

export const competitionMock = {
  WEEKS_PER_SEASON: 52,
  LAST_CLUB_WEEK: 44,
  weekInfo: (season: number, week: number): WeekInfo => ({
    season, week, date: '2026-08-01', label: { tr: `Hafta ${week + 1}`, en: `Week ${week + 1}` },
    phase: week >= 45 ? 'summer' : 'season', transferWindow: env.window ?? (week >= 45 || week <= 3),
    internationalBreak: env.breaks.includes(week), tournament: false,
  }),
  createSeasonCompetitions: () => ({}),
  fixturesForWeek: (state: GameState, week: number) => env.fixtures.filter((f) => f.week === week && !f.played),
  userFixturesForWeek: (state: GameState) => {
    const club = state.world.players[state.career.playerId]?.clubId;
    return env.fixtures.filter((f) => f.week === state.week && club && (f.homeId === club || f.awayId === club));
  },
  findFixture: (_s: GameState, id: string) => env.fixtures.find((f) => f.id === id) ?? null,
  teamInfo: (state: GameState, id: string) => ({
    name: state.world.clubs[id]?.name ?? id, shortName: id, kit: { primary: '#000', secondary: '#fff', style: 'plain' }, reputation: 50, isNational: false,
  }),
  buildMatchContext: (state: GameState, f: Fixture, role: UserMatchRole): MatchContext => ({
    fixtureId: f.id, compId: f.compId, compName: 'Test Division', userSide: 'home', userRole: role,
    home: { teamId: f.homeId } as never, away: { teamId: f.awayId } as never,
    weather: { kind: 'clear', time: 'night', wind: { x: 0, y: 0 }, temperature: 15 }, importance: 0.5, derby: false, knockout: false,
    stadium: 'Arena', attendance: 30000,
  }),
  applyResult: (_s: GameState, id: string, sm: MatchSummary) => {
    count('applyResult');
    const f = env.fixtures.find((x) => x.id === id);
    if (!f) throw new Error('no fixture');
    Object.assign(f, { played: true, homeGoals: sm.homeGoals, awayGoals: sm.awayGoals });
  },
  simulateWeek: (state: GameState, rng: Rng, skip: string[]) => {
    count('simulateWeek');
    env.order.push(`simulateWeek:${skip.join(',')}`);
    rng.next();
    if (env.simulateWeekThrows) {
      state.week = 99; // half-applied mutation that must be rolled back
      throw new Error('sim exploded');
    }
    return env.fixtures.filter((f) => f.week === state.week && !f.played && !skip.includes(f.id)).map((f) => {
      Object.assign(f, { played: true, homeGoals: 1, awayGoals: 0 });
      return { fixture: f, summary: summary(f.id, 1, 0) };
    });
  },
  sortedTable: () => [],
  userLeague: () => null,
  leaguePosition: () => 3,
  topScorers: () => [],
  isSeasonComplete: (state: GameState) => state.week >= 45,
  endOfSeason: (state: GameState): SeasonSummary => {
    count('endOfSeason');
    const s: SeasonSummary = { season: state.season, champions: {}, awards: [], promoted: [], relegated: [] };
    state.seasons.push(s);
    return s;
  },
  startNewSeason: (state: GameState) => {
    count('startNewSeason');
    state.season += 1;
    state.week = 0;
  },
  computeAwards: () => [],
  buildTeamSheet: () => { throw new Error('unused'); },
  teamStrength: () => ({ att: 50, mid: 50, def: 50, gk: 50, overall: 50 }),
  randomWeather: () => ({ kind: 'clear', time: 'day', wind: { x: 0, y: 0 }, temperature: 20 }),
  quickSimulate: () => { throw new Error('unused'); },
};

// ───────── career ─────────

function applyEffects(state: GameState, e: Effects): string[] {
  const c = state.career;
  if (e.money) c.money += e.money;
  if (e.fame) c.fame = Math.max(0, Math.min(100, c.fame + e.fame));
  if (e.followers) c.followers = Math.max(0, c.followers + e.followers);
  if (e.energy) c.energy = Math.max(0, Math.min(100, c.energy + e.energy));
  for (const [k, v] of Object.entries(e.rel ?? {})) {
    const key = k as keyof typeof c.relationships;
    c.relationships[key] = Math.max(0, Math.min(100, c.relationships[key] + (v ?? 0)));
  }
  return [];
}

export const careerMock = {
  ACTIONS_PER_WEEK: 3,
  REL_KEYS: ['manager', 'teammates', 'fans', 'media', 'family', 'partner', 'agent', 'sponsors'],
  TRAITS: [], TRAINING_FOCUSES: [], SHOP_ITEMS: [], ACTIVITIES: [],
  userPlayer: (s: GameState) => s.world.players[s.career.playerId],
  applyEffects: vi.fn(applyEffects),
  sanitizeEffects: (e: Effects) => ({ ...e }),
  relationshipLabel: () => '',
  selectionFor: () => env.role,
  trainWeek: (_s: GameState, rng: Rng) => { rng.next(); return []; },
  weeklyRecovery: () => [],
  applyWeeklyFinances: (s: GameState) => { s.career.money += 100; return { wage: 100, sponsors: 0, upkeep: 0, tax: 0, total: 100 }; },
  nationalCallup: () => false,
  generateOffers: () => [] as TransferOffer[],
  maybeSponsorOffer: () => env.sponsor,
  acceptSponsor: vi.fn((s: GameState, d: SponsorDeal) => { s.career.sponsors.push(d); }),
  checkCareerGoals: () => [],
  marketValue: () => 250_000,
  userSeasonAgeing: () => [],
  contractHousekeeping: () => [],
  retirementStatus: () => ({ canRetire: false, forced: false }),
  hallOfFameScore: () => 42,
  makeCareerGoals: () => [],
  trialOffers: () => [],
  fairWage: () => 2000,
  doActivity: (s: GameState, rng: Rng, id: string) => {
    rng.next(); rng.next(); rng.next();
    s.career.actionsLeft -= 1;
    return { ok: true, text: `did ${id}`, notes: [] };
  },
  applyDrill: () => [{ attr: 'shooting', delta: 1 }],
  buyItem: () => ({ ok: true }),
  sellItem: () => ({ ok: true, refund: 10 }),
  afterUserMatch: (s: GameState, fixtureId: string, sm: MatchSummary) => {
    s.career.matches.push({
      fixtureId, season: s.season, week: s.week, compName: 'Test Division', opponent: 'X', home: true, goalsFor: sm.homeGoals,
      goalsAgainst: sm.awayGoals, rating: sm.user?.rating ?? 6, goals: sm.user?.stats.goals ?? 0, assists: 0, minutes: 90, motm: false,
    });
    return ['note'];
  },
  startNegotiation: (s: GameState, offerId: string): Negotiation => {
    const o = s.offers.find((x) => x.id === offerId)!;
    return {
      offerId, clubId: o.fromClubId, round: 0, maxRounds: 4, patience: 50, current: { ...o.terms },
      limits: { maxWage: 5000, maxYears: 4, minReleaseClause: null, maxSigningBonus: 10_000, maxGoalBonus: 1000, roles: ['rotation', 'starter'] },
      lines: [], status: 'open',
    };
  },
  negotiationStep: (s: GameState, ask: ContractTerms, rng: Rng): Step => {
    env.order.push('step');
    rng.next();
    const neg = s.negotiation!;
    if (env.step) return env.step(ask, neg);
    return { accepted: false, collapsed: false, terms: { ...neg.current, wage: Math.round((neg.current.wage + ask.wage) / 2) }, patienceDelta: -10 };
  },
  clampTerms: vi.fn((neg: Negotiation, t: ContractTerms): ContractTerms => ({
    ...t,
    wage: Math.min(t.wage, neg.limits.maxWage),
    years: Math.max(1, Math.min(t.years, neg.limits.maxYears)),
    role: neg.limits.roles.includes(t.role) ? t.role : neg.limits.roles[0],
  })),
  acceptOffer: vi.fn((s: GameState, offerId: string, terms?: ContractTerms) => {
    const o = s.offers.find((x) => x.id === offerId);
    if (!o) throw new Error('no offer');
    const p = s.world.players[s.career.playerId];
    if (p.clubId) s.world.clubs[p.clubId].squad = s.world.clubs[p.clubId].squad.filter((id) => id !== p.id);
    p.clubId = o.fromClubId;
    s.world.clubs[o.fromClubId].squad.push(p.id);
    const t = terms ?? o.terms;
    p.contract = { clubId: o.fromClubId, wage: t.wage, startSeason: s.season, endSeason: s.season + t.years - 1, releaseClause: t.releaseClause, role: t.role, goalBonus: t.goalBonus, appearanceBonus: 0 };
    o.status = 'accepted';
  }),
  rejectOffer: (s: GameState, id: string) => { const o = s.offers.find((x) => x.id === id); if (o) o.status = 'rejected'; },
  setTransferListed: (s: GameState, on: boolean) => { s.career.transferListed = on; },
  canDoActivity: () => ({ ok: true }),
  weeklyFinances: () => ({ wage: 0, sponsors: 0, upkeep: 0, tax: 0, total: 0 }),
  applyXp: () => [],
  rollInjury: () => null,
};

// ───────── narrator (shared by narrative.templateNarrator and ai.getNarrator) ─────────

const defaults: Partial<Narrator> = {
  news: async (_ctx, seeds) => seeds.map((s) => ({ outlet: 'Test Gazette', headline: `H: ${s.facts.slice(0, 40)}`, body: s.facts, tags: s.tags, importance: s.importance, aboutUser: s.aboutUser, ai: false })),
  social: async (_ctx, _trigger, n) => Array.from({ length: n }, (_, i) => ({
    author: { name: `Fan ${i}`, handle: `@fan${i}`, kind: 'fan' as const, verified: false }, text: `post ${i}`, likes: 3, reposts: 1, sentiment: 0.5, ai: false,
  })),
  pressQuestions: async () => [{
    id: 'q1', journalist: 'J', outlet: 'Test Gazette', text: 'Question?', topic: 'form',
    options: [{ id: 'o1', tone: 'humble', text: 'Humble answer' }, { id: 'o2', tone: 'provocative', text: 'Spicy answer' }],
  }],
  evaluatePress: async () => ({ tone: 'provocative', effects: { fame: 50, morale: -40, money: 1_000_000, rel: { media: -90 } }, headline: 'Bomb dropped', feedback: 'Oops.' }),
  negotiate: async (_ctx, neg) => ({ text: 'Director says hi.', terms: { ...neg.current }, patienceDelta: 0, walkAway: false }),
  dynamicEvent: async () => null,
  chat: async (_ctx, _p, name) => `Hi from ${name}`,
  biography: async () => 'A long and winding biography of a footballer who gave everything to the game.',
};

export const fakeNarrator: Narrator = new Proxy({} as Narrator, {
  get: (_t, prop: string) => {
    if (prop === 'kind') return env.narratorKind;
    if (prop === 'then') return undefined;
    return (...args: unknown[]) => {
      env.order.push(`narrator.${prop}`);
      const impl = (env.narrator as Record<string, unknown>)[prop] ?? (defaults as Record<string, unknown>)[prop];
      if (typeof impl !== 'function') return Promise.reject(new Error(`no fake for ${prop}`));
      return (impl as (...a: unknown[]) => unknown)(...args);
    };
  },
});

export const narrativeMock = {
  buildNarrativeContext: () => { throw new Error('use minimal context'); },
  templateNarrator: fakeNarrator,
  weeklyEvents: () => env.weeklyEvents(),
  resolveEvent: (s: GameState, eventId: string, choiceId: string, rng: Rng) => {
    rng.next();
    if (env.resolveThrows) { s.career.money += 999_999; throw new Error('resolve exploded'); }
    const e = s.events.find((x) => x.id === eventId)!;
    const c = e.choices.find((x) => x.id === choiceId)!;
    applyEffects(s, c.effects);
    e.resolved = { choiceId, text: c.resultText ?? 'ok' };
    return e.resolved.text;
  },
  updateStorylines: () => ({ events: [], seeds: [] }),
  initialStorylines: () => [],
  newsSeedsForWeek: () => env.seeds(),
  matchCommentary: () => '',
  momentCommentary: () => null,
  outletsFor: () => ['Test Gazette'],
};

export const aiMock = { getNarrator: () => fakeNarrator };

export const worldMock = {
  NATIONS: [], LEAGUES: [],
  getNation: () => { throw new Error('unused'); },
  positionName: (p: string) => p,
  generateWorld: () => { throw new Error('unused'); },
};

// ───────── match flow ─────────

export class FakeLiveMatch {
  constructor(public state: GameState, public ctx: MatchContext, public rng: Rng) {}
  done = false;
  simulateToEnd(): void { this.done = true; this.rng.next(); }
  summary(): MatchSummary { return summary(this.ctx.fixtureId, 2, 1, 'USER', 1); }
}

export const flowMock = { LiveMatch: FakeLiveMatch };

// ───────── helpers ─────────

export function event(id: string, nChoices = 2): GameEvent {
  return {
    id, defId: 'test', season: 2026, week: 0, title: `Event ${id}`, body: 'Body', icon: 'sparkles', source: 'template',
    choices: Array.from({ length: nChoices }, (_, i) => ({ id: `c${i + 1}`, label: `Choice ${i + 1}`, effects: { money: 10 * (i + 1) }, resultText: `Result ${i + 1}` })),
  };
}

export function offer(id: string, clubId: string, kind: TransferOffer['kind'] = 'transfer', wage = 2000): TransferOffer {
  return {
    id, kind, fromClubId: clubId, season: 2026, week: 0, expiresWeek: 202630, fee: kind === 'trial' ? 0 : 1_500_000, status: 'pending',
    parentClubAccepts: true, note: 'We want you.', terms: { wage, years: 3, releaseClause: null, role: 'rotation', signingBonus: 0, goalBonus: 0 },
  };
}
