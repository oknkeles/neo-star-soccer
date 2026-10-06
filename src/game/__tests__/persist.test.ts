import { describe, expect, it } from 'vitest';
import { makeTestState } from '../../core/testing';
import type { GameState, InboxMessage, NewsArticle, SocialPost } from '../../core/types';
import {
  CAPS, SAVE_CAPS, SAVE_SCHEMA, SaveError, SPONSOR_FLAG, enforceCaps, envelope, makeMeta, migrateState, parseSave,
  parseSaveJson, trimEvents, trimForSave, trimInbox,
} from '../persist';
import '../strings';

function news(s: GameState, n: number): NewsArticle[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `N-${i}`, season: s.season, week: 0, outlet: 'X', headline: `h${i}`, body: '', tags: [], importance: 0.5, aboutUser: false, ai: false,
  }));
}

function posts(s: GameState, n: number): SocialPost[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `S-${i}`, season: s.season, week: 0, author: { name: 'a', handle: '@a', kind: 'fan', verified: false }, text: `p${i}`,
    likes: 0, reposts: 0, sentiment: 0, ai: false,
  }));
}

function mail(n: number, read: boolean, prefix = 'M'): InboxMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`, season: 2026, week: 0, kind: 'info', from: 'x', subject: 's', body: 'b', read,
  }));
}

describe('trimming', () => {
  it('trimForSave keeps the most recent feed items, the whole world, and does not touch the live state', () => {
    const s = makeTestState();
    s.news = news(s, 300);
    s.social = posts(s, 400);
    s.inbox = mail(300, true);
    const players = Object.keys(s.world.players).length;
    const lean = trimForSave(s);
    expect(lean.news).toHaveLength(SAVE_CAPS.news);
    expect(lean.news[lean.news.length - 1].id).toBe('N-299');
    expect(lean.social).toHaveLength(SAVE_CAPS.social);
    expect(lean.inbox.length).toBeLessThanOrEqual(SAVE_CAPS.inbox);
    expect(Object.keys(lean.world.players)).toHaveLength(players);
    expect(s.news).toHaveLength(300);
    expect(s.social).toHaveLength(400);
  });

  it('trimInbox drops read mail first and never drops actionable messages', () => {
    const s = makeTestState();
    s.offers.push({
      id: 'OF-1', kind: 'transfer', fromClubId: 'ENG-1-01', season: 2026, week: 0, expiresWeek: 202610, fee: 1, status: 'pending',
      parentClubAccepts: true, note: '', terms: { wage: 1, years: 1, releaseClause: null, role: 'rotation', signingBonus: 0, goalBonus: 0 },
    });
    s.flags[SPONSOR_FLAG + 'SP-1'] = JSON.stringify({ deal: {}, at: 0 });
    const offerMsg: InboxMessage = { ...mail(1, true, 'OFFER')[0], ref: { type: 'offer', id: 'OF-1' } };
    const sponsorMsg: InboxMessage = { ...mail(1, true, 'SPON')[0], ref: { type: 'sponsor', id: 'SP-1' } };
    const list = [offerMsg, sponsorMsg, ...mail(10, false, 'U'), ...mail(10, true, 'R')];
    const out = trimInbox(s, list, 12);
    expect(out).toHaveLength(12);
    expect(out).toContain(offerMsg);
    expect(out).toContain(sponsorMsg);
    expect(out.filter((m) => m.id.startsWith('R'))).toHaveLength(0);
    expect(out.filter((m) => m.id.startsWith('U'))).toHaveLength(10);
  });

  it('trimEvents keeps every pending event and only the latest resolved ones', () => {
    const base = { defId: 'x', season: 2026, week: 0, title: 't', body: 'b', icon: 'x', choices: [], source: 'template' as const };
    const list = [
      ...Array.from({ length: 10 }, (_, i) => ({ ...base, id: `R${i}`, resolved: { choiceId: 'c', text: '' } })),
      { ...base, id: 'P1' },
      { ...base, id: 'P2' },
    ];
    const out = trimEvents(list, 3);
    expect(out.map((e) => e.id)).toEqual(['R7', 'R8', 'R9', 'P1', 'P2']);
  });

  it('enforceCaps applies in-game caps', () => {
    const s = makeTestState();
    s.news = news(s, CAPS.news + 20);
    s.social = posts(s, CAPS.social + 20);
    s.inbox = mail(CAPS.inbox + 20, true);
    s.chats = { agent: Array.from({ length: 60 }, (_, i) => ({ from: 'user' as const, text: `m${i}` })) };
    enforceCaps(s);
    expect(s.news).toHaveLength(CAPS.news);
    expect(s.social).toHaveLength(CAPS.social);
    expect(s.inbox).toHaveLength(CAPS.inbox);
    expect(s.chats.agent).toHaveLength(CAPS.chat);
    expect(s.chats.agent[CAPS.chat - 1].text).toBe('m59');
  });
});

describe('save format', () => {
  it('round-trips through JSON envelopes', () => {
    const s = makeTestState();
    const json = JSON.stringify(envelope(trimForSave(s)));
    const back = parseSaveJson(json);
    expect(back.id).toBe(s.id);
    expect(back.world.players.USER.firstName).toBe('Deniz');
    expect(back.rng).toEqual(s.rng);
  });

  it('accepts a bare state (older exports) and migrates schema 0', () => {
    const s = makeTestState() as unknown as Record<string, unknown>;
    delete s.schema;
    delete s.social;
    delete s.flags;
    (s.career as Record<string, unknown>).inventory = undefined;
    const st = migrateState(JSON.parse(JSON.stringify(s)));
    expect(st.schema).toBe(SAVE_SCHEMA);
    expect(st.social).toEqual([]);
    expect(st.flags).toEqual({});
    expect(st.career.inventory).toEqual([]);
    expect(() => parseSave(st)).not.toThrow();
  });

  it('rejects garbage, broken states and saves from the future', () => {
    expect(() => parseSaveJson('{nope')).toThrow(SaveError);
    expect(() => parseSave(42)).toThrow(SaveError);
    const s = makeTestState();
    expect(() => parseSave({ ...JSON.parse(JSON.stringify(s)), schema: SAVE_SCHEMA + 1 })).toThrow(/newer|yeni/i);
    const noUser = JSON.parse(JSON.stringify(s)) as GameState;
    delete noUser.world.players.USER;
    expect(() => parseSave(noUser)).toThrow(SaveError);
    const badRng = { ...JSON.parse(JSON.stringify(s)), rng: [1, 2] };
    expect(() => parseSave(badRng)).toThrow(SaveError);
  });

  it('builds slot metadata from the state', () => {
    const s = makeTestState();
    s.week = 7;
    const m = makeMeta(s, 2);
    expect(m).toMatchObject({ slot: 2, name: 'Deniz Yıldız', club: 'Test City 0', season: 2026, week: 7 });
    expect(m.overall).toBeGreaterThan(0);
  });
});
