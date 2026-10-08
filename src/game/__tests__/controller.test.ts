import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestState } from '../../core/testing';
import { Rng } from '../../core/rng';
import { setLang } from '../../core/i18n';
import type { GameState } from '../../core/types';
import { env, event, fixture, offer, resetEnv, summary } from './mocks';

vi.mock('../../competition/api', async () => (await import('./mocks')).competitionMock);
vi.mock('../../career/api', async () => (await import('./mocks')).careerMock);
vi.mock('../../narrative/api', async () => (await import('./mocks')).narrativeMock);
vi.mock('../../ai/api', async () => (await import('./mocks')).aiMock);
vi.mock('../../world/api', async () => (await import('./mocks')).worldMock);
vi.mock('../../match/flow/api', async () => (await import('./mocks')).flowMock);

const { GameController, GameBlockedError, MAX_PENDING_EVENTS } = await import('../controller');
const { memoryStorage } = await import('../storage');
const { SPONSOR_FLAG } = await import('../persist');
const { FLAG } = await import('../agenda');

type Ctl = InstanceType<typeof GameController>;

function setup(mutate?: (s: GameState) => void): { g: Ctl; s: GameState; storage: ReturnType<typeof memoryStorage> } {
  const storage = memoryStorage();
  const g = new GameController({ storage, autosaveMs: 0 });
  const s = makeTestState();
  s.flags[FLAG.everSigned] = true;
  mutate?.(s);
  g.state = s;
  g.slot = 0;
  return { g, s, storage };
}

beforeEach(() => {
  resetEnv();
  setLang('en');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('store', () => {
  it('commit bumps the version, notifies listeners and yields a fresh snapshot per version', () => {
    const { g } = setup();
    const fn = vi.fn();
    const off = g.subscribe(fn);
    const snap1 = g.getSnapshot();
    expect(g.getSnapshot()).toBe(snap1);
    g.commit();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(g.getVersion()).toBe(snap1.version + 1);
    const snap2 = g.getSnapshot();
    expect(snap2).not.toBe(snap1);
    expect(snap2.state).toBe(g.state);
    off();
    g.commit();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('autosave is debounced after commits', async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const set = vi.spyOn(storage, 'set');
    const g = new GameController({ storage, autosaveMs: 1500 });
    g.state = makeTestState();
    g.slot = 1;
    g.commit(); g.commit(); g.commit();
    expect(set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1600);
    await g.whenIdle();
    const saveWrites = set.mock.calls.filter(([k]) => k === 'nss.save.1');
    expect(saveWrites).toHaveLength(1);
  });
});

describe('saves', () => {
  it('save → listSaves → load restores the career', async () => {
    const { g, s } = setup();
    s.week = 9;
    await g.save();
    const metas = await g.listSaves();
    expect(metas).toEqual([expect.objectContaining({ slot: 0, name: 'Deniz Yıldız', week: 9, season: 2026 })]);
    s.week = 30;
    s.career.money = -1;
    await g.load(0);
    expect(g.state).not.toBe(s);
    expect(g.state!.week).toBe(9);
    expect(g.state!.career.money).toBe(5000);
  });

  it('export → import into another slot, delete, and invalid imports are rejected', async () => {
    const { g } = setup();
    const json = g.exportSave();
    await g.importSave(json, 2);
    expect((await g.listSaves()).map((m) => m.slot)).toEqual([2]);
    expect(g.slot).toBe(0); // a running career in another slot stays active
    await expect(g.importSave('{"broken":', 1)).rejects.toThrow();
    await expect(g.importSave(JSON.stringify({ hello: 'world' }), 1)).rejects.toThrow();
    await g.deleteSave(2);
    expect(await g.listSaves()).toEqual([]);
    await expect(g.load(2)).rejects.toThrow();
  });

  it('saves are lean: feeds trimmed, world kept', async () => {
    const { g, s, storage } = setup();
    for (let i = 0; i < 400; i++) s.social.push({ id: `S${i}`, season: 2026, week: 0, author: { name: 'a', handle: '@a', kind: 'fan', verified: false }, text: 'x', likes: 0, reposts: 0, sentiment: 0, ai: false });
    await g.save();
    const raw = JSON.parse((await storage.get<string>('nss.save.0'))!) as { state: GameState };
    expect(raw.state.social.length).toBeLessThan(400);
    expect(Object.keys(raw.state.world.players).length).toBe(Object.keys(s.world.players).length);
    expect(s.social).toHaveLength(400);
  });

  it('quit clears the career and notifies', () => {
    const { g } = setup();
    const fn = vi.fn();
    g.subscribe(fn);
    g.quit();
    expect(g.state).toBeNull();
    expect(fn).toHaveBeenCalled();
    expect(g.getSnapshot().state).toBeNull();
  });
});

describe('agenda & blockers', () => {
  it('a new career without a club must pick a trial offer first', () => {
    const { g, s } = setup((st) => {
      delete st.flags[FLAG.everSigned];
      const u = st.world.players.USER;
      st.world.clubs[u.clubId!].squad = st.world.clubs[u.clubId!].squad.filter((id) => id !== 'USER');
      u.clubId = null;
      u.contract = null;
      st.offers.push(offer('OF-T1', 'ENG-1-03', 'trial'));
    });
    const a = g.agenda();
    expect(a.needsClub).toBe(true);
    expect(a.canAdvance).toBe(false);
    expect(a.blockers.join(' ')).toMatch(/trial/i);
    g.respondOffer('OF-T1', 'accept');
    expect(s.world.players.USER.clubId).toBe('ENG-1-03');
    const b = g.agenda();
    expect(b.needsClub).toBe(false);
    expect(b.canAdvance).toBe(true);
    expect(b.pressAvailable).toBe('unveiling');
  });

  it('unplayed user fixtures block unless the manager leaves the user out', () => {
    const { g } = setup();
    env.fixtures = [fixture('F1', 'ENG-1-00', 'ENG-1-01'), fixture('F2', 'ENG-1-02', 'ENG-1-03')];
    let a = g.agenda();
    expect(a.fixtures).toHaveLength(1);
    expect(a.fixtures[0]).toMatchObject({ role: 'starter', home: true, opponent: 'Test City 1' });
    expect(a.pendingMatches).toEqual(['F1']);
    expect(a.canAdvance).toBe(false);
    env.role = 'none';
    a = g.agenda();
    expect(a.pendingMatches).toEqual([]);
    expect(a.canAdvance).toBe(true);
  });

  it('pending events with choices block; info-only events do not', () => {
    const { g, s } = setup();
    s.events.push(event('E1', 0));
    expect(g.agenda().canAdvance).toBe(true);
    s.events.push(event('E2', 2));
    const a = g.agenda();
    expect(a.canAdvance).toBe(false);
    expect(a.blockers[0]).toContain('Event E2');
    g.resolveEvent('E2', 'c2');
    expect(g.agenda().canAdvance).toBe(true);
  });

  it('retired careers cannot advance', () => {
    const { g, s } = setup();
    s.career.retired = true;
    const a = g.agenda();
    expect(a.canAdvance).toBe(false);
    expect(a.pressAvailable).toBeNull();
  });
});

describe('rng persistence', () => {
  it('actions consume the career rng and store it back', () => {
    const { g, s } = setup();
    const expected = new Rng(s.rng);
    expected.next(); expected.next(); expected.next();
    const res = g.doActivity('rest');
    expect(res.ok).toBe(true);
    expect(s.rng).toEqual(expected.state());
    expect(s.career.actionsLeft).toBe(2);
  });

  it('advanceWeek is deterministic for identical states', async () => {
    const a = setup();
    const b = setup();
    await a.g.advanceWeek();
    await b.g.advanceWeek();
    expect(a.s.rng).toEqual(b.s.rng);
    expect(a.s.rng).not.toEqual(makeTestState().rng);
  });

  it('a failing event resolution is rolled back and resolved locally', () => {
    const { g, s } = setup();
    s.events.push(event('E1'));
    env.resolveThrows = true;
    const text = g.resolveEvent('E1', 'c1');
    expect(text).toBe('Result 1');
    expect(s.career.money).toBe(5010); // the narrative mutation (+999 999) was rolled back; choice applied once
    expect(s.events[0].resolved?.choiceId).toBe('c1');
  });
});

describe('advanceWeek', () => {
  it('refuses to advance while blocked and leaves the state untouched', async () => {
    const { g, s } = setup();
    env.fixtures = [fixture('F1', 'ENG-1-00', 'ENG-1-01')];
    const before = JSON.stringify(s);
    await expect(g.advanceWeek()).rejects.toBeInstanceOf(GameBlockedError);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('simulates the week (skipping user-played fixtures), resets actions and stores a report', async () => {
    const { g, s } = setup();
    env.fixtures = [fixture('F1', 'ENG-1-00', 'ENG-1-01'), fixture('F2', 'ENG-1-02', 'ENG-1-03')];
    await g.simulateUserMatch('F1');
    expect(g.agenda().canAdvance).toBe(true);
    s.career.actionsLeft = 0;
    const report = await g.advanceWeek();
    expect(env.order).toContain('simulateWeek:F1');
    expect(report.userMatches).toEqual(['F1']);
    // Only notable results are reported (the user's own matches first; F2 is outside the user's competitions here).
    expect(report.results.map((r) => r.fixtureId)).toEqual(expect.arrayContaining(['F1']));
    expect(report.moneyDelta).toBe(100);
    expect(s.week).toBe(1);
    expect(s.career.actionsLeft).toBe(3);
    expect(s.career.lastWeekReport).toEqual(report);
    expect(s.flags[FLAG.userPlayed]).toBeUndefined();
  });

  it('rolls everything back when a module throws mid-week', async () => {
    const { g, s } = setup();
    env.simulateWeekThrows = true;
    const before = JSON.stringify(s);
    await expect(g.advanceWeek()).rejects.toThrow('sim exploded');
    expect(JSON.stringify(s)).toBe(before);
    expect(g.advancing).toBe(false);
  });

  it('caps pending events at three and mirrors them in the inbox', async () => {
    const { g, s } = setup();
    env.weeklyEvents = () => ['A', 'B', 'C', 'D', 'E'].map((id) => event(id));
    await g.advanceWeek();
    expect(s.events.filter((e) => !e.resolved)).toHaveLength(MAX_PENDING_EVENTS);
    expect(s.inbox.filter((m) => m.ref?.type === 'event')).toHaveLength(MAX_PENDING_EVENTS);
  });

  it('keeps news and social within caps', async () => {
    const { g, s } = setup();
    for (let i = 0; i < 160; i++) s.news.push({ id: `N${i}`, season: 2026, week: 0, outlet: 'o', headline: 'h', body: '', tags: [], importance: 0, aboutUser: false, ai: false });
    env.seeds = () => [1, 2, 3].map((i) => ({ kind: 'league' as const, facts: `Fact ${i}.`, aboutUser: false, importance: 0.5, tags: ['league'] }));
    await g.advanceWeek();
    expect(s.news.length).toBeLessThanOrEqual(150);
    expect(s.news.some((n) => n.headline.startsWith('H: Fact'))).toBe(true);
  });

  it('closes the season and rolls over into the next one', async () => {
    const { g, s } = setup((st) => { st.week = 44; });
    const r1 = await g.advanceWeek();
    expect(r1.seasonEnded).toBe(true);
    expect(env.calls.endOfSeason).toBe(1);
    expect(s.week).toBe(45);
    expect(s.inbox.some((m) => m.subject.includes('2026/27'))).toBe(true);
    s.week = 51;
    await g.advanceWeek();
    expect(env.calls.endOfSeason).toBe(1);
    expect(env.calls.startNewSeason).toBe(1);
    expect(s.season).toBe(2027);
    expect(s.week).toBe(0);
  });

  it('sponsor proposals live in flags until answered', async () => {
    const { g, s } = setup();
    env.sponsor = { id: 'SP-1', brand: 'Kartal Boots', category: 'boots', weekly: 800, endSeason: 2027 };
    await g.advanceWeek();
    const msg = s.inbox.find((m) => m.ref?.type === 'sponsor')!;
    expect(msg).toBeDefined();
    expect(s.flags[SPONSOR_FLAG + 'SP-1']).toBeTypeOf('string');
    expect(g.pendingSponsor(msg.id)?.brand).toBe('Kartal Boots');
    g.acceptSponsor(msg.id, true);
    expect(s.career.sponsors.map((d) => d.id)).toEqual(['SP-1']);
    expect(s.flags[SPONSOR_FLAG + 'SP-1']).toBeUndefined();
    expect(g.pendingSponsor(msg.id)).toBeNull();
  });
});

describe('matches', () => {
  it('finishMatch applies once, marks the fixture as user-played and writes the news', async () => {
    const { g, s } = setup();
    env.fixtures = [fixture('F1', 'ENG-1-00', 'ENG-1-01')];
    const notes = await g.finishMatch('F1', summary('F1', 3, 0, 'USER', 2));
    expect(notes).toEqual(['note']);
    expect(await g.finishMatch('F1', summary('F1', 3, 0))).toEqual([]);
    expect(env.calls.applyResult).toBe(1);
    expect(s.flags[FLAG.userPlayed]).toBe('F1');
    await g.whenIdle();
    expect(s.news.some((n) => n.aboutUser)).toBe(true);
    expect(s.social.length).toBeGreaterThan(0);
  });

  it('startMatch builds the context with the selected role and persists rng', () => {
    const { g, s } = setup();
    env.fixtures = [fixture('F1', 'ENG-1-00', 'ENG-1-01')];
    env.role = 'bench';
    const before = [...s.rng];
    const { ctx, live } = g.startMatch('F1');
    expect(ctx.userRole).toBe('bench');
    expect(live).toBeDefined();
    expect(s.rng).not.toEqual(before);
    expect(g.activeMatch?.fixtureId).toBe('F1');
  });
});

describe('negotiation', () => {
  function withOffer() {
    const ctx = setup((st) => { st.offers.push(offer('OF-1', 'ENG-1-04', 'transfer', 2000)); });
    return ctx;
  }

  it('runs the deterministic step before the narrator and records the round', async () => {
    const { g, s } = withOffer();
    await g.openNegotiation('OF-1');
    expect(s.negotiation?.status).toBe('open');
    expect(s.offers[0].status).toBe('negotiating');
    let seen: { round: number; lastFrom: string } | null = null;
    env.narrator.negotiate = async () => {
      seen = { round: s.negotiation!.round, lastFrom: s.negotiation!.lines[s.negotiation!.lines.length - 1].from };
      return { text: 'Let us talk.', terms: { ...s.negotiation!.current }, patienceDelta: 0, walkAway: false };
    };
    await g.negotiate({ ...s.offers[0].terms, wage: 3000 }, 'I want more.');
    expect(env.order.indexOf('step')).toBeLessThan(env.order.indexOf('narrator.negotiate'));
    expect(seen).toEqual({ round: 1, lastFrom: 'player' });
    const neg = s.negotiation!;
    expect(neg.round).toBe(1);
    expect(neg.patience).toBe(40);
    expect(neg.current.wage).toBe(2500);
    expect(neg.lines.map((l) => l.from)).toEqual(['club', 'agent', 'player', 'club']);
  });

  it('clamps Claude terms and patience; collapses when patience runs out', async () => {
    const { g, s } = withOffer();
    env.narratorKind = 'claude';
    await g.openNegotiation('OF-1');
    env.narrator.negotiate = async (_c, neg) => ({ text: 'Fine.', terms: { ...neg.current, wage: 99_999, years: 9 }, patienceDelta: -500, walkAway: false });
    await g.negotiate({ ...s.offers[0].terms, wage: 3000 }, null);
    let neg = s.negotiation!;
    expect(neg.current.wage).toBe(5000);
    expect(neg.current.years).toBe(4);
    expect(neg.patience).toBe(10); // 50 −10 (step) −30 (clamped narrator delta)
    expect(neg.status).toBe('open');
    await g.negotiate({ ...s.offers[0].terms, wage: 3000 }, null);
    neg = s.negotiation!;
    expect(neg.status).toBe('collapsed');
    expect(s.offers[0].status).toBe('withdrawn');
    expect(s.inbox.some((m) => /walk away/.test(m.subject))).toBe(true);
  });

  it('accepting agreed terms signs the player with clamped terms', async () => {
    const { g, s } = withOffer();
    await g.openNegotiation('OF-1');
    env.step = (ask) => ({ accepted: true, collapsed: false, terms: ask, patienceDelta: 0 });
    await g.negotiate({ ...s.offers[0].terms, wage: 4200, years: 4 }, null);
    expect(s.negotiation?.status).toBe('agreed');
    g.acceptNegotiatedTerms();
    expect(s.negotiation).toBeNull();
    expect(s.world.players.USER.clubId).toBe('ENG-1-04');
    expect(s.world.players.USER.contract?.wage).toBe(4200);
    expect(s.world.clubs['ENG-1-00'].squad).not.toContain('USER');
    expect(s.offers[0].status).toBe('accepted');
  });

  it('walking away rejects the offer and closes the talks', async () => {
    const { g, s } = withOffer();
    await g.openNegotiation('OF-1');
    g.walkAway();
    expect(s.negotiation).toBeNull();
    expect(s.offers[0].status).toBe('rejected');
  });
});

describe('press, chat & social', () => {
  it('press answers are clamped and make the papers', async () => {
    const { g, s } = setup();
    const session = await g.startPress('post_match');
    expect(session.questions).toHaveLength(1);
    const fameBefore = s.career.fame;
    const moneyBefore = s.career.money;
    const ev = await g.answerPress(session.id, 'q1', { optionId: 'o2' });
    expect(ev.effects.fame).toBe(4);
    expect(ev.effects.money).toBeUndefined();
    expect(ev.effects.rel?.media).toBe(-8);
    expect(s.career.fame).toBe(fameBefore + 4);
    expect(s.career.money).toBe(moneyBefore);
    expect(s.news.at(-1)?.headline).toBe('Bomb dropped');
    expect(await g.answerPress(session.id, 'q1', { optionId: 'o1' })).toBe(ev);
  });

  it('chat keeps per-persona history capped at 40', async () => {
    const { g, s } = setup();
    for (let i = 0; i < 25; i++) await g.chat('agent', `msg ${i}`);
    const h = g.chatHistory('agent');
    expect(h).toHaveLength(40);
    expect(h.at(-1)).toEqual({ from: 'persona', text: 'Hi from Kemal Usta' });
    expect(s.chats?.agent).toBe(h);
  });

  it('posting on social adds the post, reactions and followers', async () => {
    const { g, s } = setup();
    const before = s.career.followers;
    await g.postSocial('Teşekkürler herkese, hadi bakalım!!');
    expect(s.social[0].author.kind).toBe('user');
    expect(s.social.length).toBeGreaterThan(1);
    expect(s.career.followers).toBeGreaterThan(before);
  });
});

describe('retirement', () => {
  it('retire marks the career, scores the legacy and stores a biography', async () => {
    const { g, s, storage } = setup();
    await g.retire();
    expect(s.career.retired).toBe(true);
    expect(s.career.hallOfFame).toBe(42);
    expect(s.career.biography).toMatch(/biography/);
    expect(s.world.players.USER.clubId).toBeNull();
    expect(s.world.clubs['ENG-1-00'].squad).not.toContain('USER');
    expect(await storage.get('nss.save.0')).toBeTypeOf('string');
  });
});
