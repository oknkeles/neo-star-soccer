import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyResult, buildMatchContext, buildTeamSheet, createSeasonCompetitions, findFixture, fixturesForWeek, isSeasonComplete,
  leaguePosition, quickSimulate, simulateWeek, sortedTable, teamInfo, topScorers, userFixturesForWeek, userLeague,
} from '../api';
import { INTL_BREAK_WEEKS } from '../calendar';
import { compFormat } from '../formats';
import { Rng } from '../../core/rng';
import type { Competition, GameState } from '../../core/types';
import { makeWorldState } from './worldkit';

function fresh(season = 2026, seed = 5): { state: GameState; rng: Rng } {
  const state = makeWorldState({ season, seed });
  const rng = new Rng(seed + 100);
  state.competitions = createSeasonCompetitions(state, rng);
  return { state, rng };
}

describe('createSeasonCompetitions', () => {
  let state: GameState;
  beforeAll(() => { state = fresh().state; });

  it('creates 16 leagues, 8 cups, the Champions Cup and internationals', () => {
    const comps = Object.values(state.competitions);
    expect(comps.filter((c) => c.kind === 'league')).toHaveLength(16);
    expect(comps.filter((c) => c.kind === 'cup')).toHaveLength(8);
    expect(comps.filter((c) => c.kind === 'continental')).toHaveLength(1);
    expect(state.competitions['ENG-1-2026']).toBeDefined();
    expect(state.competitions['CUP-ENG-2026']).toBeDefined();
    expect(state.competitions['CC-2026']).toBeDefined();
    expect(state.competitions['INT-2026']).toBeDefined();
    expect(Object.keys(state.competitions).some((id) => id.startsWith('WC-') || id.startsWith('CONT-'))).toBe(false);
  });

  it('localizes names with the save language', () => {
    expect(state.competitions['CC-2026'].name).toBe('Şampiyonlar Kupası');
    expect(state.competitions['CUP-TUR-2026'].name).toBe('Türkiye Kupası');
    const en = makeWorldState({ seed: 3 });
    en.lang = 'en';
    const comps = createSeasonCompetitions(en, new Rng(1));
    expect(comps['CC-2026'].name).toBe('Champions Cup');
  });

  it('schedules double round-robin leagues on legal weeks', () => {
    for (const lg of Object.values(state.competitions).filter((c) => c.kind === 'league')) {
      const n = lg.teamIds.length;
      expect(lg.fixtures).toHaveLength(n * (n - 1));
      const pairs = new Set(lg.fixtures.map((f) => `${f.homeId}>${f.awayId}`));
      expect(pairs.size).toBe(n * (n - 1));
      const perSlot = new Map<string, Set<string>>();
      for (const f of lg.fixtures) {
        expect(f.week).toBeGreaterThanOrEqual(1);
        expect(f.week).toBeLessThanOrEqual(44);
        expect(INTL_BREAK_WEEKS.includes(f.week)).toBe(false);
        const key = `${f.week}-${f.slot}`;
        const used = perSlot.get(key) ?? new Set<string>();
        expect(used.has(f.homeId) || used.has(f.awayId)).toBe(false);
        used.add(f.homeId); used.add(f.awayId);
        perSlot.set(key, used);
      }
    }
  });

  it('draws 32-team cups with the biggest clubs and a late final', () => {
    const cup = state.competitions['CUP-ENG-2026'];
    expect(cup.teamIds).toHaveLength(32);
    expect(cup.fixtures).toHaveLength(16);
    const tier1 = Object.values(state.world.clubs).filter((c) => c.country === 'ENG' && c.tier === 1).map((c) => c.id);
    for (const id of tier1) expect(cup.teamIds).toContain(id);
    expect(cup.fixtures.every((f) => f.slot === 'midweek' && f.week === 8)).toBe(true);
    expect(compFormat(cup)!.koWeeks).toEqual([8, 14, 27, 33, 42]);
  });

  it('builds the Champions Cup: 32 clubs, 8 groups of 4, six midweek matchdays', () => {
    const cc = state.competitions['CC-2026'];
    expect(cc.teamIds).toHaveLength(32);
    expect(Object.keys(cc.tables).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    for (const rows of Object.values(cc.tables)) expect(rows).toHaveLength(4);
    expect(cc.fixtures).toHaveLength(8 * 12);
    expect([...new Set(cc.fixtures.map((f) => f.week))]).toEqual([3, 7, 12, 17, 23, 26]);
    expect(cc.fixtures.every((f) => f.slot === 'midweek')).toBe(true);
    // each country qualified at least its league spots from reputation order (ENG-1-00 is the strongest)
    expect(cc.teamIds).toContain('ENG-1-00');
    expect(compFormat(cc)!.koWeeks).toEqual([32, 36, 39, 43]);
  });

  it('plays national teams in every international break', () => {
    const intl = state.competitions['INT-2026'];
    const weeks = [...new Set(intl.fixtures.map((f) => f.week))].sort((a, b) => a - b);
    expect(weeks).toEqual([...INTL_BREAK_WEEKS]);
    const nts = Object.keys(state.world.nationalTeams);
    for (const w of weeks) {
      const fx = intl.fixtures.filter((f) => f.week === w);
      for (const nt of nts) {
        const n = fx.filter((f) => f.homeId === nt || f.awayId === nt).length;
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(2);
      }
      // nobody twice in the same slot
      for (const slot of ['midweek', 'weekend'] as const) {
        const ids = fx.filter((f) => f.slot === slot).flatMap((f) => [f.homeId, f.awayId]);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
    expect(intl.fixtures.some((f) => f.id.includes('-Q-'))).toBe(true);
    expect(intl.fixtures.some((f) => f.id.includes('-F-'))).toBe(true);
  });

  it('adds the World Cup in 2029 (WC-2030) and a Continental Cup in 2027 (CONT-2028)', () => {
    const wc = fresh(2029, 8).state.competitions['WC-2030'];
    expect(wc).toBeDefined();
    expect(wc.teamIds).toHaveLength(32);
    expect(Object.keys(wc.tables)).toHaveLength(8);
    expect(wc.fixtures).toHaveLength(8 * 6);
    expect(wc.name).toBe('Dünya Kupası 2030');
    expect(Math.min(...wc.fixtures.map((f) => f.week))).toBeGreaterThanOrEqual(45);
    expect(Math.max(...wc.fixtures.map((f) => f.week))).toBeLessThanOrEqual(50);
    expect(wc.fixtures.every((f) => f.neutral)).toBe(true);

    const cont = fresh(2027, 9).state.competitions['CONT-2028'];
    expect(cont).toBeDefined();
    expect(cont.name).toBe('Kıta Kupası 2028');
    expect(cont.teamIds.length).toBeGreaterThanOrEqual(8);
    expect(cont.teamIds.length % 4).toBe(0);
  });
});

describe('queries', () => {
  it('lists fixtures per week and the user fixtures (midweek before weekend)', () => {
    const { state } = fresh();
    expect(fixturesForWeek(state, 1).length).toBeGreaterThan(100);
    expect(fixturesForWeek(state, 5).every((f) => f.compId === 'INT-2026')).toBe(true);
    state.week = 8; // cup midweek + league weekend for ENG-1-00 if drawn
    const mine = userFixturesForWeek(state);
    for (const f of mine) expect(f.homeId === 'ENG-1-00' || f.awayId === 'ENG-1-00').toBe(true);
    for (let i = 1; i < mine.length; i++) expect(mine[i - 1].slot === 'weekend' && mine[i].slot === 'midweek').toBe(false);
    state.week = 1;
    expect(userFixturesForWeek(state).some((f) => f.compId === 'ENG-1-2026')).toBe(true);
    state.career.calledUp = true;
    state.career.nationalTeamId = 'NT-TUR';
    state.week = 5;
    const intl = userFixturesForWeek(state);
    expect(intl.length).toBeGreaterThanOrEqual(1);
    expect(intl.every((f) => f.homeId === 'NT-TUR' || f.awayId === 'NT-TUR')).toBe(true);
    const f0 = state.competitions['ENG-1-2026'].fixtures[7];
    expect(findFixture(state, f0.id)).toBe(f0);
    expect(findFixture(state, 'nope')).toBeNull();
    expect(userLeague(state)?.id).toBe('ENG-1-2026');
    expect(leaguePosition(state, 'ENG-1-00')).toBeGreaterThanOrEqual(1);
  });

  it('describes clubs and national teams', () => {
    const { state } = fresh();
    expect(teamInfo(state, 'ENG-1-00')).toMatchObject({ name: 'ENG FC 1-0', isNational: false });
    const nt = teamInfo(state, 'NT-TUR');
    expect(nt.isNational).toBe(true);
    expect(nt.shortName).toBe('TUR');
    expect(nt.name).toBe('TUR Milli');
  });
});

describe('team sheets', () => {
  it('picks a legal XI + bench by formation and skips injured players', () => {
    const { state } = fresh();
    const club = state.world.clubs['ENG-1-03'];
    club.formation = '4-3-3';
    const sheet = buildTeamSheet(state, club.id);
    expect(sheet.xi).toHaveLength(11);
    expect(sheet.bench.length).toBeGreaterThanOrEqual(5);
    expect(sheet.bench.length).toBeLessThanOrEqual(7);
    expect(new Set([...sheet.xi, ...sheet.bench]).size).toBe(sheet.xi.length + sheet.bench.length);
    expect(state.world.players[sheet.xi[0]].position).toBe('GK');
    const groups = sheet.xi.map((id) => state.world.players[id].position);
    expect(groups.filter((p) => p === 'CB' || p === 'FB').length).toBe(4);
    expect(groups.filter((p) => p === 'ST' || p === 'W').length).toBeGreaterThanOrEqual(3);
    // injure the starting keeper → another keeper takes his place
    const gk = state.world.players[sheet.xi[0]];
    gk.injury = { key: 'knock', weeksLeft: 2, severity: 1 };
    const sheet2 = buildTeamSheet(state, club.id);
    expect(sheet2.xi[0]).not.toBe(gk.id);
    expect(state.world.players[sheet2.xi[0]].position).toBe('GK');
    expect(sheet2.xi).not.toContain(gk.id);
    expect(sheet2.strength.overall).toBeGreaterThan(30);
  });

  it('forces the user into the XI, onto the bench or out', () => {
    const { state } = fresh();
    const uid = state.career.playerId;
    const starter = buildTeamSheet(state, 'ENG-1-00', 'starter');
    expect(starter.xi).toContain(uid);
    expect(starter.xi).toHaveLength(11);
    const bench = buildTeamSheet(state, 'ENG-1-00', 'bench');
    expect(bench.xi).not.toContain(uid);
    expect(bench.bench).toContain(uid);
    const none = buildTeamSheet(state, 'ENG-1-00', 'none');
    expect(none.xi).not.toContain(uid);
    expect(none.bench).not.toContain(uid);
  });

  it('builds national team sheets from the national squad', () => {
    const { state } = fresh();
    const sheet = buildTeamSheet(state, 'NT-BRA');
    const squad = new Set(state.world.nationalTeams['NT-BRA'].squad);
    expect(sheet.xi).toHaveLength(11);
    for (const id of sheet.xi) expect(squad.has(id)).toBe(true);
    expect(sheet.name).toBe('BRA Milli');
  });

  it('stronger squads get higher team strength', () => {
    const { state } = fresh();
    const top = buildTeamSheet(state, 'ENG-1-00').strength;
    const low = buildTeamSheet(state, 'ENG-2-15').strength;
    expect(top.overall).toBeGreaterThan(low.overall + 10);
    for (const k of ['att', 'mid', 'def', 'gk', 'overall'] as const) expect(Number.isFinite(top[k])).toBe(true);
  });
});

describe('match context', () => {
  it('marks derbies, knockouts and sets plausible attendance', () => {
    const { state, rng } = fresh();
    const lg = state.competitions['ENG-1-2026'];
    const derby = lg.fixtures.find((f) => state.world.clubs[f.homeId].derbyRivals.includes(f.awayId))!;
    const ctxD = buildMatchContext(state, derby, 'none', rng);
    expect(ctxD.derby).toBe(true);
    expect(ctxD.importance).toBeGreaterThan(0.5);
    expect(ctxD.knockout).toBe(false);
    expect(ctxD.attendance).toBeGreaterThan(5000);
    expect(ctxD.attendance).toBeLessThanOrEqual(state.world.clubs[derby.homeId].stadium.capacity);
    const cupFx = state.competitions['CUP-ENG-2026'].fixtures[0];
    const ctxC = buildMatchContext(state, cupFx, 'none', rng);
    expect(ctxC.knockout).toBe(true);
    expect(ctxC.compName).toContain(state.competitions['CUP-ENG-2026'].name);
    const mine = lg.fixtures.find((f) => f.homeId === 'ENG-1-00' || f.awayId === 'ENG-1-00')!;
    const ctxU = buildMatchContext(state, mine, 'starter', rng);
    expect(ctxU.userSide).toBe(mine.homeId === 'ENG-1-00' ? 'home' : 'away');
    expect([...ctxU.home.xi, ...ctxU.away.xi]).toContain(state.career.playerId);
  });
});

describe('knockouts', () => {
  function playAll(state: GameState, rng: Rng, comp: Competition, fromWeek: number, toWeek: number) {
    for (let w = fromWeek; w <= toWeek; w++) {
      state.week = w;
      for (const f of fixturesForWeek(state, w).filter((x) => x.compId === comp.id)) {
        applyResult(state, f.id, quickSimulate(state, buildMatchContext(state, f, 'none', rng), rng));
      }
    }
  }

  it('a domestic cup progresses round by round to a single winner', () => {
    const { state, rng } = fresh();
    const cup = state.competitions['CUP-TUR-2026'];
    playAll(state, rng, cup, 0, 44);
    expect(cup.stage).toBe('done');
    expect(cup.winnerId).toBeTruthy();
    expect(cup.fixtures).toHaveLength(31);
    const final = cup.fixtures[cup.fixtures.length - 1];
    expect(final.week).toBe(42);
    expect(final.neutral).toBe(true);
    expect(final.roundName).toBe('Final');
    // every knockout tie has a winner (level scores settled by penalties)
    for (const f of cup.fixtures) {
      expect(f.played).toBe(true);
      if (f.homeGoals === f.awayGoals) expect(f.pens).toBeDefined();
    }
    // a winner never lost a tie
    const lost = new Set(cup.fixtures.map((f) => {
      const h = f.homeGoals! + (f.pens ? (f.pens.home > f.pens.away ? 0.5 : -0.5) : 0);
      const a = f.awayGoals!;
      return h > a ? f.awayId : f.homeId;
    }));
    expect(lost.has(cup.winnerId!)).toBe(false);
  });

  it('the Champions Cup goes through groups, R16, QF, SF and a neutral final in week 43', () => {
    const { state, rng } = fresh();
    const cc = state.competitions['CC-2026'];
    playAll(state, rng, cc, 0, 44);
    expect(cc.stage).toBe('done');
    expect(cc.winnerId).toBeTruthy();
    expect(cc.fixtures).toHaveLength(96 + 8 + 4 + 2 + 1);
    const weeks = [...new Set(cc.fixtures.filter((f) => f.round > 6).map((f) => f.week))];
    expect(weeks).toEqual([32, 36, 39, 43]);
    const final = cc.fixtures.find((f) => f.week === 43)!;
    expect(final.neutral).toBe(true);
    expect(final.roundName).toBe('Final');
    // 16 teams reached the knockouts: group winners and runners-up
    const r16 = cc.fixtures.filter((f) => f.round === 7);
    expect(r16).toHaveLength(8);
    for (const f of r16) {
      const key = Object.keys(cc.tables).find((k) => cc.tables[k].some((r) => r.teamId === f.homeId))!;
      expect(sortedTable(cc, key).slice(0, 2).map((r) => r.teamId)).toContain(f.homeId);
    }
  });

  it('the World Cup is played in the summer weeks and crowns a champion', () => {
    const { state, rng } = fresh(2029, 12);
    const wc = state.competitions['WC-2030'];
    playAll(state, rng, wc, 44, 51);
    expect(wc.stage).toBe('done');
    expect(wc.winnerId).toBeTruthy();
    expect(wc.fixtures).toHaveLength(48 + 8 + 4 + 2 + 1);
    expect(Math.max(...wc.fixtures.map((f) => f.week))).toBeLessThanOrEqual(51);
    expect(wc.fixtures[wc.fixtures.length - 1].week).toBeGreaterThanOrEqual(49);
  });
});

describe('statistics helpers', () => {
  it('sorts a table by points, goal difference, goals scored', () => {
    const { state } = fresh();
    const lg = state.competitions['ENG-1-2026'];
    const rows = lg.tables.main;
    const set = (i: number, pts: number, gf: number, ga: number) => Object.assign(rows[i], { points: pts, gf, ga, played: 10 });
    set(0, 20, 15, 10);
    set(1, 20, 18, 10); // better GD
    set(2, 20, 18, 13); // same GD as #0 (+5) but more goals
    set(3, 25, 5, 5);
    const order = sortedTable(lg).slice(0, 4).map((r) => r.teamId);
    expect(order).toEqual([rows[3].teamId, rows[1].teamId, rows[2].teamId, rows[0].teamId]);
    expect(topScorers(state, lg.id, 3)).toEqual([]);
    expect(isSeasonComplete(state)).toBe(false);
  });

  it('simulateWeek skips the requested fixtures', () => {
    const { state, rng } = fresh();
    state.week = 1;
    const mine = userFixturesForWeek(state)[0];
    const out = simulateWeek(state, rng, [mine.id]);
    expect(out.some((r) => r.fixture.id === mine.id)).toBe(false);
    expect(mine.played).toBe(false);
    expect(out.length).toBeGreaterThan(100);
    expect(out.every((r) => r.fixture.played)).toBe(true);
  });
});
