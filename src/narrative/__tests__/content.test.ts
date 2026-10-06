import { describe, expect, it } from 'vitest';
import { MATCH_LINES, MOMENT_LINES } from '../commentary';
import { GENESIS_BANKS } from '../genesis';
import { NEWS_TABLES } from '../news';
import { matchCommentary, momentCommentary, outletsFor, allOutlets } from '../api';
import { Rng } from '../../core/rng';
import type { MatchEventKind, MomentEvent } from '../../core/types';
import { hasKey, t } from '../../core/i18n';
import { fill, trSuffix } from '../grammar';
import '../strings';

const KINDS = Object.keys(MATCH_LINES) as MatchEventKind[];

describe('i18n parity', () => {
  it('news banks exist in TR and EN with matching slot sets', () => {
    const slots = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]);
    for (const [key, e] of Object.entries(NEWS_TABLES)) {
      for (const bank of [e.h, e.f]) {
        expect(bank.tr.length, key).toBeGreaterThan(0);
        expect(bank.en.length, key).toBeGreaterThan(0);
        for (const lang of ['tr', 'en'] as const) for (const line of bank[lang]) expect(line.length).toBeGreaterThan(5);
      }
      // every slot used in one language must be available in the other too (same key set)
      const set = (arr: readonly string[]) => new Set(arr.flatMap(slots));
      for (const bank of [e.h, e.f]) {
        const tr = set(bank.tr); const en = set(bank.en);
        for (const k of tr) expect(en.has(k) || k === 'first', `${key}: {${k}} only in TR`).toBe(true);
      }
    }
  });
  it('commentary and genesis banks are complete in both languages', () => {
    for (const k of KINDS) { expect(MATCH_LINES[k].tr.length, k).toBeGreaterThan(0); expect(MATCH_LINES[k].en.length, k).toBeGreaterThan(0); }
    for (const [k, b] of Object.entries(MOMENT_LINES)) { expect(b.tr.length, k).toBeGreaterThan(0); expect(b.en.length, k).toBeGreaterThan(0); }
    for (const b of GENESIS_BANKS) { expect(b.tr.length).toBeGreaterThan(0); expect(b.en.length).toBeGreaterThan(0); }
  });
  it('registered strings match across languages', () => {
    for (const k of ['pot.generational', 'story.rival', 'story.contract_standoff', 'tone.humble', 'topic.rival', 'persona.agent', 'ev.missing']) {
      expect(hasKey(`narr.${k}`)).toBe(true);
      expect(t(`narr.${k}`, undefined, 'tr')).not.toBe(t(`narr.${k}`, undefined, 'en'));
    }
  });
});

describe('commentary', () => {
  it('has many energetic variants for goals', () => {
    expect(MATCH_LINES.goal.tr.length).toBeGreaterThanOrEqual(5);
    expect(MATCH_LINES.goal.en.length).toBeGreaterThanOrEqual(5);
  });
  it('writes a line for every macro event kind', () => {
    for (const kind of KINDS) {
      for (const seed of [1, 2, 3]) {
        const line = matchCommentary(kind, { player: 'Deniz Yıldız', team: 'Test City', minute: 37, score: '2-1' }, new Rng(seed));
        expect(line.length, kind).toBeGreaterThan(3);
        expect(line, kind).not.toMatch(/[{}]|undefined/);
      }
    }
  });
  it('moment commentary is null for low-value events and a line for the big ones', () => {
    const rng = new Rng(1);
    const names = (id: string) => `Player ${id}`;
    const goal = { t: 'goal', scorer: 'a', assist: null, side: 'us', minute: 3 } as unknown as MomentEvent;
    expect(momentCommentary(goal, names, rng)).toMatch(/Player a|GOL|GOAL|goal/i);
    const post = { t: 'woodwork', part: 'post', by: 'a' } as unknown as MomentEvent;
    expect(momentCommentary(post, names, rng)).toBeTruthy();
    const pass = { t: 'pass', from: 'a', to: 'b', ok: true } as unknown as MomentEvent;
    expect(momentCommentary(pass, names, rng)).toBeNull();
  });
});

describe('outlets', () => {
  it('has invented outlets for the big seven and Türkiye', () => {
    for (const c of ['TUR', 'ENG', 'ESP', 'ITA', 'GER', 'FRA', 'POR', 'NED']) {
      const list = outletsFor(c);
      expect(list.length).toBeGreaterThanOrEqual(4);
      expect(new Set(list).size).toBe(list.length);
    }
    expect(outletsFor('TUR')).toEqual(expect.arrayContaining(['Gol Postası', 'Tribün Gazetesi', 'Saha Kenarı', 'Futbol Ekspres']));
    expect(outletsFor('ENG')).toEqual(expect.arrayContaining(['The Touchline', 'Evening Whistle']));
    expect(outletsFor('xxx').length).toBeGreaterThan(0);
    expect(allOutlets().length).toBeGreaterThan(30);
  });
  it('never leaks a mutable list', () => {
    outletsFor('TUR').push('x');
    expect(outletsFor('TUR')).not.toContain('x');
  });
});

describe('Turkish grammar engine', () => {
  it('inflects names with vowel harmony', () => {
    const r = new Rng(1);
    expect(fill('{a:dat} {b:acc} {c:loc} {d:gen}', { a: 'Ankara', b: 'İzmir', c: 'Bursa', d: 'Galatasaray' }, r, 'tr')).toBe("Ankara'ya İzmir'i Bursa'da Galatasaray'ın");
    expect(trSuffix('Deniz', 'ins')).toBe("Deniz'le");
    expect(fill('{n:dat}', { n: 5 }, r, 'tr')).toBe("5'e");
    expect(fill('{p:gen}', { p: 'James' }, r, 'en')).toBe("James'");
  });
});
