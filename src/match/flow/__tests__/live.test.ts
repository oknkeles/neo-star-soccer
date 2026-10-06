import { describe, expect, it } from 'vitest';
import { Rng } from '../../../core/rng';
import { makeTestState } from '../../../core/testing';
import { missingKeys } from '../../../core/i18n';
import type { GameState, MatchContext, MomentResult, Position, TeamSheet, UserMatchRole } from '../../../core/types';
import { LiveMatch, drillSetup, fallbackResolve, safeAutoResolve, assignSlots } from '../api';
import { emptyMomentStats } from '../moments';
import { fallbackCommentary } from '../commentary';

const SHAPE: Position[] = ['GK', 'FB', 'CB', 'CB', 'FB', 'CM', 'DM', 'CM', 'W', 'ST', 'W'];

function sheet(state: GameState, clubId: string, strength: number, userRole: UserMatchRole = 'none'): TeamSheet {
  const club = state.world.clubs[clubId];
  const pool = club.squad.filter((id) => !state.world.players[id].isUser);
  const xi: string[] = [];
  for (const pos of SHAPE) {
    const id = pool.find((p) => state.world.players[p].position === pos && !xi.includes(p)) ?? pool.find((p) => !xi.includes(p))!;
    xi.push(id);
  }
  let bench = pool.filter((p) => !xi.includes(p)).slice(0, 7);
  const user = state.career.playerId;
  if (club.squad.includes(user)) {
    if (userRole === 'starter') xi[9] = user; // the user plays ST
    if (userRole === 'bench') bench = [user, ...bench.slice(0, 6)];
  }
  return {
    teamId: clubId, name: club.name, shortName: club.shortName, kit: club.kit, formation: '4-3-3', style: club.style, xi, bench,
    strength: { att: strength, mid: strength, def: strength, gk: strength, overall: strength },
  };
}

function makeMatch(seed: number, opts: { role?: UserMatchRole; knockout?: boolean; pos?: Position; home?: number; away?: number; userAway?: boolean } = {}) {
  const state = makeTestState({ seed: 11, userPosition: opts.pos ?? 'ST' });
  const role = opts.role ?? 'starter';
  const userClub = 'ENG-1-00';
  const oppClub = 'ENG-1-03';
  const usSheet = sheet(state, userClub, opts.home ?? 64, role);
  const themSheet = sheet(state, oppClub, opts.away ?? 64);
  const ctx: MatchContext = {
    fixtureId: `fx-${seed}`, compId: 'ENG-1-2026', compName: 'Test Division',
    home: opts.userAway ? themSheet : usSheet,
    away: opts.userAway ? usSheet : themSheet,
    userSide: opts.userAway ? 'away' : 'home', userRole: role,
    weather: { kind: 'clear', time: 'night', wind: { x: 0, y: 0 }, temperature: 15 },
    importance: 0.5, derby: false, knockout: !!opts.knockout, stadium: 'Arena 0', attendance: 30000,
  };
  const live = new LiveMatch(state, ctx, new Rng(seed));
  live.commentary = fallbackCommentary;
  return { state, ctx, live };
}

/** Plays a whole match, auto-resolving every moment; records moment minutes & kinds. */
function playOut(live: LiveMatch) {
  const moments: { minute: number; added: number; kind: string | null; type: string }[] = [];
  let guard = 0;
  while (!live.isOver() && guard++ < 1000) {
    const r = live.tick();
    if (r.moment) {
      moments.push({ minute: live.minute, added: live.added, kind: live.momentKind, type: r.moment.type });
      live.resolveMoment(safeAutoResolve(r.moment, new Rng(guard * 7919)));
    }
  }
  return moments;
}

const goalsFor = (live: LiveMatch, side: 'home' | 'away') =>
  live.events.filter((e) => (e.kind === 'goal' || e.kind === 'penalty_goal' || e.kind === 'own_goal') && e.side === side).length;

describe('LiveMatch — full 90 minutes', () => {
  it('ends with sane scores, events and ratings', () => {
    let totalGoals = 0;
    const N = 120;
    for (let seed = 1; seed <= N; seed++) {
      const { live, ctx } = makeMatch(seed);
      playOut(live);
      expect(live.isOver()).toBe(true);
      expect(live.homeGoals).toBeLessThanOrEqual(9);
      expect(live.awayGoals).toBeLessThanOrEqual(9);
      // score always equals the goal events
      expect(goalsFor(live, 'home')).toBe(live.homeGoals);
      expect(goalsFor(live, 'away')).toBe(live.awayGoals);
      expect(live.events[0].kind).toBe('kickoff');
      expect(live.events.at(-1)!.kind).toBe('fulltime');
      expect(live.events.filter((e) => e.kind === 'halftime')).toHaveLength(1);
      const s = live.summary();
      totalGoals += s.homeGoals + s.awayGoals;
      for (const r of Object.values(s.ratings)) {
        expect(r).toBeGreaterThanOrEqual(3);
        expect(r).toBeLessThanOrEqual(10);
      }
      expect(s.user).toBeDefined();
      expect(s.user!.rating).toBeGreaterThanOrEqual(3);
      expect(s.user!.rating).toBeLessThanOrEqual(10);
      expect(s.user!.stats.minutes).toBeGreaterThan(0);
      expect(s.user!.stats.minutes).toBeLessThanOrEqual(90);
      expect(s.shots.home).toBeGreaterThanOrEqual(s.homeGoals);
      expect(s.shots.away).toBeGreaterThanOrEqual(s.awayGoals);
      expect(s.possession).toBeGreaterThanOrEqual(25);
      expect(s.possession).toBeLessThanOrEqual(75);
      expect(s.lineups).toEqual({ home: ctx.home.xi, away: ctx.away.xi });
      expect(s.pens).toBeUndefined();
    }
    const avgGoals = totalGoals / N;
    expect(avgGoals).toBeGreaterThan(1.6);
    expect(avgGoals).toBeLessThan(4.6);
  });

  it('is deterministic for a given seed', () => {
    const a = makeMatch(42).live;
    const b = makeMatch(42).live;
    playOut(a);
    playOut(b);
    const sa = a.summary();
    const sb = b.summary();
    expect([sa.homeGoals, sa.awayGoals]).toEqual([sb.homeGoals, sb.awayGoals]);
    expect(sa.ratings).toEqual(sb.ratings);
    expect(sa.events.map((e) => e.text)).toEqual(sb.events.map((e) => e.text));
    // summary() is idempotent
    expect(a.summary().ratings).toEqual(sa.ratings);
  });

  it('simulateToEnd finishes the match from any point', () => {
    const { live } = makeMatch(5);
    for (let i = 0; i < 30; i++) {
      const r = live.tick();
      if (r.moment) break;
    }
    live.simulateToEnd();
    expect(live.isOver()).toBe(true);
    expect(live.tick().done).toBe(true);
    expect(live.summary().user!.stats.moments).toBeGreaterThan(0);
  });

  it('a stronger team wins more often', () => {
    let strongWins = 0;
    let weakWins = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const { live } = makeMatch(seed, { home: 78, away: 52 });
      live.simulateToEnd();
      if (live.homeGoals > live.awayGoals) strongWins++;
      if (live.awayGoals > live.homeGoals) weakWins++;
    }
    expect(strongWins).toBeGreaterThan(weakWins * 2);
  });
});

describe('LiveMatch — moments', () => {
  function stats(pos: Position, n = 80) {
    let total = 0;
    let minM = 99;
    let maxM = 0;
    for (let seed = 1; seed <= n; seed++) {
      const { live } = makeMatch(seed, { pos });
      const ms = playOut(live);
      // scheduled moments are never within 3 minutes of each other
      const normal = ms.filter((m) => m.kind === 'normal' && m.added === 0);
      for (let i = 1; i < normal.length; i++) expect(normal[i].minute - normal[i - 1].minute).toBeGreaterThanOrEqual(4);
      total += ms.length;
      minM = Math.min(minM, ms.length);
      maxM = Math.max(maxM, ms.length);
    }
    return { avg: total / n, minM, maxM };
  }

  it('gives attackers ~4–8 moments per 90 and defenders fewer', () => {
    const st = stats('ST');
    const cb = stats('CB');
    expect(st.avg).toBeGreaterThanOrEqual(4);
    expect(st.avg).toBeLessThanOrEqual(8.5);
    expect(cb.avg).toBeGreaterThanOrEqual(2.5);
    expect(cb.avg).toBeLessThanOrEqual(6.5);
    expect(st.avg).toBeGreaterThan(cb.avg);
    expect(st.maxM).toBeLessThanOrEqual(12);
  });

  it('mixes moment types by position', () => {
    const count = (pos: Position) => {
      const c: Record<string, number> = {};
      for (let seed = 1; seed <= 60; seed++) {
        const { live } = makeMatch(seed, { pos });
        for (const m of playOut(live)) c[m.type] = (c[m.type] ?? 0) + 1;
      }
      return c;
    };
    const st = count('ST');
    const cb = count('CB');
    expect((st.one_on_one ?? 0) + (st.cross_receive ?? 0)).toBeGreaterThan(st.defend ?? 0);
    expect(cb.defend ?? 0).toBeGreaterThan(cb.one_on_one ?? 0);
    expect(st.defend ?? 0).toBe(0);
  });

  it('builds complete moment setups', () => {
    const { live, state } = makeMatch(3);
    let setup = null;
    for (let i = 0; i < 200 && !setup; i++) setup = live.tick().moment;
    expect(setup).not.toBeNull();
    const s = setup!;
    expect(s.userId).toBe(state.career.playerId);
    expect(s.us.players).toHaveLength(11);
    expect(s.them.players).toHaveLength(11);
    expect(s.us.players[0].role).toBe('GK');
    expect(s.them.players[0].role).toBe('GK');
    expect(s.us.players.filter((p) => p.isUser)).toHaveLength(1);
    expect(s.timeLimit).toBeGreaterThanOrEqual(8);
    expect(s.timeLimit).toBeLessThanOrEqual(20);
    expect(s.difficulty).toBeGreaterThan(0);
    expect(s.difficulty).toBeLessThan(1);
    expect(s.teammateTrust).toBeGreaterThanOrEqual(0);
    expect(s.teammateTrust).toBeLessThanOrEqual(100);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    // ticking while a moment is pending does not advance the clock
    const m = live.minute;
    expect(live.tick().moment).toBe(s);
    expect(live.minute).toBe(m);
  });

  it('resolveMoment credits a user goal and lifts the rating', () => {
    const { live, state } = makeMatch(9);
    let setup = null;
    for (let i = 0; i < 200 && !setup; i++) setup = live.tick().moment;
    const before = live.homeGoals;
    const result: MomentResult = {
      type: setup!.type, outcome: 'goal', goalFor: true, goalAgainst: false, scorerId: state.career.playerId, assistId: null,
      stats: { ...emptyMomentStats(), shots: 1, shotsOnTarget: 1, goals: 1 }, ratingDelta: 1.2, xp: { shooting: 3 },
      followUp: null, highlight: true, replay: [], skipped: false,
    };
    const evs = live.resolveMoment(result);
    expect(live.homeGoals).toBe(before + 1);
    expect(live.userStats.goals).toBe(1);
    expect(live.userRating).toBeCloseTo(7.2, 5);
    expect(evs.some((e) => e.kind === 'goal' && e.user && e.playerId === state.career.playerId)).toBe(true);
    live.simulateToEnd();
    const s = live.summary();
    expect(s.user!.xp.shooting).toBeGreaterThanOrEqual(3);
    expect(s.user!.highlights).toBeGreaterThanOrEqual(1);
  });

  it('a teammate goal after a user pass is an assist', () => {
    const { live, ctx, state } = makeMatch(13);
    let setup = null;
    for (let i = 0; i < 200 && !setup; i++) setup = live.tick().moment;
    const mate = ctx.home.xi[8];
    live.resolveMoment({
      type: setup!.type, outcome: 'assist', goalFor: true, goalAgainst: false, scorerId: mate, assistId: state.career.playerId,
      stats: { ...emptyMomentStats(), passes: 1, passesCompleted: 1, keyPasses: 1, assists: 1 }, ratingDelta: 0.7, xp: {},
      followUp: null, highlight: true, replay: [], skipped: false,
    });
    expect(live.userStats.assists).toBe(1);
    const goal = live.events.find((e) => e.kind === 'goal' && e.playerId === mate);
    expect(goal?.assistId).toBe(state.career.playerId);
    expect(goal?.user).toBe(true);
  });

  it('a foul won leads to a set-piece moment next minute when the user is the taker', () => {
    const { live, state } = makeMatch(21);
    state.career.setPieces.freeKicks = true;
    let setup = null;
    for (let i = 0; i < 200 && !setup; i++) setup = live.tick().moment;
    live.resolveMoment({
      type: setup!.type, outcome: 'foul_won', goalFor: false, goalAgainst: false, scorerId: null, assistId: null,
      stats: { ...emptyMomentStats(), foulsWon: 1 }, ratingDelta: 0.2, xp: {},
      followUp: { type: 'free_kick', spot: { x: 30, y: 5 } }, highlight: false, replay: [], skipped: false,
    });
    const next = live.tick();
    expect(next.moment?.type).toBe('free_kick');
    expect(next.moment?.spot).toEqual({ x: 30, y: 5 });
    expect(live.momentKind).toBe('followup');
  });

  it('a failed defend moment can concede a goal', () => {
    const { live } = makeMatch(17, { pos: 'CB' });
    let setup = null;
    for (let i = 0; i < 200 && !setup; i++) setup = live.tick().moment;
    const before = live.awayGoals;
    live.resolveMoment({
      type: 'defend', outcome: 'conceded', goalFor: false, goalAgainst: true, scorerId: null, assistId: null,
      stats: emptyMomentStats(), ratingDelta: -0.8, xp: {}, followUp: null, highlight: false, replay: [], skipped: false,
    });
    expect(live.awayGoals).toBe(before + 1);
    expect(live.userRating).toBeCloseTo(5.2, 5);
  });
});

describe('LiveMatch — bench and knockouts', () => {
  it('bench players only come on between 55 and 80 minutes', () => {
    let cameOn = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const { live } = makeMatch(seed, { role: 'bench' });
      expect(live.userOnPitch).toBe(false);
      const ms = playOut(live);
      const sub = live.events.find((e) => e.kind === 'sub' && e.user);
      if (sub) {
        cameOn++;
        expect(sub.minute).toBeGreaterThanOrEqual(55);
        expect(sub.minute).toBeLessThanOrEqual(80);
        const s = live.summary();
        expect(s.user!.stats.minutes).toBeLessThanOrEqual(35);
        for (const m of ms) expect(m.minute).toBeGreaterThanOrEqual(sub.minute);
      } else {
        expect(ms).toHaveLength(0);
        expect(live.summary().user).toBeUndefined();
      }
    }
    expect(cameOn).toBeGreaterThan(15);
    expect(cameOn).toBeLessThan(75);
  });

  it('a user not in the squad never gets moments', () => {
    const { live } = makeMatch(4, { role: 'none' });
    expect(playOut(live)).toHaveLength(0);
    expect(live.summary().user).toBeUndefined();
  });

  it('knockout matches always produce a winner', () => {
    let pens = 0;
    let userKicks = 0;
    for (let seed = 1; seed <= 120; seed++) {
      // low-scoring teams so shoot-outs actually happen
      const { live } = makeMatch(seed, { knockout: true, home: 45, away: 45, userAway: seed % 2 === 0 });
      const ms = playOut(live);
      const s = live.summary();
      expect(live.winnerSide()).not.toBeNull();
      if (s.pens) {
        pens++;
        expect(s.homeGoals).toBe(s.awayGoals);
        expect(s.pens.home).not.toBe(s.pens.away);
        expect(live.wentToExtraTime).toBe(true);
        if (live.userOnPitch) {
          expect(ms.some((m) => m.kind === 'shootout' && m.type === 'penalty')).toBe(true);
          userKicks++;
        }
      }
      if (live.wentToExtraTime) {
        for (const m of Object.values(s.minutes ?? {})) expect(m).toBeLessThanOrEqual(120);
      }
    }
    expect(pens).toBeGreaterThan(0);
    expect(userKicks).toBeGreaterThan(0);
  });
});

describe('drills, fallback and helpers', () => {
  it('drillSetup builds a playable drill for each type', () => {
    const state = makeTestState();
    for (const type of ['drill_free_kick', 'drill_finishing', 'drill_passing'] as const) {
      const s = drillSetup(state, type, 123);
      expect(s.type).toBe(type);
      expect(s.drill!.attempts).toBeGreaterThanOrEqual(5);
      expect(s.drill!.attempts).toBeLessThanOrEqual(8);
      expect(s.us.players.some((p) => p.isUser && p.id === state.career.playerId)).toBe(true);
      expect(s.them.players.some((p) => p.role === 'GK')).toBe(true);
      expect(s.us.kit).toEqual(state.world.clubs['ENG-1-00'].kit);
      expect(s.them.kit.primary).not.toBe(s.us.kit.primary);
      if (type === 'drill_free_kick') expect(s.them.players.length).toBeGreaterThanOrEqual(4);
      const r = fallbackResolve(s, new Rng(1));
      expect(r.drillScore).toBeGreaterThanOrEqual(0);
      expect(r.drillScore).toBeLessThanOrEqual(100);
    }
    // deterministic by seed
    expect(drillSetup(state, 'drill_free_kick', 5)).toEqual(drillSetup(state, 'drill_free_kick', 5));
  });

  it('assignSlots keeps GK first and the user in his position', () => {
    const state = makeTestState({ userPosition: 'W' });
    const ids = state.world.clubs['ENG-1-00'].squad.slice(0, 10).concat('USER');
    const slots = assignSlots(ids, '4-4-2', (id) => state.world.players[id].position, 'USER');
    expect(slots).toHaveLength(11);
    expect(slots[0].role).toBe('GK');
    expect(slots.find((s) => s.id === 'USER')!.role).toBe('W');
    expect(new Set(slots.map((s) => s.id)).size).toBe(11);
  });

  it('fallbackResolve is sane for every match moment type', () => {
    const { live } = makeMatch(77);
    let setup = null;
    for (let i = 0; i < 200 && !setup; i++) setup = live.tick().moment;
    const types = ['open_play', 'counter', 'one_on_one', 'cross_receive', 'wing_cross', 'build_up', 'defend', 'free_kick', 'penalty', 'corner'] as const;
    for (const type of types) {
      let goals = 0;
      for (let i = 0; i < 300; i++) {
        const r = fallbackResolve({ ...setup!, type }, new Rng(i));
        expect(r.ratingDelta).toBeGreaterThanOrEqual(-1.5);
        expect(r.ratingDelta).toBeLessThanOrEqual(2);
        if (r.goalFor) goals++;
        if (type === 'defend') expect(r.goalFor).toBe(false);
      }
      if (type === 'penalty') expect(goals / 300).toBeGreaterThan(0.5);
      if (type === 'build_up') expect(goals / 300).toBeLessThan(0.2);
    }
  });

  it('has every string in both languages', () => {
    const m = missingKeys();
    expect(m.en.filter((k) => k.startsWith('match.'))).toEqual([]);
    expect(m.tr.filter((k) => k.startsWith('match.'))).toEqual([]);
  });
});
