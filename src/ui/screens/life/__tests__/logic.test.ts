/** Pure helpers behind the life screens (tables, brackets, negotiation ranges, news, legacy, clubs). */
import { describe, expect, it } from 'vitest';
import { makeTestState } from '../../../../core/testing';
import type { Competition, ContractTerms, Fixture, GameState, LeagueDef, NewsArticle, Negotiation, TableRow } from '../../../../core/types';
import { overall } from '../../../../core/ratings';
import {
  askGreed, askRanges, bracketColumns, firstSentence, headlineOf, careerRecords, careerSpan, clubHonours, clubStints, compFamily, compactNumber, defaultWeek,
  effectChips, filterNews, fixtureOutcomeFor, groupRoundsOf, groupSquad, hallProgress, hallTier, heroOf, hueOf, initialsOf,
  legacySummaryText, lineGeometry, money, niceStep, offerWeeksLeft, radarPath, repStars, sameTerms, sentimentTone, signed, sortNews,
  sortRows, squadSummary, stepMoney, tableZone, tagCounts, trophyShelves, trophyStyle,
} from '../logic';

const league = (over: Partial<LeagueDef> = {}): LeagueDef => ({ id: 'ENG-1', country: 'ENG', tier: 1, name: 'L', teams: 18, promote: 0, relegate: 3, continentalSpots: 4, strength: 70, ...over });
const row = (teamId: string, points: number, gf: number, ga: number): TableRow => ({ teamId, played: 10, won: 0, drawn: 0, lost: 0, gf, ga, points, form: [] });
const fx = (id: string, round: number, extra: Partial<Fixture> = {}): Fixture => ({
  id, compId: 'CUP-ENG-2026', season: 2026, week: round, slot: 'midweek', round, homeId: 'A', awayId: 'B', played: false, ...extra,
});

describe('tables', () => {
  it('colours top-flight zones', () => {
    const lg = league();
    expect(tableZone(1, 18, lg)).toBe('title');
    expect(tableZone(3, 18, lg)).toBe('continental');
    expect(tableZone(10, 18, lg)).toBe('none');
    expect(tableZone(16, 18, lg)).toBe('relegation');
    expect(tableZone(1, 18, undefined)).toBe('none');
  });

  it('colours promotion in the second tier', () => {
    const lg = league({ tier: 2, promote: 2, relegate: 2, continentalSpots: 0 });
    expect(tableZone(2, 16, lg)).toBe('promotion');
    expect(tableZone(3, 16, lg)).toBe('none');
    expect(tableZone(15, 16, lg)).toBe('relegation');
  });

  it('sorts by points, goal difference, goals for, then name', () => {
    const names: Record<string, string> = { a: 'Alpha', b: 'Bravo', c: 'Charlie', d: 'Delta' };
    const sorted = sortRows([row('a', 10, 10, 10), row('b', 12, 5, 9), row('c', 10, 12, 12), row('d', 10, 12, 10)], (id) => names[id]);
    expect(sorted.map((r) => r.teamId)).toEqual(['b', 'd', 'c', 'a']);
  });
});

describe('fixtures & brackets', () => {
  it('derives a result for either side, including penalties', () => {
    const f = fx('x', 1, { played: true, homeId: 'A', awayId: 'B', homeGoals: 2, awayGoals: 1 });
    expect(fixtureOutcomeFor(f, 'A')).toBe('W');
    expect(fixtureOutcomeFor(f, 'B')).toBe('L');
    const draw = fx('y', 1, { played: true, homeGoals: 1, awayGoals: 1, pens: { home: 3, away: 5 } });
    expect(fixtureOutcomeFor(draw, 'A')).toBe('L');
    expect(fixtureOutcomeFor(draw, 'B')).toBe('W');
    expect(fixtureOutcomeFor(fx('z', 1), 'A')).toBeNull();
  });

  it('picks the right default week', () => {
    expect(defaultWeek([3, 5, 9], 4)).toBe(5);
    expect(defaultWeek([3, 5, 9], 12)).toBe(9);
    expect(defaultWeek([], 7)).toBe(7);
  });

  const cup = (fixtures: Fixture[], stage = 'R16'): Competition => ({
    id: 'CUP-ENG-2026', kind: 'cup', name: 'Cup', shortName: 'C', season: 2026, teamIds: [], fixtures, tables: {}, stage, winnerId: null, prizeMoney: 0,
  });

  it('adds placeholder columns up to the final', () => {
    const c = cup([fx('1', 1), fx('2', 1), fx('3', 1), fx('4', 1)], 'QF');
    const cols = bracketColumns(c, (k) => k);
    expect(cols.map((x) => x.name)).toEqual(['QF', 'SF', 'F']);
    expect(cols.map((x) => x.placeholder)).toEqual([false, true, true]);
    expect(cols[1].fixtures).toHaveLength(2);
  });

  it('does not invent rounds after the final', () => {
    const cols = bracketColumns(cup([fx('1', 1)], 'done'), (k) => k);
    expect(cols).toHaveLength(1);
    expect(cols.every((x) => !x.placeholder)).toBe(true);
  });

  it('knows which competitions have group stages', () => {
    const base = cup([]);
    expect(groupRoundsOf(base)).toBe(0);
    expect(groupRoundsOf({ ...base, id: 'CC-2026', kind: 'continental', tables: { A: [], B: [] } })).toBe(6);
    expect(groupRoundsOf({ ...base, id: 'WC-2030', kind: 'international', tables: { A: [] } })).toBe(3);
  });
});

describe('charts', () => {
  it('builds a radar path inside the radius', () => {
    const d = radarPath([100, 50, 0, 75], 100, 50, 60, 60);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    const nums = [...d.matchAll(/-?\d+\.\d/g)].map((m) => Number(m[0]));
    expect(Math.max(...nums)).toBeLessThanOrEqual(110.1);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(9.9);
  });

  it('handles empty, flat and single-point series', () => {
    expect(lineGeometry([], 100, 40).line).toBe('');
    expect(lineGeometry([5, 5, 5], 100, 40).pts).toHaveLength(3);
    const one = lineGeometry([7], 100, 40);
    expect(one.pts).toHaveLength(1);
    expect(one.pts[0].x).toBe(50);
  });
});

describe('negotiation helpers', () => {
  const terms = (over: Partial<ContractTerms> = {}): ContractTerms => ({ wage: 20_000, years: 3, releaseClause: 30_000_000, role: 'rotation', signingBonus: 100_000, goalBonus: 5_000, ...over });
  const neg = (): Negotiation => ({
    offerId: 'O1', clubId: 'C', round: 1, maxRounds: 4, patience: 80, current: terms(), lines: [], status: 'open',
    limits: { maxWage: 30_000, maxYears: 5, minReleaseClause: 20_000_000, maxSigningBonus: 250_000, maxGoalBonus: 12_000, roles: ['rotation', 'starter'] },
  });

  it('lets the sliders reach past the club limits', () => {
    const r = askRanges(neg());
    expect(r.wage[1]).toBeGreaterThan(30_000);
    expect(r.wage[0]).toBeLessThan(20_000);
    expect(r.signingBonus[1]).toBeGreaterThan(250_000);
    expect(r.years).toEqual([1, 5]);
  });

  it('measures how greedy an ask is', () => {
    const cur = terms();
    expect(askGreed(cur, cur)).toBe(0);
    expect(askGreed(terms({ wage: 40_000 }), cur)).toBeGreaterThan(askGreed(terms({ wage: 24_000 }), cur));
    expect(askGreed(terms({ role: 'star' }), cur)).toBeGreaterThan(0);
    expect(sameTerms(cur, terms())).toBe(true);
    expect(sameTerms(cur, terms({ years: 4 }))).toBe(false);
  });

  it('steps money values by a tidy amount and respects the bounds', () => {
    expect(niceStep(20_000)).toBeGreaterThanOrEqual(250);
    const up = stepMoney(20_000, 1);
    const down = stepMoney(20_000, -1);
    expect(up).toBeGreaterThan(20_000);
    expect(down).toBeLessThan(20_000);
    expect(stepMoney(1_000, -1, 900)).toBeGreaterThanOrEqual(900);
    expect(stepMoney(1_000, 1, 0, 1_050)).toBeLessThanOrEqual(1_050);
  });

  it('counts the weeks left on an offer', () => {
    expect(offerWeeksLeft(202610, 2026, 4)).toBe(6);
    expect(offerWeeksLeft(202701, 2026, 50)).toBe(3);
  });
});

describe('money', () => {
  it('writes unit words in Turkish and short suffixes in English', () => {
    expect(money(950, 'tr')).toBe('€950');
    expect(money(15_400, 'tr')).toBe('€15 bin');
    expect(money(2_640_000, 'tr')).toBe('€2,6 Mn');
    expect(money(1_250_000_000, 'tr')).toBe('€1,3 Mr');
    expect(money(15_400, 'en')).toBe('€15K');
    expect(money(2_640_000, 'en')).toBe('€2.6M');
    expect(money(-3_000_000, 'en')).toBe('-€3M');
  });
});

describe('effects & signs', () => {
  it('flattens effects into labelled chips', () => {
    const chips = effectChips({ money: -500, fame: 2, rel: { fans: 3 }, xp: { shooting: 4 }, injuryWeeks: 2 }, (k) => k);
    expect(chips.map((c) => c.key)).toEqual(['money', 'fame', 'rel.fans', 'xp.shooting', 'injury']);
    expect(chips[0].tone).toBe('danger');
    expect(chips[1].tone).toBe('accent');
    expect(effectChips(undefined, (k) => k)).toEqual([]);
  });

  it('formats signed numbers', () => {
    expect(signed(2)).toBe('+2');
    expect(signed(-1.26)).toBe('-1.3');
    expect(signed(0)).toBe('0');
  });
});

describe('news & social', () => {
  const art = (id: string, week: number, importance: number, tags: string[], aboutUser = false): NewsArticle => ({
    id, season: 2026, week, outlet: 'Daily', headline: id, body: 'a\n\nb', tags, importance, aboutUser, ai: false,
  });
  const news = [art('old-big', 1, 0.99, ['league']), art('new-small', 10, 0.2, ['match']), art('new-big', 10, 0.8, ['transfer', 'user'], true), art('mid', 9, 0.5, ['match'])];

  it('sorts newest first, then by importance', () => {
    expect(sortNews(news).map((a) => a.id)).toEqual(['new-big', 'new-small', 'mid', 'old-big']);
  });

  it('chooses a recent, important hero story', () => {
    expect(heroOf(news)?.id).toBe('new-big');
    expect(heroOf([])).toBeNull();
  });

  it('counts and filters by tag', () => {
    expect(tagCounts(news)[0]).toEqual({ tag: 'match', count: 2 });
    expect(filterNews(news, 'match')).toHaveLength(2);
    expect(filterNews(news, 'user').map((a) => a.id)).toEqual(['new-big']);
    expect(filterNews(news, null)).toHaveLength(4);
  });

  it('recovers a headline that a generator cut at an ordinal', () => {
    const body = '1. Lig: Sivas 4-1 Manisa. Sivas açısından sonuç: galibiyet.';
    expect(headlineOf({ headline: '1', body })).toBe('1. Lig: Sivas 4-1 Manisa');
    expect(headlineOf({ headline: 'Deniz Yıldız, kariyerindeki 1', body: 'Deniz Yıldız, kariyerindeki 1. golünü attı.' })).toBe('Deniz Yıldız, kariyerindeki 1. golünü attı');
    expect(headlineOf({ headline: 'Derbi heyecanı', body: 'Derbi heyecanı sürüyor.' })).toBe('Derbi heyecanı');
    expect(firstSentence('x'.repeat(300), 20)).toHaveLength(20);
  });

  it('formats follower counts per language', () => {
    expect(compactNumber(950)).toBe('950');
    expect(compactNumber(12_500, 'en')).toBe('12.5K');
    expect(compactNumber(2_300_000, 'tr')).toBe('2,3 Mn');
  });

  it('builds stable avatar details', () => {
    expect(hueOf('Deniz')).toBe(hueOf('Deniz'));
    expect(initialsOf('Kemal Usta')).toBe('KU');
    expect(initialsOf('İsmail Çelik')).toBe('İÇ');
    expect(initialsOf('')).toBe('?');
    expect(sentimentTone(0.6)).toBe('accent');
    expect(sentimentTone(-0.6)).toBe('danger');
    expect(sentimentTone(0)).toBe('neutral');
  });
});

describe('squads & clubs', () => {
  const state = makeTestState();
  const club = state.world.clubs['ENG-1-00'];
  const players = club.squad.map((id) => state.world.players[id]);

  it('groups a squad by position group in a stable order', () => {
    const g = groupSquad(players, overall);
    expect(g.GK.length + g.DEF.length + g.MID.length + g.ATT.length).toBe(players.length);
    expect(g.GK.every((p) => p.position === 'GK')).toBe(true);
    expect(g.ATT.every((p) => ['W', 'ST'].includes(p.position))).toBe(true);
  });

  it('summarises the squad', () => {
    const s = squadSummary(players, overall, state.season);
    expect(s.size).toBe(players.length);
    expect(s.avgOvr).toBeGreaterThan(30);
    expect(s.avgAge).toBeGreaterThan(16);
    expect(s.value).toBe(players.reduce((n, p) => n + p.value, 0));
    expect(s.injured).toBe(0);
    expect(squadSummary([], overall, 2026).size).toBe(0);
  });

  it('maps reputation to half-star steps', () => {
    expect(repStars(100)).toBe(5);
    expect(repStars(1)).toBe(0.5);
    expect(repStars(55)).toBe(3);
  });

  it('collects club honours across seasons', () => {
    const s: GameState = makeTestState();
    s.competitions['ENG-1-2028'] = { id: 'ENG-1-2028', kind: 'league', name: 'Test Division', shortName: 'TD', season: 2028, teamIds: [], fixtures: [], tables: {}, stage: 'done', winnerId: 'ENG-1-00', prizeMoney: 0 };
    s.seasons.push(
      { season: 2026, champions: { 'ENG-1-2026': 'ENG-1-00', 'CC-2026': 'ENG-1-01' }, awards: [], promoted: [], relegated: [] },
      { season: 2027, champions: { 'ENG-1-2027': 'ENG-1-00', 'CC-2027': 'ENG-1-00' }, awards: [], promoted: [], relegated: [] },
    );
    const mine = clubHonours(s, 'ENG-1-00');
    const lg = mine.find((h) => h.key === 'ENG-1');
    expect(lg?.seasons).toEqual([2026, 2027, 2028]);
    expect(lg?.name).toBe('Test Division');
    expect(mine.find((h) => h.key === 'CC')?.seasons).toEqual([2027]);
    expect(clubHonours(s, 'ENG-1-02')).toEqual([]);
  });
});

describe('legacy', () => {
  it('maps scores to tiers and progress', () => {
    expect(hallTier(0).id).toBe('unknown');
    expect(hallTier(250).id).toBe('journeyman');
    expect(hallTier(1000).id).toBe('star');
    expect(hallTier(2600).id).toBe('immortal');
    expect(hallProgress(2900)).toBe(1);
    expect(hallProgress(600)).toBeCloseTo((600 - 500) / 500, 5);
  });

  const withHistory = (): GameState => {
    const s = makeTestState();
    const rec = (season: number, clubId: string, goals: number, rating: number, ovr: number, trophies: string[] = []) => ({
      season, clubId, clubName: clubId, league: 'L', leaguePos: 3,
      stats: { apps: 30, starts: 28, minutes: 2500, goals, assists: goals / 2, ratingSum: rating * 30, motm: 2, yellow: 1, red: 0, cleanSheets: 0 },
      avgRating: rating, overall: ovr, value: ovr * 1_000_000, trophies,
    });
    s.career.history = [rec(2026, 'ENG-1-00', 8, 6.8, 62), rec(2027, 'ENG-1-00', 14, 7.2, 68, ['Cup']), rec(2028, 'ENG-1-03', 21, 7.6, 74), rec(2030, 'ENG-1-03', 5, 6.5, 71)];
    return s;
  };

  it('finds career records', () => {
    const r = careerRecords(withHistory());
    expect(r.bestSeasonGoals).toEqual({ season: 2028, goals: 21 });
    expect(r.bestRating?.season).toBe(2028);
    expect(r.peakOverall).toEqual({ season: 2028, overall: 74 });
    expect(careerRecords(makeTestState()).bestSeasonGoals).toBeNull();
  });

  it('collapses consecutive seasons into club stints', () => {
    const stints = clubStints(withHistory());
    expect(stints.map((s) => [s.clubId, s.from, s.to])).toEqual([['ENG-1-00', 2026, 2027], ['ENG-1-03', 2028, 2028], ['ENG-1-03', 2030, 2030]]);
    expect(stints[0].goals).toBe(22);
    expect(stints[0].trophies).toEqual(['Cup']);
  });

  it('spans the career in years', () => {
    expect(careerSpan(withHistory())).toBe('2026–2030');
    expect(careerSpan(makeTestState())).toBe('2026');
  });

  it('groups trophies into shelves, biggest first', () => {
    const shelves = trophyShelves([
      { compId: 'CUP-ENG-2026', name: 'Cup', season: 2026 }, { compId: 'ENG-1-2027', name: 'League', season: 2027 },
      { compId: 'CC-2028', name: 'Champions Cup', season: 2028 }, { compId: 'ENG-1-2029', name: 'League', season: 2029 },
    ]);
    expect(shelves.map((s) => s.key)).toEqual(['CC', 'ENG-1', 'CUP-ENG']);
    expect(shelves[1].seasons).toEqual([2027, 2029]);
    expect(trophyStyle('CC-2028').icon).toBe('crown');
    expect(trophyStyle('CC').icon).toBe('crown');
    expect(trophyStyle('ENG-1').icon).toBe('trophy');
    expect(compFamily('ENG-1-2027')).toBe('ENG-1');
  });

  it('writes a shareable plain-text summary', () => {
    const text = legacySummaryText(
      { name: 'Deniz Yıldız', tier: 'Legend', score: 1800, span: '2026–2042', clubs: ['A', 'B'], apps: 500, goals: 300, assists: 120, trophies: 9, caps: 60, peakOvr: 91, peakValue: '€120M' },
      { score: 'Score', apps: 'Apps', goals: 'Goals', assists: 'Assists', trophies: 'Trophies', caps: 'Caps', peak: 'Peak', value: 'Value' },
    );
    expect(text).toContain('Deniz Yıldız · 2026–2042');
    expect(text).toContain('A → B');
    expect(text).toContain('Goals: 300');
    expect(text.split('\n').at(-1)).toBe('#NeoStarSoccer');
  });
});
