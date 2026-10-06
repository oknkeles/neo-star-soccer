import { describe, expect, it } from 'vitest';
import { selectionFor, userPlayer } from '../api';
import type { Attributes, GameState, UserMatchRole } from '../../core/types';
import { ATTR_KEYS } from '../../core/ratings';
import { addFixture, addNationalTeam, setUser, stateWith } from './kit';

const ORDER: Record<UserMatchRole, number> = { none: 0, bench: 1, starter: 2 };

/** Give the user a flat attribute level. */
function setLevel(s: GameState, level: number): void {
  const attrs = userPlayer(s).attrs;
  for (const k of ATTR_KEYS) (attrs as Attributes)[k] = k === 'goalkeeping' ? 10 : level;
}

describe('selectionFor', () => {
  it('leaves injured players out and ignores fixtures of other clubs', () => {
    const s = stateWith();
    const f = addFixture(s, { id: 'f1' });
    setLevel(s, 90);
    expect(selectionFor(s, f)).toBe('starter');
    userPlayer(s).injury = { key: 'knock', weeksLeft: 1, severity: 1 };
    expect(selectionFor(s, f)).toBe('none');
    userPlayer(s).injury = null;
    const other = addFixture(s, { id: 'f2', homeId: 'ENG-1-02', awayId: 'ENG-1-03' });
    expect(selectionFor(s, other)).toBe('none');
  });

  it('starts a clearly better player, drops a clearly worse one', () => {
    const s = stateWith();
    const f = addFixture(s, { id: 'f1' });
    setLevel(s, 92);
    expect(selectionFor(s, f)).toBe('starter');
    setLevel(s, 25);
    expect(['none', 'bench']).toContain(selectionFor(s, f));
    expect(selectionFor(s, f)).not.toBe('starter');
  });

  it('is monotonic in quality and a good manager relationship never hurts', () => {
    const s = stateWith({ seed: 11 });
    const f = addFixture(s, { id: 'f1' });
    for (let level = 30; level <= 90; level += 5) {
      setLevel(s, level);
      s.career.relationships.manager = 50;
      const mid = ORDER[selectionFor(s, f)];
      s.career.relationships.manager = 100;
      const high = ORDER[selectionFor(s, f)];
      s.career.relationships.manager = 0;
      const low = ORDER[selectionFor(s, f)];
      expect(high).toBeGreaterThanOrEqual(mid);
      expect(mid).toBeGreaterThanOrEqual(low);
    }
    // somewhere in the sweep the user must have gone from out to starting
    setLevel(s, 30);
    s.career.relationships.manager = 50;
    const lo = ORDER[selectionFor(s, f)];
    setLevel(s, 90);
    const hi = ORDER[selectionFor(s, f)];
    expect(hi).toBeGreaterThan(lo);
  });

  it('a young player gets a nudge from a manager who trusts youth', () => {
    const find = (trust: number) => {
      const s = stateWith({ seed: 11 });
      const f = addFixture(s, { id: 'f1' });
      s.world.managers[s.world.clubs[userPlayer(s).clubId as string].managerId].trustsYouth = trust;
      let firstStart = -1;
      for (let level = 30; level <= 95; level++) {
        setLevel(s, level);
        if (selectionFor(s, f) === 'starter') { firstStart = level; break; }
      }
      return firstStart;
    };
    expect(find(95)).toBeLessThanOrEqual(find(5));
  });

  it('a promised star role is worth something', () => {
    const find = (role: 'prospect' | 'star') => {
      const s = stateWith({ seed: 11 });
      const f = addFixture(s, { id: 'f1' });
      userPlayer(s).contract!.role = role;
      for (let level = 30; level <= 95; level++) {
        setLevel(s, level);
        if (selectionFor(s, f) === 'starter') return level;
      }
      return 99;
    };
    expect(find('star')).toBeLessThanOrEqual(find('prospect'));
  });

  it('national fixtures depend on the call-up and the rank within the national squad', () => {
    const s = stateWith();
    const ntId = addNationalTeam(s, 62);
    const f = addFixture(s, { id: 'nt1', compId: `INT-${s.season}`, homeId: ntId, awayId: 'NT-XXX' });
    s.competitions[`INT-${s.season}`].kind = 'international';
    setLevel(s, 95);
    s.career.calledUp = false;
    expect(selectionFor(s, f)).toBe('none');
    s.career.calledUp = true;
    s.world.nationalTeams[ntId].squad.push(userPlayer(s).id);
    expect(selectionFor(s, f)).toBe('starter');
    setLevel(s, 30);
    expect(selectionFor(s, f)).toBe('bench');
  });

  it('assigns set pieces to the best taker', () => {
    const s = stateWith({ seed: 4 });
    const f = addFixture(s, { id: 'f1' });
    setLevel(s, 90);
    setUser(s, { traits: ['set_piece_specialist'] });
    userPlayer(s).attrs.curl = 99;
    selectionFor(s, f);
    expect(s.career.setPieces.freeKicks).toBe(true);
    setLevel(s, 90);
    userPlayer(s).attrs.curl = 15;
    userPlayer(s).attrs.shooting = 20;
    userPlayer(s).attrs.passing = 20;
    userPlayer(s).traits = [];
    selectionFor(s, f);
    expect(s.career.setPieces.freeKicks).toBe(false);
    expect(s.career.setPieces.corners).toBe(false);
  });
});
