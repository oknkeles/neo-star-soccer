/** The player's circle (manager, mentor, agent, family, rival) and the local money log. */
import { afterEach, describe, expect, it } from 'vitest';
import { makeTestState } from '../../../../core/testing';
import type { Person } from '../../../../core/types';
import { buildCircle, relBand } from '../circle';
import { loadMoney, mergePoint, projectMoney, recordMoney } from '../moneylog';

const person = (id: string, role: Person['role']): Person => ({ id, name: `${role} ${id}`, role, personality: 'warm', bio: 'bio', relationship: 55 });

describe('buildCircle', () => {
  it('lists manager, mentor, agent and rival for a fresh career', () => {
    const state = makeTestState();
    const circle = buildCircle(state);
    const roles = circle.map((e) => e.role);
    expect(roles).toContain('manager');
    expect(roles).toContain('mentor');
    expect(roles).toContain('agent');
    expect(roles).toContain('rival');
    expect(circle.find((e) => e.role === 'manager')?.persona).toBe('manager');
    expect(circle.find((e) => e.role === 'rival')?.group).toBe('rival');
  });

  it('opens chats only for the first family member and the partner', () => {
    const state = makeTestState();
    state.career.people.push(person('F1', 'father'), person('F2', 'mother'), person('P1', 'partner'), person('FR', 'friend'));
    state.career.partnerId = 'P1';
    const circle = buildCircle(state);
    expect(circle.filter((e) => e.persona === 'family')).toHaveLength(1);
    expect(circle.find((e) => e.role === 'partner')?.persona).toBe('partner');
    expect(circle.find((e) => e.role === 'friend')?.persona).toBeNull();
    expect(circle.filter((e) => e.group === 'family').length).toBeGreaterThanOrEqual(4);
  });

  it('works for a free agent (no manager)', () => {
    const state = makeTestState();
    const p = state.world.players[state.career.playerId];
    p.clubId = null;
    expect(buildCircle(state).some((e) => e.role === 'manager')).toBe(false);
  });
});

describe('relBand', () => {
  it('splits 0..100 into five bands', () => {
    expect([0, 19, 20, 39, 40, 59, 60, 79, 80, 100].map(relBand)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('money log', () => {
  const g = globalThis as { localStorage?: Storage };
  afterEach(() => { delete g.localStorage; });

  it('merges, sorts and caps points', () => {
    let list = mergePoint([], { k: 202610, v: 5 });
    list = mergePoint(list, { k: 202605, v: 3 });
    list = mergePoint(list, { k: 202610, v: 9 });
    expect(list).toEqual([{ k: 202605, v: 3 }, { k: 202610, v: 9 }]);
    const many = Array.from({ length: 10 }, (_, i) => ({ k: i, v: i })).reduce((acc, p) => mergePoint(acc, p, 4), [] as { k: number; v: number }[]);
    expect(many.map((p) => p.k)).toEqual([6, 7, 8, 9]);
  });

  it('survives missing storage', () => {
    expect(loadMoney('none')).toEqual([]);
    expect(recordMoney('none', { k: 1, v: 2 })).toEqual([{ k: 1, v: 2 }]);
  });

  it('persists through a storage object and ignores garbage', () => {
    const mem = new Map<string, string>();
    g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } as unknown as Storage;
    recordMoney('s1', { k: 1, v: 100 });
    recordMoney('s1', { k: 2, v: 150 });
    expect(loadMoney('s1')).toEqual([{ k: 1, v: 100 }, { k: 2, v: 150 }]);
    mem.set('nss.life.money.s2', '{"not":"an array"}');
    expect(loadMoney('s2')).toEqual([]);
    mem.set('nss.life.money.s3', '[{"k":1,"v":"x"},{"k":2,"v":7}]');
    expect(loadMoney('s3')).toEqual([{ k: 2, v: 7 }]);
  });

  it('projects a straight line', () => {
    expect(projectMoney(100, 10, 3)).toEqual([100, 110, 120, 130]);
  });
});
