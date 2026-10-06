import { describe, expect, it } from 'vitest';
import type { Formation, KitStyle, TacticalStyle } from '../../../core/types';
import { CLUBS_ENG } from '../clubs_eng';
import { CLUBS_ESP } from '../clubs_esp';
import { CLUBS_GER } from '../clubs_ger';
import { CLUBS_ITA } from '../clubs_ita';
import type { ClubSeed, CountryClubs } from '../types';

const COUNTRIES: { data: CountryClubs; tier1: number; giantFloor: number }[] = [
  { data: CLUBS_ENG, tier1: 20, giantFloor: 88 },
  { data: CLUBS_ESP, tier1: 20, giantFloor: 86 },
  { data: CLUBS_ITA, tier1: 20, giantFloor: 86 },
  { data: CLUBS_GER, tier1: 18, giantFloor: 86 },
];

const KIT_STYLES: KitStyle[] = ['plain', 'stripes', 'hoops', 'halves', 'sash'];
const STYLES: TacticalStyle[] = ['possession', 'counter', 'direct', 'pressing', 'balanced', 'defensive'];
const FORMATIONS: Formation[] = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '5-3-2', '4-1-4-1'];
const HEX = /^#[0-9a-f]{6}$/i;

/** Real clubs, stadiums and famous venues that must never appear (everything is fictional). */
const REAL_TOKENS = [
  'arsenal', 'chelsea', 'tottenham', 'juventus', 'bayern', 'borussia', 'eintracht', 'werder', 'schalke',
  'real madrid', 'atlético de madrid', 'real betis', 'real sociedad', 'athletic club', 'old trafford',
  'anfield', 'camp nou', 'san siro', 'bernabéu', 'wembley', 'stamford', 'emirates', 'etihad', 'mestalla',
  'riazor', 'balaídos', 'allianz', 'westfalenstadion', 'olimpico', 'villa park', 'goodison', 'maradona',
];

const allClubs = (c: CountryClubs): ClubSeed[] => [...c.tier1, ...c.tier2];

describe.each(COUNTRIES)('clubs data: $data.country', ({ data, tier1, giantFloor }) => {
  const clubs = allClubs(data);

  it('has the right number of clubs per tier', () => {
    expect(data.tier1).toHaveLength(tier1);
    expect(data.tier2).toHaveLength(16);
  });

  it('uses unique 3-letter A–Z short codes across both tiers', () => {
    const shorts = clubs.map((c) => c.short);
    for (const s of shorts) expect(s).toMatch(/^[A-Z]{3}$/);
    expect(new Set(shorts).size).toBe(shorts.length);
  });

  it('has unique names, stadiums and non-empty text fields', () => {
    expect(new Set(clubs.map((c) => c.name)).size).toBe(clubs.length);
    expect(new Set(clubs.map((c) => c.stadium)).size).toBe(clubs.length);
    for (const c of clubs) {
      for (const text of [c.name, c.nickname, c.city, c.stadium]) expect(text.trim().length).toBeGreaterThan(2);
    }
  });

  it('never uses real club or stadium names', () => {
    for (const c of clubs) {
      const haystack = `${c.name} ${c.nickname} ${c.stadium}`.toLowerCase();
      for (const token of REAL_TOKENS) expect(haystack).not.toContain(token);
    }
  });

  it('has sane founding years and capacities', () => {
    for (const c of clubs) {
      expect(c.founded).toBeGreaterThanOrEqual(1850);
      expect(c.founded).toBeLessThanOrEqual(1960);
      expect(Number.isInteger(c.capacity)).toBe(true);
    }
    for (const c of data.tier1) {
      expect(c.capacity).toBeGreaterThanOrEqual(20000);
      expect(c.capacity).toBeLessThanOrEqual(90000);
    }
    for (const c of data.tier2) {
      expect(c.capacity).toBeGreaterThanOrEqual(10000);
      expect(c.capacity).toBeLessThanOrEqual(30000);
    }
  });

  it('spreads reputation: 3–5 giants, a mid pack, strugglers, and a weaker tier two', () => {
    const giants = data.tier1.filter((c) => c.rep >= giantFloor);
    expect(giants.length).toBeGreaterThanOrEqual(3);
    expect(giants.length).toBeLessThanOrEqual(5);
    for (const c of giants) expect(c.rep).toBeLessThanOrEqual(95);
    const mid = data.tier1.filter((c) => c.rep >= 65 && c.rep < giantFloor);
    expect(mid.length).toBeGreaterThanOrEqual(6);
    const strugglers = data.tier1.filter((c) => c.rep >= 55 && c.rep < 65);
    expect(strugglers.length).toBeGreaterThanOrEqual(3);
    for (const c of data.tier1) expect(c.rep).toBeGreaterThanOrEqual(55);
    for (const c of data.tier2) {
      expect(c.rep).toBeGreaterThanOrEqual(30);
      expect(c.rep).toBeLessThanOrEqual(55);
    }
    const best2 = Math.max(...data.tier2.map((c) => c.rep));
    const worst1 = Math.min(...data.tier1.map((c) => c.rep));
    expect(best2).toBeLessThanOrEqual(worst1 + 1);
  });

  it('keeps stadium size correlated with reputation', () => {
    const biggest = [...data.tier1].sort((a, b) => b.capacity - a.capacity)[0]!;
    expect(biggest.rep).toBeGreaterThanOrEqual(giantFloor);
    const giantMin = Math.min(...data.tier1.filter((c) => c.rep >= giantFloor).map((c) => c.capacity));
    expect(giantMin).toBeGreaterThanOrEqual(50000);
  });

  it('has valid, readable kits with variety', () => {
    for (const c of clubs) {
      for (const k of [c.kit, c.away]) {
        expect(k.primary).toMatch(HEX);
        expect(k.secondary).toMatch(HEX);
        expect(KIT_STYLES).toContain(k.style);
      }
      expect(c.kit.primary).not.toBe(c.away.primary);
    }
    const styles = new Set(clubs.map((c) => c.kit.style));
    expect(styles.size).toBeGreaterThanOrEqual(4);
    // No two clubs in the same tier share an identical home kit.
    for (const tier of [data.tier1, data.tier2]) {
      const keys = tier.map((c) => `${c.kit.primary}|${c.kit.secondary}|${c.kit.style}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('uses valid tactical styles and formations with variety', () => {
    for (const c of clubs) {
      expect(STYLES).toContain(c.style);
      expect(FORMATIONS).toContain(c.formation);
    }
    expect(new Set(clubs.map((c) => c.style)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(clubs.map((c) => c.formation)).size).toBeGreaterThanOrEqual(4);
  });

  it('has consistent derby lists: valid codes, mutual, and every same-city pair', () => {
    const byShort = new Map(clubs.map((c) => [c.short, c]));
    for (const c of clubs) {
      expect(new Set(c.derby).size).toBe(c.derby.length);
      for (const code of c.derby) {
        const rival = byShort.get(code);
        expect(rival, `${c.short} lists unknown derby ${code}`).toBeDefined();
        expect(code).not.toBe(c.short);
        expect(rival!.derby, `${code} should list ${c.short}`).toContain(c.short);
      }
      for (const other of clubs) {
        if (other !== c && other.city === c.city) expect(c.derby).toContain(other.short);
      }
    }
    // The giants always have at least one rival to hate.
    for (const c of data.tier1.filter((x) => x.rep >= giantFloor)) expect(c.derby.length).toBeGreaterThan(0);
  });
});

describe('clubs data: authenticity', () => {
  it('keeps national diacritics intact', () => {
    const cities = (c: CountryClubs) => new Set(allClubs(c).map((x) => x.city));
    expect(cities(CLUBS_ESP)).toContain('Málaga');
    expect(cities(CLUBS_ESP)).toContain('A Coruña');
    expect(cities(CLUBS_ESP)).toContain('San Sebastián');
    expect(cities(CLUBS_GER)).toContain('München');
    expect(cities(CLUBS_GER)).toContain('Köln');
    expect(cities(CLUBS_GER)).toContain('Düsseldorf');
    expect(cities(CLUBS_ITA)).toContain('Milano');
    expect(cities(CLUBS_ENG)).toContain('Manchester');
  });

  it('follows each country naming convention', () => {
    expect(CLUBS_ESP.tier1.some((c) => c.name.startsWith('Real Club'))).toBe(true);
    expect(CLUBS_ITA.tier1.some((c) => c.name.startsWith('Associazione Calcio'))).toBe(true);
    expect(CLUBS_GER.tier1.some((c) => /^(SC|SV|FC|SG|TuS|SpVgg) /.test(c.name))).toBe(true);
    expect(CLUBS_ENG.tier1.some((c) => /(Athletic|Rovers|Wanderers|Albion|FC)$/.test(c.name))).toBe(true);
  });

  it('has the league giants in the biggest cities', () => {
    const top = (c: CountryClubs) => [...c.tier1].sort((a, b) => b.rep - a.rep)[0]!;
    expect(top(CLUBS_ENG).city).toBe('London');
    expect(top(CLUBS_ESP).city).toBe('Madrid');
    expect(top(CLUBS_ITA).city).toBe('Milano');
    expect(top(CLUBS_GER).city).toBe('München');
  });
});
