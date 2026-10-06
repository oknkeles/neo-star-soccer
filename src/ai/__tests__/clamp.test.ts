import { describe, expect, it } from 'vitest';
import {
  clampEffects, clampPatience, clampTerms, clip, compactToEffects, followersCap, line, negotiationMandate, sanitizeHandle, validIcon,
} from '../clamp';
import { makeNegotiation, terms, zeroEffects } from './fixtures';

describe('effects', () => {
  it('bounds every field and drops flags and zeros', () => {
    const e = clampEffects({
      money: -1e7, fame: 9, morale: 2.6, energy: 0, followers: 3e6, injuryWeeks: -3,
      rel: { media: -20, fans: 0.2 }, xp: { shooting: 33 }, flags: { evil: true },
    }, { followers: 1_000_000 });
    expect(e).toEqual({ money: -20_000, fame: 4, morale: 3, followers: 50_000, rel: { media: -8 }, xp: { shooting: 10 } });
  });

  it('ignores NaN / non-numbers', () => {
    expect(clampEffects({ money: Number.NaN, fame: Infinity, morale: '5' as unknown as number })).toEqual({});
  });

  it('sums duplicate keys before clamping and normalises key spelling', () => {
    const e = compactToEffects({
      ...zeroEffects(),
      rel: [{ who: 'Fans', delta: 3 }, { who: 'fans', delta: 3 }, { who: 'referee', delta: 5 }],
      xp: [{ attr: 'first_touch', delta: 4 }, { attr: 'FirstTouch', delta: 4 }],
    });
    expect(e).toEqual({ rel: { fans: 6 }, xp: { firstTouch: 8 } });
  });

  it('scales the follower cap with the audience', () => {
    expect(followersCap(0)).toBe(2_000);
    expect(followersCap(1_000_000)).toBe(50_000);
    expect(followersCap(1e9)).toBe(250_000);
  });
});

describe('negotiation', () => {
  it('builds a mandate inside the hard limits', () => {
    const neg = makeNegotiation();
    const m = negotiationMandate(neg, terms({ wage: 50_000, signingBonus: 500_000 }));
    expect(m.wage[1]).toBeLessThanOrEqual(neg.limits.maxWage);
    expect(m.wage[0]).toBeLessThanOrEqual(m.wage[1]);
    expect(m.signingBonus[1]).toBeLessThanOrEqual(neg.limits.maxSigningBonus);
    expect(m.years[1]).toBeLessThanOrEqual(neg.limits.maxYears);
    expect(m.releaseClause![0]).toBeGreaterThanOrEqual(neg.limits.minReleaseClause!);
  });

  it('never offers more than the player asked for', () => {
    const neg = makeNegotiation();
    const ask = terms({ wage: 10_200 });
    const t = clampTerms({ wage: 12_000, years: 3, releaseClause: 0, role: 'rotation', signingBonus: 50_000, goalBonus: 1_000 }, neg, ask);
    expect(t.wage).toBe(10_200);
  });

  it('keeps a missing release clause missing unless the player asked for one', () => {
    const neg = makeNegotiation({ current: terms({ releaseClause: null }), limits: { ...makeNegotiation().limits, minReleaseClause: null } });
    const base = { wage: 10_000, years: 3, role: 'rotation', signingBonus: 50_000, goalBonus: 1_000 };
    expect(clampTerms({ ...base, releaseClause: 5_000_000 }, neg, terms({ releaseClause: null })).releaseClause).toBeNull();
    expect(clampTerms({ ...base, releaseClause: 5_000_000 }, neg, terms({ releaseClause: 30_000_000 })).releaseClause).toBe(30_000_000);
  });

  it('clamps patience into [-30, 10]', () => {
    expect(clampPatience(-100)).toBe(-30);
    expect(clampPatience(55)).toBe(10);
    expect(clampPatience('x')).toBe(0);
  });
});

describe('text helpers', () => {
  it('clips at a word boundary with an ellipsis', () => {
    const s = clip('Deniz fileleri havalandırdı ve tribünler ayağa kalktı', 30);
    expect(s.length).toBeLessThanOrEqual(30);
    expect(s.endsWith('…')).toBe(true);
    expect(s).not.toMatch(/ …$/);
  });

  it('strips markdown, wrapping quotes and extra whitespace', () => {
    expect(line('  "**Derbi   ateşi**"  ', 50)).toBe('Derbi ateşi');
    expect(clip('a\n\n\n\nb', 10)).toBe('a\n\nb');
    expect(clip(undefined, 10)).toBe('');
  });

  it('makes ASCII handles from Turkish names', () => {
    expect(sanitizeHandle('', 'Gökhan Şimşek')).toBe('@gokhan_simsek');
    expect(sanitizeHandle('@İzmirli_Ultra', 'x')).toBe('@izmirli_ultra');
    expect(sanitizeHandle('🔥🔥', '')).toBe('@fan');
  });

  it('validates icon names', () => {
    expect(validIcon('trophy')).toBe('trophy');
    expect(validIcon('Trophy')).toBe('sparkles');
    expect(validIcon(undefined)).toBe('sparkles');
  });
});
