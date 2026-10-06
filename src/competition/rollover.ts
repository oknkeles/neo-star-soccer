/**
 * Season rollover: the world lives on. Promotion/relegation, reputations and budgets,
 * manager merry-go-round, AI development/ageing/retirement, contracts, youth intakes,
 * transfers, national squads and the next season's competitions.
 */
import type { Club, Competition, Footballer, Formation, GameState, Manager, ManagerTemperament, Position, TacticalStyle } from '../core/types';
import type { Rng } from '../core/rng';
import { positionGroup, type PositionGroup } from '../core/ratings';
import { age, clamp, nextId } from '../core/util';
import { generateManager } from '../world/api';
import { createSeasonCompetitions } from './create';
import { developPlayer, retirementChance, valueOf } from './development';
import { compFormat } from './formats';
import { compsOfSeason, ct } from './helpers';
import { knockoutReach } from './knockout';
import {
  aiTransfers, balanceSquads, createFootballer, handleContracts, ovrOf, refreshRoles, syncSquads, youthIntakes, type MarketCtx,
} from './market';
import { endOfSeason } from './season';
import { sortedTable } from './tables';

const emptyLine = () => ({ apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, ratingSum: 0, motm: 0, yellow: 0, red: 0, cleanSheets: 0 });

/** −1..1: how far above (+) or below (−) expectations (reputation order) each club finished its league. */
function clubPerformance(state: GameState, comps: Competition[]): Map<string, number> {
  const perf = new Map<string, number>();
  for (const c of comps) {
    if (c.kind !== 'league') continue;
    const table = sortedTable(c);
    const expected = table
      .map((r) => r.teamId)
      .sort((a, b) => (state.world.clubs[b]?.reputation ?? 0) - (state.world.clubs[a]?.reputation ?? 0) || a.localeCompare(b));
    const n = Math.max(1, table.length - 1);
    table.forEach((r, actual) => perf.set(r.teamId, (expected.indexOf(r.teamId) - actual) / n));
  }
  return perf;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Reputation follows results; budgets drift toward what the new reputation can sustain. */
function reputationAndBudgets(state: GameState, comps: Competition[], perf: Map<string, number>, promoted: string[], relegated: string[]): void {
  const clubs = Object.values(state.world.clubs);
  const k = median(clubs.map((c) => Math.max(0, c.budget) / Math.exp(0.06 * c.reputation)).filter((v) => v > 0)) || 20_000;
  const bonus = new Map<string, number>();
  const add = (id: string, v: number) => bonus.set(id, (bonus.get(id) ?? 0) + v);
  for (const c of comps) {
    if (c.kind === 'league' && c.winnerId) add(c.winnerId, c.tier === 1 ? 2 : 1);
    if (c.kind === 'cup' && c.winnerId) add(c.winnerId, 1.5);
    if (c.kind === 'continental') {
      const reach = knockoutReach(c);
      const rounds = compFormat(c)?.koWeeks.length ?? 4;
      for (const [id, r] of Object.entries(reach)) add(id, r === 0 ? -0.5 : r > rounds ? 4 : r === rounds ? 2.5 : r >= rounds - 1 ? 1.5 : 0.5);
    }
  }
  for (const id of promoted) add(id, 3);
  for (const id of relegated) add(id, -4);
  for (const club of clubs) {
    const lg = state.world.leagues.find((l) => l.country === club.country && l.tier === club.tier);
    const oldRep = club.reputation;
    let rep = oldRep + (perf.get(club.id) ?? 0) * 7 + (bonus.get(club.id) ?? 0);
    if (lg) rep += (lg.strength - rep) * 0.04;
    club.reputation = Math.round(clamp(rep, 10, 99));
    const target = k * Math.exp(0.06 * club.reputation);
    club.budget = Math.max(0, Math.round((club.budget * 0.7 + target * 0.3) / 10_000) * 10_000);
    club.wageBudget = Math.max(5_000, Math.round((club.wageBudget * Math.pow(club.reputation / Math.max(1, oldRep), 1.2)) / 100) * 100);
  }
}

function applyPromotions(state: GameState, promoted: string[], relegated: string[]): void {
  for (const id of promoted) { const c = state.world.clubs[id]; if (c) c.tier = 1; }
  for (const id of relegated) { const c = state.world.clubs[id]; if (c) c.tier = 2; }
}

// ───────── managers ─────────

const STYLE_FORMATIONS: Record<TacticalStyle, Formation[]> = {
  possession: ['4-3-3', '4-2-3-1'], pressing: ['4-2-3-1', '4-3-3'], counter: ['4-4-2', '4-2-3-1', '4-1-4-1'],
  direct: ['4-4-2', '3-5-2'], defensive: ['5-3-2', '4-1-4-1'], balanced: ['4-4-2', '4-2-3-1', '4-3-3'],
};
const STYLES: TacticalStyle[] = ['possession', 'counter', 'direct', 'pressing', 'balanced', 'defensive'];
const TEMPERAMENTS: ManagerTemperament[] = ['calm', 'fiery', 'demanding', 'mentor', 'pragmatic'];

function newManager(state: GameState, rng: Rng, club: Club, season: number, reputation: number): Manager {
  let id = nextId(state, 'MG');
  while (state.world.managers[id]) id = nextId(state, 'MG');
  let m: Manager | null = null;
  try {
    m = generateManager(rng, id, club.country, season, reputation);
  } catch {
    m = null;
  }
  if (!m) {
    const names = Object.values(state.world.players).filter((p) => p.nation === club.country).slice(0, 300);
    const a = names.length ? rng.pick(names) : undefined;
    const b = names.length ? rng.pick(names) : undefined;
    m = {
      id, firstName: a?.firstName ?? 'Marco', lastName: b?.lastName ?? 'Rossi', nation: club.country, birthYear: season - rng.int(38, 62),
      style: rng.pick(STYLES), temperament: rng.pick(TEMPERAMENTS), trustsYouth: rng.int(20, 90), reputation, clubId: null,
    };
  }
  m.id = id;
  state.world.managers[id] = m;
  return m;
}

/** Underperformers sack their managers; free managers (or new faces) take over. */
function managerChanges(state: GameState, rng: Rng, perf: Map<string, number>, relegated: Set<string>, season: number): void {
  const managers = state.world.managers;
  const clubs = Object.values(state.world.clubs).sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id));
  const free = () => Object.values(managers).filter((m) => !m.clubId && season - m.birthYear <= 68);
  for (const club of clubs) {
    const current = managers[club.managerId];
    const p = perf.get(club.id) ?? 0;
    if (current && p > 0.2) current.reputation = Math.min(99, current.reputation + 2);
    if (current && p < -0.2) current.reputation = Math.max(1, current.reputation - 1);
    let sack = p < -0.3 ? 0.55 : p < -0.15 ? 0.25 : 0.04;
    if (relegated.has(club.id)) sack = Math.max(sack, 0.7);
    if (current && current.clubId === club.id && !rng.chance(sack)) continue;
    if (current) {
      current.clubId = null;
      current.reputation = Math.max(1, current.reputation - 4);
    }
    const options = free()
      .filter((m) => m.id !== current?.id && m.reputation >= club.reputation - 18 && m.reputation <= club.reputation + 6)
      .sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id));
    const hire = options.length ? options[Math.min(options.length - 1, rng.int(0, 2))] : newManager(state, rng, club, season, clamp(club.reputation + rng.int(-10, 4), 20, 95));
    hire.clubId = club.id;
    club.managerId = hire.id;
    // a new manager brings his ideas
    club.style = hire.style;
    const shapes = STYLE_FORMATIONS[hire.style] ?? STYLE_FORMATIONS.balanced;
    if (!shapes.includes(club.formation)) club.formation = rng.pick(shapes);
  }
}

// ───────── players ─────────

function retire(state: GameState, p: Footballer): void {
  const club = p.clubId ? state.world.clubs[p.clubId] : undefined;
  if (club) club.squad = club.squad.filter((id) => id !== p.id);
  p.retired = true;
  p.clubId = null;
  p.contract = null;
  p.injury = null;
}

/** AI development, ageing and retirements (the user's own ageing belongs to the career module). */
function evolvePlayers(state: GameState, rng: Rng, season: number, userId: string | null): Set<string> {
  const retired = new Set<string>();
  for (const p of Object.values(state.world.players)) {
    if (p.retired || p.isUser || p.id === userId) continue;
    const share = p.season.minutes / 3000;
    developPlayer(p, rng, season, share);
    const free = !p.clubId && !state.world.externalClubs[p.id];
    if (rng.chance(retirementChance(p, season, free))) {
      retire(state, p);
      retired.add(p.id);
    }
  }
  if (retired.size) {
    for (const nt of Object.values(state.world.nationalTeams)) nt.squad = nt.squad.filter((id) => !retired.has(id));
  }
  return retired;
}

const NT_QUOTA: Record<PositionGroup, number> = { GK: 3, DEF: 8, MID: 8, ATT: 7 };
const NT_POSITIONS: Record<PositionGroup, Position[]> = { GK: ['GK'], DEF: ['CB', 'FB', 'CB'], MID: ['CM', 'DM', 'AM'], ATT: ['ST', 'W'] };

/** Fresh national squads: the nation's best footballers anywhere, topped up with players abroad. */
function refreshNationalTeams(m: MarketCtx): void {
  const { state, rng, season, userId } = m;
  const players = state.world.players;
  const external = state.world.externalClubs;
  const byNation = new Map<string, Footballer[]>();
  for (const p of Object.values(players)) {
    if (p.retired || p.isUser || p.id === userId) continue;
    if (!p.clubId && !external[p.id]) continue;
    const list = byNation.get(p.nation);
    if (list) list.push(p);
    else byNation.set(p.nation, [p]);
  }
  for (const nt of Object.values(state.world.nationalTeams)) {
    const userIn = !!userId && nt.squad.includes(userId);
    const labels = nt.squad.map((id) => external[id]).filter((l): l is string => !!l);
    const pool = (byNation.get(nt.nation) ?? []).slice().sort((a, b) => ovrOf(m, b) - ovrOf(m, a) || a.id.localeCompare(b.id));
    const picked: Footballer[] = [];
    const counts: Record<PositionGroup, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    for (const p of pool) {
      const g = positionGroup(p.position);
      if (counts[g] >= NT_QUOTA[g]) continue;
      picked.push(p);
      counts[g]++;
    }
    const level = picked.length ? picked.slice(0, 11).reduce((a, p) => a + ovrOf(m, p), 0) / Math.min(11, picked.length) : 45 + nt.reputation * 0.35;
    // small football nations: new faces from abroad keep the squad complete
    for (const g of Object.keys(NT_QUOTA) as PositionGroup[]) {
      const min = g === 'GK' ? 2 : g === 'ATT' ? 4 : 6;
      while (counts[g] < min) {
        const p = createFootballer(m, nt.nation, rng.pick(NT_POSITIONS[g]), rng.int(20, 30), level - 4 + rng.normal(0, 3), null);
        p.value = valueOf(p, season);
        external[p.id] = labels.length ? rng.pick(labels) : ct(state, 'abroadClub');
        picked.push(p);
        counts[g]++;
      }
    }
    nt.squad = picked.map((p) => p.id);
    if (userIn && userId) nt.squad.push(userId);
  }
}

/** Long-retired footballers nobody refers to any more are removed to keep saves small. */
function pruneRetired(state: GameState, season: number): void {
  const refs = new Set<string>();
  const c = state.career;
  if (c) {
    refs.add(c.playerId);
    refs.add(c.rivalId);
    if (c.mentorId) refs.add(c.mentorId);
    for (const a of c.awards) if (a.playerId) refs.add(a.playerId);
  }
  for (const s of state.seasons) for (const a of s.awards) if (a.playerId) refs.add(a.playerId);
  for (const st of state.storylines ?? []) for (const v of Object.values(st.data)) if (typeof v === 'string') refs.add(v);
  for (const v of Object.values(state.flags)) if (typeof v === 'string') refs.add(v);
  for (const p of Object.values(state.world.players)) {
    if (!p.retired || p.isUser || refs.has(p.id) || age(p, season) < 42) continue;
    delete state.world.players[p.id];
    delete state.world.externalClubs[p.id];
  }
}

export function startNewSeason(state: GameState, rng: Rng): void {
  const oldSeason = state.season;
  const summary = state.seasons.find((s) => s.season === oldSeason) ?? endOfSeason(state, rng);
  const oldComps = compsOfSeason(state, oldSeason);
  const userId = state.career?.playerId ?? null;

  // clubs: results → reputation, money, divisions and dugouts
  const perf = clubPerformance(state, oldComps);
  reputationAndBudgets(state, oldComps, perf, summary.promoted, summary.relegated);
  applyPromotions(state, summary.promoted, summary.relegated);
  const season = oldSeason + 1;
  managerChanges(state, rng, perf, new Set(summary.relegated), season);

  state.season = season;
  state.week = 0;

  // footballers: a year older
  evolvePlayers(state, rng, season, userId);
  const m: MarketCtx = { state, rng, season, userId, ovr: new Map() };
  handleContracts(m);
  youthIntakes(m);
  aiTransfers(m);
  balanceSquads(m);
  syncSquads(state);
  refreshRoles(m);

  for (const p of Object.values(state.world.players)) {
    p.season = emptyLine();
    if (p.retired || p.isUser || p.id === userId) continue;
    p.form = Math.round(50 + (p.form - 50) * 0.3);
    p.fitness = Math.max(p.fitness, 90);
    p.value = valueOf(p, season);
  }
  refreshNationalTeams(m);
  pruneRetired(state, season);

  // old competitions are still needed for the Champions Cup qualification table
  state.competitions = createSeasonCompetitions(state, rng);
}
