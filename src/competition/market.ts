/**
 * The AI transfer market at season rollover: expiring contracts and renewals, loans
 * returning, big clubs buying the best talents, free-agent signings, youth intakes and
 * squad balancing (22–28 players, enough cover in every line). The user is never moved.
 */
import type { Club, Contract, Footballer, GameState, Position, SquadRole } from '../core/types';
import type { Rng } from '../core/rng';
import { ATTR_KEYS, POSITION_WEIGHTS, overall, overallFor, positionGroup, type PositionGroup } from '../core/ratings';
import { age, clamp, nextId } from '../core/util';
import { generateFootballer, generateYouthIntake, randomAppearance, randomName } from '../world/api';
import { valueOf, wageFor } from './development';

export const SQUAD_MIN = 22;
export const SQUAD_MAX = 28;
const LINE_MIN: Record<PositionGroup, number> = { GK: 2, DEF: 7, MID: 6, ATT: 4 };
const LINE_POSITIONS: Record<PositionGroup, Position[]> = {
  GK: ['GK'], DEF: ['CB', 'CB', 'FB', 'FB'], MID: ['CM', 'DM', 'CM', 'AM'], ATT: ['ST', 'W', 'ST', 'W'],
};

function attempt<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export interface MarketCtx {
  state: GameState;
  rng: Rng;
  season: number;
  userId: string | null;
  ovr: Map<string, number>;
  /** Lazily built nation → footballers index (name donors for the fallback generator). */
  byNation?: Map<string, Footballer[]>;
}

function compatriots(m: MarketCtx, nation: string): Footballer[] {
  if (!m.byNation) {
    m.byNation = new Map();
    for (const p of Object.values(m.state.world.players)) {
      const list = m.byNation.get(p.nation);
      if (list) list.push(p);
      else m.byNation.set(p.nation, [p]);
    }
  }
  return m.byNation.get(nation) ?? [];
}

export function ovrOf(m: MarketCtx, p: Footballer): number {
  let v = m.ovr.get(p.id);
  if (v === undefined) { v = overall(p); m.ovr.set(p.id, v); }
  return v;
}

const isProtected = (m: MarketCtx, p: Footballer) => p.id === m.userId || !!p.isUser || p.retired === true;

export function squadOf(m: MarketCtx, club: Club): Footballer[] {
  return club.squad.map((id) => m.state.world.players[id]).filter((p): p is Footballer => !!p && !p.retired);
}

/** Average overall of a club's best eleven (its "level"). */
export function clubLevel(m: MarketCtx, club: Club): number {
  const ovrs = squadOf(m, club).map((p) => ovrOf(m, p)).sort((a, b) => b - a).slice(0, 11);
  if (!ovrs.length) return Math.round(35 + club.reputation * 0.4);
  return ovrs.reduce((a, b) => a + b, 0) / ovrs.length;
}

function freeShirt(m: MarketCtx, club: Club, preferred: number, position: Position): number {
  const taken = new Set(squadOf(m, club).map((p) => p.shirtNumber));
  if (preferred > 0 && !taken.has(preferred)) return preferred;
  const order = position === 'GK' ? [1, 12, 13, 25, 31, 33] : [];
  for (const n of order) if (!taken.has(n)) return n;
  for (let n = 2; n <= 99; n++) if (!taken.has(n)) return n;
  return preferred;
}

function roleFor(m: MarketCtx, p: Footballer, club: Club): SquadRole {
  const level = clubLevel(m, club);
  const o = ovrOf(m, p);
  if (o >= level + 4) return 'star';
  if (o >= level - 2) return 'starter';
  if (age(p, m.season) <= 20 && o < level - 6) return 'prospect';
  return 'rotation';
}

function newContract(m: MarketCtx, p: Footballer, club: Club, years: number, role?: SquadRole): Contract {
  return {
    clubId: club.id,
    wage: wageFor(m.state, p, club.id),
    startSeason: m.season,
    endSeason: m.season + Math.max(1, years) - 1,
    releaseClause: null,
    role: role ?? roleFor(m, p, club),
    goalBonus: 0,
    appearanceBonus: 0,
  };
}

function contractYears(m: MarketCtx, p: Footballer): number {
  const a = age(p, m.season);
  if (a <= 23) return m.rng.int(3, 5);
  if (a <= 29) return m.rng.int(2, 4);
  if (a <= 32) return m.rng.int(1, 2);
  return 1;
}

export function releasePlayer(m: MarketCtx, p: Footballer): void {
  if (isProtected(m, p)) return;
  const club = p.clubId ? m.state.world.clubs[p.clubId] : undefined;
  if (club) club.squad = club.squad.filter((id) => id !== p.id);
  p.clubId = null;
  p.contract = null;
}

/** Move an AI footballer to a club (fee paid between the clubs). */
export function signPlayer(m: MarketCtx, p: Footballer, to: Club, fee: number): void {
  if (isProtected(m, p)) return;
  const from = p.clubId ? m.state.world.clubs[p.clubId] : undefined;
  if (from) {
    from.squad = from.squad.filter((id) => id !== p.id);
    from.budget = Math.round(from.budget + fee);
  }
  to.budget = Math.round(to.budget - fee);
  p.clubId = to.id;
  p.shirtNumber = freeShirt(m, to, p.shirtNumber, p.position);
  p.contract = newContract(m, p, to, contractYears(m, p));
  if (!to.squad.includes(p.id)) to.squad.push(p.id);
}

// ───────── contracts ─────────

/** Loans end, contracts expire: AI clubs renew the ones they still want, the rest become free agents. */
export function handleContracts(m: MarketCtx): void {
  const { state, season, rng } = m;
  const clubs = state.world.clubs;
  for (const p of Object.values(state.world.players)) {
    if (isProtected(m, p) || !p.clubId || !p.contract) continue;
    const loan = p.contract.loan;
    if (loan && loan.endSeason < season) {
      const parent = clubs[loan.parentClubId];
      const cur = clubs[p.clubId];
      if (cur) cur.squad = cur.squad.filter((id) => id !== p.id);
      if (parent) {
        p.clubId = parent.id;
        p.contract = { ...p.contract, clubId: parent.id };
        delete p.contract.loan;
        if (!parent.squad.includes(p.id)) parent.squad.push(p.id);
      } else {
        p.clubId = null;
        p.contract = null;
      }
    }
  }
  const levels = new Map<string, number>();
  for (const p of Object.values(state.world.players)) {
    if (isProtected(m, p) || !p.clubId || !p.contract || p.contract.endSeason >= season) continue;
    const club = clubs[p.clubId];
    if (!club) { p.clubId = null; p.contract = null; continue; }
    let level = levels.get(club.id);
    if (level === undefined) { level = clubLevel(m, club); levels.set(club.id, level); }
    const a = age(p, season);
    const o = ovrOf(m, p);
    let keep = o >= level - 3 ? 0.85 : o >= level - 8 ? 0.55 : 0.3;
    if (a >= 33) keep *= o >= level ? 0.6 : 0.35;
    else if (a <= 21 && p.potential >= level) keep = Math.max(keep, 0.8);
    if (rng.chance(keep)) {
      p.contract = newContract(m, p, club, contractYears(m, p), p.contract.role);
    } else {
      releasePlayer(m, p);
    }
  }
}

// ───────── generating players ─────────

/** Local generator used only when the world module cannot create a footballer. */
function fallbackFootballer(m: MarketCtx, id: string, nation: string, position: Position, a: number, quality: number, clubId: string | null): Footballer {
  const { rng } = m;
  const weights = POSITION_WEIGHTS[position];
  const attrs = {} as Footballer['attrs'];
  for (const k of ATTR_KEYS) {
    const base = weights[k] ? quality + rng.normal(1, 4) : quality - 10 + rng.normal(0, 8);
    attrs[k] = clamp(Math.round(base), 15, 95);
  }
  attrs.goalkeeping = position === 'GK' ? clamp(Math.round(quality + 6 + rng.normal(0, 3)), 20, 95) : rng.int(8, 18);
  const shift = quality - overallFor(attrs, position);
  for (const k of Object.keys(weights) as (keyof typeof attrs)[]) attrs[k] = clamp(attrs[k] + shift, 1, 99);
  // borrow names from compatriots so the fallback still looks plausible
  const name = attempt(() => randomName(rng, nation));
  const donors = compatriots(m, nation);
  const donor = donors.length ? rng.pick(donors) : undefined;
  const donor2 = donors.length ? rng.pick(donors) : undefined;
  const appearance = attempt(() => randomAppearance(rng, nation)) ?? {
    skin: rng.int(0, 5), hairStyle: rng.int(0, 7), hairColor: donor?.appearance.hairColor ?? '#2b1d14', beard: a >= 20 ? rng.int(0, 3) : 0,
    boots: rng.pick(['#ffffff', '#111111', '#ff3d00', '#00c2ff', '#ffd400']), height: rng.int(168, 194),
  };
  const potential = clamp(Math.round(quality + (a <= 18 ? rng.int(8, 26) : a <= 21 ? rng.int(4, 16) : rng.int(0, 6))), quality, 95);
  return {
    id, firstName: name?.first ?? donor?.firstName ?? 'Alex', lastName: name?.last ?? donor2?.lastName ?? 'Novak', nation,
    birthYear: m.season - a, position, foot: rng.chance(0.24) ? 'L' : 'R', weakFoot: rng.int(1, 4), attrs, potential, clubId,
    shirtNumber: rng.int(2, 45), contract: null, form: 50, fitness: 92, morale: 60, injury: null, value: 0, appearance, traits: [],
    season: emptyLine(), career: emptyLine(), intlCaps: 0, intlGoals: 0,
  };
}

const emptyLine = () => ({ apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, ratingSum: 0, motm: 0, yellow: 0, red: 0, cleanSheets: 0 });

export function freshId(m: MarketCtx, prefix: string): string {
  let id = nextId(m.state, prefix);
  while (m.state.world.players[id]) id = nextId(m.state, prefix);
  return id;
}

/** A brand-new footballer (world generator first, local fallback otherwise). */
export function createFootballer(m: MarketCtx, nation: string, position: Position, a: number, quality: number, clubId: string | null): Footballer {
  const id = freshId(m, 'GP');
  const q = clamp(Math.round(quality), 30, 92);
  const p = attempt(() => generateFootballer(m.rng, { id, nation, position, age: a, season: m.season, quality: q, clubId }))
    ?? fallbackFootballer(m, id, nation, position, a, q, clubId);
  p.id = id;
  p.clubId = clubId;
  m.state.world.players[id] = p;
  return p;
}

/** Academy graduates for every club. */
export function youthIntakes(m: MarketCtx): void {
  const { state, rng, season } = m;
  for (const club of Object.values(state.world.clubs)) {
    const makeId = () => freshId(m, 'YP');
    let kids = attempt(() => generateYouthIntake(rng, state.world, club, season, makeId));
    if (!kids) {
      const foreign = [...new Set(squadOf(m, club).map((p) => p.nation))];
      const n = rng.int(2, club.youth >= 70 ? 4 : 3);
      const base = 38 + club.youth * 0.18 + club.reputation * 0.08;
      kids = [];
      for (let i = 0; i < n; i++) {
        const pos = rng.pick<Position>(['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST', 'ST', 'CM', 'W', 'CB']);
        const nation = rng.chance(0.82) || !foreign.length ? club.country : rng.pick(foreign);
        const a = rng.int(16, 18);
        const id = makeId();
        const kid = fallbackFootballer(m, id, nation, pos, a, base + rng.normal(0, 4), club.id);
        kid.potential = clamp(Math.round(kid.potential + club.youth * 0.08), 40, 96);
        kids.push(kid);
      }
    }
    for (const kid of kids) {
      if (!kid?.id) continue;
      if (state.world.players[kid.id] && state.world.players[kid.id] !== kid) kid.id = freshId(m, 'YP');
      kid.clubId = club.id;
      state.world.players[kid.id] = kid;
      kid.shirtNumber = freeShirt(m, club, kid.shirtNumber, kid.position);
      if (!kid.contract || kid.contract.clubId !== club.id) kid.contract = newContract(m, kid, club, 3, 'prospect');
      if (!club.squad.includes(kid.id)) club.squad.push(kid.id);
    }
  }
}

// ───────── transfers ─────────

interface Target { p: Footballer; o: number; score: number }

/** Big clubs buy the best talents from smaller clubs. */
export function aiTransfers(m: MarketCtx): number {
  const { state, rng, season } = m;
  const clubs = Object.values(state.world.clubs).sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id));
  const repOf = (id: string | null) => (id ? state.world.clubs[id]?.reputation ?? 0 : 0);
  const external = state.world.externalClubs;
  const targets: Target[] = [];
  for (const p of Object.values(state.world.players)) {
    if (isProtected(m, p) || !p.clubId || external[p.id] || p.contract?.loan) continue;
    const a = age(p, season);
    if (a > 31 || (p.injury && p.injury.severity === 3)) continue;
    const o = ovrOf(m, p);
    const score = o + (a <= 21 ? Math.max(0, p.potential - o) * 0.45 : 0) - Math.max(0, a - 28) * 1.5;
    targets.push({ p, o, score });
  }
  targets.sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));
  const moved = new Set<string>();
  const sold = new Map<string, number>();
  let count = 0;
  const buyers = clubs.slice(0, Math.ceil(clubs.length * 0.6));
  for (const club of buyers) {
    const wants = rng.weighted([0, 1, 2, 3], (k) => (club.reputation >= 80 ? [0.15, 0.4, 0.3, 0.15] : club.reputation >= 65 ? [0.3, 0.45, 0.2, 0.05] : [0.5, 0.4, 0.1, 0])[k]);
    let level = clubLevel(m, club);
    let bought = 0;
    let scanned = 0;
    for (const t of targets) {
      if (bought >= wants || scanned > 450) break;
      if (t.score < level - 4) break;
      scanned++;
      const p = t.p;
      if (moved.has(p.id) || p.clubId === club.id) continue;
      const fromRep = repOf(p.clubId);
      if (fromRep >= club.reputation - 2) continue;
      const a = age(p, season);
      const fits = t.o >= level + 0.5 || (a <= 21 && p.potential >= level + 6 && t.o >= level - 8);
      if (!fits) continue;
      const from = p.clubId ? state.world.clubs[p.clubId] : undefined;
      if (from && from.squad.length - (sold.get(from.id) ?? 0) <= SQUAD_MIN - 2) continue;
      const fee = Math.round((valueOf(p, season) * rng.float(1.05, 1.4)) / 50_000) * 50_000;
      if (fee > club.budget * 0.6) continue;
      if (!rng.chance(0.55)) continue; // not every chase ends in a signature
      signPlayer(m, p, club, fee);
      moved.add(p.id);
      if (from) sold.set(from.id, (sold.get(from.id) ?? 0) + 1);
      bought++;
      count++;
      level = clubLevel(m, club);
    }
  }
  return count;
}

function lineCounts(m: MarketCtx, club: Club): Record<PositionGroup, number> {
  const c: Record<PositionGroup, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const p of squadOf(m, club)) c[positionGroup(p.position)]++;
  return c;
}

/** Free agents worth signing, per line, best first. */
function freeAgentPool(m: MarketCtx): Record<PositionGroup, Footballer[]> {
  const pool: Record<PositionGroup, Footballer[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of Object.values(m.state.world.players)) {
    if (p.clubId || p.retired || isProtected(m, p) || m.state.world.externalClubs[p.id]) continue;
    pool[positionGroup(p.position)].push(p);
  }
  for (const k of Object.keys(pool) as PositionGroup[]) pool[k].sort((a, b) => ovrOf(m, b) - ovrOf(m, a) || a.id.localeCompare(b.id));
  return pool;
}

/** Keep every squad between 22 and 28 players with enough cover in each line. */
export function balanceSquads(m: MarketCtx): void {
  const { state, rng, season } = m;
  const clubs = Object.values(state.world.clubs).sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id));

  // 1) trim bloated squads: old and weak players go first, never below a line minimum
  for (const club of clubs) {
    let squad = squadOf(m, club);
    if (squad.length <= SQUAD_MAX) continue;
    const counts = lineCounts(m, club);
    const expendable = squad
      .filter((p) => !isProtected(m, p))
      .map((p) => ({ p, keep: ovrOf(m, p) + (age(p, season) <= 21 ? Math.max(0, p.potential - ovrOf(m, p)) * 0.5 : 0) - Math.max(0, age(p, season) - 29) * 2 }))
      .sort((a, b) => a.keep - b.keep);
    for (const { p } of expendable) {
      if (squad.length <= SQUAD_MAX) break;
      const g = positionGroup(p.position);
      if (counts[g] <= LINE_MIN[g] + 1) continue;
      releasePlayer(m, p);
      counts[g]--;
      squad = squad.filter((x) => x !== p);
    }
  }

  // 2) fill the gaps: free agents first, otherwise a newly discovered player
  const pool = freeAgentPool(m);
  for (const club of clubs) {
    const level = clubLevel(m, club);
    for (let guard = 0; guard < 12; guard++) {
      const counts = lineCounts(m, club);
      const size = counts.GK + counts.DEF + counts.MID + counts.ATT;
      const needLine = (Object.keys(LINE_MIN) as PositionGroup[]).find((g) => counts[g] < LINE_MIN[g]);
      if (!needLine && size >= SQUAD_MIN) break;
      const line: PositionGroup = needLine ?? (['DEF', 'MID', 'ATT', 'MID', 'DEF'] as PositionGroup[])[size % 5];
      const candidates = pool[line];
      const idx = candidates.findIndex((p) => !p.clubId && ovrOf(m, p) <= level + 3 && ovrOf(m, p) >= level - 14 && age(p, season) <= 33);
      if (idx >= 0) {
        const p = candidates.splice(idx, 1)[0];
        signPlayer(m, p, club, 0);
        continue;
      }
      const pos = rng.pick(LINE_POSITIONS[line]);
      const nation = rng.chance(0.75) ? club.country : (squadOf(m, club).length ? rng.pick(squadOf(m, club)).nation : club.country);
      const p = createFootballer(m, nation, pos, rng.int(19, 29), level - 6 + rng.normal(0, 3), null);
      signPlayer(m, p, club, 0);
    }
  }
}

/** Squad roles follow the pecking order after the summer's movements. */
export function refreshRoles(m: MarketCtx): void {
  for (const club of Object.values(m.state.world.clubs)) {
    for (const p of squadOf(m, club)) {
      if (isProtected(m, p) || !p.contract || p.contract.clubId !== club.id) continue;
      p.contract.role = roleFor(m, p, club);
    }
  }
}

/** Repair squad lists ↔ footballer.clubId so both always agree. */
export function syncSquads(state: GameState): void {
  const players = state.world.players;
  for (const club of Object.values(state.world.clubs)) {
    const seen = new Set<string>();
    club.squad = club.squad.filter((id) => {
      const p = players[id];
      if (!p || p.retired || p.clubId !== club.id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  for (const p of Object.values(players)) {
    if (!p.clubId || p.retired) continue;
    const club = state.world.clubs[p.clubId];
    if (!club) { if (!p.isUser) { p.clubId = null; p.contract = null; } continue; }
    if (!club.squad.includes(p.id)) club.squad.push(p.id);
  }
}
