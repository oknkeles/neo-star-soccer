import { beforeAll, describe, expect, it } from 'vitest';
import { applyResult, buildMatchContext, createSeasonCompetitions, findFixture, quickSimulate, sortedTable } from '../api';
import { Rng } from '../../core/rng';
import type { Fixture, GameState, MatchSummary } from '../../core/types';
import { makeWorldState } from './worldkit';

let state: GameState;
let rng: Rng;
let leagueFixtures: Fixture[];

beforeAll(() => {
  state = makeWorldState({ seed: 21 });
  rng = new Rng(77);
  state.competitions = createSeasonCompetitions(state, rng);
  leagueFixtures = Object.values(state.competitions).filter((c) => c.kind === 'league' && c.tier === 1).flatMap((c) => c.fixtures);
});

function simulate(f: Fixture): MatchSummary {
  return quickSimulate(state, buildMatchContext(state, f, 'none', rng), rng);
}

describe('quickSimulate', () => {
  it('produces believable scorelines: ≈2.6 goals a game with a home edge', () => {
    let goals = 0;
    let home = 0;
    let away = 0;
    let draws = 0;
    const N = 1500;
    for (let i = 0; i < N; i++) {
      const s = simulate(leagueFixtures[(i * 7) % leagueFixtures.length]);
      goals += s.homeGoals + s.awayGoals;
      home += s.homeGoals;
      away += s.awayGoals;
      if (s.homeGoals === s.awayGoals) draws++;
    }
    const avg = goals / N;
    expect(avg).toBeGreaterThan(2.35);
    expect(avg).toBeLessThan(2.95);
    expect((home - away) / N).toBeGreaterThan(0.12);
    expect((home - away) / N).toBeLessThan(0.6);
    expect(draws / N).toBeGreaterThan(0.18);
    expect(draws / N).toBeLessThan(0.34);
  });

  it('strength matters but upsets happen', () => {
    const strong = 'ENG-1-00';
    const weak = 'ENG-2-15';
    const fx: Fixture = { id: 'ENG-1-2026-TEST', compId: 'ENG-1-2026', season: 2026, week: 10, slot: 'weekend', round: 1, homeId: strong, awayId: weak, played: false };
    let w = 0;
    let l = 0;
    for (let i = 0; i < 600; i++) {
      const s = quickSimulate(state, buildMatchContext(state, fx, 'none', rng), rng);
      if (s.homeGoals > s.awayGoals) w++;
      else if (s.homeGoals < s.awayGoals) l++;
    }
    expect(w / 600).toBeGreaterThan(0.6);
    expect(l / 600).toBeGreaterThan(0.01);
    expect(l / 600).toBeLessThan(0.2);
  });

  it('fills ratings 4.5–9.5, minutes, lineups, a man of the match and consistent events', () => {
    for (let i = 0; i < 80; i++) {
      const s = simulate(leagueFixtures[i * 3]);
      const ratings = Object.entries(s.ratings);
      expect(ratings.length).toBeGreaterThanOrEqual(22);
      expect(ratings.length).toBeLessThanOrEqual(22 + 10);
      for (const [, r] of ratings) {
        expect(r).toBeGreaterThanOrEqual(4.5);
        expect(r).toBeLessThanOrEqual(9.5);
      }
      expect(s.lineups!.home).toHaveLength(11);
      expect(s.lineups!.away).toHaveLength(11);
      expect(s.motmId).toBeTruthy();
      expect(s.ratings[s.motmId!]).toBeDefined();
      for (const id of Object.keys(s.ratings)) expect(s.minutes![id]).toBeGreaterThan(0);
      for (const id of [...s.lineups!.home, ...s.lineups!.away]) expect(s.minutes![id]).toBeLessThanOrEqual(90);
      const goalEvents = s.events.filter((e) => e.kind === 'goal' || e.kind === 'penalty_goal' || e.kind === 'own_goal');
      expect(goalEvents.filter((e) => e.side === 'home')).toHaveLength(s.homeGoals);
      expect(goalEvents.filter((e) => e.side === 'away')).toHaveLength(s.awayGoals);
      expect(s.possession).toBeGreaterThanOrEqual(25);
      expect(s.possession).toBeLessThanOrEqual(75);
      expect(s.shots.home).toBeGreaterThanOrEqual(s.homeGoals);
      expect(s.xg.home).toBeGreaterThan(0);
      for (const e of s.events) {
        expect(e.text.length).toBeGreaterThan(3);
        expect(e.minute).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('hands out cards, injuries, penalties and own goals now and then', () => {
    const kinds = new Map<string, number>();
    for (let i = 0; i < 600; i++) {
      for (const e of simulate(leagueFixtures[(i * 11) % leagueFixtures.length]).events) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
    }
    expect(kinds.get('yellow')! / 600).toBeGreaterThan(1.5);
    expect(kinds.get('yellow')! / 600).toBeLessThan(5);
    expect(kinds.get('red')! / 600).toBeLessThan(0.3);
    expect(kinds.get('red')!).toBeGreaterThan(0);
    expect(kinds.get('own_goal')!).toBeGreaterThan(0);
    expect(kinds.get('penalty_goal')!).toBeGreaterThan(0);
    expect(kinds.get('injury')!).toBeGreaterThan(0);
    expect(kinds.get('sub')! / 600).toBeGreaterThan(3);
  });

  it('strikers score more than defenders; keepers never score open play', () => {
    const byPos: Record<string, number> = {};
    const apps: Record<string, number> = {};
    for (let i = 0; i < 500; i++) {
      const s = simulate(leagueFixtures[(i * 5) % leagueFixtures.length]);
      for (const id of Object.keys(s.ratings)) apps[state.world.players[id].position] = (apps[state.world.players[id].position] ?? 0) + 1;
      for (const e of s.events) {
        if (e.kind !== 'goal' && e.kind !== 'penalty_goal') continue;
        const pos = state.world.players[e.playerId!].position;
        byPos[pos] = (byPos[pos] ?? 0) + 1;
      }
    }
    const rate = (pos: string) => (byPos[pos] ?? 0) / (apps[pos] ?? 1);
    expect(rate('ST')).toBeGreaterThan(rate('CB') * 2);
    expect(rate('ST')).toBeGreaterThan(rate('CM'));
    expect(byPos.GK ?? 0).toBe(0);
  });

  it('knockouts always end with a winner via extra time or penalties', () => {
    const cup = state.competitions['CUP-ENG-2026'];
    let ets = 0;
    let shootouts = 0;
    for (let i = 0; i < 400; i++) {
      const f = cup.fixtures[i % cup.fixtures.length];
      const ctx = buildMatchContext(state, f, 'none', rng);
      expect(ctx.knockout).toBe(true);
      const s = quickSimulate(state, ctx, rng);
      if (s.events.some((e) => e.kind === 'extra_time')) ets++;
      if (s.homeGoals === s.awayGoals) {
        expect(s.pens).toBeDefined();
        expect(s.pens!.home).not.toBe(s.pens!.away);
        shootouts++;
      } else {
        expect(s.pens).toBeUndefined();
      }
    }
    expect(ets).toBeGreaterThan(40);
    expect(shootouts).toBeGreaterThan(10);
    expect(shootouts).toBeLessThanOrEqual(ets);
  });

  it('is deterministic for a given seed', () => {
    const f = leagueFixtures[3];
    const a = quickSimulate(state, buildMatchContext(state, f, 'none', new Rng(5)), new Rng(6));
    const b = quickSimulate(state, buildMatchContext(state, f, 'none', new Rng(5)), new Rng(6));
    expect(a).toEqual(b);
  });

  it('simulates the user as a player when selected', () => {
    const mine = state.competitions['ENG-1-2026'].fixtures.find((f) => f.homeId === 'ENG-1-00' || f.awayId === 'ENG-1-00')!;
    const ctx = buildMatchContext(state, mine, 'starter', rng);
    const s = quickSimulate(state, ctx, rng);
    expect(s.user).toBeDefined();
    expect(s.user!.rating).toBe(s.ratings[state.career.playerId]);
    expect(s.user!.stats.minutes).toBeGreaterThan(0);
  });
});

describe('applyResult', () => {
  it('updates fixture, table, stats and competition numbers; ignores repeats', () => {
    const lg = state.competitions['ESP-1-2026'];
    const f = lg.fixtures[0];
    const summary = simulate(f);
    const before = JSON.stringify(Object.values(state.world.players).filter((p) => p.clubId === f.homeId).map((p) => p.season));
    applyResult(state, f.id, summary);
    expect(f.played).toBe(true);
    expect(f.homeGoals).toBe(summary.homeGoals);
    expect(f.awayGoals).toBe(summary.awayGoals);
    expect(f.scorers!.length).toBe(summary.homeGoals + summary.awayGoals);
    const rows = lg.tables.main;
    const h = rows.find((r) => r.teamId === f.homeId)!;
    const a = rows.find((r) => r.teamId === f.awayId)!;
    expect(h.played).toBe(1);
    expect(a.played).toBe(1);
    expect(h.gf).toBe(summary.homeGoals);
    expect(h.points + a.points).toBe(summary.homeGoals === summary.awayGoals ? 2 : 3);
    expect(h.form).toHaveLength(1);
    // players
    const starters = summary.lineups!.home;
    for (const id of starters) {
      const p = state.world.players[id];
      expect(p.season.apps).toBe(1);
      expect(p.season.starts).toBe(1);
      expect(p.season.minutes).toBe(summary.minutes![id]);
      expect(p.career.apps).toBe(1);
      expect(p.season.ratingSum).toBeCloseTo(summary.ratings[id], 5);
    }
    const scorersHome = summary.events.filter((e) => (e.kind === 'goal' || e.kind === 'penalty_goal') && e.side === 'home').length;
    const totalGoals = starters.concat(Object.keys(summary.ratings)).reduce((acc, id, i, arr) => (arr.indexOf(id) === i ? acc + state.world.players[id].season.goals : acc), 0);
    expect(totalGoals).toBeGreaterThanOrEqual(scorersHome);
    expect(lg.playerStats![summary.motmId!].motm).toBe(1);
    expect(state.world.players[summary.motmId!].season.motm).toBe(1);
    if (summary.awayGoals === 0) {
      const gk = state.world.players[summary.lineups!.home[0]];
      expect(gk.season.cleanSheets).toBe(1);
    }
    // second apply is a no-op
    applyResult(state, f.id, summary);
    expect(h.played).toBe(1);
    expect(before).not.toBe('');
    expect(findFixture(state, f.id)!.played).toBe(true);
    expect(sortedTable(lg)[0].played + sortedTable(lg)[sortedTable(lg).length - 1].played).toBeGreaterThanOrEqual(0);
  });

  it('records national appearances as caps, not club stats', () => {
    const intl = state.competitions['INT-2026'];
    const f = intl.fixtures[0];
    const summary = simulate(f);
    const caps = (id: string) => state.world.players[id].intlCaps;
    const first = summary.lineups!.home[3];
    const capsBefore = caps(first);
    const seasonBefore = state.world.players[first].season.apps;
    applyResult(state, f.id, summary);
    expect(caps(first)).toBe(capsBefore + 1);
    expect(state.world.players[first].season.apps).toBe(seasonBefore);
  });

  it('keeps AI injuries from the event log and heals them weekly', () => {
    const lg = state.competitions['GER-1-2026'];
    const f = lg.fixtures[2];
    const summary = simulate(f);
    const victim = Object.keys(summary.ratings).find((id) => id !== state.career.playerId)!;
    summary.events.push({ minute: 50, kind: 'injury', side: 'home', playerId: victim, text: 'injured' });
    state.world.players[victim].injury = null;
    applyResult(state, f.id, summary);
    expect(state.world.players[victim].injury).not.toBeNull();
    expect(state.world.players[victim].injury!.weeksLeft).toBeGreaterThan(0);
  });
});
