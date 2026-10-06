/**
 * COMPETITION module — calendar, fixtures, leagues, cups, the Champions Cup,
 * international football, statistical match simulation for non-user matches,
 * awards and season rollover (world evolution). Owner: competition agent.
 *
 * Calendar model (52 weeks per season, week 0 ≈ first weekend of August):
 *  - weeks 0..44: club season. League matchdays on weekends; domestic cup and
 *    Champions Cup on some midweeks. International breaks (no club matches) ~ weeks 5, 10, 15, 30, 35.
 *  - winter transfer window ~ weeks 21..25; summer window weeks 45..51 (and 0..3 of the next season).
 *  - weeks 45..51: summer. In tournament years (World Cup: 2030, 2034…; Continental Cup:
 *    2028, 2032…) an international tournament is played in weeks 46..50.
 *  - A league of N teams needs 2(N−1) matchdays; place them so the season ends by week 44.
 */
export { WEEKS_PER_SEASON, LAST_CLUB_WEEK, weekInfo } from './calendar';
export { createSeasonCompetitions } from './create';
export { fixturesForWeek, userFixturesForWeek, findFixture, userLeague, leaguePosition, topScorers, isSeasonComplete } from './queries';
export { teamInfo, teamStrength } from './teams';
export { randomWeather, buildMatchContext } from './context';
export { quickSimulate } from './sim';
export { applyResult, simulateWeek } from './apply';
export { sortedTable } from './tables';
export { endOfSeason } from './season';
export { startNewSeason } from './rollover';
export { computeAwards } from './awards';
export { buildTeamSheet } from './sheet';

// Additions beyond the original contract (useful to UIs and other modules).
export { INTL_BREAK_WEEKS, tournamentOf } from './calendar';
export { championsCupEntrants } from './create';
export { findComp, leagueOf } from './queries';
export { compFormat, isKnockoutFixture, fixtureWinner } from './formats';
export { computePromotions } from './season';
