/**
 * Read-only views of the week: agenda, blockers, press availability. Never mutates state.
 */
import type { Fixture, GameEvent, GameState, TransferOffer, UserMatchRole, WeekInfo } from '../core/types';
import type { PressOccasion } from '../core/narrative-types';
import { absWeek } from '../core/util';
import { t } from '../core/i18n';
import * as comp from '../competition/api';
import * as career from '../career/api';
import type { Agenda } from './api';

/** Flag keys owned by the game controller. */
export const FLAG = {
  userPlayed: 'game.userPlayed',        // comma-separated fixture ids played by the user this week
  everSigned: 'game.everSigned',
  unveil: 'game.unveil',                // absWeek of the latest club change
  unveilDone: 'game.unveilDone',
  milestone: 'game.milestone',          // absWeek of the latest milestone (goal reached, award…)
  seasonEnded: 'game.seasonEnded',      // season number whose end was processed
  forcedRetire: 'game.forcedRetire',
  postsWeek: 'game.postsWeek',          // `${absWeek}:${count}` of user social posts
  pressPrefix: 'game.press.',           // + occasion → absWeek (or scandal storyline key)
} as const;

export function userPlayedIds(state: GameState): string[] {
  const v = state.flags[FLAG.userPlayed];
  return typeof v === 'string' && v ? v.split(',') : [];
}

export function markUserPlayed(state: GameState, fixtureId: string): void {
  const ids = userPlayedIds(state);
  if (!ids.includes(fixtureId)) ids.push(fixtureId);
  state.flags[FLAG.userPlayed] = ids.join(',');
}

export function userPlayer(state: GameState) {
  return state.world.players[state.career.playerId];
}

/** Team ids the user can play for right now (club, and national team when called up). */
export function userTeamIds(state: GameState): string[] {
  const ids: string[] = [];
  const p = userPlayer(state);
  if (p?.clubId) ids.push(p.clubId);
  if (state.career.nationalTeamId) ids.push(state.career.nationalTeamId);
  return ids;
}

export function userSide(state: GameState, f: Fixture): 'home' | 'away' | null {
  const ids = userTeamIds(state);
  if (ids.includes(f.homeId)) return 'home';
  if (ids.includes(f.awayId)) return 'away';
  return null;
}

export function teamName(state: GameState, teamId: string): string {
  try {
    return comp.teamInfo(state, teamId).name;
  } catch {
    return state.world.clubs[teamId]?.name ?? state.world.nationalTeams[teamId]?.name?.[state.lang] ?? teamId;
  }
}

export function compName(state: GameState, compId: string): string {
  return state.competitions[compId]?.name ?? compId;
}

export function pendingEvents(state: GameState): GameEvent[] {
  return state.events.filter((e) => !e.resolved);
}

/** Events the player must answer before advancing (anything pending with real choices). */
export function mandatoryEvents(state: GameState): GameEvent[] {
  return pendingEvents(state).filter((e) => Array.isArray(e.choices) && e.choices.length > 0);
}

export function pendingOffers(state: GameState): TransferOffer[] {
  return state.offers.filter((o) => o.status === 'pending' || o.status === 'negotiating');
}

export function needsClub(state: GameState): boolean {
  const p = userPlayer(state);
  return !!p && !p.clubId && !state.career.retired;
}

function safeWeekInfo(state: GameState): WeekInfo {
  try {
    return comp.weekInfo(state.season, state.week);
  } catch {
    return {
      season: state.season, week: state.week, date: '',
      label: { tr: `Hafta ${state.week + 1}`, en: `Week ${state.week + 1}` },
      phase: state.week >= 45 ? 'summer' : 'season', transferWindow: false, internationalBreak: false, tournament: false,
    };
  }
}

function roleFor(state: GameState, f: Fixture): UserMatchRole {
  if (f.played) {
    const rec = state.career.matches.find((m) => m.fixtureId === f.id);
    if (!rec) return 'none';
    return rec.minutes >= 46 ? 'starter' : 'bench';
  }
  try {
    return career.selectionFor(state, f);
  } catch {
    return 'starter';
  }
}

/** Is this fixture a "big" one worth a pre-match press conference? */
export function isBigFixture(state: GameState, f: Fixture): boolean {
  const side = userSide(state, f);
  if (!side) return false;
  const oppId = side === 'home' ? f.awayId : f.homeId;
  const ourId = side === 'home' ? f.homeId : f.awayId;
  const club = state.world.clubs[ourId];
  if (club?.derbyRivals.includes(oppId)) return true;
  if (state.world.nationalTeams[ourId]) return true;
  if (f.roundName && /final|finale/i.test(f.roundName)) return true;
  const kind = state.competitions[f.compId]?.kind;
  if (kind === 'continental' && f.round > 0 && !!f.roundName) return true;
  const rival = state.world.players[state.career.rivalId];
  if (rival?.clubId && rival.clubId === oppId) return true;
  return false;
}

function lastUserRecordThisWeek(state: GameState) {
  const m = state.career.matches[state.career.matches.length - 1];
  return m && m.season === state.season && m.week === state.week ? m : null;
}

export function pressAvailable(state: GameState, fixtures: Fixture[]): PressOccasion | null {
  if (state.career.retired) return null;
  const now = absWeek(state.season, state.week);
  const done = (o: PressOccasion) => state.flags[FLAG.pressPrefix + o] === now;

  const unveil = state.flags[FLAG.unveil];
  if (typeof unveil === 'number' && now - unveil <= 1 && state.flags[FLAG.unveilDone] !== unveil && userPlayer(state)?.clubId) return 'unveiling';

  const scandal = state.storylines.find((s) => s.active && /scandal/.test(s.kind));
  if (scandal && state.flags[FLAG.pressPrefix + 'scandal'] !== `${scandal.id}:${scandal.stage}`) return 'scandal';

  const rec = lastUserRecordThisWeek(state);
  if (rec && !done('post_match')) {
    const fx = fixtures.find((f) => f.id === rec.fixtureId);
    const big = rec.rating >= 7.8 || rec.rating <= 5 || rec.goals >= 2 || Math.abs(rec.goalsFor - rec.goalsAgainst) >= 3 || (fx ? isBigFixture(state, fx) : false);
    if (big) return 'post_match';
  }

  if (!done('pre_match') && fixtures.some((f) => !f.played && isBigFixture(state, f))) return 'pre_match';

  const milestone = state.flags[FLAG.milestone];
  if (typeof milestone === 'number' && now - milestone <= 1 && !done('milestone')) return 'milestone';

  const p = userPlayer(state);
  const myRep = p?.clubId ? state.world.clubs[p.clubId]?.reputation ?? 0 : 0;
  const hot = pendingOffers(state).some((o) => o.kind !== 'trial' && o.kind !== 'renewal' && (state.world.clubs[o.fromClubId]?.reputation ?? 0) > myRep);
  if ((hot || state.career.transferListed) && p?.clubId && !done('transfer')) return 'transfer';
  return null;
}

export function computeAgenda(state: GameState): Agenda {
  const week = safeWeekInfo(state);
  const p = userPlayer(state);
  const club = needsClub(state);
  let weekFixtures: Fixture[] = [];
  if (!state.career.retired && userTeamIds(state).length) {
    try {
      weekFixtures = comp.userFixturesForWeek(state);
    } catch {
      weekFixtures = [];
    }
  }
  const fixtures = weekFixtures.map((f) => {
    const side = userSide(state, f);
    const home = side !== 'away';
    return {
      fixture: f,
      role: roleFor(state, f),
      opponent: teamName(state, home ? f.awayId : f.homeId),
      home,
      compName: compName(state, f.compId),
    };
  });
  const pendingMatches = fixtures.filter((x) => !x.fixture.played && x.role !== 'none').map((x) => x.fixture.id);
  const events = pendingEvents(state);
  const blockers: string[] = [];

  if (state.career.retired) {
    blockers.push(t('game.block.retired'));
  } else {
    if (club && !state.flags[FLAG.everSigned] && pendingOffers(state).length > 0) blockers.push(t('game.block.chooseClub'));
    for (const id of pendingMatches) {
      const fx = fixtures.find((x) => x.fixture.id === id)!;
      blockers.push(t('game.block.playMatch', { opp: fx.opponent, comp: fx.compName }));
    }
    for (const e of mandatoryEvents(state)) blockers.push(t('game.block.event', { title: e.title }));
    if (state.flags[FLAG.forcedRetire] && !state.career.retired) blockers.push(t('game.block.mustRetire'));
  }

  return {
    week,
    fixtures,
    pendingMatches,
    pendingEvents: events,
    unread: state.inbox.filter((m) => !m.read).length,
    actionsLeft: state.career.actionsLeft,
    canAdvance: blockers.length === 0,
    blockers,
    pressAvailable: p ? pressAvailable(state, weekFixtures) : null,
    needsClub: club,
  };
}
