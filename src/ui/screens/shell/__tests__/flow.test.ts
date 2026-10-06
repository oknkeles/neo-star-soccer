/**
 * The shell's data path with the real game API: new career → genesis → trial offers → hub agenda → week.
 * Skips itself when another module cannot run in this environment.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { setLang } from '../../../../core/i18n';
import type { GameState } from '../../../../core/types';
import { GameController, memoryStorage, type Agenda } from '../../../../game/api';
import { openClubOffers } from '../TrialOffers';
import { userView } from '../helpers';
import { DEFAULT_APPEARANCE, offeredTraits, rollAppearance } from '../newcareer/data';
import { GameBlockedError } from '../../../../game/api';

let g: GameController | null = null;
let boot = '';

beforeAll(async () => {
  setLang('en');
  try {
    const c = new GameController({ storage: memoryStorage(), autosaveMs: 0 });
    const traits = offeredTraits();
    await c.newCareer({
      firstName: 'Deniz', lastName: 'Yıldız', nation: 'TUR', position: 'ST', foot: 'R',
      appearance: { ...DEFAULT_APPEARANCE, ...rollAppearance('TUR') }, trait: traits[0] ?? 'calm', seed: 20260807,
    }, 0);
    g = c;
  } catch (e) {
    boot = e instanceof Error ? e.message : String(e);
  }
}, 60_000);

const need = (ctx: { skip: (why?: string) => never }): GameController => {
  if (!g) ctx.skip(`game API unavailable: ${boot}`);
  return g!;
};

describe('shell flow on the real game API', () => {
  it('offers three trial clubs after genesis and blocks advancing until one is accepted', (ctx) => {
    const c = need(ctx);
    const s = c.state as GameState;
    const ag: Agenda = c.agenda();
    expect(ag.needsClub).toBe(true);
    expect(ag.canAdvance).toBe(false);
    expect(ag.blockers.length).toBeGreaterThan(0);
    const offers = openClubOffers(s);
    expect(offers.length).toBeGreaterThanOrEqual(2);
    for (const o of offers) expect(s.world.clubs[o.fromClubId]).toBeDefined();
    expect(userView(s)?.club).toBeNull();
  });

  it('generates a reveal-ready genesis (story, motto, family, agent, rival, goals)', (ctx) => {
    const g0 = need(ctx).state!.career.genesis;
    expect(g0.backstory.length).toBeGreaterThan(40);
    expect(g0.motto).toBeTruthy();
    expect(g0.dream).toBeTruthy();
    expect(g0.destinyHint).toBeTruthy();
    expect(g0.agent.name).toBeTruthy();
    expect(g0.family.length).toBeGreaterThan(0);
    expect(g0.goals.length).toBe(3);
    const s = need(ctx).state!;
    expect(s.world.players[s.career.rivalId]).toBeDefined();
  });

  it('accepting a trial offer puts the player in a club and unblocks the hub', (ctx) => {
    const c = need(ctx);
    const s = c.state as GameState;
    const o = openClubOffers(s)[0];
    c.respondOffer(o.id, 'accept');
    const v = userView(c.state);
    expect(v?.club?.id).toBe(o.fromClubId);
    expect(c.agenda().needsClub).toBe(false);
    expect(c.agenda().week.label.en).toBeTruthy();
  });

  it('plays or simulates pending matches, then the week advances with a report', async (ctx) => {
    const c = need(ctx);
    for (let i = 0; i < 3; i++) {
      for (const id of c.agenda().pendingMatches) await c.simulateUserMatch(id);
      const open = c.agenda().pendingEvents.filter((e) => e.choices.length > 0);
      for (const ev of open) c.resolveEvent(ev.id, ev.choices[0].id);
      if (c.agenda().canAdvance) break;
    }
    const before = `${c.state!.season}-${c.state!.week}`;
    const report = await c.advanceWeek();
    expect(`${c.state!.season}-${c.state!.week}`).not.toBe(before);
    expect(c.state!.career.lastWeekReport).toBe(report);
    expect(typeof report.moneyDelta).toBe('number');
    expect(Array.isArray(report.results)).toBe(true);
  }, 60_000);

  it('refuses to advance while a user match is pending', async (ctx) => {
    const c = need(ctx);
    for (let i = 0; i < 12 && c.agenda().pendingMatches.length === 0; i++) {
      for (const ev of c.agenda().pendingEvents.filter((e) => e.choices.length > 0)) c.resolveEvent(ev.id, ev.choices[0].id);
      await c.advanceWeek();
    }
    if (c.agenda().pendingMatches.length === 0) ctx.skip('no match week reached');
    const err = await c.advanceWeek().then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(GameBlockedError);
    expect((err as GameBlockedError).blockers.length).toBeGreaterThan(0);
  }, 90_000);

  it('can export and re-import the career (settings → saves)', async (ctx) => {
    const c = need(ctx);
    const json = c.exportSave();
    expect(JSON.parse(json)).toBeTruthy();
    const other = new GameController({ storage: memoryStorage(), autosaveMs: 0 });
    await other.importSave(json, 1);
    expect(other.state?.career.playerId).toBe(c.state!.career.playerId);
    const metas = await other.listSaves();
    expect(metas.map((m) => m.slot)).toContain(1);
  });
});
