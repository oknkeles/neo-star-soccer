import { describe, expect, it } from 'vitest';
import {
  GOAL_TEMPLATE_IDS, buyItem, callupChance, checkCareerGoals, goalProgress, hallOfFameScore, legacyTier, makeCareerGoals, nationalCallup,
  retirementStatus, trophyKind, userPlayer,
} from '../api';
import { Rng } from '../../core/rng';
import { ATTR_KEYS, overall } from '../../core/ratings';
import type { CareerGoal, GameState } from '../../core/types';
import { addNationalTeam, makeRng, setUser, stateWith } from './kit';

function withGoals(s: GameState, seed = 1): CareerGoal[] {
  s.career.genesis.goals = makeCareerGoals(s, new Rng(seed));
  return s.career.genesis.goals;
}

describe('makeCareerGoals', () => {
  it('creates three distinct, localized goals (short / mid / dream)', () => {
    for (const lang of ['tr', 'en'] as const) {
      for (let seed = 1; seed <= 30; seed++) {
        const s = stateWith({ seed });
        s.lang = lang;
        s.career.genesis.hometownClubId = 'ENG-1-03';
        addNationalTeam(s, 65);
        const goals = withGoals(s, seed);
        expect(goals).toHaveLength(3);
        expect(new Set(goals.map((g) => g.text)).size).toBe(3);
        expect(new Set(goals.map((g) => g.id)).size).toBe(3);
        for (const g of goals) {
          expect(g.done).toBe(false);
          expect(g.text.length).toBeGreaterThan(8);
          expect(g.text, g.text).not.toMatch(/[{}]|undefined|NaN/);
        }
      }
    }
  });

  it('writes Turkish and English text', () => {
    const tr = stateWith();
    tr.lang = 'tr';
    const en = stateWith();
    en.lang = 'en';
    expect(withGoals(tr).map((g) => g.text).join(' ')).not.toBe(withGoals(en).map((g) => g.text).join(' '));
  });

  it('offers the hometown club goal when it makes sense', () => {
    let hometown = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = stateWith({ seed });
      s.career.genesis.hometownClubId = 'ENG-1-04';
      const goals = withGoals(s, seed);
      if (goals.some((g) => g.kind === 'play_for_club' && g.target === 'ENG-1-04')) hometown++;
    }
    expect(hometown).toBeGreaterThan(5);
    for (let seed = 1; seed <= 30; seed++) {
      const s = stateWith({ seed });
      s.career.genesis.hometownClubId = null;
      expect(withGoals(s, seed).some((g) => g.kind === 'play_for_club')).toBe(false);
    }
  });

  it('skips national-team goals for nations without a team and scales goal targets by position', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = stateWith({ seed });
      expect(withGoals(s, seed).some((g) => g.kind === 'caps')).toBe(false);
    }
    const target = (pos: 'ST' | 'CB') => {
      for (let seed = 1; seed <= 200; seed++) {
        const s = stateWith({ seed, userPosition: pos });
        const g = withGoals(s, seed).find((x) => x.kind === 'season_goals');
        if (g) return Number(g.target);
      }
      return 0;
    };
    expect(target('ST')).toBeGreaterThan(target('CB'));
  });

  it('has a catalogue of ~20+ templates', () => {
    expect(new Set(GOAL_TEMPLATE_IDS).size).toBe(GOAL_TEMPLATE_IDS.length);
    expect(GOAL_TEMPLATE_IDS.length).toBeGreaterThanOrEqual(20);
  });
});

describe('checkCareerGoals', () => {
  const find = (s: GameState, kind: CareerGoal['kind'], target?: string | number): CareerGoal => {
    const g: CareerGoal = { id: `g-${kind}-${target}`, text: `${kind}`, kind, target, done: false };
    s.career.genesis.goals.push(g);
    return g;
  };

  it('completes standard goals as the career unfolds and reports each only once', () => {
    const s = stateWith();
    const league = find(s, 'win_comp', 'league');
    const cc = find(s, 'win_comp', 'cc');
    const gb = find(s, 'golden_ball');
    const goals = find(s, 'season_goals', 20);
    const caps = find(s, 'caps', 10);
    const value = find(s, 'value', 20_000_000);
    const club = find(s, 'play_for_club', 'ENG-1-00');
    expect(checkCareerGoals(s).map((g) => g.id)).toEqual([club.id]);
    expect(checkCareerGoals(s)).toEqual([]);

    s.career.trophies.push({ compId: 'ENG-1-2026', name: 'League', season: 2026, teamId: 'ENG-1-00' });
    s.career.awards.push({ key: 'golden_ball', name: 'Golden Ball', season: 2026 });
    userPlayer(s).season.goals = 22;
    userPlayer(s).intlCaps = 12;
    userPlayer(s).value = 21_000_000;
    s.season = 2027;
    const done = checkCareerGoals(s);
    expect(done.map((g) => g.id).sort()).toEqual([league.id, gb.id, goals.id, caps.id, value.id].sort());
    expect(done.every((g) => g.done && g.doneSeason === 2027)).toBe(true);
    expect(cc.done).toBe(false);
    s.career.trophies.push({ compId: 'CC-2026', name: 'Champions Cup', season: 2026, teamId: 'ENG-1-00' });
    expect(checkCareerGoals(s).map((g) => g.id)).toEqual([cc.id]);
  });

  it('completes the generated template goals (custom kinds) too', () => {
    const s = stateWith({ seed: 3 });
    s.lang = 'en';
    const goals = withGoals(s, 7);
    expect(checkCareerGoals(s).filter((g) => goals.includes(g)).length).toBeLessThanOrEqual(1);
    // make everything true at once
    s.career.trophies.push(
      { compId: 'ENG-1-2026', name: 'L', season: 2026, teamId: 'x' }, { compId: 'CC-2026', name: 'C', season: 2026, teamId: 'x' },
      { compId: 'CUP-ENG-2026', name: 'Cup', season: 2026, teamId: 'x' }, { compId: 'WC-2030', name: 'WC', season: 2030, teamId: 'x' },
      { compId: 'ENG-1-2027', name: 'L2', season: 2027, teamId: 'x' },
    );
    for (const key of ['golden_ball', 'young_player', 'league_top_scorer', 'team_of_season']) s.career.awards.push({ key, name: key, season: 2026 });
    const p = userPlayer(s);
    for (const k of ATTR_KEYS) p.attrs[k] = 95;
    Object.assign(p, { value: 900_000_000, intlCaps: 150, season: { ...p.season, goals: 80, apps: 300 }, career: { ...p.career, goals: 400, apps: 500 } });
    s.career.followers = 50_000_000;
    s.flags['career.married'] = true;
    s.career.money = 5e8;
    s.career.fame = 100;
    buyItem(s, 'j_own');
    s.world.clubs[p.clubId as string].reputation = 90;
    const done = checkCareerGoals(s);
    expect(done.length).toBeGreaterThan(0);
    for (const g of goals) {
      if (g.kind === 'play_for_club' || g.kind === 'caps' || g.kind === 'win_comp' && g.target === 'intl') continue;
      expect(g.done, g.text).toBe(true);
    }
  });

  it('reports progress for numeric goals', () => {
    const s = stateWith();
    userPlayer(s).intlCaps = 4;
    expect(goalProgress(s, { id: 'a', text: '', kind: 'caps', target: 10, done: false })).toEqual({ current: 4, target: 10 });
    expect(goalProgress(s, { id: 'b', text: '', kind: 'golden_ball', done: false })).toBeNull();
    s.career.followers = 4_000;
    expect(goalProgress(s, { id: 'c', text: '', kind: 'custom', target: 'followers:250000', done: false })).toEqual({ current: 4_000, target: 250_000 });
  });
});

describe('hallOfFameScore', () => {
  it('starts near zero and grows with trophies, awards, stats and caps', () => {
    const s = stateWith();
    const base = hallOfFameScore(s);
    expect(base).toBeGreaterThanOrEqual(0);
    expect(base).toBeLessThan(600);
    s.career.trophies.push({ compId: 'ENG-1-2026', name: 'L', season: 2026, teamId: 'x' });
    const withLeague = hallOfFameScore(s);
    expect(withLeague).toBeGreaterThan(base);
    s.career.trophies.push({ compId: 'CC-2026', name: 'C', season: 2026, teamId: 'x' });
    expect(hallOfFameScore(s)).toBeGreaterThan(withLeague + 50);
    const before = hallOfFameScore(s);
    s.career.awards.push({ key: 'golden_ball', name: 'GB', season: 2026 });
    expect(hallOfFameScore(s)).toBeGreaterThan(before + 100);
    const p = userPlayer(s);
    const b2 = hallOfFameScore(s);
    p.career.goals = 200;
    p.intlCaps = 80;
    expect(hallOfFameScore(s)).toBeGreaterThan(b2 + 150);
    s.career.genesis.goals = [{ id: 'g', text: '', kind: 'custom', done: true }];
    expect(Number.isInteger(hallOfFameScore(s))).toBe(true);
  });

  it('labels the legacy', () => {
    expect(legacyTier(3000, 'en')).not.toBe(legacyTier(10, 'en'));
    expect(legacyTier(900, 'tr').length).toBeGreaterThan(2);
  });

  it('classifies trophies by competition id', () => {
    expect(trophyKind({ compId: 'TUR-1-2030' })).toBe('league');
    expect(trophyKind({ compId: 'ESP-2-2030' })).toBe('league2');
    expect(trophyKind({ compId: 'CC-2030' })).toBe('cc');
    expect(trophyKind({ compId: 'CUP-ITA-2030' })).toBe('cup');
    expect(trophyKind({ compId: 'CONT-2032' })).toBe('intl');
  });
});

describe('retirementStatus', () => {
  const at = (age: number, mut?: (s: GameState) => void) => {
    const s = stateWith();
    setUser(s, { birthYear: s.season - age });
    mut?.(s);
    return retirementStatus(s);
  };

  it('allows retirement from 32 and forces it at 40', () => {
    expect(at(25)).toEqual({ canRetire: false, forced: false });
    expect(at(31)).toEqual({ canRetire: false, forced: false });
    expect(at(32)).toEqual({ canRetire: true, forced: false });
    expect(at(38)).toEqual({ canRetire: true, forced: false });
    expect(at(40)).toEqual({ canRetire: true, forced: true });
  });

  it('a career-threatening injury allows an earlier exit, but not for teenagers', () => {
    const inj = (s: GameState) => { userPlayer(s).injury = { key: 'acl', weeksLeft: 34, severity: 3 }; };
    expect(at(29, inj).canRetire).toBe(true);
    expect(at(19, inj).canRetire).toBe(false);
  });

  it('retired players are done', () => {
    expect(at(41, (s) => { s.career.retired = true; })).toEqual({ canRetire: false, forced: false });
  });
});

describe('nationalCallup', () => {
  it('without a national team nothing happens', () => {
    const s = stateWith();
    expect(nationalCallup(s, makeRng(1))).toBe(false);
    expect(s.career.calledUp).toBe(false);
  });

  it('a star is called up and joins the squad list', () => {
    const s = stateWith();
    const ntId = addNationalTeam(s, 62);
    const p = userPlayer(s);
    for (const k of ATTR_KEYS) p.attrs[k] = 85;
    s.career.fame = 70;
    expect(callupChance(s)).toBeGreaterThan(0.9);
    let called = 0;
    for (let seed = 0; seed < 20; seed++) if (nationalCallup(s, new Rng(seed))) called++;
    expect(called).toBeGreaterThan(15);
    expect(s.career.calledUp).toBe(true);
    expect(s.career.nationalTeamId).toBe(ntId);
    const squad = s.world.nationalTeams[ntId].squad;
    expect(squad.filter((id) => id === p.id)).toHaveLength(1);
    expect(squad.length).toBeLessThanOrEqual(26);
  });

  it('a clearly weaker player is not called up, and drops out of the list', () => {
    const s = stateWith();
    const ntId = addNationalTeam(s, 78);
    const p = userPlayer(s);
    s.world.nationalTeams[ntId].squad.push(p.id);
    s.career.calledUp = true;
    expect(overall(p)).toBeLessThan(65);
    expect(callupChance(s)).toBeLessThan(0.1);
    let called = 0;
    for (let seed = 0; seed < 30; seed++) if (nationalCallup(s, new Rng(seed))) called++;
    expect(called).toBeLessThan(5);
    s.career.calledUp = true;
    s.world.nationalTeams[ntId].squad.push(p.id);
    for (let seed = 100; seed < 130 && s.career.calledUp; seed++) nationalCallup(s, new Rng(seed));
    expect(s.career.calledUp).toBe(false);
    expect(s.world.nationalTeams[ntId].squad).not.toContain(p.id);
  });

  it('fame, form and an injury change the odds', () => {
    const s = stateWith();
    addNationalTeam(s, 66);
    const p = userPlayer(s);
    for (const k of ATTR_KEYS) p.attrs[k] = 66;
    s.career.fame = 10;
    const lowFame = callupChance(s);
    s.career.fame = 80;
    expect(callupChance(s)).toBeGreaterThan(lowFame);
    p.form = 90;
    const hot = callupChance(s);
    p.form = 20;
    expect(callupChance(s)).toBeLessThan(hot);
    p.injury = { key: 'acl', weeksLeft: 20, severity: 3 };
    expect(callupChance(s)).toBe(0);
  });
});
