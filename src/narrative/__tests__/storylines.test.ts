import { describe, expect, it } from 'vitest';
import { initialStorylines, STORY_KINDS, updateStorylines, resolveEvent, newsSeedsForWeek, templateNarrator, buildNarrativeContext } from '../api';
import { STORY_BEATS } from '../data/story_beats';
import { NEWS_TABLES } from '../news';
import { stateFor, withLeague, rngOf } from './kit';
import { Rng } from '../../core/rng';
import type { GameState, Storyline } from '../../core/types';
import { parseFacts } from '../grammar';

function addRivalClub(s: GameState) {
  const rival = s.world.players[s.career.rivalId];
  return rival;
}

describe('storylines', () => {
  it('has the twelve arcs and every beat used by them exists', () => {
    expect(STORY_KINDS.length).toBeGreaterThanOrEqual(10);
    for (const k of ['rival', 'mentor', 'hometown', 'manager_feud', 'love', 'scandal', 'injury_comeback', 'wonderkid_threat', 'agent_drama', 'golden_generation', 'underdog_title', 'contract_standoff']) {
      expect(STORY_KINDS).toContain(k);
    }
    const ids = new Set(STORY_BEATS.map((b) => b.id));
    for (const id of ['rival_buildup', 'rival_after_win', 'rival_after_loss', 'rival_resolution', 'mentor_lesson_1', 'mentor_lesson_2', 'mentor_farewell', 'hometown_call', 'feud_public', 'feud_summit', 'love_paparazzi', 'love_proposal', 'love_breakup', 'scandal_press', 'comeback_rehab', 'comeback_return', 'wonderkid_buzz', 'wonderkid_pressure', 'agent_whisper', 'agent_confront', 'golden_camp', 'golden_tournament', 'underdog_rise', 'underdog_dream', 'underdog_parade', 'standoff_ultimatum']) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it('starts with the rival, the mentor and a natural extra arc', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = stateFor('tr', { seed });
      const list = initialStorylines(s, new Rng(seed));
      const kinds = list.map((x) => x.kind);
      expect(kinds).toContain('rival');
      expect(kinds).toContain('mentor');
      expect(list.length).toBeGreaterThanOrEqual(3);
      expect(list.length).toBeLessThanOrEqual(5);
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
      for (const st of list) { expect(st.active).toBe(true); expect(st.stage).toBe(0); expect(() => JSON.stringify(st)).not.toThrow(); }
    }
  });

  it('updateStorylines returns well-formed output for every trigger and never throws', () => {
    const s = stateFor('en');
    s.storylines = initialStorylines(s, rngOf(1));
    const triggers = [
      { kind: 'week' as const },
      { kind: 'match' as const, fixtureId: 'nope', won: true, userGoals: 1, rating: 7.4, vsRival: false },
      { kind: 'transfer' as const, fromClubId: null, toClubId: 'ENG-1-01' },
      { kind: 'injury' as const, weeks: 6 },
      { kind: 'season_end' as const },
      { kind: 'award' as const, key: 'golden_ball' },
    ];
    for (const t of triggers) {
      const out = updateStorylines(s, rngOf(2), t);
      expect(Array.isArray(out.events)).toBe(true);
      expect(Array.isArray(out.seeds)).toBe(true);
      expect(out.events.length).toBeLessThanOrEqual(2);
    }
    expect(() => JSON.stringify(s)).not.toThrow();
  });

  it('rival arc: duel result creates a news seed and a decision, season end resolves it', async () => {
    const s = stateFor('tr');
    s.storylines = initialStorylines(s, rngOf(1));
    const out = updateStorylines(s, rngOf(3), { kind: 'match', fixtureId: 'x', won: true, userGoals: 1, rating: 8, vsRival: true });
    const rival = s.storylines.find((x) => x.kind === 'rival')!;
    expect(rival.data.duels).toBe(1);
    expect(rival.data.wins).toBe(1);
    expect(rival.stage).toBeGreaterThanOrEqual(1);
    expect(out.events.map((e) => e.defId)).toContain('rival_after_win');
    expect(out.events[0].storylineId).toBe(rival.id);
    expect(out.seeds.length).toBeGreaterThan(0);
    const seed = out.seeds[0];
    expect(parseFacts(seed.facts).k).toBe('rival_result_win');
    expect(seed.aboutUser).toBe(true);
    // the seed turns into an article through the same newsroom
    const [art] = await templateNarrator.news(buildNarrativeContext(s), [seed]);
    expect(art.headline.length).toBeGreaterThan(8);
    // second duel (a loss) then season end → resolution
    updateStorylines(s, rngOf(4), { kind: 'match', fixtureId: 'y', won: false, userGoals: 0, rating: 5.5, vsRival: true });
    expect(rival.data.losses).toBe(1);
    const end = updateStorylines(s, rngOf(5), { kind: 'season_end' });
    expect(rival.active).toBe(false);
    expect(end.events.map((e) => e.defId)).toContain('rival_resolution');
    expect(parseFacts(end.seeds[0].facts).k).toBe('rival_resolved');
    expect(s.flags['narr.rival.done']).toBeTypeOf('number');
  });

  it('rival build-up is announced the week before the clubs meet', () => {
    const s = stateFor('tr', { week: 9 });
    withLeague(s);
    const rival = addRivalClub(s);
    const rivalClubId = rival.clubId!;
    const myClubId = s.world.players[s.career.playerId].clubId!;
    s.competitions['ENG-1-2026'].fixtures.push({ id: 'F1', compId: 'ENG-1-2026', season: s.season, week: 10, slot: 'weekend', round: 10, homeId: myClubId, awayId: rivalClubId, played: false });
    s.storylines = initialStorylines(s, rngOf(1));
    const out = updateStorylines(s, rngOf(2), { kind: 'week' });
    expect(out.events.map((e) => e.defId)).toContain('rival_buildup');
    expect(out.seeds.some((x) => parseFacts(x.facts).k === 'rival_buildup')).toBe(true);
    // not twice in a row
    const again = updateStorylines(s, rngOf(2), { kind: 'week' });
    expect(again.events.map((e) => e.defId)).not.toContain('rival_buildup');
  });

  it('love, scandal, comeback and contract arcs start from their triggers', () => {
    const s = stateFor('tr', { week: 14 });
    s.career.partnerId = 'PER-p';
    s.career.people.push({ id: 'PER-p', name: 'Defne Kaya', role: 'partner', personality: 'x', bio: 'y', relationship: 80 });
    s.flags['narr.scandal.pending'] = true;
    s.world.players[s.career.playerId].injury = { key: 'knock', weeksLeft: 7, severity: 2 } as never;
    s.world.players[s.career.playerId].contract!.endSeason = s.season;
    updateStorylines(s, rngOf(1), { kind: 'injury', weeks: 7 });
    updateStorylines(s, rngOf(2), { kind: 'week' });
    const kinds = s.storylines.filter((x) => x.active).map((x) => x.kind);
    expect(kinds).toContain('injury_comeback');
    expect(kinds.filter((k) => ['love', 'scandal'].includes(k)).length).toBeGreaterThanOrEqual(1);
    // progress them a few weeks
    const events: string[] = [];
    for (let w = 15; w < 30; w++) {
      s.week = w;
      const out = updateStorylines(s, new Rng(w), { kind: 'week' });
      events.push(...out.events.map((e) => e.defId));
      s.events.push(...out.events);
      for (const e of s.events) if (!e.resolved) resolveEvent(s, e.id, e.choices[0].id, new Rng(w));
    }
    expect(events.some((id) => ['love_paparazzi', 'scandal_press', 'comeback_rehab', 'standoff_ultimatum'].includes(id))).toBe(true);
  });

  it('comeback arc ends with a return beat once the injury has healed', () => {
    const s = stateFor('en', { week: 5 });
    const p = s.world.players[s.career.playerId];
    p.injury = { key: 'knock', weeksLeft: 6, severity: 2 } as never;
    updateStorylines(s, rngOf(1), { kind: 'injury', weeks: 6 });
    const arc = s.storylines.find((x) => x.kind === 'injury_comeback') as Storyline;
    expect(arc).toBeTruthy();
    s.week = 8;
    updateStorylines(s, rngOf(2), { kind: 'week' });
    p.injury = null;
    s.week = 12;
    const out = updateStorylines(s, rngOf(3), { kind: 'week' });
    expect(out.events.map((e) => e.defId)).toContain('comeback_return');
    expect(arc.active).toBe(false);
  });

  it('every news key a storyline can emit exists in the news banks', () => {
    for (const k of ['rival_goals', 'rival_move', 'rival_injury', 'rival_buildup', 'rival_result_win', 'rival_result_loss', 'rival_resolved', 'mentor_praise', 'mentor_farewell', 'hometown_call', 'feud_public', 'feud_resolved', 'love_tabloid', 'love_engaged', 'love_split', 'scandal_break', 'scandal_fade', 'comeback_return', 'comeback_setback', 'wonderkid_buzz', 'wonderkid_loan', 'agent_split', 'golden_call', 'underdog_rise', 'underdog_title', 'underdog_near', 'standoff_public', 'standoff_signed', 'derby_hype', 'apps_milestone', 'season_goals', 'upset', 'thrashing', 'leader_change', 'win_streak', 'scorer_race', 'title_race', 'relegation_fight']) {
      expect(NEWS_TABLES[k], k).toBeTruthy();
    }
  });
});

describe('newsSeedsForWeek', () => {
  it('reports upsets, thrashings, leader changes and the user\'s milestones', () => {
    const s = stateFor('en', { week: 12 });
    const comp = withLeague(s);
    const ids = comp.teamIds;
    // fixtures of week 12: a big upset (weakest beats strongest) and a thrashing, not involving the user's club
    const strong = ids[ids.length - 1];
    const weak = ids[2];
    comp.fixtures.push(
      { id: 'A', compId: comp.id, season: s.season, week: 12, slot: 'weekend', round: 12, homeId: weak, awayId: strong, played: true, homeGoals: 2, awayGoals: 0 },
      { id: 'B', compId: comp.id, season: s.season, week: 12, slot: 'weekend', round: 12, homeId: ids[3], awayId: ids[4], played: true, homeGoals: 0, awayGoals: 5 },
    );
    s.flags[`narr.leader.${comp.id}`] = ids[1];
    s.world.players[s.career.playerId].season.goals = 10;
    s.world.players[s.career.playerId].career.apps = 52;
    const seeds = newsSeedsForWeek(s, { season: s.season, week: 12, results: [], userMatches: [], progression: [], moneyDelta: 0, messages: [] }, new Rng(4));
    const keys = seeds.map((x) => parseFacts(x.facts).k);
    expect(keys).toContain('upset');
    expect(keys).toContain('leader_change');
    expect(keys).toContain('season_goals');
    expect(keys).toContain('apps_milestone');
    for (const x of seeds) {
      expect(x.importance).toBeGreaterThanOrEqual(0);
      expect(x.importance).toBeLessThanOrEqual(1);
      expect(parseFacts(x.facts).say.length).toBeGreaterThan(10);
      expect(NEWS_TABLES[parseFacts(x.facts).k]).toBeTruthy();
    }
    const up = seeds.find((x) => parseFacts(x.facts).k === 'upset')!;
    expect(up.facts).toContain('2-0');
    // the same week twice does not repeat one-shot milestones
    const again = newsSeedsForWeek(s, { season: s.season, week: 12, results: [], userMatches: [], progression: [], moneyDelta: 0, messages: [] }, new Rng(4));
    expect(again.map((x) => parseFacts(x.facts).k)).not.toContain('season_goals');
  });

  it('tracks the rival\'s goals and transfers', () => {
    const s = stateFor('tr', { week: 20 });
    const rival = s.world.players[s.career.rivalId];
    rival.season.goals = 10;
    s.flags['narr.rv.club'] = 'ENG-1-05';
    const seeds = newsSeedsForWeek(s, { season: s.season, week: 20, results: [], userMatches: [], progression: [], moneyDelta: 0, messages: [] }, new Rng(1));
    const keys = seeds.map((x) => parseFacts(x.facts).k);
    expect(keys).toContain('rival_goals');
    expect(keys).toContain('rival_move');
  });

  it('can spread transfer gossip about a hot player, and writes it up', async () => {
    let found = 0;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const s = stateFor('tr', { week: 15 });
      s.career.fame = 60;
      s.world.players[s.career.playerId].form = 80;
      const seeds = newsSeedsForWeek(s, { season: s.season, week: 15, results: [], userMatches: [], progression: [], moneyDelta: 0, messages: [] }, new Rng(seed));
      const g = seeds.find((x) => x.kind === 'transfer_rumour');
      if (g) {
        found++;
        const [art] = await templateNarrator.news(buildNarrativeContext(s), [g]);
        expect(art.body.length).toBeGreaterThan(30);
      }
    }
    expect(found).toBe(1);
  });
});
