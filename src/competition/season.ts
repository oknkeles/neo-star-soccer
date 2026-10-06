/**
 * Closing a season: finishing overdue fixtures, league merit payments, champions,
 * awards, promotion/relegation and the user's season record, trophies and awards.
 */
import type { Award, CareerSeasonRecord, Competition, GameState, SeasonSummary, Trophy } from '../core/types';
import type { Rng } from '../core/rng';
import { overall } from '../core/ratings';
import { applyResult } from './apply';
import { computeAwards } from './awards';
import { buildMatchContext } from './context';
import { compsOfSeason, userFootballer } from './helpers';
import { fixtureOrder, leaguePosition } from './queries';
import { quickSimulate } from './sim';
import { sortedTable } from './tables';

/**
 * Simulate fixtures that are still open (e.g. the season was forced closed). Club competitions are
 * always completed; international ones only once the summer is over.
 */
function finishOverdue(state: GameState, rng: Rng): void {
  const intlToo = state.week >= 51;
  for (let pass = 0; pass < 12; pass++) {
    const open = compsOfSeason(state)
      .filter((c) => c.kind !== 'international' || intlToo)
      .flatMap((c) => c.fixtures.filter((f) => !f.played))
      .sort(fixtureOrder);
    if (!open.length) return;
    for (const f of open) {
      if (f.played) continue;
      const ctx = buildMatchContext(state, f, 'none', rng);
      applyResult(state, f.id, quickSimulate(state, ctx, rng));
    }
  }
}

/** Merit payments from each league's prize pool by final position. */
function payLeaguePrizes(state: GameState, comps: Competition[]): void {
  for (const c of comps) {
    if (c.kind !== 'league' || c.prizeMoney <= 0) continue;
    const table = sortedTable(c);
    const n = table.length;
    const weights = table.map((_, i) => n - i + n / 2);
    const total = weights.reduce((a, b) => a + b, 0);
    table.forEach((row, i) => {
      const club = state.world.clubs[row.teamId];
      if (club) club.budget = Math.round(club.budget + (c.prizeMoney * weights[i]) / total);
    });
  }
}

/** Promotion / relegation per country (equal numbers both ways so league sizes never change). */
export function computePromotions(state: GameState, season = state.season): { promoted: string[]; relegated: string[] } {
  const promoted: string[] = [];
  const relegated: string[] = [];
  const countries = [...new Set(state.world.leagues.map((l) => l.country))].sort();
  for (const country of countries) {
    const top = state.world.leagues.find((l) => l.country === country && l.tier === 1);
    const second = state.world.leagues.find((l) => l.country === country && l.tier === 2);
    if (!top || !second) continue;
    const topComp = state.competitions[`${top.id}-${season}`];
    const secondComp = state.competitions[`${second.id}-${season}`];
    if (!topComp || !secondComp) continue;
    const topTable = sortedTable(topComp);
    const secondTable = sortedTable(secondComp);
    const n = Math.min(top.relegate, second.promote, topTable.length - 1, secondTable.length - 1);
    if (n <= 0) continue;
    relegated.push(...topTable.slice(-n).map((r) => r.teamId));
    promoted.push(...secondTable.slice(0, n).map((r) => r.teamId));
  }
  return { promoted, relegated };
}

/** The user's record for the closing season (null when they had no club and no games). */
function userSeasonRecord(state: GameState, comps: Competition[], trophies: Trophy[]): CareerSeasonRecord | null {
  const u = userFootballer(state);
  if (!u) return null;
  let clubId = u.clubId;
  if (!clubId) {
    // a free agent at season end: credit the last club they played for
    for (const c of comps) {
      const s = c.playerStats?.[u.id];
      if (s && state.world.clubs[s.teamId]) clubId = s.teamId;
    }
  }
  const club = clubId ? state.world.clubs[clubId] : undefined;
  if (!club && u.season.apps === 0) return null;
  const league = club ? comps.find((c) => c.kind === 'league' && c.teamIds.includes(club.id)) : undefined;
  const leagueName = league?.name ?? (club ? state.world.leagues.find((l) => l.country === club.country && l.tier === club.tier)?.name ?? '' : '');
  return {
    season: state.season,
    clubId: club?.id ?? '',
    clubName: club?.name ?? '',
    league: leagueName,
    leaguePos: club ? leaguePosition(state, club.id) : null,
    stats: { ...u.season },
    avgRating: u.season.apps ? Math.round((u.season.ratingSum / u.season.apps) * 100) / 100 : 0,
    overall: overall(u),
    value: u.value,
    trophies: trophies.map((t) => t.name),
  };
}

export function endOfSeason(state: GameState, rng: Rng): SeasonSummary {
  const existing = state.seasons.find((s) => s.season === state.season);
  if (existing) return existing;

  finishOverdue(state, rng);
  const comps = compsOfSeason(state);
  payLeaguePrizes(state, comps);

  const champions: Record<string, string> = {};
  for (const c of comps) {
    if (!c.winnerId && c.kind === 'league') c.winnerId = sortedTable(c)[0]?.teamId ?? null;
    if (c.winnerId) champions[c.id] = c.winnerId;
  }

  const awards = computeAwards(state);
  const uid = state.career?.playerId;
  const career = state.career;

  // trophies: the user's team won and the user played a part in it
  const newTrophies: Trophy[] = [];
  if (uid && career) {
    for (const c of comps) {
      if (!c.winnerId) continue;
      const s = c.playerStats?.[uid];
      if (!s || s.apps <= 0 || s.teamId !== c.winnerId) continue;
      if (career.trophies.some((t) => t.compId === c.id)) continue;
      const trophy: Trophy = { compId: c.id, name: c.name, season: state.season, teamId: c.winnerId };
      career.trophies.push(trophy);
      newTrophies.push(trophy);
    }
    const mine: Award[] = awards.filter((a) => a.playerId === uid);
    for (const a of mine) {
      if (!career.awards.some((x) => x.season === a.season && x.key === a.key && x.name === a.name)) career.awards.push(a);
    }
  }

  const { promoted, relegated } = computePromotions(state);
  const thisSeasonTrophies = career ? career.trophies.filter((t) => t.season === state.season) : newTrophies;
  const record = career ? userSeasonRecord(state, comps, thisSeasonTrophies) : null;
  if (record && career && !career.history.some((h) => h.season === record.season)) career.history.push(record);

  const summary: SeasonSummary = { season: state.season, champions, awards, promoted, relegated };
  if (record) summary.userRecord = record;
  state.seasons.push(summary);
  return summary;
}
