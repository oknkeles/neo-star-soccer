import { describe, expect, it } from 'vitest';
import {
  ACTIONS_PER_WEEK, afterUserMatch, applyDrill, applyXp, ageGrowthMultiplier, attrCap, buyItem, drillAvailable, potentialGapMultiplier,
  rollInjury, trainWeek, userPlayer, userSeasonAgeing, weeklyRecovery,
} from '../api';
import { ATTR_KEYS, overall } from '../../core/ratings';
import type { GameState, TraitId } from '../../core/types';
import { Rng } from '../../core/rng';
import { addFixture, makeRng, ovr, setUser, stateWith, summaryFor } from './kit';

const progressTotal = (s: GameState) => {
  const p = userPlayer(s);
  return ATTR_KEYS.reduce((a, k) => a + p.attrs[k] * 100 + (s.career.xp[k] ?? 0), 0);
};

/** One season: weekly training + recovery and (optionally) 38 league matches at a 6.7 rating. */
function playSeason(s: GameState, rng: Rng, matches: boolean, season = 0): void {
  for (let w = 0; w < 52; w++) {
    s.week = w;
    s.career.actionsLeft = ACTIONS_PER_WEEK;
    if (matches && w < 38) {
      const f = addFixture(s, { id: `f-${season}-${w}`, week: w });
      afterUserMatch(s, f.id, summaryFor(s, f.id, { rating: 6.7 }), rng);
    }
    trainWeek(s, rng);
    weeklyRecovery(s, rng);
  }
  userSeasonAgeing(s, rng);
}

describe('growth curves', () => {
  it('growth speed falls with age', () => {
    const none = { traits: [] as TraitId[] };
    const m = [18, 24, 28, 33].map((a) => ageGrowthMultiplier(a, none));
    expect(m[0]).toBeGreaterThan(m[1]);
    expect(m[1]).toBeGreaterThan(m[2]);
    expect(m[2]).toBeGreaterThan(m[3]);
    expect(m[3]).toBeLessThan(0.35);
  });

  it('trait twists: wonderkid early, late bloomer later', () => {
    const none = { traits: [] as TraitId[] };
    expect(ageGrowthMultiplier(18, { traits: ['wonderkid'] })).toBeGreaterThan(ageGrowthMultiplier(18, none));
    expect(ageGrowthMultiplier(18, { traits: ['late_bloomer'] })).toBeLessThan(ageGrowthMultiplier(18, none));
    expect(ageGrowthMultiplier(25, { traits: ['late_bloomer'] })).toBeGreaterThan(ageGrowthMultiplier(25, none));
  });

  it('growth slows as the overall approaches the potential', () => {
    expect(potentialGapMultiplier(60, 86)).toBeGreaterThan(potentialGapMultiplier(80, 86));
    expect(potentialGapMultiplier(86, 86)).toBeLessThan(0.5);
  });

  it('100 effective xp earns a point; negative xp only drains the pool', () => {
    const s = stateWith();
    const before = userPlayer(s).attrs.passing;
    const notes = applyXp(s, { passing: 100 });
    expect(userPlayer(s).attrs.passing).toBeGreaterThan(before);
    expect(notes[0]).toMatchObject({ attr: 'passing' });
    const pool = s.career.xp.passing ?? 0;
    applyXp(s, { passing: -500 });
    expect(s.career.xp.passing ?? 0).toBeLessThanOrEqual(pool);
    expect(userPlayer(s).attrs.passing).toBeGreaterThan(before);
  });

  it('can never push the overall beyond the hidden potential', () => {
    const s = stateWith();
    const p = userPlayer(s);
    p.potential = ovr(s) + 2;
    const xp = Object.fromEntries(ATTR_KEYS.map((k) => [k, 20_000]));
    applyXp(s, xp);
    expect(overall(p)).toBeLessThanOrEqual(p.potential);
    for (const k of ATTR_KEYS) expect(p.attrs[k]).toBeLessThanOrEqual(attrCap(p));
  });

  it('a 17-year-old with minutes grows 3–8 overall in a season, more than without minutes', () => {
    const withMins: number[] = [];
    const without: number[] = [];
    for (const seed of [1, 2, 3]) {
      const a = stateWith({ seed });
      const start = ovr(a);
      playSeason(a, makeRng(seed), true);
      withMins.push(ovr(a) - start);
      const b = stateWith({ seed });
      playSeason(b, makeRng(seed), false);
      without.push(ovr(b) - start);
    }
    for (const g of withMins) {
      expect(g).toBeGreaterThanOrEqual(3);
      expect(g).toBeLessThanOrEqual(8);
    }
    expect(withMins.reduce((a, b) => a + b, 0)).toBeGreaterThan(without.reduce((a, b) => a + b, 0));
  });

  it('plateaus near the potential and declines late in the career', () => {
    const s = stateWith({ seed: 3 });
    const rng = makeRng(3);
    const p = userPlayer(s);
    const ovrs: number[] = [];
    for (let i = 0; i < 20; i++) {
      playSeason(s, rng, true, i);
      ovrs.push(ovr(s));
      s.season += 1;
    }
    expect(Math.max(...ovrs)).toBeLessThanOrEqual(p.potential + 2);
    expect(ovrs[ovrs.length - 1]).toBeLessThan(Math.max(...ovrs));
    expect(ovrs[3]).toBeGreaterThan(ovrs[0] + 5);
  });
});

describe('trainWeek', () => {
  it('costs a little energy and follows the chosen focus', () => {
    const a = stateWith({ seed: 5 });
    a.career.trainingFocus = 'shooting';
    const e0 = a.career.energy;
    trainWeek(a, makeRng(1));
    expect(a.career.energy).toBeLessThan(e0);
    expect(a.career.energy).toBeGreaterThan(e0 - 12);
    const b = stateWith({ seed: 5 });
    b.career.trainingFocus = 'defending';
    trainWeek(b, makeRng(1));
    const gain = (s: GameState, k: 'shooting' | 'tackling') => (s.career.xp[k] ?? 0) + (userPlayer(s).attrs[k] - userPlayer(stateWith({ seed: 5 })).attrs[k]) * 100;
    expect(gain(a, 'shooting')).toBeGreaterThan(gain(b, 'shooting'));
    expect(gain(b, 'tackling')).toBeGreaterThan(gain(a, 'tackling'));
  });

  it('better facilities, workaholic trait and training gear all boost progress', () => {
    const run = (mut: (s: GameState) => void) => {
      const s = stateWith({ seed: 5 });
      mut(s);
      const start = progressTotal(s);
      trainWeek(s, makeRng(7));
      return progressTotal(s) - start;
    };
    const base = run(() => {});
    expect(run((s) => { s.world.clubs[userPlayer(s).clubId as string].facilities = 95; })).toBeGreaterThan(base);
    expect(run((s) => { userPlayer(s).traits = ['workaholic']; })).toBeGreaterThan(base);
    expect(run((s) => { s.career.money = 5e6; s.career.fame = 60; expect(buyItem(s, 'w_smart').ok).toBe(true); })).toBeGreaterThan(base);
    expect(run((s) => { s.career.energy = 10; })).toBeLessThan(base);
  });

  it('set-piece specialists grow curl faster', () => {
    const run = (traits: TraitId[]) => {
      const s = stateWith({ seed: 5 });
      userPlayer(s).traits = traits;
      s.career.trainingFocus = 'setpieces';
      const start = progressTotal(s);
      for (let i = 0; i < 6; i++) trainWeek(s, makeRng(i));
      return (s.career.xp.curl ?? 0) + userPlayer(s).attrs.curl * 100 - start / 1e9;
    };
    expect(run(['set_piece_specialist'])).toBeGreaterThan(run([]));
  });

  it('an injured player only does light rehab work', () => {
    const s = stateWith();
    userPlayer(s).injury = { key: 'hamstring', weeksLeft: 3, severity: 2 };
    const e0 = s.career.energy;
    trainWeek(s, makeRng(1));
    expect(s.career.energy).toBe(e0);
  });
});

describe('applyDrill', () => {
  it('rewards once per week per drill type, better scores pay more', () => {
    const s = stateWith();
    expect(drillAvailable(s, 'drill_finishing')).toBe(true);
    const start = progressTotal(s);
    applyDrill(s, 'drill_finishing', 100);
    const high = progressTotal(s) - start;
    expect(high).toBeGreaterThan(0);
    const mid = progressTotal(s);
    expect(applyDrill(s, 'drill_finishing', 100)).toEqual([]);
    expect(progressTotal(s)).toBe(mid);
    expect(drillAvailable(s, 'drill_finishing')).toBe(false);
    expect(drillAvailable(s, 'drill_passing')).toBe(true);
    s.week += 1;
    expect(drillAvailable(s, 'drill_finishing')).toBe(true);

    const t = stateWith();
    const t0 = progressTotal(t);
    applyDrill(t, 'drill_finishing', 0);
    expect(progressTotal(t) - t0).toBeLessThan(high);
  });
});

describe('weeklyRecovery', () => {
  it('restores energy, drifts morale toward 55 and form toward 50', () => {
    const s = stateWith();
    s.career.energy = 20;
    setUser(s, { morale: 95, form: 90 });
    const notes = weeklyRecovery(s, makeRng(1));
    expect(s.career.energy).toBeGreaterThan(20);
    expect(userPlayer(s).morale).toBeLessThan(95);
    expect(userPlayer(s).form).toBeLessThan(90);
    expect(userPlayer(s).form).toBeGreaterThan(50);
    expect(Array.isArray(notes)).toBe(true);
    setUser(s, { morale: 10, form: 10 });
    weeklyRecovery(s, makeRng(1));
    expect(userPlayer(s).morale).toBeGreaterThan(10);
    expect(userPlayer(s).form).toBeGreaterThan(10);
  });

  it('counts injuries down and announces the return', () => {
    const s = stateWith();
    userPlayer(s).injury = { key: 'groin', weeksLeft: 2, severity: 2 };
    weeklyRecovery(s, makeRng(1));
    expect(userPlayer(s).injury?.weeksLeft).toBe(1);
    const notes = weeklyRecovery(s, makeRng(1));
    expect(userPlayer(s).injury).toBeNull();
    expect(notes.join(' ')).toMatch(/sakatlığın tamamen geçti/i);
  });

  it('being benched while the club plays erodes morale and a promised role the manager relation', () => {
    const s = stateWith();
    s.week = 3;
    userPlayer(s).contract!.role = 'starter';
    for (let i = 0; i < 4; i++) {
      s.week = 3 + i;
      addFixture(s, { id: `bf-${i}`, week: s.week, played: true, homeGoals: 1, awayGoals: 0 });
      weeklyRecovery(s, makeRng(i));
    }
    expect(userPlayer(s).morale).toBeLessThan(60);
    expect(s.career.relationships.manager).toBeLessThan(50);
  });

  it('neglected partners eventually leave', () => {
    const s = stateWith();
    s.career.people.push({ id: 'PER-love', name: 'Ada', role: 'partner', personality: 'warm', bio: '', relationship: 12 });
    s.career.partnerId = 'PER-love';
    s.career.relationships.partner = 9;
    s.flags['career.lastAct.romance'] = 1; // no date night for ages
    for (let i = 0; i < 6 && s.career.partnerId; i++) weeklyRecovery(s, makeRng(i));
    expect(s.career.partnerId).toBeNull();
  });
});

describe('rollInjury', () => {
  const rate = (traits: TraitId[], rolls = 3000) => {
    let n = 0;
    const rng = new Rng(11);
    for (let i = 0; i < rolls; i++) {
      const s = stateWith();
      userPlayer(s).traits = traits;
      if (rollInjury(s, rng, 1)) n++;
    }
    return n / rolls;
  };

  it('glass bones get hurt far more often than iron men', () => {
    const glass = rate(['glass_bones']);
    const normal = rate([]);
    const iron = rate(['iron_man']);
    expect(glass).toBeGreaterThan(normal * 1.3);
    expect(iron).toBeLessThan(normal);
    expect(normal).toBeGreaterThan(0.01);
    expect(normal).toBeLessThan(0.12);
  });

  it('sets the injury on the player and never stacks injuries', () => {
    const rng = new Rng(3);
    const s = stateWith();
    userPlayer(s).traits = ['glass_bones'];
    s.career.energy = 5;
    let inj = null;
    for (let i = 0; i < 300 && !inj; i++) inj = rollInjury(s, rng, 1.5);
    expect(inj).not.toBeNull();
    expect(userPlayer(s).injury).toEqual(inj);
    expect(inj!.weeksLeft).toBeGreaterThanOrEqual(1);
    expect(rollInjury(s, rng, 1.5)).toBeNull();
  });
});

describe('userSeasonAgeing', () => {
  it('veterans lose physical attributes; late bloomers gain after 22', () => {
    const old = stateWith({ seed: 2 });
    setUser(old, { birthYear: old.season - 34 });
    const p = userPlayer(old);
    const phys = () => p.attrs.pace + p.attrs.acceleration + p.attrs.stamina + p.attrs.jumping;
    const before = phys();
    const notes = userSeasonAgeing(old, makeRng(1));
    expect(phys()).toBeLessThan(before);
    expect(notes.some((n) => n.delta < 0)).toBe(true);

    const lb = stateWith({ seed: 2 });
    setUser(lb, { birthYear: lb.season - 23, traits: ['late_bloomer'], potential: 92 });
    const start = progressTotal(lb);
    userSeasonAgeing(lb, makeRng(1));
    expect(progressTotal(lb)).toBeGreaterThan(start);
  });
});
