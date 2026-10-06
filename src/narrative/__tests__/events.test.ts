import { describe, expect, it } from 'vitest';
import { EVENT_DEFS, eventDefById, resolveEvent, weeklyEvents } from '../api';
import { STORY_BEATS } from '../data/story_beats';
import { makeEvent } from '../eventkit';
import { buildFacts } from '../facts';
import { ICONS } from '../../ui/components/icons';
import { noHoles, rngOf, stateFor } from './kit';
import { Rng } from '../../core/rng';
import type { GameState } from '../../core/types';

const ALL = [...EVENT_DEFS, ...STORY_BEATS];

describe('event library', () => {
  it('has 60+ events plus storyline beats with unique ids', () => {
    expect(EVENT_DEFS.length).toBeGreaterThanOrEqual(60);
    expect(STORY_BEATS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(ALL.map((d) => d.id)).size).toBe(ALL.length);
  });

  it('every event is complete in TR and EN, with valid icons and 2-3 choices', () => {
    for (const d of ALL) {
      expect(ICONS, `icon of ${d.id}`).toHaveProperty(d.icon);
      for (const lang of ['tr', 'en'] as const) {
        expect(d.title[lang].length, `${d.id} title ${lang}`).toBeGreaterThan(2);
        expect(d.body[lang].length, `${d.id} body ${lang}`).toBeGreaterThan(30);
      }
      expect(d.choices.length, d.id).toBeGreaterThanOrEqual(2);
      expect(d.choices.length, d.id).toBeLessThanOrEqual(4);
      for (const c of d.choices) {
        for (const lang of ['tr', 'en'] as const) {
          expect(c.label[lang].length, `${d.id}.${c.id} label ${lang}`).toBeGreaterThan(2);
          expect(c.result[lang].length, `${d.id}.${c.id} result ${lang}`).toBeGreaterThan(5);
          if (c.risk) expect(c.risk.text[lang].length).toBeGreaterThan(5);
        }
      }
      expect(d.cooldown).toBeGreaterThanOrEqual(0);
    }
  });

  it('conditions and weights never throw on a bare state (any week, both languages)', () => {
    for (const lang of ['tr', 'en'] as const) {
      for (const week of [0, 3, 10, 21, 30, 44, 49]) {
        const s = stateFor(lang, { week });
        const f = buildFacts(s);
        for (const d of EVENT_DEFS) {
          expect(() => d.when(f)).not.toThrow();
          expect(() => (typeof d.weight === 'function' ? d.weight(f) : d.weight)).not.toThrow();
        }
      }
    }
  });

  it('every event renders into a concrete, hole-free GameEvent in both languages', () => {
    for (const lang of ['tr', 'en'] as const) {
      const s = stateFor(lang);
      s.career.partnerId = 'PER-partner';
      s.career.people.push({ id: 'PER-partner', name: 'Defne Kaya', role: 'partner', personality: 'x', bio: 'y', relationship: 70 });
      const f = buildFacts(s);
      for (const d of ALL) {
        const ev = makeEvent(s, d, f, rngOf(3));
        expect(ev.title && noHoles(ev.title), `${d.id} title`).toBeTruthy();
        expect(noHoles(ev.body), `${d.id} body: ${ev.body}`).toBe(true);
        expect(ev.choices.length, d.id).toBeGreaterThanOrEqual(2);
        for (const c of ev.choices) {
          expect(noHoles(c.label), `${d.id}.${c.id}`).toBe(true);
          expect(noHoles(c.resultText ?? ''), `${d.id}.${c.id} result`).toBe(true);
          expect(c.effects).toBeTypeOf('object');
        }
      }
    }
  });
});

describe('weeklyEvents', () => {
  it('picks 0-2 events, never duplicates a pending one, respects cooldowns', () => {
    const s = stateFor('tr');
    const counts = new Map<number, number>();
    const seenAtWeek: string[][] = [];
    for (let w = 1; w <= 40; w++) {
      s.week = w;
      const rng = new Rng(100 + w);
      const evs = weeklyEvents(s, rng);
      expect(evs.length).toBeLessThanOrEqual(2);
      counts.set(evs.length, (counts.get(evs.length) ?? 0) + 1);
      for (const e of evs) {
        expect(s.events.some((x) => !x.resolved && x.defId === e.defId)).toBe(false);
        expect(e.source).toBe('template');
        expect(e.choices.length).toBeGreaterThanOrEqual(2);
      }
      s.events.push(...evs);
      seenAtWeek.push(evs.map((e) => e.defId));
      // answer old events so the pending cap does not block everything
      for (const e of s.events) if (!e.resolved && w % 2 === 0) resolveEvent(s, e.id, e.choices[0].id, rngOf(w));
    }
    expect((counts.get(1) ?? 0) + (counts.get(2) ?? 0)).toBeGreaterThan(10);
    // an event with cooldown >= 40 appears at most once
    const flat = seenAtWeek.flat();
    for (const d of EVENT_DEFS.filter((x) => x.cooldown >= 40)) expect(flat.filter((id) => id === d.id).length).toBeLessThanOrEqual(1);
  });

  it('is deterministic for the same state and rng', () => {
    const a = weeklyEvents(stateFor('en'), new Rng(5)).map((e) => e.defId);
    const b = weeklyEvents(stateFor('en'), new Rng(5)).map((e) => e.defId);
    expect(a).toEqual(b);
  });

  it('varies between careers', () => {
    const sets = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const s = stateFor('tr', { seed });
      sets.add(weeklyEvents(s, new Rng(seed)).map((e) => e.defId).join(','));
    }
    expect(sets.size).toBeGreaterThan(5);
  });

  it('stops offering events when too many are pending or the career is over', () => {
    const s = stateFor('tr');
    for (let i = 0; i < 3; i++) s.events.push({ id: `E${i}`, defId: `x${i}`, season: 2026, week: 1, title: 't', body: 'b', icon: 'star', choices: [], source: 'template' });
    expect(weeklyEvents(s, rngOf())).toEqual([]);
    const done = stateFor('tr');
    done.career.retired = true;
    expect(weeklyEvents(done, rngOf())).toEqual([]);
  });

  it('turns on Turkey-specific events only for Turkish players', () => {
    const hits = (nation: string) => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const s = stateFor('tr', { seed, week: 8 });
        s.world.players[s.career.playerId].nation = nation as never;
        n += weeklyEvents(s, new Rng(seed)).filter((e) => ['mahalle_maci', 'first_coach_call', 'kahvehane_derby', 'nazar_boncugu', 'grandma_tv'].includes(e.defId)).length;
      }
      return n;
    };
    expect(hits('TUR')).toBeGreaterThan(0);
    expect(hits('BRA')).toBe(0);
  });
});

describe('resolveEvent', () => {
  function pending(s: GameState, id = 'fan_jersey') {
    const def = eventDefById(id)!;
    const ev = makeEvent(s, def, buildFacts(s), rngOf(2));
    s.events.push(ev);
    return ev;
  }

  it('applies effects, marks the event resolved and returns the result text', () => {
    const s = stateFor('tr');
    const ev = pending(s);
    const before = { fans: s.career.relationships.fans, money: s.career.money };
    const choice = ev.choices[0];
    const text = resolveEvent(s, ev.id, choice.id, rngOf(1));
    expect(text).toContain(choice.resultText!.slice(0, 10));
    expect(ev.resolved?.choiceId).toBe(choice.id);
    expect(ev.resolved?.text).toBe(text);
    const moved = s.career.relationships.fans !== before.fans || s.career.money !== before.money || Object.keys(choice.effects).length === 0 || choice.effects.morale !== undefined || choice.effects.fame !== undefined || choice.effects.followers !== undefined;
    expect(moved).toBe(true);
    expect(s.flags['narr.cd.fan_jersey']).toBeTypeOf('number');
  });

  it('is idempotent and tolerant of bad ids', () => {
    const s = stateFor('en');
    const ev = pending(s);
    const first = resolveEvent(s, ev.id, ev.choices[0].id, rngOf(1));
    expect(resolveEvent(s, ev.id, ev.choices[1].id, rngOf(1))).toBe(first);
    expect(resolveEvent(s, 'nope', 'x', rngOf())).toBeTruthy();
    const ev2 = pending(s, 'viral_video');
    expect(resolveEvent(s, ev2.id, 'no-such-choice', rngOf())).toBeTruthy();
    expect(ev2.resolved).toBeUndefined();
  });

  it('rolls the risk with the rng', () => {
    const s = stateFor('tr');
    const defWithRisk = ALL.find((d) => d.choices.some((c) => c.risk))!;
    const risky = defWithRisk.choices.find((c) => c.risk)!;
    const ev = makeEvent(s, defWithRisk, buildFacts(s), rngOf(2));
    s.events.push(ev);
    const hit = (seed: number) => {
      const copy = structuredClone(s);
      const text = resolveEvent(copy, ev.id, risky.id, new Rng(seed));
      return text.includes(ev.choices.find((c) => c.id === risky.id)!.risk!.text);
    };
    const results = Array.from({ length: 80 }, (_, i) => hit(i + 1));
    expect(results.some(Boolean)).toBe(true);
    expect(results.some((x) => !x)).toBe(true);
  });

  it('runs choice hooks and advances the linked storyline', () => {
    const s = stateFor('tr');
    s.storylines.push({ id: 'ST1', kind: 'agent_drama', stage: 2, startedSeason: 2026, data: { oldAgent: 'Kemal Usta' }, active: true });
    const def = eventDefById('agent_confront')!;
    const ev = makeEvent(s, def, buildFacts(s), rngOf(2), 'ST1');
    s.events.push(ev);
    resolveEvent(s, ev.id, 'fire', rngOf(1));
    expect(s.storylines[0].data.fired).toBe(true);
    expect(s.career.people.find((p) => p.role === 'agent')?.name).not.toBe('Kemal Usta');
    expect(s.storylines[0].data['last.agent_confront']).toBe('fire');
  });

  it('marks cooldowns so a resolved event does not come straight back', () => {
    const s = stateFor('tr');
    const ev = pending(s, 'tabloid_rumour');
    resolveEvent(s, ev.id, ev.choices[0].id, rngOf());
    const f = buildFacts(s);
    expect(f.weeksSince('narr.cd.tabloid_rumour')).toBeLessThan(2);
  });
});
