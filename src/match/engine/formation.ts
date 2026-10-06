/**
 * Team shapes for the moment engine. Slots use the same layout convention as the macro
 * match (x across 0..1 left→right when attacking, y depth 0..1 own goal→front line);
 * engine code turns them into pitch coordinates around the ball.
 */
import type { Formation, MomentPlayerSpec, Position, TacticalStyle, Vec2 } from '../../core/types';
import { clamp } from '../../core/util';

export interface SlotDef { role: Position; x: number; y: number }

const GK: SlotDef = { role: 'GK', x: 0.5, y: 0.04 };
const BACK4: SlotDef[] = [
  { role: 'FB', x: 0.12, y: 0.25 }, { role: 'CB', x: 0.37, y: 0.19 },
  { role: 'CB', x: 0.63, y: 0.19 }, { role: 'FB', x: 0.88, y: 0.25 },
];

export const SLOTS: Record<Formation, SlotDef[]> = {
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

/** Map players onto formation slots (exact role → compatible → any). Returns one slot per player. */
export function assignSlots(players: readonly MomentPlayerSpec[], formation: Formation): SlotDef[] {
  const slots = SLOTS[formation] ?? SLOTS['4-4-2'];
  const taken = slots.map(() => false);
  const out: (SlotDef | null)[] = players.map(() => null);
  const tryPass = (match: (p: MomentPlayerSpec, s: SlotDef) => boolean) => {
    players.forEach((p, i) => {
      if (out[i]) return;
      const idx = slots.findIndex((s, k) => !taken[k] && match(p, s));
      if (idx >= 0) { taken[idx] = true; out[i] = slots[idx]; }
    });
  };
  tryPass((p, s) => p.role === s.role);
  tryPass((p, s) => COMPAT[p.role]?.includes(s.role) ?? false);
  tryPass((p, s) => (p.role === 'GK') === (s.role === 'GK'));
  // more players than slots (never in a real match): stack extras in midfield
  return out.map((s, i) => s ?? { role: players[i].role, x: 0.2 + 0.6 * ((i * 0.37) % 1), y: 0.5 });
}

export interface ShapeCtx {
  /** +1 = attacks toward +x. */
  dir: 1 | -1;
  inPossession: boolean;
  /** Ball position in pitch coordinates. */
  ball: Vec2;
  style: TacticalStyle;
}

/** Back/front line positions (own frame: own goal at u = −52.5) for the current situation. */
export function shapeLines(c: ShapeCtx): { back: number; front: number; width: number; shift: number } {
  const bu = c.ball.x * c.dir;
  const deep = c.style === 'defensive' ? -5 : c.style === 'pressing' ? 5 : 0;
  if (c.inPossession) {
    const back = clamp(bu - 30, -40, 10);
    const front = clamp(bu + 12, back + 24, 40);
    return { back, front, width: 29, shift: 0.3 };
  }
  const back = clamp(bu - 19 + deep * 0.6, -45, -4);
  const front = clamp(back + 27 + deep, back + 16, bu + 4);
  return { back, front, width: 21, shift: 0.45 };
}

/** Formation home position for a slot in pitch coordinates. */
export function slotHome(slot: SlotDef, c: ShapeCtx): Vec2 {
  if (slot.role === 'GK') return { x: c.dir * -51.2, y: 0 };
  const L = shapeLines(c);
  const t = clamp((slot.y - 0.17) / (0.88 - 0.17), 0, 1.05);
  const u = L.back + (L.front - L.back) * t;
  const lateral = (0.5 - slot.x) * 2 * L.width * c.dir;
  const y = clamp(lateral + c.ball.y * L.shift, -32, 32);
  return { x: c.dir * u, y };
}
