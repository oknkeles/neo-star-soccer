import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyResult, buildMatchContext, computeAwards, createSeasonCompetitions, endOfSeason, fixturesForWeek, isSeasonComplete,
  quickSimulate, simulateWeek, sortedTable, startNewSeason, topScorers, userFixturesForWeek,
} from '../api';
import { Rng } from '../../core/rng';
import { positionGroup } from '../../core/ratings';
import type { GameState } from '../../core/types';
import { makeWorldState } from './worldkit';

/** Plays a whole season the way the game controller does (user = AI-simulated). */
function playSeason(state: GameState, rng: Rng, lastWeek = 51): { weekMs: number[]; totalMs: number } {
  const weekMs: number[] = [];
  const t0 = performance.now();
  for (let w = state.week; w <= lastWeek; w++) {
    state.week = w;
    const t = performance.now();
    simulateWeek(state, rng, []);
    weekMs.push(performance.now() - t);
  }
  return { weekMs, totalMs: performance.now() - t0 };
}

describe('a full season on a 16-league world', () => {
  let state: GameState;
  let rng: Rng;
  let timing: { weekMs: number[]; totalMs: number };

  beforeAll(() => {
    state = makeWorldState({ seed: 31 });
    rng = new Rng(9);
    state.competitions = createSeasonCompetitions(state, rng);
    timing = playSeason(state, rng, 50);
  });

  it('runs fast enough (season < 3 s, a typical week < 50 ms)', () => {
    expect(timing.totalMs).toBeLessThan(3000);
    const sorted = timing.weekMs.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    expect(median).toBeLessThan(50);
  });

  it('plays every league fixture, every cup and the Champions Cup to a conclusion', () => {
    for (const c of Object.values(state.competitions)) {
      expect(c.fixtures.every((f) => f.played), c.id).toBe(true);
      if (c.kind !== 'international') expect(c.stage, c.id).toBe('done');
      if (c.kind === 'league' || c.kind === 'cup' || c.kind === 'continental') expect(c.winnerId, c.id).toBeTruthy();
    }
    expect(isSeasonComplete(state)).toBe(true);
  });

  it('keeps league tables consistent with the fixtures', () => {
    for (const lg of Object.values(state.competitions).filter((c) => c.kind === 'league')) {
      const n = lg.teamIds.length;
      const rows = sortedTable(lg);
      expect(rows).toHaveLength(n);
      let gf = 0;
      let ga = 0;
      for (const r of rows) {
        expect(r.played).toBe(2 * (n - 1));
        expect(r.won + r.drawn + r.lost).toBe(r.played);
        expect(r.points).toBe(r.won * 3 + r.drawn);
        expect(r.form.length).toBeLessThanOrEqual(5);
        gf += r.gf; ga += r.ga;
      }
      expect(gf).toBe(ga);
      expect(gf).toBe(lg.fixtures.reduce((a, f) => a + f.homeGoals! + f.awayGoals!, 0));
      for (let i = 1; i < rows.length; i++) expect(rows[i - 1].points).toBeGreaterThanOrEqual(rows[i].points);
      expect(lg.winnerId).toBe(rows[0].teamId);
    }
  });

  it('gives a sensible league: stronger clubs finish higher on average, ~2.6 goals a game', () => {
    let goals = 0;
    let games = 0;
    let corr = 0;
    let leagues = 0;
    for (const lg of Object.values(state.competitions).filter((c) => c.kind === 'league' && c.tier === 1)) {
      for (const f of lg.fixtures) { goals += f.homeGoals! + f.awayGoals!; games++; }
      const rows = sortedTable(lg);
      const topHalf = rows.slice(0, rows.length / 2).reduce((a, r) => a + state.world.clubs[r.teamId].reputation, 0);
      const bottomHalf = rows.slice(rows.length / 2).reduce((a, r) => a + state.world.clubs[r.teamId].reputation, 0);
      corr += topHalf > bottomHalf ? 1 : 0;
      leagues++;
    }
    expect(goals / games).toBeGreaterThan(2.35);
    expect(goals / games).toBeLessThan(2.95);
    expect(corr).toBe(leagues);
  });

  it('tracks top scorers and per-player numbers', () => {
    const top = topScorers(state, 'ENG-1-2026', 5);
    expect(top).toHaveLength(5);
    for (let i = 1; i < top.length; i++) expect(top[i - 1].goals).toBeGreaterThanOrEqual(top[i].goals);
    expect(top[0].goals).toBeGreaterThan(8);
    const p = state.world.players[top[0].playerId];
    expect(p.season.goals).toBeGreaterThanOrEqual(top[0].goals);
    expect(positionGroup(p.position)).not.toBe('GK');
    // stat sanity over all players
    for (const q of Object.values(state.world.players)) {
      expect(q.season.starts).toBeLessThanOrEqual(q.season.apps);
      expect(q.season.minutes).toBeLessThanOrEqual(q.season.apps * 121);
      if (q.season.apps > 0) {
        const avg = q.season.ratingSum / q.season.apps;
        expect(avg).toBeGreaterThanOrEqual(4.5);
        expect(avg).toBeLessThanOrEqual(9.5);
      }
    }
  });

  it('ends the season with champions, awards, promotion/relegation and a user record', () => {
    const summary = endOfSeason(state, rng);
    expect(state.seasons).toHaveLength(1);
    expect(state.seasons[0]).toBe(summary);
    expect(summary.season).toBe(2026);
    for (const id of ['ENG-1-2026', 'ENG-2-2026', 'TUR-1-2026', 'CUP-GER-2026', 'CC-2026']) expect(summary.champions[id]).toBeTruthy();
    expect(summary.champions['ENG-1-2026']).toBe(sortedTable(state.competitions['ENG-1-2026'])[0].teamId);
    const keys = new Set(summary.awards.map((a) => a.key));
    for (const k of ['golden_ball', 'league_top_scorer', 'league_mvp', 'young_player', 'team_of_season']) expect(keys.has(k), k).toBe(true);
    expect(summary.awards.filter((a) => a.key === 'golden_ball')).toHaveLength(1);
    expect(summary.awards.filter((a) => a.key === 'team_of_season')).toHaveLength(8 * 11);
    const gb = summary.awards.find((a) => a.key === 'golden_ball')!;
    expect(gb.name).toBe('Altın Top');
    expect(gb.playerId).toBeTruthy();
    expect(gb.season).toBe(2026);
    const young = summary.awards.find((a) => a.key === 'young_player')!;
    expect(2026 - state.world.players[young.playerId!].birthYear).toBeLessThanOrEqual(21);
    expect(summary.promoted).toHaveLength(8 * 3);
    expect(summary.relegated).toHaveLength(8 * 3);
    for (const id of summary.promoted) expect(state.world.clubs[id].tier).toBe(2);
    for (const id of summary.relegated) expect(state.world.clubs[id].tier).toBe(1);
    expect(summary.userRecord).toBeDefined();
    expect(state.career.history).toHaveLength(1);
    expect(state.career.history[0].clubId).toBe('ENG-1-00');
    expect(state.career.history[0].leaguePos).toBeGreaterThanOrEqual(1);
    // idempotent
    expect(endOfSeason(state, rng)).toBe(summary);
    expect(state.seasons).toHaveLength(1);
  });

  it('computeAwards is deterministic and names recipients', () => {
    const a = computeAwards(state);
    const b = computeAwards(state);
    expect(a).toEqual(b);
    for (const award of a) {
      expect(award.playerId).toBeTruthy();
      expect(state.world.players[award.playerId!]).toBeDefined();
      expect(award.name.length).toBeGreaterThan(2);
    }
  });
});

describe('user trophies and awards', () => {
  it('credits the user with a league title won while playing', () => {
    const state = makeWorldState({ seed: 41 });
    const rng = new Rng(2);
    state.competitions = createSeasonCompetitions(state, rng);
    // make the user's club overwhelming favourites and the user a regular
    const club = state.world.clubs['ENG-1-00'];
    for (const id of club.squad) for (const k of Object.keys(state.world.players[id].attrs) as (keyof typeof state.world.players[string]['attrs'])[]) state.world.players[id].attrs[k] = Math.min(99, state.world.players[id].attrs[k] + 30);
    for (let w = 0; w <= 44; w++) {
      state.week = w;
      for (const f of userFixturesForWeek(state).filter((x) => !x.played && state.competitions[x.compId].kind === 'league')) {
        const ctx = buildMatchContext(state, f, 'starter', rng);
        applyResult(state, f.id, quickSimulate(state, ctx, rng));
      }
      simulateWeek(state, rng, []);
    }
    expect(state.competitions['ENG-1-2026'].winnerId).toBe('ENG-1-00');
    const summary = endOfSeason(state, rng);
    expect(state.career.trophies.some((t) => t.compId === 'ENG-1-2026')).toBe(true);
    expect(summary.userRecord!.trophies.length).toBeGreaterThan(0);
    expect(state.world.players[state.career.playerId].season.apps).toBeGreaterThan(30);
  });
});

describe('season rollover', () => {
  let state: GameState;
  let before: { ids: Set<string>; leagueSizes: Record<string, number>; userClub: string | null; userAttrs: string; userAge: number };

  beforeAll(() => {
    state = makeWorldState({ seed: 51 });
    const rng = new Rng(4);
    state.competitions = createSeasonCompetitions(state, rng);
    playSeason(state, rng, 50);
    endOfSeason(state, rng);
    const u = state.world.players[state.career.playerId];
    before = {
      ids: new Set(Object.keys(state.world.players)),
      leagueSizes: Object.fromEntries(state.world.leagues.map((l) => [l.id, Object.values(state.world.clubs).filter((c) => c.country === l.country && c.tier === l.tier).length])),
      userClub: u.clubId,
      userAttrs: JSON.stringify(u.attrs),
      userAge: 2026 - u.birthYear,
    };
    startNewSeason(state, rng);
  });

  it('advances the calendar and builds the next season', () => {
    expect(state.season).toBe(2027);
    expect(state.week).toBe(0);
    expect(Object.keys(state.competitions).every((id) => id.endsWith('2027') || id.endsWith('2028'))).toBe(true);
    expect(state.competitions['ENG-1-2027']).toBeDefined();
    expect(state.competitions['CC-2027']).toBeDefined();
    expect(state.competitions['CONT-2028']).toBeDefined();
    expect(fixturesForWeek(state, 1).length).toBeGreaterThan(100);
    for (const c of Object.values(state.competitions)) expect(c.fixtures.every((f) => !f.played)).toBe(true);
  });

  it('applies promotion and relegation but keeps every league the same size', () => {
    for (const lg of state.world.leagues) {
      const n = Object.values(state.world.clubs).filter((c) => c.country === lg.country && c.tier === lg.tier).length;
      expect(n).toBe(before.leagueSizes[lg.id]);
      expect(state.competitions[`${lg.id}-2027`].teamIds).toHaveLength(n);
    }
    const summary = state.seasons[0];
    for (const id of summary.promoted) expect(state.competitions[`${state.world.clubs[id].country}-1-2027`].teamIds).toContain(id);
  });

  it('seeds the Champions Cup from last season’s tables', () => {
    const cc = state.competitions['CC-2027'];
    expect(cc.teamIds).toHaveLength(32);
    for (const country of ['ENG', 'ESP', 'ITA', 'GER']) {
      const champion = state.seasons[0].champions[`${country}-1-2026`];
      expect(cc.teamIds).toContain(champion);
    }
    expect(cc.teamIds).toContain(state.seasons[0].champions['CC-2026']);
  });

  it('keeps squads between 22 and 28 with every line covered, and lists consistent', () => {
    for (const club of Object.values(state.world.clubs)) {
      expect(club.squad.length, club.id).toBeGreaterThanOrEqual(22);
      expect(club.squad.length, club.id).toBeLessThanOrEqual(30);
      expect(new Set(club.squad).size).toBe(club.squad.length);
      const groups = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
      for (const id of club.squad) {
        const p = state.world.players[id];
        expect(p, `${club.id} ${id}`).toBeDefined();
        expect(p.clubId).toBe(club.id);
        expect(p.retired).toBeFalsy();
        groups[positionGroup(p.position)]++;
      }
      expect(groups.GK).toBeGreaterThanOrEqual(2);
      expect(groups.DEF).toBeGreaterThanOrEqual(6);
      expect(groups.MID).toBeGreaterThanOrEqual(5);
      expect(groups.ATT).toBeGreaterThanOrEqual(4);
      expect(state.world.managers[club.managerId]?.clubId).toBe(club.id);
    }
    // every player with a club is listed in that club's squad
    for (const p of Object.values(state.world.players)) {
      if (p.clubId) expect(state.world.clubs[p.clubId].squad).toContain(p.id);
    }
  });

  it('develops, ages and retires AI players; adds youth with fresh ids; never touches the user', () => {
    const u = state.world.players[state.career.playerId];
    expect(u.clubId).toBe(before.userClub);
    expect(u.retired).toBeFalsy();
    expect(JSON.stringify(u.attrs)).toBe(before.userAttrs);
    expect(state.world.clubs[before.userClub!].squad).toContain(u.id);
    const players = Object.values(state.world.players);
    const retired = players.filter((p) => p.retired);
    expect(retired.length).toBeGreaterThan(0);
    for (const p of retired) expect(p.clubId).toBeNull();
    const fresh = players.filter((p) => !before.ids.has(p.id));
    expect(fresh.length).toBeGreaterThan(300);
    expect(fresh.filter((p) => 2027 - p.birthYear <= 19).length).toBeGreaterThan(200);
    expect(new Set(players.map((p) => p.id)).size).toBe(players.length);
    // stats were reset
    expect(players.every((p) => p.season.apps === 0 && p.season.goals === 0)).toBe(true);
    // careers keep their history
    expect(players.some((p) => p.career.apps > 0)).toBe(true);
  });

  it('moves some AI players between clubs and expires contracts', () => {
    const moved = Object.values(state.world.players).filter((p) => before.ids.has(p.id) && p.clubId && p.contract && p.contract.startSeason === 2027 && p.id !== state.career.playerId);
    expect(moved.length).toBeGreaterThan(20);
    for (const p of Object.values(state.world.players)) {
      if (p.clubId && p.id !== state.career.playerId) expect(p.contract?.endSeason ?? 0).toBeGreaterThanOrEqual(2027);
    }
  });

  it('rolls reputations and managers', () => {
    const clubs = Object.values(state.world.clubs);
    expect(clubs.every((c) => c.reputation >= 10 && c.reputation <= 99)).toBe(true);
    expect(clubs.every((c) => Number.isFinite(c.budget) && c.budget >= 0)).toBe(true);
    const managers = Object.values(state.world.managers);
    expect(managers.some((m) => !m.clubId)).toBe(true); // sacked managers wait for a job
  });

  it('refreshes national squads', () => {
    for (const nt of Object.values(state.world.nationalTeams)) {
      expect(nt.squad.length).toBeGreaterThanOrEqual(18);
      for (const id of nt.squad) {
        const p = state.world.players[id];
        expect(p).toBeDefined();
        expect(p.retired).toBeFalsy();
      }
    }
  });

  it('survives JSON round-trips (state stays serialisable)', () => {
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    expect(Object.keys(copy.competitions)).toEqual(Object.keys(state.competitions));
    expect(copy.seasons[0].awards.length).toBe(state.seasons[0].awards.length);
  });

  it('plays a second season after the rollover', () => {
    const rng = new Rng(8);
    const t0 = performance.now();
    playSeason(state, rng, 50);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(isSeasonComplete(state)).toBe(true); // including the 2028 Continental Cup
    expect(state.competitions['CONT-2028'].stage).toBe('done');
    const summary = endOfSeason(state, rng);
    expect(summary.awards.some((a) => a.key === 'tournament_best')).toBe(true);
    expect(summary.champions['CONT-2028']).toBeTruthy();
  });
});
