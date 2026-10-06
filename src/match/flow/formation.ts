import type { Formation, Position } from '../../core/types';

/** One formation slot: role + layout coordinate (x across 0..1 left→right, y depth 0..1 own goal→halfway). */
export interface Slot { role: Position; x: number; y: number }

const GK: Slot = { role: 'GK', x: 0.5, y: 0.04 };
const BACK4: Slot[] = [
  { role: 'FB', x: 0.12, y: 0.25 }, { role: 'CB', x: 0.37, y: 0.19 },
  { role: 'CB', x: 0.63, y: 0.19 }, { role: 'FB', x: 0.88, y: 0.25 },
];

export const FORMATION_SLOTS: Record<Formation, Slot[]> = {
  '4-4-2': [GK, ...BACK4,
    { role: 'W', x: 0.12, y: 0.56 }, { role: 'CM', x: 0.38, y: 0.5 }, { role: 'CM', x: 0.62, y: 0.5 }, { role: 'W', x: 0.88, y: 0.56 },
    { role: 'ST', x: 0.38, y: 0.86 }, { role: 'ST', x: 0.62, y: 0.86 }],
  '4-3-3': [GK, ...BACK4,
    { role: 'CM', x: 0.28, y: 0.52 }, { role: 'DM', x: 0.5, y: 0.42 }, { role: 'CM', x: 0.72, y: 0.52 },
    { role: 'W', x: 0.15, y: 0.8 }, { role: 'ST', x: 0.5, y: 0.88 }, { role: 'W', x: 0.85, y: 0.8 }],
  '4-2-3-1': [GK, ...BACK4,
    { role: 'DM', x: 0.38, y: 0.42 }, { role: 'DM', x: 0.62, y: 0.42 },
    { role: 'W', x: 0.15, y: 0.68 }, { role: 'AM', x: 0.5, y: 0.66 }, { role: 'W', x: 0.85, y: 0.68 },
    { role: 'ST', x: 0.5, y: 0.88 }],
  '3-5-2': [GK,
    { role: 'CB', x: 0.25, y: 0.2 }, { role: 'CB', x: 0.5, y: 0.17 }, { role: 'CB', x: 0.75, y: 0.2 },
    { role: 'FB', x: 0.08, y: 0.54 }, { role: 'CM', x: 0.32, y: 0.52 }, { role: 'DM', x: 0.5, y: 0.42 }, { role: 'CM', x: 0.68, y: 0.52 }, { role: 'FB', x: 0.92, y: 0.54 },
    { role: 'ST', x: 0.38, y: 0.86 }, { role: 'ST', x: 0.62, y: 0.86 }],
  '5-3-2': [GK,
    { role: 'FB', x: 0.08, y: 0.32 }, { role: 'CB', x: 0.28, y: 0.2 }, { role: 'CB', x: 0.5, y: 0.17 }, { role: 'CB', x: 0.72, y: 0.2 }, { role: 'FB', x: 0.92, y: 0.32 },
    { role: 'CM', x: 0.3, y: 0.52 }, { role: 'DM', x: 0.5, y: 0.45 }, { role: 'CM', x: 0.7, y: 0.52 },
    { role: 'ST', x: 0.38, y: 0.86 }, { role: 'ST', x: 0.62, y: 0.86 }],
  '4-1-4-1': [GK, ...BACK4,
    { role: 'DM', x: 0.5, y: 0.38 },
    { role: 'W', x: 0.12, y: 0.62 }, { role: 'CM', x: 0.38, y: 0.58 }, { role: 'CM', x: 0.62, y: 0.58 }, { role: 'W', x: 0.88, y: 0.62 },
    { role: 'ST', x: 0.5, y: 0.88 }],
};

/** Which roles a natural position can reasonably fill, best first. */
const COMPAT: Record<Position, Position[]> = {
  GK: ['GK'],
  CB: ['CB', 'DM', 'FB'],
  FB: ['FB', 'W', 'CB', 'DM'],
  DM: ['DM', 'CM', 'CB'],
  CM: ['CM', 'DM', 'AM'],
  AM: ['AM', 'CM', 'W', 'ST'],
  W: ['W', 'AM', 'ST', 'FB'],
  ST: ['ST', 'W', 'AM'],
};

export interface AssignedSlot { id: string; slot: number; role: Position; x: number; y: number }

/**
 * Map on-pitch players onto formation slots (GK first, then back → front).
 * The user always keeps his natural position as role. With fewer than 11 players
 * (red cards) the most advanced unfilled slots stay empty.
 */
export function assignSlots(
  ids: readonly string[],
  formation: Formation,
  positionOf: (id: string) => Position,
  userId?: string | null,
): AssignedSlot[] {
  const slots = FORMATION_SLOTS[formation] ?? FORMATION_SLOTS['4-4-2'];
  const taken: (string | null)[] = slots.map(() => null);
  const pool = [...ids];

  const place = (id: string, slotIdx: number) => {
    taken[slotIdx] = id;
    pool.splice(pool.indexOf(id), 1);
  };

  if (userId && pool.includes(userId)) {
    const pos = positionOf(userId);
    for (const role of COMPAT[pos]) {
      const idx = slots.findIndex((s, i) => !taken[i] && s.role === role);
      if (idx >= 0) { place(userId, idx); break; }
    }
  }
  // exact → compatible → any (outfield never takes the GK slot unless no GK exists)
  for (const pass of [0, 1, 2] as const) {
    slots.forEach((s, i) => {
      if (taken[i]) return;
      const pick = pool.find((id) => {
        const pos = positionOf(id);
        if (pass === 0) return pos === s.role;
        if (pass === 1) return COMPAT[pos].includes(s.role);
        return s.role === 'GK' ? true : pos !== 'GK';
      });
      if (pick) place(pick, i);
    });
  }
  // leftovers (e.g. a second GK) fill whatever is free
  slots.forEach((_, i) => { if (!taken[i] && pool.length) place(pool[0], i); });

  const out: AssignedSlot[] = [];
  taken.forEach((id, i) => {
    if (!id) return;
    const s = slots[i];
    out.push({ id, slot: i, role: id === userId ? positionOf(id) : s.role, x: s.x, y: s.y });
  });
  return out;
}

export function isAttackingRole(p: Position): boolean {
  return p === 'ST' || p === 'W' || p === 'AM';
}

export function isDefensiveRole(p: Position): boolean {
  return p === 'CB' || p === 'FB' || p === 'GK';
}
