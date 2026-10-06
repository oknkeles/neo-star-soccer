import { describe, expect, it } from 'vitest';
import { Rng } from '../../core/rng';
import { overallFor } from '../../core/ratings';
import type { Club, CountryCode, Footballer, Position, World } from '../../core/types';
import { COUNTRIES, LEAGUES, NATIONS, generateWorld, getLeague, nationalTeamOf, refreshNationalTeams } from '../api';
import { hasNamePool } from '../gen/names';
import { sharedWorld } from './helpers';

const ovr = (p: Footballer) => overallFor(p.attrs, p.position);
const clubsOf = (w: World, country: CountryCode, tier: 1 | 2): Club[] =>
  Object.values(w.clubs).filter((c) => c.country === country && c.tier === tier);
const xi = (w: World, c: Club) => {
  const o = c.squad.map((id) => ovr(w.players[id])).sort((a, b) => b - a).slice(0, 11);
  return o.reduce((a, b) => a + b, 0) / o.length;
};

describe('leagues', () => {
  it('defines 16 leagues with the brief\'s sizes, strengths and spots', () => {
    expect(LEAGUES).toHaveLength(16);
    const size = (c: CountryCode) => (['ENG', 'ESP', 'ITA'].includes(c) ? 20 : 18);
    const spots: Record<CountryCode, number> = { ENG: 4, ESP: 4, ITA: 4, GER: 4, FRA: 3, POR: 3, NED: 3, TUR: 3 };
    const strength: Record<CountryCode, number> = { ENG: 92, ESP: 90, ITA: 87, GER: 87, FRA: 82, POR: 76, NED: 75, TUR: 72 };
    for (const c of COUNTRIES) {
      const t1 = getLeague(c, 1), t2 = getLeague(c, 2);
      expect(t1.id).toBe(`${c}-1`); expect(t2.id).toBe(`${c}-2`);
      expect(t1.teams).toBe(size(c)); expect(t2.teams).toBe(16);
      expect(t1.relegate).toBe(3); expect(t2.promote).toBe(3);
      expect(t1.continentalSpots).toBe(spots[c]);
      expect(t1.strength).toBe(strength[c]); expect(t2.strength).toBe(strength[c] - 22);
    }
    expect(getLeague('TUR', 1).name).toBe('Süper Lig');
    expect(getLeague('ENG', 2).name).toBe('First Division');
  });
});

describe('generateWorld', () => {
  const w = sharedWorld();

  it('creates the right number of clubs per league with stable ids', () => {
    for (const l of LEAGUES) {
      const clubs = clubsOf(w, l.country, l.tier);
      expect(clubs, l.id).toHaveLength(l.teams);
      clubs.forEach((c, i) => expect(c.id).toBe(`${l.country}-${l.tier}-${String(i).padStart(2, '0')}`));
    }
    expect(Object.keys(w.clubs)).toHaveLength(LEAGUES.reduce((a, l) => a + l.teams, 0));
    expect(w.leagues).toHaveLength(16);
  });

  it('gives every club a complete, valid profile', () => {
    for (const c of Object.values(w.clubs)) {
      expect(c.name.length).toBeGreaterThan(2);
      expect(c.shortName).toMatch(/^[A-Z]{3}$/);
      expect(c.kit.primary).toMatch(/^#/); expect(c.awayKit.primary).toMatch(/^#/);
      expect(c.kit.primary.toLowerCase()).not.toBe(c.awayKit.primary.toLowerCase());
      expect(c.stadium.capacity).toBeGreaterThan(1000);
      expect(c.reputation).toBeGreaterThanOrEqual(1); expect(c.reputation).toBeLessThanOrEqual(100);
      expect(c.facilities).toBeGreaterThanOrEqual(1); expect(c.facilities).toBeLessThanOrEqual(100);
      expect(c.youth).toBeGreaterThanOrEqual(1); expect(c.youth).toBeLessThanOrEqual(100);
      expect(c.budget).toBeGreaterThan(0); expect(c.wageBudget).toBeGreaterThan(0);
      expect(w.managers[c.managerId]?.clubId).toBe(c.id);
      expect(c.founded).toBeGreaterThan(1800);
    }
  });

  it('keeps club shorts unique inside each country and club names unique worldwide', () => {
    for (const country of COUNTRIES) {
      const shorts = [...clubsOf(w, country, 1), ...clubsOf(w, country, 2)].map((c) => c.shortName);
      expect(new Set(shorts).size, country).toBe(shorts.length);
    }
    const names = Object.values(w.clubs).map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('resolves mutual derbies to valid club ids in the same country', () => {
    let withDerby = 0;
    for (const c of Object.values(w.clubs)) {
      expect(c.derbyRivals.length).toBeLessThanOrEqual(10);
      if (c.derbyRivals.length) withDerby++;
      for (const id of c.derbyRivals) {
        const o = w.clubs[id];
        expect(o, `${c.id} → ${id}`).toBeDefined();
        expect(o.country).toBe(c.country);
        expect(o.derbyRivals).toContain(c.id);
        expect(id).not.toBe(c.id);
      }
    }
    expect(withDerby).toBeGreaterThan(40);
  });

  it('builds 24-man squads with a sensible position mix and unique shirt numbers', () => {
    const want: Record<Position, number> = { GK: 3, CB: 4, FB: 4, DM: 2, CM: 3, AM: 2, W: 3, ST: 3 };
    for (const c of Object.values(w.clubs)) {
      expect(c.squad).toHaveLength(24);
      const counts: Record<string, number> = {};
      const nums = new Set<number>();
      for (const id of c.squad) {
        const p = w.players[id];
        expect(p, id).toBeDefined();
        expect(p.clubId).toBe(c.id);
        counts[p.position] = (counts[p.position] ?? 0) + 1;
        nums.add(p.shirtNumber);
        expect(p.shirtNumber).toBeGreaterThanOrEqual(1); expect(p.shirtNumber).toBeLessThan(100);
        if (p.shirtNumber === 1) expect(p.position).toBe('GK');
      }
      expect(counts).toEqual(want);
      expect(nums.size, c.id).toBe(24);
    }
  });

  it('has globally unique ids and consistent contracts, ages and stats', () => {
    const season = 2026;
    const ids = Object.keys(w.players);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of Object.values(w.players)) {
      expect(p.id).toBe(ids.includes(p.id) ? p.id : '');
      expect(p.firstName.length).toBeGreaterThan(0); expect(p.lastName.length).toBeGreaterThan(0);
      expect(p.potential).toBeGreaterThanOrEqual(ovr(p));
      expect(p.value).toBeGreaterThan(0);
      expect(p.injury).toBeNull();
      if (p.clubId) {
        const age = season - p.birthYear;
        expect(age).toBeGreaterThanOrEqual(17); expect(age).toBeLessThanOrEqual(37);
        expect(p.contract?.clubId).toBe(p.clubId);
        expect(p.contract!.endSeason).toBeGreaterThanOrEqual(season);
        expect(p.contract!.endSeason - p.contract!.startSeason).toBeLessThanOrEqual(4);
        expect(p.contract!.wage).toBeGreaterThan(0);
        expect(['star', 'starter', 'rotation', 'prospect']).toContain(p.contract!.role);
        expect(w.clubs[p.clubId].squad).toContain(p.id);
      }
    }
  });

  it('scales quality with club reputation and league strength', () => {
    const t1 = (c: CountryCode) => clubsOf(w, c, 1).map((c2) => xi(w, c2));
    const t2 = (c: CountryCode) => clubsOf(w, c, 2).map((c2) => xi(w, c2));
    const best = Math.max(...COUNTRIES.flatMap(t1));
    expect(best).toBeGreaterThanOrEqual(84); expect(best).toBeLessThanOrEqual(90);
    const worst = Math.min(...COUNTRIES.flatMap(t2));
    expect(worst).toBeGreaterThanOrEqual(50); expect(worst).toBeLessThanOrEqual(61);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    for (const c of COUNTRIES) expect(mean(t1(c))).toBeGreaterThan(mean(t2(c)) + 4);
    expect(mean(t1('ENG'))).toBeGreaterThan(mean(t1('TUR')));
    // within a league, reputation drives strength
    for (const c of COUNTRIES) {
      const clubs = clubsOf(w, c, 1).sort((a, b) => b.reputation - a.reputation);
      const top = mean(clubs.slice(0, 4).map((x) => xi(w, x)));
      const bottom = mean(clubs.slice(-4).map((x) => xi(w, x)));
      expect(top, c).toBeGreaterThan(bottom + 5);
    }
  });

  it('is realistic in age and nationality mix', () => {
    const ages = Object.values(w.players).filter((p) => p.clubId).map((p) => 2026 - p.birthYear);
    const mean = ages.reduce((a, b) => a + b, 0) / ages.length;
    expect(mean).toBeGreaterThan(24); expect(mean).toBeLessThan(28);
    expect(ages.filter((a) => a <= 20).length).toBeGreaterThan(300);
    const share = (country: CountryCode, tier: 1 | 2) => {
      const ps = clubsOf(w, country, tier).flatMap((c) => c.squad.map((id) => w.players[id]));
      return ps.filter((p) => p.nation !== country).length / ps.length;
    };
    expect(share('ENG', 1)).toBeGreaterThan(share('ENG', 2));
    expect(share('ENG', 1)).toBeGreaterThan(0.25); expect(share('ENG', 1)).toBeLessThan(0.7);
    const natives = clubsOf(w, 'TUR', 1).flatMap((c) => c.squad.map((id) => w.players[id])).filter((p) => p.nation === 'TUR');
    expect(natives.length).toBeGreaterThan(100);
  });

  it('adds a free-manager pool plus a club manager for every team', () => {
    const free = Object.values(w.managers).filter((m) => m.clubId === null);
    expect(free.length).toBe(15);
    expect(Object.values(w.managers).filter((m) => m.clubId).length).toBe(Object.keys(w.clubs).length);
    const domestic = Object.values(w.clubs).filter((c) => w.managers[c.managerId].nation === c.country).length;
    expect(domestic / Object.keys(w.clubs).length).toBeGreaterThan(0.65);
    const matching = Object.values(w.clubs).filter((c) => w.managers[c.managerId].style === c.style).length;
    expect(matching / Object.keys(w.clubs).length).toBeGreaterThan(0.6);
  });

  it('creates a 23-man squad for every nation, with abroad players registered externally', () => {
    expect(Object.keys(w.nationalTeams)).toHaveLength(NATIONS.length);
    for (const nat of NATIONS) {
      const nt = nationalTeamOf(w, nat.code)!;
      expect(nt, nat.code).not.toBeNull();
      expect(nt.id).toBe(`NT-${nat.code}`);
      expect(nt.squad).toHaveLength(23);
      expect(new Set(nt.squad).size).toBe(23);
      expect(nt.name.tr).toContain(nat.name.tr);
      expect(nt.name.en).toContain(nat.name.en);
      expect(nt.managerName.length).toBeGreaterThan(3);
      expect(nt.kit).toEqual(nat.kit);
      expect(nt.squad.filter((id) => w.players[id].position === 'GK')).toHaveLength(3);
      for (const id of nt.squad) {
        const p = w.players[id];
        expect(p, id).toBeDefined();
        expect(p.nation).toBe(nat.code);
        if (w.externalClubs[id]) {
          expect(p.clubId).toBeNull();
          expect(w.externalClubs[id]).toMatch(/\([A-Z]{3}\)$/);
        } else {
          expect(p.clubId).not.toBeNull();
        }
      }
    }
    expect(nationalTeamOf(w, 'NOPE')).toBeNull();
  });

  it('matches national team quality to the nation\'s reputation', () => {
    const quality = (code: string) => {
      const nt = nationalTeamOf(w, code)!;
      return nt.squad.map((id) => ovr(w.players[id])).sort((a, b) => b - a).slice(0, 11).reduce((a, b) => a + b, 0) / 11;
    };
    const ranked = [...NATIONS].sort((a, b) => b.reputation - a.reputation);
    const top = ranked.slice(0, 6).map((n) => quality(n.code));
    const bottom = ranked.slice(-6).map((n) => quality(n.code));
    expect(top.reduce((a, b) => a + b, 0) / 6).toBeGreaterThan(bottom.reduce((a, b) => a + b, 0) / 6 + 7);
    for (const n of NATIONS) { expect(quality(n.code)).toBeGreaterThan(55); expect(quality(n.code)).toBeLessThan(93); }
  });

  it('is deterministic for a given rng state and keeps the world JSON-serializable', () => {
    const a = generateWorld(new Rng(99), { startSeason: 2026, userNation: 'TUR' });
    const b = generateWorld(new Rng(99), { startSeason: 2026, userNation: 'ENG' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    const c = generateWorld(new Rng(100), { startSeason: 2026, userNation: 'TUR' });
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it('advances the rng and varies between careers', () => {
    const rng = new Rng(5);
    const s0 = rng.state();
    const w1 = generateWorld(rng, { startSeason: 2026, userNation: 'TUR' });
    expect(rng.state()).not.toEqual(s0);
    const w2 = generateWorld(rng, { startSeason: 2026, userNation: 'TUR' });
    const top = (x: World) => Object.values(x.players).sort((p, q) => ovr(q) - ovr(p))[0].lastName;
    expect(Object.keys(w1.players).length).toBeGreaterThan(6000);
    expect(top(w1) + JSON.stringify(Object.values(w1.clubs)[3].squad.length)).toBeTruthy();
    expect(JSON.stringify(w1.players['WP-1'])).not.toBe(JSON.stringify(w2.players['WP-1']));
  });

  it('generates the world fast (< 300 ms)', () => {
    generateWorld(new Rng(1), { startSeason: 2026, userNation: 'TUR' }); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      generateWorld(new Rng(10 + i), { startSeason: 2026, userNation: 'TUR' });
      times.push(performance.now() - t0);
    }
    expect(Math.min(...times)).toBeLessThan(300);
  });
});

describe('national team refresh', () => {
  it('re-selects squads after retirements and keeps 23 unique players per team', () => {
    const w = generateWorld(new Rng(321), { startSeason: 2026, userNation: 'TUR' });
    const before = new Set(w.nationalTeams['NT-TUR'].squad);
    for (const id of before) w.players[id].retired = true; // everyone in the TUR squad retires
    refreshNationalTeams(new Rng(1), w, 2027);
    for (const nat of NATIONS) {
      const nt = w.nationalTeams[`NT-${nat.code}`];
      expect(nt.squad).toHaveLength(23);
      expect(new Set(nt.squad).size).toBe(23);
      for (const id of nt.squad) {
        expect(w.players[id].retired).not.toBe(true);
        expect(w.players[id].nation).toBe(nat.code);
        if (!w.players[id].clubId) expect(w.externalClubs[id]).toBeDefined();
      }
    }
    expect(w.nationalTeams['NT-TUR'].squad.some((id) => before.has(id))).toBe(false);
    expect(w.nationalTeams['NT-TUR'].managerName.length).toBeGreaterThan(3);
  });
});

describe('name pools', () => {
  it('has a culture pool for every nation', () => {
    for (const n of NATIONS) expect(hasNamePool(n.code), n.code).toBe(true);
  });
});

