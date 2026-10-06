import { afterEach, describe, expect, it } from 'vitest';
import { Rng } from '../../core/rng';
import { getLang, missingKeys, setLang } from '../../core/i18n';
import { overallFor } from '../../core/ratings';
import { makeTestState } from '../../core/testing';
import type { Position } from '../../core/types';
import {
  COUNTRIES, generateYouthIntake, nationalTeamOf, pickStartingClubs, positionName, styleName, temperamentName,
} from '../api';
import { sharedWorld } from './helpers';

const POSITIONS: Position[] = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];

describe('positionName', () => {
  const lang = getLang();
  afterEach(() => setLang(lang));

  it('localizes long and short names in Turkish and English', () => {
    setLang('tr');
    expect(positionName('ST')).toBe('Forvet');
    expect(positionName('ST', true)).toBe('FV');
    expect(positionName('GK')).toBe('Kaleci');
    setLang('en');
    expect(positionName('ST')).toBe('Striker');
    expect(positionName('ST', true)).toBe('ST');
    expect(positionName('W')).toBe('Winger');
  });

  it('covers all eight positions with distinct short codes in both languages', () => {
    for (const l of ['tr', 'en'] as const) {
      setLang(l);
      const shorts = POSITIONS.map((p) => positionName(p, true));
      expect(new Set(shorts).size).toBe(8);
      for (const p of POSITIONS) {
        expect(positionName(p)).not.toContain('world.');
        expect(positionName(p, true)).not.toContain('world.');
      }
    }
  });

  it('has no missing translations in the world namespace and localizes styles', () => {
    const m = missingKeys();
    expect(m.tr.filter((k) => k.startsWith('world.'))).toEqual([]);
    expect(m.en.filter((k) => k.startsWith('world.'))).toEqual([]);
    setLang('tr');
    expect(styleName('counter')).toBe('Kontra Atak');
    expect(temperamentName('fiery')).toBe('Ateşli');
    setLang('en');
    expect(styleName('counter')).toBe('Counter-Attack');
  });
});

describe('generateYouthIntake', () => {
  const w = sharedWorld();
  const club = w.clubs['ENG-1-05'];

  it('returns 2–4 academy players aged 16–18 with unique ids, shirts and prospect contracts', () => {
    const rng = new Rng(4);
    let n = 0;
    const makeId = () => `YP-${++n}`;
    for (let round = 0; round < 40; round++) {
      const kids = generateYouthIntake(rng, w, club, 2026, makeId);
      expect(kids.length).toBeGreaterThanOrEqual(2);
      expect(kids.length).toBeLessThanOrEqual(4);
      const taken = new Set(club.squad.map((id) => w.players[id].shirtNumber));
      const shirts = new Set<number>();
      for (const k of kids) {
        const age = 2026 - k.birthYear;
        expect(age).toBeGreaterThanOrEqual(16); expect(age).toBeLessThanOrEqual(18);
        expect(k.id).toMatch(/^YP-/);
        expect(k.clubId).toBe(club.id);
        expect(k.contract?.role).toBe('prospect');
        expect(k.contract?.clubId).toBe(club.id);
        expect(k.contract!.endSeason).toBeGreaterThanOrEqual(2026);
        expect(taken.has(k.shirtNumber)).toBe(false);
        expect(shirts.has(k.shirtNumber)).toBe(false);
        shirts.add(k.shirtNumber);
        expect(k.potential).toBeGreaterThanOrEqual(overallFor(k.attrs, k.position));
      }
    }
    expect(w.players['YP-1']).toBeUndefined(); // the function does not mutate the world
  });

  it('scales with academy quality and occasionally finds gems', () => {
    const rng = new Rng(14);
    const gen = (youth: number) => {
      const c = { ...club, youth };
      const kids = Array.from({ length: 150 }, () => generateYouthIntake(rng, w, c, 2026, () => `K${rng.seed()}`)).flat();
      return {
        ovr: kids.reduce((a, k) => a + overallFor(k.attrs, k.position), 0) / kids.length,
        gems: kids.filter((k) => k.potential >= 86).length,
      };
    };
    const strong = gen(90), weak = gen(20);
    expect(strong.ovr).toBeGreaterThan(weak.ovr + 4);
    expect(strong.gems).toBeGreaterThan(weak.gems);
    expect(strong.gems).toBeGreaterThan(3);
  });
});

describe('pickStartingClubs', () => {
  const w = sharedWorld();
  const modest = (id: string) => {
    const c = w.clubs[id];
    if (c.tier === 2) return true;
    const rank = Object.values(w.clubs).filter((x) => x.country === c.country && x.tier === 1).sort((a, b) => a.reputation - b.reputation).findIndex((x) => x.id === id);
    return rank < Math.ceil(0.4 * (w.leagues.find((l) => l.id === `${c.country}-1`)!.teams));
  };

  it('picks three distinct modest clubs from different countries, one in the user\'s league country', () => {
    for (const nation of ['TUR', 'ENG', 'ESP', 'GER']) {
      for (let seed = 0; seed < 25; seed++) {
        const ids = pickStartingClubs(w, new Rng(seed), nation);
        expect(ids).toHaveLength(3);
        expect(new Set(ids).size).toBe(3);
        for (const id of ids) expect(modest(id), `${id} is not modest`).toBe(true);
        expect(ids.some((id) => w.clubs[id].country === nation)).toBe(true);
        expect(new Set(ids.map((id) => w.clubs[id].country)).size).toBe(3);
      }
    }
  });

  it('works for nations without a league and is mostly tier 2', () => {
    let t2 = 0, total = 0;
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const ids = pickStartingClubs(w, new Rng(seed), 'BRA');
      expect(ids).toHaveLength(3);
      expect(new Set(ids.map((id) => w.clubs[id].country)).size).toBe(3);
      for (const id of ids) { total++; seen.add(w.clubs[id].country); if (w.clubs[id].tier === 2) t2++; }
    }
    expect(t2 / total).toBeGreaterThan(0.5);
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });

  it('is deterministic and robust on tiny worlds', () => {
    expect(pickStartingClubs(w, new Rng(3), 'TUR')).toEqual(pickStartingClubs(w, new Rng(3), 'TUR'));
    const small = makeTestState({ clubs: 4 }).world;
    const ids = pickStartingClubs(small, new Rng(1), 'TUR');
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(pickStartingClubs({ ...small, clubs: {} }, new Rng(1), 'TUR')).toEqual([]);
  });

  it('exposes national teams through nationalTeamOf', () => {
    for (const c of COUNTRIES) expect(nationalTeamOf(w, c)?.nation).toBe(c);
  });
});
