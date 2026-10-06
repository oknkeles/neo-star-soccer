import { describe, expect, it } from 'vitest';
import { NATIONS_DATA } from '../nations';
import { NAME_POOLS, NATION_POOL } from '../names';

const LEAGUE_COUNTRIES = ['ENG', 'ESP', 'ITA', 'GER', 'FRA', 'POR', 'NED', 'TUR'];
const KIT_STYLES = ['plain', 'stripes', 'hoops', 'halves', 'sash'];
const COLOUR = /^#[0-9a-f]{6}$/i;

describe('NATIONS_DATA', () => {
  it('has around 40+ nations with unique 3-letter codes', () => {
    expect(NATIONS_DATA.length).toBeGreaterThanOrEqual(40);
    const codes = NATIONS_DATA.map((x) => x.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{3}$/);
  });

  it('has names, flag, continent, reputation and kit for every nation', () => {
    for (const x of NATIONS_DATA) {
      expect(x.name.tr.length, x.code).toBeGreaterThan(1);
      expect(x.name.en.length, x.code).toBeGreaterThan(1);
      expect(x.flag.length, x.code).toBeGreaterThan(1);
      expect(['EU', 'SA', 'AF', 'AS', 'NA', 'OC']).toContain(x.continent);
      expect(x.reputation).toBeGreaterThanOrEqual(1);
      expect(x.reputation).toBeLessThanOrEqual(100);
      expect(x.kit.primary).toMatch(COLOUR);
      expect(x.kit.secondary).toMatch(COLOUR);
      expect(KIT_STYLES).toContain(x.kit.style);
    }
  });

  it('lists 5-8 distinct hometown cities per nation', () => {
    for (const x of NATIONS_DATA) {
      expect(x.cities.length, x.code).toBeGreaterThanOrEqual(5);
      expect(x.cities.length, x.code).toBeLessThanOrEqual(8);
      expect(new Set(x.cities).size, x.code).toBe(x.cities.length);
    }
  });

  it('links exactly the eight league nations to their own league', () => {
    const linked = NATIONS_DATA.filter((x) => x.league);
    expect(linked.map((x) => x.code).sort()).toEqual([...LEAGUE_COUNTRIES].sort());
    for (const x of linked) expect(x.league).toBe(x.code);
  });

  it('keeps a sensible reputation ordering (top footballing nations above minnows)', () => {
    const rep = (c: string) => NATIONS_DATA.find((x) => x.code === c)!.reputation;
    expect(rep('ARG')).toBeGreaterThan(rep('TUR'));
    expect(rep('FRA')).toBeGreaterThan(rep('JPN'));
    expect(rep('BRA')).toBeGreaterThan(rep('GHA'));
    expect(rep('TUR')).toBeGreaterThan(rep('IRL'));
    const top = [...NATIONS_DATA].sort((a, b) => b.reputation - a.reputation).slice(0, 8).map((x) => x.code);
    expect(top).toEqual(expect.arrayContaining(['ARG', 'FRA', 'BRA', 'ESP', 'ENG']));
  });

  it('keeps Turkish text correctly spelled', () => {
    const tr = (c: string) => NATIONS_DATA.find((x) => x.code === c)!;
    expect(tr('ENG').name.tr).toBe('İngiltere');
    expect(tr('TUR').cities).toContain('İstanbul');
    expect(tr('TUR').cities).toContain('İzmir');
  });
});

describe('NAME_POOLS', () => {
  it('has big enough first/last name lists in every group', () => {
    const keys = Object.keys(NAME_POOLS);
    expect(keys.length).toBeGreaterThanOrEqual(16);
    for (const k of keys) {
      expect(NAME_POOLS[k].first.length, `${k} first`).toBeGreaterThanOrEqual(60);
      expect(NAME_POOLS[k].last.length, `${k} last`).toBeGreaterThanOrEqual(80);
    }
  });

  it('contains clean, unique, non-empty names', () => {
    for (const [k, p] of Object.entries(NAME_POOLS)) {
      for (const list of [p.first, p.last]) {
        expect(new Set(list).size, k).toBe(list.length);
        for (const name of list) {
          expect(name, k).toBe(name.trim());
          expect(name.length, `${k}:${name}`).toBeGreaterThan(1);
          expect(name, `${k}:${name}`).not.toMatch(/[0-9,;]/);
        }
      }
    }
  });

  it('maps every nation to an existing pool, and every pool is used', () => {
    for (const x of NATIONS_DATA) {
      const group = NATION_POOL[x.code];
      expect(group, x.code).toBeTruthy();
      expect(NAME_POOLS[group], `${x.code} → ${group}`).toBeDefined();
    }
    const used = new Set(Object.values(NATION_POOL));
    for (const k of Object.keys(NAME_POOLS)) expect(used.has(k), `unused pool ${k}`).toBe(true);
    for (const code of Object.keys(NATION_POOL)) {
      expect(NATIONS_DATA.some((x) => x.code === code), `stray nation ${code}`).toBe(true);
    }
  });

  it('keeps authentic diacritics', () => {
    const tr = NAME_POOLS.turkish;
    expect(tr.first).toContain('İbrahim');
    expect(tr.last).toContain('Şahin');
    expect(NAME_POOLS.german.last).toContain('Müller');
    expect(NAME_POOLS.spanish.last).toContain('García');
    expect(NAME_POOLS.scandinavian.last).toContain('Sørensen');
    expect(NAME_POOLS.slavic_west.last).toContain('Wiśniewski');
  });

  it('offers nickname-style first names for Brazil', () => {
    expect(NAME_POOLS.brazilian.first).toEqual(expect.arrayContaining(['Dudu', 'Juninho']));
  });
});
