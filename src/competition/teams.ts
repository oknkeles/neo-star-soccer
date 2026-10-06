/**
 * Team info, formation-aware team selection (best XI + bench) and team strength.
 */
import type {
  Footballer, Formation, GameState, Kit, Position, TacticalStyle, TeamSheet, UserMatchRole,
} from '../core/types';
import { positionGroup } from '../core/ratings';
import { fastOverall as overallFor } from './fastovr';
import { clamp } from '../core/util';
import { hashNoise, hashStr, isNationalId, teamName, teamShort, userFootballer, userNationalTeamId } from './helpers';

/** Slot positions per formation, GK first then back → front. */
export const FORMATION_SLOTS: Record<Formation, Position[]> = {
  '4-4-2': ['GK', 'FB', 'CB', 'CB', 'FB', 'W', 'CM', 'CM', 'W', 'ST', 'ST'],
  '4-3-3': ['GK', 'FB', 'CB', 'CB', 'FB', 'CM', 'DM', 'CM', 'W', 'ST', 'W'],
  '4-2-3-1': ['GK', 'FB', 'CB', 'CB', 'FB', 'DM', 'CM', 'W', 'AM', 'W', 'ST'],
  '3-5-2': ['GK', 'CB', 'CB', 'CB', 'FB', 'CM', 'DM', 'CM', 'FB', 'ST', 'ST'],
  '5-3-2': ['GK', 'FB', 'CB', 'CB', 'CB', 'FB', 'CM', 'DM', 'CM', 'ST', 'ST'],
  '4-1-4-1': ['GK', 'FB', 'CB', 'CB', 'FB', 'DM', 'W', 'CM', 'CM', 'W', 'ST'],
};

/** Unfamiliarity penalty (overall points) for a natural position playing a slot. */
const FAMILIARITY: Record<Position, Record<Position, number>> = {
  GK: { GK: 0, CB: 40, FB: 40, DM: 40, CM: 40, AM: 40, W: 40, ST: 40 },
  CB: { GK: 40, CB: 0, FB: 5, DM: 6, CM: 12, AM: 18, W: 18, ST: 15 },
  FB: { GK: 40, CB: 6, FB: 0, DM: 9, CM: 10, AM: 14, W: 6, ST: 16 },
  DM: { GK: 40, CB: 6, FB: 10, DM: 0, CM: 3, AM: 8, W: 14, ST: 15 },
  CM: { GK: 40, CB: 12, FB: 10, DM: 3, CM: 0, AM: 4, W: 9, ST: 12 },
  AM: { GK: 40, CB: 16, FB: 13, DM: 9, CM: 4, AM: 0, W: 5, ST: 6 },
  W: { GK: 40, CB: 16, FB: 7, DM: 13, CM: 9, AM: 5, W: 0, ST: 6 },
  ST: { GK: 40, CB: 14, FB: 15, DM: 15, CM: 12, AM: 6, W: 6, ST: 0 },
};

export function slotRating(p: Footballer, slot: Position): number {
  return overallFor(p.attrs, slot) - FAMILIARITY[p.position][slot];
}

const NT_FORMATIONS: Formation[] = ['4-3-3', '4-2-3-1', '4-4-2', '3-5-2', '4-1-4-1', '4-2-3-1'];

export function nationalFormation(nation: string): Formation {
  return NT_FORMATIONS[hashStr(nation) % NT_FORMATIONS.length];
}

function nationalStyle(rep: number, nation: string): TacticalStyle {
  if (rep >= 82) return hashStr(nation) % 2 ? 'possession' : 'pressing';
  if (rep >= 70) return 'balanced';
  return hashStr(nation) % 2 ? 'counter' : 'defensive';
}

const DEFAULT_KIT: Kit = { primary: '#334155', secondary: '#f8fafc', style: 'plain' };

export function teamInfo(state: GameState, teamId: string): { name: string; shortName: string; kit: Kit; reputation: number; isNational: boolean } {
  const club = state.world.clubs[teamId];
  if (club) return { name: club.name, shortName: club.shortName, kit: club.kit, reputation: club.reputation, isNational: false };
  const nt = state.world.nationalTeams[teamId];
  if (nt) return { name: teamName(state, teamId), shortName: nt.nation, kit: nt.kit, reputation: nt.reputation, isNational: true };
  return { name: teamId, shortName: teamShort(state, teamId), kit: DEFAULT_KIT, reputation: 50, isNational: isNationalId(teamId) };
}

export interface SheetOptions {
  /** 0 = strongest XI, ~1.5 light midweek rotation, ~4 heavy cup rotation. */
  rotation?: number;
  /** Labels mixed into the deterministic rotation noise. */
  noiseKey?: string;
}

function available(p: Footballer | undefined): p is Footballer {
  return !!p && !p.retired && !(p.injury && p.injury.weeksLeft > 0);
}

function roleBonus(p: Footballer): number {
  switch (p.contract?.role) {
    case 'star': return 2;
    case 'starter': return 1;
    case 'prospect': return -1.5;
    default: return 0;
  }
}

/** Candidate pool + formation/style for a club or national team. */
function teamPool(state: GameState, teamId: string): { pool: Footballer[]; formation: Formation; style: TacticalStyle } {
  const players = state.world.players;
  const club = state.world.clubs[teamId];
  if (club) {
    const pool = club.squad.map((id) => players[id]).filter((p): p is Footballer => !!p && p.clubId === teamId);
    return { pool, formation: club.formation, style: club.style };
  }
  const nt = state.world.nationalTeams[teamId];
  if (nt) {
    const pool = nt.squad.map((id) => players[id]).filter((p): p is Footballer => !!p);
    return { pool, formation: nationalFormation(nt.nation), style: nationalStyle(nt.reputation, nt.nation) };
  }
  return { pool: [], formation: '4-4-2', style: 'balanced' };
}

/**
 * Pick XI + bench. `userRole` forces the user's footballer: 'starter' → XI, 'bench' → bench,
 * 'none' → left out. When undefined the user is picked on merit (national teams only while called up).
 */
export function buildSheetWith(state: GameState, teamId: string, userRole: UserMatchRole | undefined, opts: SheetOptions = {}): TeamSheet {
  const info = teamInfo(state, teamId);
  const { pool: rawPool, formation, style } = teamPool(state, teamId);
  const slots = FORMATION_SLOTS[formation] ?? FORMATION_SLOTS['4-4-2'];
  const user = userFootballer(state);
  const isNt = !!state.world.nationalTeams[teamId];
  let pool = rawPool.filter(available);

  // the user's presence in this pool
  let forcedUser: Footballer | null = null;
  let benchUser: Footballer | null = null;
  if (user) {
    const userBelongs = isNt ? userNationalTeamId(state) === teamId : user.clubId === teamId;
    pool = pool.filter((p) => p.id !== user.id);
    if (userBelongs && !user.retired) {
      if (userRole === 'starter') forcedUser = user;
      else if (userRole === 'bench') benchUser = user;
      else if (userRole === undefined && available(user)) pool.push(user);
    }
  }

  const rotation = opts.rotation ?? 0;
  const key = opts.noiseKey ?? `${state.season}-${state.week}`;
  const extra = new Map<string, number>();
  for (const p of pool) {
    let e = (p.form - 50) * 0.06 + roleBonus(p);
    if (p.fitness < 85) e += (p.fitness - 85) * 0.3;
    if (rotation > 0) e += hashNoise(p.id, key) * rotation;
    extra.set(p.id, e);
  }

  const xi: (string | null)[] = new Array(slots.length).fill(null);
  const used = new Set<string>();
  if (forcedUser) {
    // the slot the user fits best (natural position first)
    let best = -1;
    let bestScore = -Infinity;
    slots.forEach((s, i) => {
      if (s === 'GK') return;
      const sc = slotRating(forcedUser!, s);
      if (sc > bestScore) { bestScore = sc; best = i; }
    });
    if (best >= 0) { xi[best] = forcedUser.id; used.add(forcedUser.id); }
  }

  // greedy assignment: repeatedly take the best remaining (player, slot) pair
  const distinct = [...new Set(slots)];
  const slotKind = slots.map((sp) => distinct.indexOf(sp));
  const nPool = pool.length;
  const nSlots = slots.length;
  const rate = new Float64Array(nPool * distinct.length);
  for (let pi = 0; pi < nPool; pi++) {
    const p = pool[pi];
    const e = extra.get(p.id) ?? 0;
    for (let di = 0; di < distinct.length; di++) rate[pi * distinct.length + di] = slotRating(p, distinct[di]) + e;
  }
  const keys = new Float64Array(nPool * nSlots);
  let nKeys = 0;
  for (let pi = 0; pi < nPool; pi++) {
    for (let si = 0; si < nSlots; si++) {
      if (xi[si] !== null) continue;
      // score in the high digits, pair index in the low 16 bits → one numeric sort, deterministic ties
      keys[nKeys++] = Math.round((rate[pi * distinct.length + slotKind[si]] + 400) * 100) * 65536 + (pi * 32 + si);
    }
  }
  const sorted = keys.subarray(0, nKeys).sort();
  let filled = xi.filter((id) => id !== null).length;
  for (let k = nKeys - 1; k >= 0 && filled < nSlots; k--) {
    const code = sorted[k] % 65536;
    const si = code & 31;
    const p = pool[code >> 5];
    if (xi[si] !== null || used.has(p.id)) continue;
    xi[si] = p.id;
    used.add(p.id);
    filled++;
  }
  const xiIds = xi.filter((id): id is string => id !== null);

  // bench: a keeper, then a spread of outfield cover, best first
  const rest = pool.filter((p) => !used.has(p.id));
  const benchScore = (p: Footballer) => overallFor(p.attrs, p.position) + (extra.get(p.id) ?? 0);
  rest.sort((a, b) => benchScore(b) - benchScore(a));
  const bench: string[] = [];
  if (benchUser) bench.push(benchUser.id);
  const gk = rest.find((p) => p.position === 'GK');
  if (gk) bench.push(gk.id);
  for (const group of ['DEF', 'MID', 'ATT'] as const) {
    const p = rest.find((x) => positionGroup(x.position) === group && !bench.includes(x.id));
    if (p && bench.length < 7) bench.push(p.id);
  }
  for (const p of rest) {
    if (bench.length >= 7) break;
    if (!bench.includes(p.id) && p.position !== 'GK') bench.push(p.id);
  }

  return {
    teamId,
    name: info.name,
    shortName: info.shortName,
    kit: info.kit,
    formation,
    style,
    xi: xiIds,
    bench,
    strength: teamStrength(state, xiIds, formation, info.reputation),
  };
}

const ATT_W: Record<Position, number> = { GK: 0, CB: 0.05, FB: 0.25, DM: 0.15, CM: 0.4, AM: 0.85, W: 0.9, ST: 1 };
const MID_W: Record<Position, number> = { GK: 0, CB: 0.1, FB: 0.3, DM: 0.9, CM: 1, AM: 0.8, W: 0.4, ST: 0.15 };
const DEF_W: Record<Position, number> = { GK: 0.3, CB: 1, FB: 0.8, DM: 0.6, CM: 0.25, AM: 0.05, W: 0.05, ST: 0 };

/**
 * Line strengths from the XI (in slot order of `formation`). Missing players cost strength.
 * `fallbackRep` is used when there is no XI at all (e.g. an empty national squad).
 */
export function teamStrength(state: GameState, xi: string[], formation: Formation, fallbackRep = 55): TeamSheet['strength'] {
  const slots = FORMATION_SLOTS[formation] ?? FORMATION_SLOTS['4-4-2'];
  const players = state.world.players;
  let att = 0, attW = 0, mid = 0, midW = 0, def = 0, defW = 0, ovr = 0, n = 0;
  let gk = 0;
  for (let i = 0; i < Math.min(xi.length, slots.length); i++) {
    const p = players[xi[i]];
    if (!p) continue;
    const slot = slots[i];
    const r = overallFor(p.attrs, slot) - FAMILIARITY[p.position][slot] * 0.5;
    if (slot === 'GK') gk = r;
    att += r * ATT_W[slot]; attW += ATT_W[slot];
    mid += r * MID_W[slot]; midW += MID_W[slot];
    def += r * DEF_W[slot]; defW += DEF_W[slot];
    ovr += r; n++;
  }
  if (n === 0) {
    const base = clamp(fallbackRep * 0.85, 35, 90);
    return { att: base, mid: base, def: base, gk: base, overall: base };
  }
  const missing = Math.max(0, 11 - n) * 3;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const avgOvr = ovr / n;
  return {
    att: r1((attW ? att / attW : avgOvr) - missing),
    mid: r1((midW ? mid / midW : avgOvr) - missing),
    def: r1((defW ? def / defW : avgOvr) - missing),
    gk: r1((gk || avgOvr - 15) - (gk ? 0 : 5)),
    overall: r1(avgOvr - missing),
  };
}
