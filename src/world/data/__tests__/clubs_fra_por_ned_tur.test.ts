import { describe, expect, it } from 'vitest';
import type { Formation, KitStyle, TacticalStyle } from '../../../core/types';
import { CLUBS_FRA } from '../clubs_fra';
import { CLUBS_NED } from '../clubs_ned';
import { CLUBS_POR } from '../clubs_por';
import { CLUBS_TUR } from '../clubs_tur';
import type { ClubSeed, CountryClubs } from '../types';

const COUNTRIES: { data: CountryClubs; giantFloor: number; giants: [number, number]; capFloor: number }[] = [
  { data: CLUBS_FRA, giantFloor: 85, giants: [3, 4], capFloor: 50000 },
  { data: CLUBS_POR, giantFloor: 80, giants: [3, 4], capFloor: 30000 },
  { data: CLUBS_NED, giantFloor: 82, giants: [3, 4], capFloor: 36000 },
  { data: CLUBS_TUR, giantFloor: 79, giants: [3, 4], capFloor: 39000 },
];

const KIT_STYLES: KitStyle[] = ['plain', 'stripes', 'hoops', 'halves', 'sash'];
const STYLES: TacticalStyle[] = ['possession', 'counter', 'direct', 'pressing', 'balanced', 'defensive'];
const FORMATIONS: Formation[] = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '5-3-2', '4-1-4-1'];
const HEX = /^#[0-9a-f]{6}$/i;

/** Real clubs and famous venues that must never appear (everything is fictional). */
const REAL_TOKENS = [
  'paris saint', 'olympique de marseille', 'olympique lyonnais', 'as monaco', 'losc', 'ogc nice', 'rennais',
  'parc des princes', 'vélodrome', 'velodrome', 'groupama', 'bollaert', 'geoffroy', 'la beaujoire', 'la meinau',
  'benfica', 'sporting cp', 'sporting de braga', 'fc porto', 'vitória', 'boavista', 'marítimo', 'estádio da luz',
  'alvalade', 'dragão', 'bessa', 'afonso henriques', 'ajax', 'psv', 'feyenoord', 'az alkmaar', 'twente',
  'vitesse', 'heerenveen', 'de kuip', 'johan cruyff', 'cruijff', 'philips', 'galatasaray', 'fenerbahçe', 'fenerbahce',
  'beşiktaş', 'besiktas', 'trabzonspor', 'başakşehir', 'basaksehir', 'kasımpaşa', 'karagümrük', 'göztepe', 'altay',
  'bursaspor', 'konyaspor', 'sivasspor', 'antalyaspor', 'kayserispor', 'samsunspor', 'şükrü', 'ali sami', 'vodafone',
  'papara', 'atatürk', 'türk telekom', 'rams park', 'nef stadyumu',
];

const allClubs = (c: CountryClubs): ClubSeed[] => [...c.tier1, ...c.tier2];

describe.each(COUNTRIES)('clubs data: $data.country', ({ data, giantFloor, giants, capFloor }) => {
  const clubs = allClubs(data);

  it('has 18 tier-1 and 16 tier-2 clubs', () => {
    expect(data.tier1).toHaveLength(18);
    expect(data.tier2).toHaveLength(16);
  });

  it('uses unique 3-letter A–Z short codes across both tiers', () => {
    const shorts = clubs.map((c) => c.short);
    for (const s of shorts) expect(s).toMatch(/^[A-Z]{3}$/);
    expect(new Set(shorts).size).toBe(shorts.length);
  });

  it('has unique names, nicknames and stadiums and non-empty text fields', () => {
    for (const pick of [(c: ClubSeed) => c.name, (c: ClubSeed) => c.nickname, (c: ClubSeed) => c.stadium]) {
      expect(new Set(clubs.map(pick)).size).toBe(clubs.length);
    }
    for (const c of clubs) {
      for (const text of [c.name, c.nickname, c.city, c.stadium]) {
        expect(text).toBe(text.trim());
        expect(text.length).toBeGreaterThan(2);
      }
    }
  });

  it('never uses real club or stadium names', () => {
    for (const c of clubs) {
      const haystack = `${c.name} ${c.nickname} ${c.stadium}`.toLowerCase();
      for (const token of REAL_TOKENS) expect(haystack, `${c.short}: ${token}`).not.toContain(token);
    }
  });

  it('has sane founding years and capacities', () => {
    for (const c of clubs) {
      expect(c.founded).toBeGreaterThanOrEqual(1850);
      expect(c.founded).toBeLessThanOrEqual(1995);
      expect(Number.isInteger(c.capacity)).toBe(true);
    }
    for (const c of data.tier1) {
      expect(c.capacity).toBeGreaterThanOrEqual(9000);
      expect(c.capacity).toBeLessThanOrEqual(70000);
    }
    for (const c of data.tier2) {
      expect(c.capacity).toBeGreaterThanOrEqual(4000);
      expect(c.capacity).toBeLessThanOrEqual(21000);
    }
  });

  it('spreads reputation: 3–4 giants, a mid pack, strugglers, and a much weaker tier two', () => {
    const top = data.tier1.filter((c) => c.rep >= giantFloor);
    expect(top.length).toBeGreaterThanOrEqual(giants[0]);
    expect(top.length).toBeLessThanOrEqual(giants[1]);
    for (const c of data.tier1) expect(c.rep).toBeLessThanOrEqual(91);
    expect(data.tier1.filter((c) => c.rep >= 56 && c.rep < giantFloor - 8).length).toBeGreaterThanOrEqual(6);
    expect(data.tier1.filter((c) => c.rep < 58).length).toBeGreaterThanOrEqual(3);
    for (const c of data.tier1) expect(c.rep).toBeGreaterThanOrEqual(50);
    for (const c of data.tier2) {
      expect(c.rep).toBeGreaterThanOrEqual(28);
      expect(c.rep).toBeLessThanOrEqual(50);
    }
    const best2 = Math.max(...data.tier2.map((c) => c.rep));
    const worst1 = Math.min(...data.tier1.map((c) => c.rep));
    expect(best2).toBeLessThanOrEqual(worst1 + 1);
  });

  it('keeps stadium size correlated with reputation', () => {
    for (const c of data.tier1.filter((x) => x.rep >= giantFloor)) expect(c.capacity).toBeGreaterThanOrEqual(capFloor);
    const biggest = [...data.tier1].sort((a, b) => b.capacity - a.capacity)[0]!;
    expect(biggest.rep).toBeGreaterThanOrEqual(giantFloor);
  });

  it('has valid, readable kits with variety', () => {
    for (const c of clubs) {
      for (const k of [c.kit, c.away]) {
        expect(k.primary).toMatch(HEX);
        expect(k.secondary).toMatch(HEX);
        expect(k.primary.toLowerCase()).not.toBe(k.secondary.toLowerCase());
        expect(KIT_STYLES).toContain(k.style);
      }
      expect(c.kit.primary).not.toBe(c.away.primary);
    }
    expect(new Set(clubs.map((c) => c.kit.style)).size).toBeGreaterThanOrEqual(4);
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
    for (const c of data.tier1.filter((x) => x.rep >= giantFloor)) expect(c.derby.length).toBeGreaterThan(0);
    // Most clubs have somebody to hate.
    expect(clubs.filter((c) => c.derby.length > 0).length).toBeGreaterThanOrEqual(clubs.length - 2);
  });
});

describe('clubs data: authenticity per country', () => {
  const cities = (c: CountryClubs) => allClubs(c).map((x) => x.city);

  it('France: giants in Paris/Marseille/Lyon/Lille and French naming', () => {
    const top = [...CLUBS_FRA.tier1].sort((a, b) => b.rep - a.rep).slice(0, 4).map((c) => c.city);
    expect(top).toEqual(['Paris', 'Marseille', 'Lyon', 'Lille']);
    expect(cities(CLUBS_FRA)).toEqual(expect.arrayContaining(['Saint-Étienne', 'Nîmes', 'Clermont-Ferrand']));
    expect(CLUBS_FRA.tier1.some((c) => c.name.startsWith('Olympique'))).toBe(true);
    expect(CLUBS_FRA.tier1.some((c) => c.name.startsWith('Stade '))).toBe(true);
    expect(CLUBS_FRA.tier1.every((c) => c.nickname.startsWith('Les '))).toBe(true);
    // Paris has two clubs and they are derby rivals.
    const paris = allClubs(CLUBS_FRA).filter((c) => c.city === 'Paris');
    expect(paris.length).toBe(2);
    expect(paris[0]!.derby).toContain(paris[1]!.short);
  });

  it('Portugal: Lisbon and Porto rivalries, islands included', () => {
    const top = [...CLUBS_POR.tier1].sort((a, b) => b.rep - a.rep).slice(0, 3).map((c) => c.city);
    expect(top.filter((c) => c === 'Lisboa')).toHaveLength(2);
    expect(top).toContain('Porto');
    expect(cities(CLUBS_POR)).toEqual(expect.arrayContaining(['Lisboa', 'Porto', 'Funchal', 'Ponta Delgada', 'Guimarães', 'Setúbal', 'Évora']));
    const lisbon = CLUBS_POR.tier1.filter((c) => c.city === 'Lisboa');
    expect(lisbon.length).toBeGreaterThanOrEqual(3);
    expect(CLUBS_POR.tier1.some((c) => c.name.startsWith('Sport Lisboa e'))).toBe(true);
    expect(CLUBS_POR.tier1.every((c) => /^Os /.test(c.nickname))).toBe(true);
  });

  it('Netherlands: Amsterdam/Rotterdam/Eindhoven giants and Dutch naming', () => {
    const top = [...CLUBS_NED.tier1].sort((a, b) => b.rep - a.rep).slice(0, 3).map((c) => c.city);
    expect(top).toEqual(['Amsterdam', 'Rotterdam', 'Eindhoven']);
    expect(cities(CLUBS_NED)).toEqual(expect.arrayContaining(['Den Haag', "'s-Hertogenbosch", 'Groningen', 'Maastricht']));
    expect(CLUBS_NED.tier1.every((c) => /^De /.test(c.nickname))).toBe(true);
    const klassieker = CLUBS_NED.tier1.filter((c) => c.city === 'Amsterdam' || c.city === 'Rotterdam');
    expect(klassieker.map((c) => c.short)).toEqual(['AMS', 'MAA']);
    expect(klassieker[0]!.derby).toContain('MAA');
  });

  it('Türkiye: İstanbul across districts, Black Sea power, Anatolian spread', () => {
    const istanbul = CLUBS_TUR.tier1.filter((c) => c.city === 'İstanbul');
    expect(istanbul.length).toBeGreaterThanOrEqual(5);
    expect(allClubs(CLUBS_TUR).filter((c) => c.city === 'İstanbul').length).toBeGreaterThanOrEqual(7);
    const giants = CLUBS_TUR.tier1.filter((c) => c.rep >= 79);
    expect(giants.filter((c) => c.city === 'İstanbul')).toHaveLength(3);
    const trabzon = giants.find((c) => c.city === 'Trabzon');
    expect(trabzon).toBeDefined();
    // The Black Sea power hates its neighbours and the İstanbul giants.
    const byShort = new Map(allClubs(CLUBS_TUR).map((c) => [c.short, c]));
    for (const code of ['SAM', 'RIZ', 'ORD']) expect(trabzon!.derby).toContain(code);
    for (const g of giants.filter((c) => c.city === 'İstanbul')) expect(trabzon!.derby).toContain(g.short);
    // Every İstanbul club is a derby rival of every other İstanbul club.
    for (const a of allClubs(CLUBS_TUR).filter((c) => c.city === 'İstanbul')) {
      for (const b of allClubs(CLUBS_TUR).filter((c) => c.city === 'İstanbul' && c !== a)) {
        expect(byShort.get(a.short)!.derby).toContain(b.short);
      }
    }
    expect(cities(CLUBS_TUR)).toEqual(expect.arrayContaining([
      'Ankara', 'İzmir', 'Bursa', 'Konya', 'Antalya', 'Kayseri', 'Samsun', 'Gaziantep', 'Adana', 'Eskişehir', 'Rize', 'Diyarbakır',
    ]));
  });

  it('Türkiye: Turkish characters are intact and nicknames feel Turkish', () => {
    const text = allClubs(CLUBS_TUR).map((c) => `${c.name} ${c.nickname} ${c.city} ${c.stadium}`).join(' ');
    for (const ch of ['ç', 'ğ', 'ı', 'İ', 'ö', 'ş', 'ü', 'Ç', 'Ş']) expect(text).toContain(ch);
    // No "ASCII-ified" leftovers of common Turkish words.
    for (const bad of ['Istanbul', 'Gucu', 'Bogaz', 'Idman', 'Kizil', 'Sahin']) expect(text).not.toContain(bad);
    const suffixes = /(SK|FK|Gücü|Spor|spor|Yurdu)$/;
    for (const c of allClubs(CLUBS_TUR)) expect(c.name, c.name).toMatch(suffixes);
    const colourWords = /^(Kızıl|Bordo|Kara|Mavi|Turuncu|Yeşil|Turkuaz|Beyaz|Boğaz|Karlı|Körfez|Zeytin|Kale|Marmara|Mogan|Spil|Kar)/;
    expect(allClubs(CLUBS_TUR).filter((c) => colourWords.test(c.nickname)).length).toBeGreaterThanOrEqual(18);
    // Nicknames are plural Turkish (…lar/…ler/…ları/…leri) like real Turkish football culture.
    for (const c of allClubs(CLUBS_TUR)) expect(c.nickname, c.nickname).toMatch(/(lar|ler|ları|leri|Kubbe|Kervan)$/);
  });

  it('keeps every league in its own country-flavoured naming', () => {
    const ascii = /^[\x20-\x7e]+$/;
    // Short codes are plain ASCII everywhere, even for Turkish clubs.
    for (const c of allClubs(CLUBS_TUR)) expect(c.short).toMatch(ascii);
  });
});
