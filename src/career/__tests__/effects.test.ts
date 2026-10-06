import { describe, expect, it } from 'vitest';
import { applyEffects, applyXp, relationshipLabel, sanitizeEffects, sanitizeEffectsFor, userPlayer, MONEY_FLOOR } from '../api';
import { stateWith } from './kit';

describe('applyEffects', () => {
  it('clamps every meter to 0..100 and keeps followers non-negative', () => {
    const s = stateWith();
    applyEffects(s, { energy: 500, fame: 500, morale: 500, form: 500, followers: -9_999_999, rel: { manager: 500, fans: -500 } });
    const p = userPlayer(s);
    expect(s.career.energy).toBe(100);
    expect(s.career.fame).toBe(100);
    expect(p.morale).toBe(100);
    expect(p.form).toBe(100);
    expect(s.career.followers).toBe(0);
    expect(s.career.relationships.manager).toBe(100);
    expect(s.career.relationships.fans).toBe(0);
    applyEffects(s, { energy: -500, fame: -500, morale: -500, form: -500 });
    expect(s.career.energy).toBe(0);
    expect(s.career.fame).toBe(0);
    expect(p.morale).toBe(0);
    expect(p.form).toBe(0);
  });

  it('lets money go negative only down to the floor', () => {
    const s = stateWith();
    s.career.money = 5_000;
    applyEffects(s, { money: -1_000_000 });
    expect(s.career.money).toBe(MONEY_FLOOR);
    applyEffects(s, { money: -10_000 });
    expect(s.career.money).toBe(MONEY_FLOOR);
    applyEffects(s, { money: 20_000 });
    expect(s.career.money).toBe(MONEY_FLOOR + 20_000);
  });

  it('returns short localized notes such as "+3 Taraftar"', () => {
    const s = stateWith();
    s.career.relationships.fans = 40;
    const notes = applyEffects(s, { rel: { fans: 3 }, money: 1_500 });
    expect(notes).toContain('+3 Taraftar');
    expect(notes.some((n) => n.startsWith('+') && n.includes('€'))).toBe(true);
  });

  it('routes xp through applyXp (points are earned, not raw xp)', () => {
    const s = stateWith();
    const before = userPlayer(s).attrs.shooting;
    const notes = applyEffects(s, { xp: { shooting: 15 } });
    expect(userPlayer(s).attrs.shooting).toBe(before);
    expect(s.career.xp.shooting ?? 0).toBeGreaterThan(0);
    expect(notes.length).toBe(0);
    const gained = applyXp(s, { shooting: 400 });
    expect(gained.find((g) => g.attr === 'shooting')?.delta ?? 0).toBeGreaterThan(0);
    expect(userPlayer(s).attrs.shooting).toBeGreaterThan(before);
  });

  it('sets, extends and shortens injuries', () => {
    const s = stateWith();
    applyEffects(s, { injuryWeeks: 3 });
    expect(userPlayer(s).injury?.weeksLeft).toBe(3);
    applyEffects(s, { injuryWeeks: 2 });
    expect(userPlayer(s).injury?.weeksLeft).toBe(5);
    applyEffects(s, { injuryWeeks: -2 });
    expect(userPlayer(s).injury?.weeksLeft).toBe(3);
    applyEffects(s, { injuryWeeks: -10 });
    expect(userPlayer(s).injury).toBeNull();
  });

  it('merges flags', () => {
    const s = stateWith();
    s.flags.keep = 1;
    applyEffects(s, { flags: { a: true, b: 'x' } });
    expect(s.flags).toMatchObject({ keep: 1, a: true, b: 'x' });
  });

  it('ignores partner relationship changes without a partner', () => {
    const s = stateWith();
    applyEffects(s, { rel: { partner: 10 } });
    expect(s.career.relationships.partner).toBe(0);
  });
});

describe('sanitizeEffects', () => {
  it('clamps untrusted effects to sane bounds', () => {
    const e = sanitizeEffects({
      money: 5_000_000, fame: 99, followers: 9e9, energy: -90, morale: 80, form: 70,
      rel: { manager: 50, fans: -50, family: 3 }, xp: { shooting: 500, passing: -500, vision: 4 }, injuryWeeks: 40,
    });
    expect(e.money).toBe(50_000);
    expect(e.fame).toBe(5);
    expect(e.energy).toBe(-30);
    expect(e.morale).toBe(15);
    expect(e.rel).toEqual({ manager: 10, fans: -10, family: 3 });
    expect(e.xp).toEqual({ shooting: 15, passing: -15, vision: 4 });
    expect(e.injuryWeeks).toBe(4);
    expect(e.followers ?? 0).toBeLessThanOrEqual(250_000);
  });

  it('drops garbage and supports scaling', () => {
    const e = sanitizeEffects({ fame: Number.NaN, morale: 10, rel: { manager: 8 }, flags: { ok: true, big: 'x'.repeat(500) } }, 0.5);
    expect(e.fame).toBeUndefined();
    expect(e.morale).toBe(5);
    expect(e.rel).toEqual({ manager: 4 });
    expect((e.flags?.big as string).length).toBeLessThanOrEqual(64);
    expect(sanitizeEffects(null as never)).toEqual({});
    expect(sanitizeEffects({ fame: 4 }, 0)).toEqual({});
  });

  it('allows money up to 5% of a large balance', () => {
    const s = stateWith();
    s.career.money = 10_000_000;
    expect(sanitizeEffectsFor(s, { money: 9_000_000 }).money).toBe(500_000);
    s.career.money = 1_000;
    expect(sanitizeEffectsFor(s, { money: 9_000_000 }).money).toBe(50_000);
  });
});

describe('relationshipLabel', () => {
  it('maps values to ordered labels', () => {
    const labels = [5, 20, 35, 50, 65, 80, 95].map(relationshipLabel);
    expect(new Set(labels).size).toBe(7);
    expect(relationshipLabel(Number.NaN)).toBe(relationshipLabel(50));
  });
});
