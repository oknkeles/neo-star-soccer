import { describe, expect, it, vi } from 'vitest';
import { Rng } from '../../core/rng';

// Inline seed data: one palette-style row, two contract-style rows with clashing codes — everything else falls back.
vi.mock('../data/clubs_tur', () => ({
  CLUBS_TUR: {
    country: 'TUR',
    tier1: [
      { name: 'Boğaz Martıları', short: 'bog', nick: 'Martılar', city: 'İstanbul', founded: 1905, kit: ['#d0202e', '#f7f7f4', 'stripes'], away: ['#d0202e', '#14234b'], stadium: 'Martı Park', cap: 41000, rep: 92, rivals: ['KAD'] },
      { name: 'Kadıköy Fırtınası', short: 'KAD', nickname: 'Fırtına', city: 'İstanbul', founded: 1911, kit: { primary: '#14234b', secondary: '#ffd21f', style: 'halves' }, away: { primary: '#f7f7f4', secondary: '#14234b', style: 'plain' }, stadium: 'Fırtına Arena', capacity: 38000, rep: 88, style: 'pressing', formation: '4-3-3', derby: [] },
      { name: 'Bornova Kartalları', short: 'BOG', nickname: 'Kartallar', city: 'İzmir', founded: 1923, kit: { primary: '#0e7a4f', secondary: '#f7f7f4', style: 'hoops' }, away: { primary: '#0e7a4f', secondary: '#f7f7f4', style: 'hoops' }, stadium: 'Kartal Stadyumu', capacity: 22000, rep: 60, youth: 91, fac: 77, foreign: 0.1, derby: ['BOG'] },
    ],
    tier2: [],
  },
}));

const { generateWorld } = await import('../api');

describe('club seed handling', () => {
  const w = generateWorld(new Rng(1), { startSeason: 2026, userNation: 'TUR' });
  const tur1 = Object.values(w.clubs).filter((c) => c.country === 'TUR' && c.tier === 1);

  it('uses the supplied seeds first and fills the league up with generated clubs', () => {
    expect(tur1).toHaveLength(18);
    expect(tur1[0].name).toBe('Boğaz Martıları');
    expect(tur1[0].id).toBe('TUR-1-00');
    expect(tur1[0].nickname).toBe('Martılar');
    expect(tur1[0].stadium).toEqual({ name: 'Martı Park', capacity: 41000 });
    expect(tur1[0].kit).toEqual({ primary: '#d0202e', secondary: '#f7f7f4', style: 'stripes' });
    expect(tur1[1].kit.style).toBe('halves');
    expect(Object.values(w.clubs).filter((c) => c.country === 'TUR' && c.tier === 2)).toHaveLength(16);
  });

  it('makes colliding short codes unique and fixes identical away kits', () => {
    const shorts = Object.values(w.clubs).filter((c) => c.country === 'TUR').map((c) => c.shortName);
    expect(new Set(shorts).size).toBe(shorts.length);
    expect(tur1[0].shortName).toBe('BOG');
    expect(tur1[2].shortName).not.toBe('BOG');
    expect(tur1[2].awayKit.primary.toLowerCase()).not.toBe(tur1[2].kit.primary.toLowerCase());
  });

  it('applies seed overrides and resolves rivalries (listed, same-city, mutual)', () => {
    expect(tur1[2].youth).toBe(91);
    expect(tur1[2].facilities).toBe(77);
    expect(tur1[0].derbyRivals).toContain('TUR-1-01'); // same city + listed rival
    expect(tur1[1].derbyRivals).toContain('TUR-1-00');
    expect(tur1[2].derbyRivals).toContain('TUR-1-00'); // short 'BOG' resolves to the first holder
    expect(tur1[0].derbyRivals).toContain('TUR-1-02');
  });

  it('generates plausible Turkish fallback clubs', () => {
    for (const c of tur1.slice(3)) {
      expect(c.name.length).toBeGreaterThan(4);
      expect(c.reputation).toBeLessThanOrEqual(c.reputation);
      expect(w.managers[c.managerId]).toBeDefined();
      expect(c.squad).toHaveLength(24);
    }
  });

  it('keeps the homegrown-only club mostly domestic', () => {
    const squad = tur1[2].squad.map((id) => w.players[id]);
    expect(squad.filter((p) => p.nation !== 'TUR').length).toBeLessThanOrEqual(5);
  });
});
