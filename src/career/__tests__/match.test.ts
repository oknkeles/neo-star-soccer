import { describe, expect, it } from 'vitest';
import { afterUserMatch, userPlayer } from '../api';
import type { GameState } from '../../core/types';
import { addFixture, makeRng, setUser, stateWith, summaryFor } from './kit';

function play(s: GameState, id: string, o: Parameters<typeof summaryFor>[2] = {}, rng = makeRng(1)) {
  const f = addFixture(s, { id });
  return afterUserMatch(s, id, summaryFor(s, id, o), rng);
}

describe('afterUserMatch', () => {
  it('a brilliant game lifts form, morale, fame, followers and relationships', () => {
    const s = stateWith();
    const p = userPlayer(s);
    s.career.money = 0;
    p.contract!.goalBonus = 2_000;
    p.contract!.appearanceBonus = 500;
    const before = { form: p.form, morale: p.morale, fame: s.career.fame, followers: s.career.followers, rel: { ...s.career.relationships } };
    const notes = play(s, 'g1', { rating: 9, goals: 2, assists: 1, motm: true, gf: 3, ga: 0 });
    expect(p.form).toBeGreaterThan(before.form);
    expect(p.morale).toBeGreaterThan(before.morale);
    expect(s.career.fame).toBeGreaterThan(before.fame);
    expect(s.career.followers).toBeGreaterThan(before.followers);
    expect(s.career.relationships.manager).toBeGreaterThan(before.rel.manager);
    expect(s.career.relationships.fans).toBeGreaterThan(before.rel.fans);
    expect(s.career.relationships.teammates).toBeGreaterThan(before.rel.teammates);
    expect(s.career.relationships.media).toBeGreaterThan(before.rel.media);
    expect(s.career.money).toBe(2 * 2_000 + 500);
    expect(notes.length).toBeGreaterThan(2);
    expect(s.career.matches).toHaveLength(1);
    expect(s.career.matches[0]).toMatchObject({ fixtureId: 'g1', goals: 2, assists: 1, motm: true, minutes: 90, goalsFor: 3, goalsAgainst: 0, home: true });
  });

  it('a stinker hurts form, morale and the manager relationship', () => {
    const s = stateWith();
    const p = userPlayer(s);
    const before = { form: p.form, morale: p.morale, mgr: s.career.relationships.manager, fans: s.career.relationships.fans };
    play(s, 'g1', { rating: 4.2, gf: 0, ga: 3 });
    expect(p.form).toBeLessThan(before.form);
    expect(p.morale).toBeLessThan(before.morale);
    expect(s.career.relationships.manager).toBeLessThan(before.mgr);
    expect(s.career.relationships.fans).toBeLessThan(before.fans);
  });

  it('expectations scale with the promised role', () => {
    const rel = (role: 'prospect' | 'star') => {
      const s = stateWith();
      userPlayer(s).contract!.role = role;
      play(s, 'g1', { rating: 6.9 });
      return s.career.relationships.manager;
    };
    expect(rel('prospect')).toBeGreaterThan(rel('star'));
  });

  it('big-game players earn more fame on a continental night', () => {
    const fame = (traits: ('big_game')[]) => {
      const s = stateWith();
      setUser(s, { traits });
      addFixture(s, { id: 'cc1', compId: `CC-${s.season}` });
      s.competitions[`CC-${s.season}`].kind = 'continental';
      s.career.fame = 20;
      afterUserMatch(s, 'cc1', summaryFor(s, 'cc1', { rating: 8, goals: 1, gf: 2 }), makeRng(1));
      return s.career.fame;
    };
    expect(fame(['big_game'])).toBeGreaterThan(fame([]));
  });

  it('an unused substitute only gets a note', () => {
    const s = stateWith();
    addFixture(s, { id: 'g1' });
    const summary = summaryFor(s, 'g1');
    delete summary.user;
    const notes = afterUserMatch(s, 'g1', summary, makeRng(1));
    expect(notes.length).toBeGreaterThan(0);
    expect(s.career.matches).toHaveLength(0);
  });

  it('keeps only the last 200 matches and does not duplicate a fixture', () => {
    const s = stateWith();
    for (let i = 0; i < 215; i++) play(s, `g${i}`, { rating: 6.5 });
    expect(s.career.matches).toHaveLength(200);
    expect(s.career.matches[199].fixtureId).toBe('g214');
    afterUserMatch(s, 'g214', summaryFor(s, 'g214'), makeRng(2));
    expect(s.career.matches.filter((m) => m.fixtureId === 'g214')).toHaveLength(1);
  });

  it('matches cost energy and can injure a tired glass-boned player', () => {
    const s = stateWith();
    const e0 = s.career.energy;
    play(s, 'g1');
    expect(s.career.energy).toBeLessThan(e0);
    const t = stateWith();
    setUser(t, { traits: ['glass_bones'] });
    t.career.energy = 3;
    const rng = makeRng(5);
    let hurt = false;
    for (let i = 0; i < 200 && !hurt; i++) {
      t.career.energy = 3;
      addFixture(t, { id: `h${i}` });
      afterUserMatch(t, `h${i}`, summaryFor(t, `h${i}`, { rating: 6.5 }), rng);
      hurt = !!userPlayer(t).injury;
    }
    expect(hurt).toBe(true);
  });

  it('match xp feeds progression', () => {
    const s = stateWith();
    const before = Object.values(s.career.xp).reduce((a, b) => a + (b ?? 0), 0);
    play(s, 'g1', { xp: { shooting: 40, curl: 30 } });
    const after = Object.values(s.career.xp).reduce((a, b) => a + (b ?? 0), 0);
    expect(after).toBeGreaterThan(before);
  });
});
