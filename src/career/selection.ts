/**
 * Team selection: would the manager start, bench or leave out the user? Also decides
 * whether the user takes free kicks, penalties and corners.
 */
import type { Fixture, Footballer, Formation, GameState, Manager, NationalTeam, Position, UserMatchRole } from '../core/types';
import { age as ageOf, clamp } from '../core/util';
import { overall } from '../core/ratings';
import {
  FORMATION_SLOTS, fixtureImportance, hasTrait, hash01, playersOf, slotTarget, userPlayer,
} from './helpers';

interface SelCtx {
  fixtureId: string;
  manager: Manager | null;
  big: boolean;
  cupRotation: boolean;
  season: number;
}

const ROLE_BONUS = { star: 8, starter: 5, rotation: 1, prospect: -1 } as const;

function formWeight(m: Manager | null): number {
  switch (m?.temperament) {
    case 'demanding': return 0.3;
    case 'pragmatic': return 0.12;
    default: return 0.2;
  }
}

/** Score for an AI squad member (deterministic per fixture: a little rotation noise). */
function aiScore(p: Footballer, ctx: SelCtx): number {
  let s = overall(p) + (p.form - 50) * formWeight(ctx.manager) + (p.fitness - 85) * 0.1;
  s += (hash01(`${ctx.fixtureId}:${p.id}`) - 0.5) * 3;
  if (ctx.cupRotation) {
    const a = ageOf(p, ctx.season);
    if (a <= 21) s += 3;
    else if (a >= 30) s -= 2;
  }
  return s;
}

function userScore(state: GameState, p: Footballer, ctx: SelCtx): number {
  const c = state.career;
  const m = ctx.manager;
  const a = ageOf(p, state.season);
  let s = overall(p) + (p.form - 50) * formWeight(m) + (p.fitness - 85) * 0.1;
  const relW = m?.temperament === 'fiery' ? 0.15 : m?.temperament === 'pragmatic' ? 0.05 : 0.1;
  s += (c.relationships.manager - 50) * relW;
  if (p.contract && p.contract.clubId === p.clubId) s += ROLE_BONUS[p.contract.role];
  if (a <= 21) s += ((m?.trustsYouth ?? 50) - 50) / 8;
  if (m?.temperament === 'mentor' && a <= 23) s += 2;
  if (hasTrait(p, 'hothead') && (m?.temperament === 'demanding' || m?.temperament === 'fiery')) s -= 1.5;
  if (hasTrait(p, 'leader')) s += 1;
  if (ctx.big && hasTrait(p, 'big_game')) s += 2;
  if (c.energy < 20) s -= 6;
  else if (c.energy < 35) s -= 2;
  if (ctx.cupRotation && a <= 21) s += 3;
  s += (hash01(`${ctx.fixtureId}:${p.id}`) - 0.5) * 3;
  return s;
}

/** Best XI ids per position for the formation (user included only when `userIn`). */
function probableXI(state: GameState, squad: Footballer[], formation: Formation, user: Footballer, userIn: boolean, ctx: SelCtx): Footballer[] {
  const slots = FORMATION_SLOTS[formation] ?? FORMATION_SLOTS['4-3-3'];
  const used = new Set<string>();
  const xi: Footballer[] = [];
  if (userIn) { xi.push(user); used.add(user.id); }
  const userTarget = slotTarget(formation, user.position).target;
  for (const [pos, nRaw] of Object.entries(slots) as [Position, number][]) {
    let n = nRaw;
    if (userIn && pos === userTarget) n -= 1;
    const pool = squad
      .filter((p) => !used.has(p.id) && p.id !== user.id && !p.injury && p.position === pos)
      .sort((a, b) => aiScore(b, ctx) - aiScore(a, ctx));
    for (const p of pool.slice(0, Math.max(0, n))) { xi.push(p); used.add(p.id); }
  }
  return xi;
}

/** Decide set-piece duties for the user among the probable XI. */
function refreshSetPieces(state: GameState, xi: Footballer[], user: Footballer, starting: boolean): void {
  const c = state.career;
  if (!starting) {
    c.setPieces = { freeKicks: false, penalties: false, corners: false };
    return;
  }
  const others = xi.filter((p) => p.id !== user.id && p.position !== 'GK');
  const relBonus = c.relationships.manager >= 80 ? 4 : c.relationships.manager >= 65 ? 1.5 : 0;
  const spec = hasTrait(user, 'set_piece_specialist') ? 5 : 0;
  const best = (f: (p: Footballer) => number) => others.reduce((m, p) => Math.max(m, f(p)), 0);

  const fk = (p: Footballer) => p.attrs.curl * 0.6 + p.attrs.shooting * 0.4;
  const pen = (p: Footballer) => p.attrs.shooting * 0.5 + p.attrs.composure * 0.5;
  const cor = (p: Footballer) => p.attrs.curl * 0.5 + p.attrs.passing * 0.5;
  const inBox = user.position === 'ST' || user.position === 'CB';

  c.setPieces = {
    freeKicks: fk(user) + spec + relBonus >= best(fk),
    penalties: pen(user) + relBonus + (hasTrait(user, 'clinical') ? 3 : 0) + (hasTrait(user, 'calm') ? 2 : 0) >= best(pen),
    corners: cor(user) + spec + relBonus - (inBox ? 8 : 0) >= best(cor),
  };
}

function nationalSelection(state: GameState, fixture: Fixture, nt: NationalTeam, user: Footballer): UserMatchRole {
  const c = state.career;
  if (!c.calledUp || !nt.squad.includes(user.id) || user.injury) {
    c.setPieces = { freeKicks: false, penalties: false, corners: false };
    return 'none';
  }
  const ctx: SelCtx = { fixtureId: fixture.id, manager: null, big: true, cupRotation: false, season: state.season };
  const squad = playersOf(state, nt.squad);
  const { target, slots } = slotTarget('4-3-3', user.position);
  const uScore = overall(user) + (user.form - 50) * 0.2 + c.fame / 25 + (hasTrait(user, 'big_game') ? 2 : 0);
  const better = squad
    .filter((p) => p.id !== user.id && !p.injury && (p.position === target || p.position === user.position))
    .filter((p) => aiScore(p, ctx) > uScore).length;
  const starting = better < slots;
  refreshSetPieces(state, probableXI(state, squad, '4-3-3', user, starting, ctx), user, starting);
  return starting ? 'starter' : 'bench';
}

export function selectionFor(state: GameState, fixture: Fixture): UserMatchRole {
  const c = state.career;
  const user = userPlayer(state);
  if (c.retired || user.retired) return 'none';

  const ntHome = state.world.nationalTeams[fixture.homeId];
  const ntAway = state.world.nationalTeams[fixture.awayId];
  if (ntHome || ntAway) {
    const mine = [ntHome, ntAway].find((nt) => nt && nt.nation === user.nation);
    return mine ? nationalSelection(state, fixture, mine, user) : 'none';
  }

  const club = user.clubId ? state.world.clubs[user.clubId] : undefined;
  if (!club || (fixture.homeId !== club.id && fixture.awayId !== club.id) || user.injury) {
    c.setPieces = { freeKicks: false, penalties: false, corners: false };
    return 'none';
  }

  const comp = state.competitions[fixture.compId];
  const ctx: SelCtx = {
    fixtureId: fixture.id,
    manager: state.world.managers[club.managerId] ?? null,
    big: fixtureImportance(state, fixture, club.id) >= 0.8,
    cupRotation: comp?.kind === 'cup' && fixture.round <= 2 && !/final/i.test(fixture.roundName ?? ''),
    season: state.season,
  };
  const squad = playersOf(state, club.squad).filter((p) => p.id !== user.id);
  const { target, slots } = slotTarget(club.formation, user.position);
  const uScore = userScore(state, user, ctx);
  const rivals = squad
    .filter((p) => !p.injury && (p.position === target || p.position === user.position))
    .map((p) => aiScore(p, ctx))
    .sort((a, b) => b - a);
  const better = rivals.filter((s) => s > uScore).length;

  let role: UserMatchRole;
  if (better < slots) role = 'starter';
  else {
    const lastStarter = rivals[slots - 1] ?? -Infinity;
    const benchRoom = slots >= 2 ? 2 : 1;
    role = better < slots + benchRoom || uScore >= lastStarter - 4 ? 'bench' : 'none';
  }
  if (role === 'none' && ctx.cupRotation && ageOf(user, state.season) <= 21) role = 'bench';

  refreshSetPieces(state, probableXI(state, squad, club.formation, user, role === 'starter', ctx), user, role === 'starter');
  return role;
}

/** Rough squad standing for UI / offers: 0 = first choice at the position. */
export function squadStanding(state: GameState, clubId: string, p: Footballer): { better: number; slots: number } {
  const club = state.world.clubs[clubId];
  if (!club) return { better: 0, slots: 1 };
  const { target, slots } = slotTarget(club.formation, p.position);
  const o = overall(p);
  const better = playersOf(state, club.squad)
    .filter((x) => x.id !== p.id && (x.position === target || x.position === p.position))
    .filter((x) => overall(x) > o).length;
  return { better, slots: clamp(slots, 1, 4) };
}
