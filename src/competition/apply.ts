/**
 * Applying finished matches (simulated or played by the user) and simulating a whole week.
 */
import type {
  CompPlayerStats, Competition, Fixture, Footballer, GameState, Injury, MatchSummary, StatLine,
} from '../core/types';
import type { Rng } from '../core/rng';
import { positionGroup } from '../core/ratings';
import { clamp } from '../core/util';
import { buildMatchContext } from './context';
import { compFormat, fixtureLoser, fixtureWinner, isKnockoutFixture, koStageKey } from './formats';
import { derivedRng } from './helpers';
import { advanceKnockout } from './knockout';
import { fixturesForWeek, findFixture } from './queries';
import { quickSimulate } from './sim';
import { recordTableResult, sortedTable, tableKeyFor } from './tables';
import { markUserFixtures } from './create';

type Side = 'home' | 'away';

// Same catalogue keys as the career module ('career.inj.<key>'), so every UI can name them.
const AI_INJURIES: Record<1 | 2 | 3, { key: string; weeks: [number, number] }[]> = {
  1: [
    { key: 'knock', weeks: [1, 1] }, { key: 'bruised_ankle', weeks: [1, 2] },
    { key: 'tight_hamstring', weeks: [1, 2] }, { key: 'calf_strain', weeks: [2, 3] },
  ],
  2: [
    { key: 'hamstring', weeks: [3, 6] }, { key: 'groin', weeks: [3, 5] }, { key: 'ankle_sprain', weeks: [3, 6] },
    { key: 'thigh_strain', weeks: [3, 5] }, { key: 'concussion', weeks: [2, 4] },
  ],
  3: [
    { key: 'acl', weeks: [24, 36] }, { key: 'metatarsal', weeks: [8, 12] }, { key: 'achilles', weeks: [16, 26] },
    { key: 'shoulder', weeks: [6, 10] }, { key: 'meniscus', weeks: [8, 14] },
  ],
};

export function rollAiInjury(rng: Rng, p: Footballer): Injury {
  const fragile = p.traits.includes('glass_bones') ? 1.6 : p.traits.includes('iron_man') ? 0.5 : 1;
  const r = rng.next() / fragile;
  const severity: 1 | 2 | 3 = r < 0.08 ? 3 : r < 0.38 ? 2 : 1;
  const def = rng.pick(AI_INJURIES[severity]);
  return { key: def.key, weeksLeft: rng.int(def.weeks[0], def.weeks[1]), severity };
}

const emptyStatLine = (): StatLine => ({
  apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, ratingSum: 0, motm: 0, yellow: 0, red: 0, cleanSheets: 0,
});

function addTo(line: StatLine, d: StatLine): void {
  line.apps += d.apps; line.starts += d.starts; line.minutes += d.minutes; line.goals += d.goals;
  line.assists += d.assists; line.ratingSum = Math.round((line.ratingSum + d.ratingSum) * 10) / 10;
  line.motm += d.motm; line.yellow += d.yellow; line.red += d.red; line.cleanSheets += d.cleanSheets;
}

function userSideOf(state: GameState, fixture: Fixture): Side | undefined {
  const club = state.world.players[state.career.playerId]?.clubId;
  if (club && fixture.homeId === club) return 'home';
  if (club && fixture.awayId === club) return 'away';
  const nt = state.career.nationalTeamId ?? undefined;
  if (nt && fixture.homeId === nt) return 'home';
  if (nt && fixture.awayId === nt) return 'away';
  return undefined;
}

/** Which side each rated footballer played for. */
function sidesOf(state: GameState, fixture: Fixture, summary: MatchSummary): Map<string, Side> {
  const side = new Map<string, Side>();
  summary.lineups?.home.forEach((id) => side.set(id, 'home'));
  summary.lineups?.away.forEach((id) => side.set(id, 'away'));
  for (const e of summary.events) {
    if (!e.playerId || !e.side || side.has(e.playerId)) continue;
    if (e.kind === 'sub' || e.kind === 'goal' || e.kind === 'penalty_goal' || e.kind === 'penalty_miss' || e.kind === 'yellow' || e.kind === 'red' || e.kind === 'injury') {
      side.set(e.playerId, e.side);
    }
    if (e.kind === 'goal' && e.assistId && !side.has(e.assistId)) side.set(e.assistId, e.side);
  }
  const belongs = (p: Footballer, teamId: string) => {
    if (p.clubId === teamId) return true;
    const nt = state.world.nationalTeams[teamId];
    return !!nt && (nt.squad.includes(p.id) || nt.nation === p.nation);
  };
  for (const id of Object.keys(summary.ratings)) {
    if (side.has(id)) continue;
    const p = state.world.players[id];
    if (!p) continue;
    if (belongs(p, fixture.homeId)) side.set(id, 'home');
    else if (belongs(p, fixture.awayId)) side.set(id, 'away');
  }
  return side;
}

/** Share of a cup / continental prize pool for winning a knockout tie at round k of n. */
function koPrizeShare(k: number, rounds: number): number {
  const fromEnd = rounds - k; // 0 = final
  return [0.22, 0.08, 0.05, 0.03, 0.02, 0.01][fromEnd] ?? 0.01;
}

function payClub(state: GameState, teamId: string, amount: number): void {
  const club = state.world.clubs[teamId];
  if (club && amount > 0) club.budget = Math.round(club.budget + amount);
}

function prizeForResult(state: GameState, comp: Competition, fixture: Fixture): void {
  if (comp.kind === 'league' || comp.kind === 'international' || comp.prizeMoney <= 0) return;
  const format = compFormat(comp);
  if (!format) return;
  if (fixture.round <= format.groupRounds) {
    const pool = comp.prizeMoney;
    const hg = fixture.homeGoals ?? 0;
    const ag = fixture.awayGoals ?? 0;
    if (hg === ag) { payClub(state, fixture.homeId, pool * 0.003); payClub(state, fixture.awayId, pool * 0.003); }
    else payClub(state, hg > ag ? fixture.homeId : fixture.awayId, pool * 0.009);
    return;
  }
  const k = fixture.round - format.groupRounds;
  const rounds = format.koWeeks.length;
  const winner = fixtureWinner(fixture);
  if (winner) payClub(state, winner, comp.prizeMoney * koPrizeShare(k, rounds));
  if (k === rounds) {
    const loser = fixtureLoser(fixture);
    if (loser) payClub(state, loser, comp.prizeMoney * 0.1);
  }
}

/** Closes leagues / friendlies once every fixture has been played. */
function closeRoundRobin(comp: Competition, fixture: Fixture): void {
  if (comp.stage === 'done') return;
  if (comp.kind === 'league') {
    let last = 0;
    for (const f of comp.fixtures) if (f.round > last) last = f.round;
    if (fixture.round < last) return;
  }
  if (!comp.fixtures.every((f) => f.played)) return;
  comp.stage = 'done';
  if (comp.kind === 'league') comp.winnerId = sortedTable(comp)[0]?.teamId ?? null;
}

/**
 * Apply a finished match to the world: fixture, tables, player stats, AI injuries and form,
 * prize money and knockout / competition progression. Ignores already-played fixtures.
 */
export function applyResult(state: GameState, fixtureId: string, summary: MatchSummary): void {
  const fixture = findFixture(state, fixtureId);
  if (!fixture || fixture.played) return;
  const comp = state.competitions[fixture.compId];
  const knockout = comp ? isKnockoutFixture(comp, fixture) : false;

  fixture.played = true;
  fixture.homeGoals = summary.homeGoals;
  fixture.awayGoals = summary.awayGoals;
  if (knockout && summary.homeGoals === summary.awayGoals) {
    if (summary.pens && summary.pens.home !== summary.pens.away) fixture.pens = { ...summary.pens };
    else {
      // a knockout must produce a winner: settle it from the spot
      const r = derivedRng(state, fixtureId, 'pens');
      const loserPens = r.int(2, 4);
      fixture.pens = r.chance(0.5) ? { home: loserPens + 1, away: loserPens } : { home: loserPens, away: loserPens + 1 };
    }
  }
  fixture.scorers = summary.events
    .filter((e) => (e.kind === 'goal' || e.kind === 'penalty_goal' || e.kind === 'own_goal') && e.playerId && e.side)
    .map((e) => ({ playerId: e.playerId!, minute: e.minute, side: e.side! }));

  if (comp) {
    const format = compFormat(comp);
    const isGroupGame = !!format && fixture.round <= format.groupRounds;
    if (comp.kind === 'league' || isGroupGame) {
      const key = comp.kind === 'league' ? 'main' : tableKeyFor(comp, fixture.homeId, fixture.awayId);
      if (key && comp.tables[key]) recordTableResult(comp.tables[key], fixture.homeId, fixture.awayId, summary.homeGoals, summary.awayGoals);
    }
  }

  applyPlayerStats(state, comp, fixture, summary);
  applyInjuries(state, fixture, summary);

  if (comp) {
    prizeForResult(state, comp, fixture);
    if (compFormat(comp)) {
      advanceKnockout(state, comp);
    } else {
      closeRoundRobin(comp, fixture);
    }
  }
}

function applyPlayerStats(state: GameState, comp: Competition | undefined, fixture: Fixture, summary: MatchSummary): void {
  const players = state.world.players;
  const national = comp?.kind === 'international' || !!state.world.nationalTeams[fixture.homeId];
  const sides = sidesOf(state, fixture, summary);
  const starters = new Set([...(summary.lineups?.home ?? []), ...(summary.lineups?.away ?? [])]);
  const goals = new Map<string, number>();
  const assists = new Map<string, number>();
  const yellows = new Map<string, number>();
  const reds = new Map<string, number>();
  const inc = (m: Map<string, number>, id: string | undefined) => { if (id) m.set(id, (m.get(id) ?? 0) + 1); };
  for (const e of summary.events) {
    if (e.kind === 'goal' || e.kind === 'penalty_goal') { inc(goals, e.playerId); inc(assists, e.assistId); }
    else if (e.kind === 'yellow') inc(yellows, e.playerId);
    else if (e.kind === 'red') inc(reds, e.playerId);
  }
  const uid = state.career?.playerId;
  const conceded: Record<Side, number> = { home: summary.awayGoals, away: summary.homeGoals };
  const teamOf: Record<Side, string> = { home: fixture.homeId, away: fixture.awayId };

  const rated: [string, number][] = Object.entries(summary.ratings);
  // a live match summary may carry the user's numbers only in `summary.user`
  if (uid && summary.user && !(uid in summary.ratings) && players[uid]) rated.push([uid, summary.user.rating]);
  for (const [id, rawRating] of rated) {
    const p = players[id];
    if (!p) continue;
    const side = sides.get(id) ?? (id === uid ? userSideOf(state, fixture) : undefined);
    const live = id === uid ? summary.user?.stats : undefined;
    const started = starters.size ? starters.has(id) : live ? live.minutes >= 46 : true;
    const fallbackMinutes = live && live.minutes > 0 ? live.minutes : started ? 90 : 20;
    const minutes = Math.max(0, Math.round(summary.minutes?.[id] ?? fallbackMinutes));
    const rating = clamp(Number.isFinite(rawRating) ? rawRating : 6, 3, 10);
    const group = positionGroup(p.position);
    const d: StatLine = {
      ...emptyStatLine(),
      apps: 1,
      starts: started ? 1 : 0,
      minutes,
      goals: Math.max(goals.get(id) ?? 0, live?.goals ?? 0),
      assists: Math.max(assists.get(id) ?? 0, live?.assists ?? 0),
      ratingSum: Math.round(rating * 10) / 10,
      motm: summary.motmId === id ? 1 : 0,
      yellow: yellows.get(id) ?? 0,
      red: reds.get(id) ?? 0,
      cleanSheets: side && conceded[side] === 0 && (group === 'GK' || group === 'DEF') && minutes >= 60 ? 1 : 0,
    };
    if (national) {
      p.intlCaps += 1;
      p.intlGoals += d.goals;
    } else {
      addTo(p.season, d);
      addTo(p.career, d);
    }
    if (comp) {
      const stats: Record<string, CompPlayerStats> = (comp.playerStats ??= {});
      const s = (stats[id] ??= { teamId: side ? teamOf[side] : p.clubId ?? '', apps: 0, goals: 0, assists: 0, ratingSum: 0, motm: 0 });
      if (side) s.teamId = teamOf[side];
      s.apps += 1;
      s.goals += d.goals;
      s.assists += d.assists;
      s.ratingSum = Math.round((s.ratingSum + d.ratingSum) * 10) / 10;
      s.motm += d.motm;
    }
    // AI form follows performances (the career module handles the user's form)
    if (id !== uid && !p.isUser) {
      p.form = Math.round(clamp(p.form + (rating - 6.4) * 4 - (p.form - 50) * 0.1, 5, 98));
    }
  }
}

function applyInjuries(state: GameState, fixture: Fixture, summary: MatchSummary): void {
  const uid = state.career?.playerId;
  for (const e of summary.events) {
    if (e.kind !== 'injury' || !e.playerId || e.playerId === uid) continue;
    const p = state.world.players[e.playerId];
    if (!p || p.isUser || (p.injury && p.injury.weeksLeft > 0)) continue;
    p.injury = rollAiInjury(derivedRng(state, fixture.id, e.playerId, 'inj'), p);
  }
}

/** Weekly injury countdown for AI footballers. */
export function healAiInjuries(state: GameState): void {
  const uid = state.career?.playerId;
  for (const p of Object.values(state.world.players)) {
    if (!p.injury || p.id === uid || p.isUser) continue;
    p.injury.weeksLeft -= 1;
    if (p.injury.weeksLeft <= 0) p.injury = null;
  }
}

/** Quick-simulate and apply every fixture of the current week except `skip` (midweek first). */
export function simulateWeek(state: GameState, rng: Rng, skip: string[]): { fixture: Fixture; summary: MatchSummary }[] {
  healAiInjuries(state);
  markUserFixtures(state);
  const skipSet = new Set(skip);
  const out: { fixture: Fixture; summary: MatchSummary }[] = [];
  for (const f of fixturesForWeek(state, state.week)) {
    if (f.played || skipSet.has(f.id)) continue;
    const ctx = buildMatchContext(state, f, 'none', rng);
    const summary = quickSimulate(state, ctx, rng);
    applyResult(state, f.id, summary);
    out.push({ fixture: f, summary });
  }
  return out;
}

/** Label of a knockout round of a competition (for UIs / news). */
export function roundStage(comp: Competition, fixture: Fixture): string | null {
  const format = compFormat(comp);
  if (!format || fixture.round <= format.groupRounds) return null;
  return koStageKey(format, fixture.round - format.groupRounds);
}
