/**
 * Season awards: Golden Ball, league top scorers & MVPs, Young Player of the Year,
 * Teams of the Season, Champions Cup and summer tournament honours.
 */
import type { Award, CompPlayerStats, Competition, Footballer, GameState, Position } from '../core/types';
import { positionGroup } from '../core/ratings';
import { age } from '../core/util';
import { compFormat, isTournamentId } from './formats';
import { compsOfSeason, ct, fullPlayerName, teamName } from './helpers';
import { knockoutReach } from './knockout';
import { sortedTable } from './tables';

const GOAL_VALUE: Record<Position, number> = { GK: 2.5, CB: 1.7, FB: 1.6, DM: 1.45, CM: 1.3, AM: 1.05, W: 1, ST: 0.9 };
const CS_VALUE: Record<Position, number> = { GK: 0.75, CB: 0.45, FB: 0.35, DM: 0.15, CM: 0, AM: 0, W: 0, ST: 0 };

const avgOf = (ratingSum: number, apps: number) => (apps > 0 ? ratingSum / apps : 0);
const fmt2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

interface Line { apps: number; goals: number; assists: number; ratingSum: number; motm: number; cleanSheets?: number }

/** Individual performance score from a stat line (playing time matters through `share`). */
function performance(p: Footballer, s: Line, share: number): number {
  const avg = avgOf(s.ratingSum, s.apps);
  const pos = p.position;
  const raw = (avg - 6.3) * 24 + s.goals * GOAL_VALUE[pos] + s.assists * 0.75 + s.motm * 1.2 + (s.cleanSheets ?? 0) * CS_VALUE[pos];
  return raw * (0.55 + 0.45 * Math.min(1, share));
}

/** Bonus for a knockout run: k = knockout round reached (rounds + 1 = winner), normalised to a 4-round bracket. */
function runBonus(table: number[], k: number, rounds: number): number {
  if (k <= 0) return 0;
  return table[Math.max(1, Math.min(table.length - 1, k + (4 - rounds)))] ?? 0;
}

/** Club success bonus this season: league finish, Champions Cup run, domestic cup. */
function teamSuccess(state: GameState, comps: Competition[]): (teamId: string) => number {
  const bonus = new Map<string, number>();
  const add = (id: string, v: number) => bonus.set(id, (bonus.get(id) ?? 0) + v);
  for (const c of comps) {
    if (c.kind === 'league') {
      const table = sortedTable(c);
      const w = c.tier === 1 ? 1 : 0.4;
      table.forEach((r, i) => add(r.teamId, w * ([12, 6, 4, 2.5][i] ?? 0)));
    } else if (c.kind === 'continental') {
      const reach = knockoutReach(c);
      const rounds = compFormat(c)?.koWeeks.length ?? 4;
      for (const [id, k] of Object.entries(reach)) add(id, runBonus([0, 1.5, 3, 5, 8, 15], k, rounds));
    } else if (c.kind === 'cup' && c.winnerId) {
      add(c.winnerId, 4);
    } else if (c.kind === 'international' && isTournamentId(c.id)) {
      const reach = knockoutReach(c);
      const rounds = compFormat(c)?.koWeeks.length ?? 4;
      for (const [id, k] of Object.entries(reach)) add(id, runBonus([0, 1, 2, 3.5, 6, 11], k, rounds));
    }
  }
  return (id) => bonus.get(id) ?? 0;
}

/** League quality factor of a club (tier-2 football counts less). */
function leagueFactor(state: GameState, clubId: string | null): number {
  const club = clubId ? state.world.clubs[clubId] : undefined;
  if (!club) return 0.6;
  const lg = state.world.leagues.find((l) => l.country === club.country && l.tier === club.tier);
  const strength = lg?.strength ?? 70;
  return (club.tier === 1 ? 1 : 0.7) * (0.75 + strength / 400);
}

function award(state: GameState, key: string, name: string, p: Footballer, teamId: string, detail: string): Award {
  return { key, name, season: state.season, detail, playerId: p.id, teamId };
}

function statsDetail(state: GameState, p: Footballer, teamId: string, s: Line): string {
  return `${ct(state, 'detail.player', { name: fullPlayerName(p), team: teamName(state, teamId) })} · ${ct(state, 'detail.stats', {
    goals: s.goals, assists: s.assists, avg: fmt2(avgOf(s.ratingSum, s.apps)),
  })}`;
}

interface Scored { p: Footballer; teamId: string; line: Line; score: number }

/** Players ranked across all leagues by season form, team success and league quality. */
function seasonRanking(state: GameState, comps: Competition[]): Scored[] {
  const success = teamSuccess(state, comps);
  // the national team's summer counts for its players too
  const ntSuccess = (p: Footballer) => {
    const nt = `NT-${p.nation}`;
    for (const c of comps) {
      if (c.kind === 'international' && isTournamentId(c.id) && c.playerStats?.[p.id]?.apps) return success(nt) * 0.8;
    }
    return 0;
  };
  let maxApps = 0;
  for (const p of Object.values(state.world.players)) if (p.season.apps > maxApps) maxApps = p.season.apps;
  const minApps = Math.max(1, Math.round(maxApps * 0.4));
  const out: Scored[] = [];
  for (const p of Object.values(state.world.players)) {
    if (p.season.apps < minApps) continue;
    const teamId = p.clubId ?? '';
    const share = p.season.minutes / Math.max(1, maxApps * 90);
    const score = (performance(p, p.season, share) + success(teamId) + ntSuccess(p)) * leagueFactor(state, p.clubId);
    out.push({ p, teamId, line: p.season, score });
  }
  return out.sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));
}

/** Ranking inside one competition using its own per-player stats. */
function compRanking(state: GameState, comp: Competition, minShare: number): Scored[] {
  const stats = comp.playerStats ?? {};
  let maxApps = 0;
  for (const s of Object.values(stats)) if (s.apps > maxApps) maxApps = s.apps;
  const minApps = Math.max(1, Math.round(maxApps * minShare));
  const table = comp.kind === 'league' ? sortedTable(comp) : [];
  const reach = comp.kind === 'league' ? {} : knockoutReach(comp);
  const out: Scored[] = [];
  for (const [id, s] of Object.entries(stats) as [string, CompPlayerStats][]) {
    const p = state.world.players[id];
    if (!p || s.apps < minApps) continue;
    let bonus = 0;
    if (comp.kind === 'league') {
      const pos = table.findIndex((r) => r.teamId === s.teamId);
      bonus = [6, 3, 2][pos] ?? 0;
    } else {
      bonus = (reach[s.teamId] ?? 0) * 1.5 + (comp.winnerId === s.teamId ? 3 : 0);
    }
    const score = performance(p, s, s.apps / Math.max(1, maxApps)) + bonus;
    out.push({ p, teamId: s.teamId, line: s, score });
  }
  return out.sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));
}

function topScorerOf(state: GameState, comp: Competition): { p: Footballer; s: CompPlayerStats } | null {
  let best: { p: Footballer; s: CompPlayerStats } | null = null;
  for (const [id, s] of Object.entries(comp.playerStats ?? {})) {
    const p = state.world.players[id];
    if (!p || s.goals <= 0) continue;
    if (!best || s.goals > best.s.goals || (s.goals === best.s.goals && (s.assists > best.s.assists || (s.assists === best.s.assists && s.apps < best.s.apps)))) {
      best = { p, s };
    }
  }
  return best;
}

/** 4-3-3 Team of the Season from a league's ranking. */
function teamOfSeason(ranked: Scored[]): Scored[] {
  const need: { pos: Position[]; n: number }[] = [
    { pos: ['GK'], n: 1 }, { pos: ['FB'], n: 2 }, { pos: ['CB'], n: 2 },
    { pos: ['DM', 'CM', 'AM'], n: 3 }, { pos: ['W'], n: 2 }, { pos: ['ST'], n: 1 },
  ];
  const picked: Scored[] = [];
  const used = new Set<string>();
  for (const { pos, n } of need) {
    let got = 0;
    for (const r of ranked) {
      if (got >= n) break;
      if (used.has(r.p.id) || !pos.includes(r.p.position)) continue;
      picked.push(r); used.add(r.p.id); got++;
    }
    // fall back to the same line of the pitch
    for (const r of ranked) {
      if (got >= n) break;
      if (used.has(r.p.id) || positionGroup(r.p.position) !== positionGroup(pos[0])) continue;
      picked.push(r); used.add(r.p.id); got++;
    }
  }
  return picked;
}

export function computeAwards(state: GameState): Award[] {
  const comps = compsOfSeason(state);
  const awards: Award[] = [];
  const ranking = seasonRanking(state, comps);

  // Golden Ball: the best footballer on the planet this season
  const gb = ranking[0];
  if (gb) awards.push(award(state, 'golden_ball', ct(state, 'aw.golden_ball'), gb.p, gb.teamId, statsDetail(state, gb.p, gb.teamId, gb.line)));

  // Young Player of the Year (21 or younger)
  const young = ranking.find((r) => age(r.p, state.season) <= 21);
  if (young) awards.push(award(state, 'young_player', ct(state, 'aw.young_player'), young.p, young.teamId, statsDetail(state, young.p, young.teamId, young.line)));

  // per top-flight league: Golden Boot, Player of the Season, Team of the Season
  const leagues = comps.filter((c) => c.kind === 'league' && c.tier === 1).sort((a, b) => a.id.localeCompare(b.id));
  for (const lg of leagues) {
    const top = topScorerOf(state, lg);
    if (top) {
      awards.push(award(state, 'league_top_scorer', ct(state, 'aw.league_top_scorer', { league: lg.name }), top.p, top.s.teamId,
        `${ct(state, 'detail.player', { name: fullPlayerName(top.p), team: teamName(state, top.s.teamId) })} · ${ct(state, 'detail.goals', { goals: top.s.goals })}`));
    }
    const ranked = compRanking(state, lg, 0.5);
    const mvp = ranked[0];
    if (mvp) awards.push(award(state, 'league_mvp', ct(state, 'aw.league_mvp', { league: lg.name }), mvp.p, mvp.teamId, statsDetail(state, mvp.p, mvp.teamId, mvp.line)));
    for (const r of teamOfSeason(ranked)) {
      awards.push(award(state, 'team_of_season', ct(state, 'aw.team_of_season', { league: lg.name }), r.p, r.teamId,
        ct(state, 'detail.pos', { pos: ct(state, `pos.${r.p.position}`), name: fullPlayerName(r.p), team: teamName(state, r.teamId) })));
    }
  }

  // Champions Cup and summer tournament honours
  for (const c of comps) {
    const tournament = c.kind === 'international' && isTournamentId(c.id);
    if (c.kind !== 'continental' && !tournament) continue;
    if (c.stage !== 'done') continue;
    const top = topScorerOf(state, c);
    if (top) {
      awards.push(award(state, tournament ? 'tournament_top_scorer' : 'cc_top_scorer', ct(state, tournament ? 'aw.tournament_top_scorer' : 'aw.cc_top_scorer', { comp: c.name }),
        top.p, top.s.teamId, `${ct(state, 'detail.player', { name: fullPlayerName(top.p), team: teamName(state, top.s.teamId) })} · ${ct(state, 'detail.goals', { goals: top.s.goals })}`));
    }
    const best = compRanking(state, c, 0.5)[0];
    if (best) {
      awards.push(award(state, tournament ? 'tournament_best' : 'cc_best', ct(state, tournament ? 'aw.tournament_best' : 'aw.cc_best', { comp: c.name }),
        best.p, best.teamId, statsDetail(state, best.p, best.teamId, best.line)));
    }
  }
  return awards;
}
