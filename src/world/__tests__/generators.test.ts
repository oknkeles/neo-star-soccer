import { describe, expect, it } from 'vitest';
import { Rng } from '../../core/rng';
import { ATTR_KEYS, overallFor } from '../../core/ratings';
import type { Position } from '../../core/types';
import {
  NATIONS, generateFootballer, generateManager, getNation, randomAppearance, randomName,
} from '../api';

const POSITIONS: Position[] = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];

describe('randomName', () => {
  it('returns non-empty, trimmed names for known and unknown nations', () => {
    const rng = new Rng(1);
    for (const code of [...NATIONS.map((n) => n.code), 'TUR', 'ZZZ', 'XYZ']) {
      for (let i = 0; i < 20; i++) {
        const n = randomName(rng, code);
        expect(n.first.length).toBeGreaterThan(1);
        expect(n.last.length).toBeGreaterThan(1);
        expect(n.first).toBe(n.first.trim());
        expect(n.last).toBe(n.last.trim());
      }
    }
  });

  it('is deterministic and varied', () => {
    const a = new Rng(5), b = new Rng(5);
    const seq = (r: Rng) => Array.from({ length: 30 }, () => randomName(r, 'TUR'));
    expect(seq(a)).toEqual(seq(b));
    expect(new Set(seq(new Rng(9)).map((n) => `${n.first} ${n.last}`)).size).toBeGreaterThan(20);
  });
});

describe('generateFootballer', () => {
  it('hits the target overall within 1 for every position and quality', () => {
    const rng = new Rng(11);
    for (const position of POSITIONS) {
      for (const quality of [35, 48, 55, 62, 70, 78, 85, 90]) {
        for (let i = 0; i < 12; i++) {
          const age = rng.int(17, 35);
          const p = generateFootballer(rng, { id: `t${i}`, nation: 'TUR', position, age, season: 2026, quality, clubId: null });
          expect(Math.abs(overallFor(p.attrs, position) - quality), `${position} q${quality}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('keeps every attribute in range and builds position-coherent profiles', () => {
    const rng = new Rng(21);
    const n = 150;
    const sum = (pos: Position, pick: (a: ReturnType<typeof generateFootballer>['attrs']) => number) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += pick(generateFootballer(rng, { id: 'x', nation: 'ENG', position: pos, age: 26, season: 2026, quality: 70, clubId: null }).attrs);
      return s / n;
    };
    for (const pos of POSITIONS) {
      const p = generateFootballer(rng, { id: 'x', nation: 'ENG', position: pos, age: 26, season: 2026, quality: 66, clubId: null });
      for (const k of ATTR_KEYS) {
        expect(p.attrs[k]).toBeGreaterThanOrEqual(1);
        expect(p.attrs[k]).toBeLessThanOrEqual(99);
        expect(Number.isInteger(p.attrs[k])).toBe(true);
      }
    }
    expect(sum('GK', (a) => a.goalkeeping)).toBeGreaterThan(70);
    expect(sum('ST', (a) => a.goalkeeping)).toBeLessThan(20);
    expect(sum('ST', (a) => a.shooting)).toBeGreaterThan(sum('ST', (a) => a.tackling) + 25);
    expect(sum('CB', (a) => a.tackling)).toBeGreaterThan(sum('CB', (a) => a.shooting) + 25);
    expect(sum('W', (a) => a.pace)).toBeGreaterThan(sum('CB', (a) => a.pace));
    expect(sum('AM', (a) => a.vision)).toBeGreaterThan(sum('ST', (a) => a.vision));
  });

  it('derives potential from age: youngsters above, veterans at their level', () => {
    const rng = new Rng(31);
    let youthGap = 0, vetGap = 0, wonder = 0;
    for (let i = 0; i < 400; i++) {
      const y = generateFootballer(rng, { id: 'y', nation: 'ESP', position: 'CM', age: 17, season: 2026, quality: 52, clubId: null });
      const v = generateFootballer(rng, { id: 'v', nation: 'ESP', position: 'CM', age: 32, season: 2026, quality: 70, clubId: null });
      const ovr = overallFor(y.attrs, 'CM');
      expect(y.potential).toBeGreaterThanOrEqual(ovr);
      expect(y.potential).toBeLessThanOrEqual(99);
      youthGap += y.potential - ovr;
      vetGap += v.potential - overallFor(v.attrs, 'CM');
      if (y.potential >= 88) wonder++;
    }
    expect(youthGap / 400).toBeGreaterThan(8);
    expect(vetGap / 400).toBeLessThan(0.6);
    expect(wonder).toBeGreaterThan(2);
    expect(wonder).toBeLessThan(80);
  });

  it('respects an explicit potential and the club / age options', () => {
    const rng = new Rng(3);
    const p = generateFootballer(rng, { id: 'P1', nation: 'BRA', position: 'ST', age: 19, season: 2027, quality: 60, potential: 91, clubId: 'TUR-2-04' });
    expect(p.id).toBe('P1');
    expect(p.potential).toBe(91);
    expect(p.birthYear).toBe(2027 - 19);
    expect(p.clubId).toBe('TUR-2-04');
    expect(p.contract?.clubId).toBe('TUR-2-04');
    expect(p.contract!.endSeason).toBeGreaterThanOrEqual(2027);
    expect(p.value).toBeGreaterThan(0);
    expect(generateFootballer(rng, { id: 'F', nation: 'TUR', position: 'W', age: 24, season: 2026, quality: 60, clubId: null }).contract).toBeNull();
  });

  it('is deterministic and JSON-serializable', () => {
    const mk = () => generateFootballer(new Rng(77), { id: 'D', nation: 'GER', position: 'DM', age: 28, season: 2026, quality: 74, clubId: null });
    const a = mk();
    expect(a).toEqual(mk());
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('produces individual specialists: free-kick wizards and speedsters', () => {
    const rng = new Rng(41);
    let wizards = 0, speedsters = 0;
    for (let i = 0; i < 600; i++) {
      const p = generateFootballer(rng, { id: 's', nation: 'ITA', position: i % 2 ? 'AM' : 'W', age: 25, season: 2026, quality: 66, clubId: null });
      if (p.traits.includes('set_piece_specialist')) { wizards++; expect(p.attrs.curl).toBeGreaterThanOrEqual(72); }
      if (p.traits.includes('speedster')) { speedsters++; expect(p.attrs.pace).toBeGreaterThanOrEqual(76); }
    }
    expect(wizards).toBeGreaterThan(15);
    expect(wizards).toBeLessThan(200);
    expect(speedsters).toBeGreaterThan(20);
  });

  it('gives Brazilians the occasional single-name nickname', () => {
    const rng = new Rng(8);
    const nick = Array.from({ length: 300 }, () => generateFootballer(rng, { id: 'b', nation: 'BRA', position: 'W', age: 24, season: 2026, quality: 65, clubId: null })).filter((p) => p.nickname);
    expect(nick.length).toBeGreaterThan(10);
    expect(nick.length).toBeLessThan(90);
  });
});

describe('randomAppearance', () => {
  it('stays inside the Appearance contract for every nation', () => {
    const rng = new Rng(5);
    for (const code of NATIONS.map((n) => n.code).concat('ZZZ')) {
      for (let i = 0; i < 25; i++) {
        const pos = POSITIONS[i % 8];
        const a = randomAppearance(rng, code, pos, 16 + (i % 20));
        expect(a.skin).toBeGreaterThanOrEqual(0); expect(a.skin).toBeLessThanOrEqual(5);
        expect(a.hairStyle).toBeGreaterThanOrEqual(0); expect(a.hairStyle).toBeLessThanOrEqual(7);
        expect(a.beard).toBeGreaterThanOrEqual(0); expect(a.beard).toBeLessThanOrEqual(3);
        expect(a.hairColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(a.boots).toMatch(/^#[0-9a-f]{6}$/i);
        expect(a.height).toBeGreaterThanOrEqual(160); expect(a.height).toBeLessThanOrEqual(206);
      }
    }
  });

  it('reflects nation and position', () => {
    const rng = new Rng(6);
    const mean = (f: () => number) => Array.from({ length: 300 }, f).reduce((a, b) => a + b, 0) / 300;
    expect(mean(() => randomAppearance(rng, 'NGA').skin)).toBeGreaterThan(mean(() => randomAppearance(rng, 'POL').skin) + 2);
    expect(mean(() => randomAppearance(rng, 'GER', 'GK', 27).height)).toBeGreaterThan(mean(() => randomAppearance(rng, 'GER', 'W', 27).height) + 8);
  });
});

describe('generateManager', () => {
  it('builds a valid manager with the requested style most of the time', () => {
    const rng = new Rng(2);
    let matched = 0;
    for (let i = 0; i < 100; i++) {
      const m = generateManager(rng, `M${i}`, 'TUR', 2026, 70, { style: 'pressing', clubId: 'TUR-1-00' });
      expect(m.id).toBe(`M${i}`);
      expect(m.firstName.length).toBeGreaterThan(0);
      expect(2026 - m.birthYear).toBeGreaterThanOrEqual(34);
      expect(2026 - m.birthYear).toBeLessThanOrEqual(73);
      expect(m.trustsYouth).toBeGreaterThanOrEqual(0); expect(m.trustsYouth).toBeLessThanOrEqual(100);
      expect(m.reputation).toBe(70);
      expect(m.clubId).toBe('TUR-1-00');
      if (m.style === 'pressing') matched++;
    }
    expect(matched).toBeGreaterThan(75);
    expect(generateManager(rng, 'X', 'TUR', 2026, 50).clubId).toBeNull();
  });
});

describe('nations', () => {
  it('getNation never throws', () => {
    expect(getNation('ZZZ').code).toBe('ZZZ');
    for (const n of NATIONS) expect(getNation(n.code)).toBe(n);
  });
});
