import { describe, expect, it } from 'vitest';
import { LAST_CLUB_WEEK, WEEKS_PER_SEASON, weekInfo } from '../api';
import { INTL_BREAK_WEEKS, firstSaturdayOfAugust, tournamentOf } from '../calendar';
import { doubleRoundRobin, leagueSlots, singleRoundRobin } from '../schedule';

describe('calendar', () => {
  it('week 0 is the first Saturday of August', () => {
    for (const season of [2026, 2027, 2028, 2030, 2034]) {
      const d = firstSaturdayOfAugust(season);
      expect(d.getUTCDay()).toBe(6);
      expect(d.getUTCMonth()).toBe(7);
      expect(d.getUTCDate()).toBeLessThanOrEqual(7);
      expect(weekInfo(season, 0).date).toBe(d.toISOString().slice(0, 10));
    }
    expect(weekInfo(2026, 0).date).toBe('2026-08-01');
    expect(weekInfo(2026, 1).date).toBe('2026-08-08');
  });

  it('labels weeks in both languages and names the special ones', () => {
    expect(weekInfo(2026, 12).label).toEqual({ tr: 'Hafta 12', en: 'Week 12' });
    expect(weekInfo(2026, 0).label.tr).toBe('Hazırlık');
    expect(weekInfo(2026, 0).phase).toBe('preseason');
    expect(weekInfo(2026, 48).label.tr).toBe('Yaz Arası');
    expect(weekInfo(2026, 48).label.en).toContain('Summer');
    expect(weekInfo(2026, 48).phase).toBe('summer');
    expect(weekInfo(2026, 20).phase).toBe('season');
    expect(WEEKS_PER_SEASON).toBe(52);
    expect(LAST_CLUB_WEEK).toBe(44);
  });

  it('flags transfer windows and international breaks', () => {
    const windows = Array.from({ length: 52 }, (_, w) => w).filter((w) => weekInfo(2026, w).transferWindow);
    expect(windows).toEqual([0, 1, 2, 3, 21, 22, 23, 24, 25, 45, 46, 47, 48, 49, 50, 51]);
    const breaks = Array.from({ length: 52 }, (_, w) => w).filter((w) => weekInfo(2026, w).internationalBreak);
    expect(breaks).toEqual([...INTL_BREAK_WEEKS]);
  });

  it('runs a tournament in the right summers only', () => {
    expect(tournamentOf(2029)).toBe('WC'); // 2030
    expect(tournamentOf(2033)).toBe('WC'); // 2034
    expect(tournamentOf(2027)).toBe('CONT'); // 2028
    expect(tournamentOf(2031)).toBe('CONT'); // 2032
    expect(tournamentOf(2026)).toBeNull();
    expect(weekInfo(2029, 48).tournament).toBe(true);
    expect(weekInfo(2029, 20).tournament).toBe(false);
    expect(weekInfo(2026, 48).tournament).toBe(false);
  });
});

describe('round robin', () => {
  for (const n of [4, 6, 9, 16, 18, 20]) {
    it(`double round robin for ${n} teams: every pair twice, once each way, nobody twice a round`, () => {
      const teams = Array.from({ length: n }, (_, i) => `T${i}`);
      const rounds = doubleRoundRobin(teams);
      const perRound = n % 2 ? (n - 1) / 2 : n / 2;
      expect(rounds).toHaveLength(2 * (n % 2 ? n : n - 1));
      const seen = new Map<string, number>();
      for (const round of rounds) {
        expect(round).toHaveLength(perRound);
        const used = new Set<string>();
        for (const [h, a] of round) {
          expect(used.has(h) || used.has(a)).toBe(false);
          used.add(h); used.add(a);
          seen.set(`${h}>${a}`, (seen.get(`${h}>${a}`) ?? 0) + 1);
        }
      }
      for (const a of teams) for (const b of teams) if (a !== b) expect(seen.get(`${a}>${b}`)).toBe(1);
    });
  }

  it('keeps home/away balanced (no long streaks, ±2 overall)', () => {
    const teams = Array.from({ length: 18 }, (_, i) => `T${i}`);
    const rounds = singleRoundRobin(teams);
    for (const t of teams) {
      let home = 0;
      let streak = 0;
      let maxStreak = 0;
      let prev: boolean | null = null;
      for (const round of rounds) {
        const m = round.find(([h, a]) => h === t || a === t)!;
        const isHome = m[0] === t;
        if (isHome) home++;
        streak = prev === isHome ? streak + 1 : 1;
        prev = isHome;
        maxStreak = Math.max(maxStreak, streak);
      }
      expect(Math.abs(home - rounds.length / 2)).toBeLessThanOrEqual(2);
      expect(maxStreak).toBeLessThanOrEqual(3);
    }
  });
});

describe('league slots', () => {
  it('places matchdays between weeks 1 and 44, avoiding international breaks', () => {
    for (const [md, country] of [[34, 'ENG'], [34, 'GER'], [38, 'ESP'], [30, 'TUR'], [22, 'POR']] as const) {
      const slots = leagueSlots(md, country);
      expect(slots).toHaveLength(md);
      for (const s of slots) {
        expect(s.week).toBeGreaterThanOrEqual(1);
        expect(s.week).toBeLessThanOrEqual(LAST_CLUB_WEEK);
        expect(INTL_BREAK_WEEKS.includes(s.week)).toBe(false);
      }
      const keys = slots.map((s) => `${s.week}-${s.slot}`);
      expect(new Set(keys).size).toBe(md);
      expect(slots.map((s) => s.week)).toEqual([...slots.map((s) => s.week)].sort((a, b) => a - b));
    }
  });

  it('uses midweeks only when the weekends run out', () => {
    expect(leagueSlots(38, 'ESP').every((s) => s.slot === 'weekend')).toBe(true);
    const long = leagueSlots(46, 'ESP');
    expect(long).toHaveLength(46);
    expect(long.filter((s) => s.slot === 'midweek').length).toBeGreaterThan(0);
  });
});
