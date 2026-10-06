import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { makeTestState } from '../../../../core/testing';
import { setLang } from '../../../../core/i18n';
import { effectChips } from '../EffectChips';
import { openClubOffers } from '../TrialOffers';
import {
  DEFAULT_KIT, attempt, clearFocusedEvent, formatDate, leagueNameOf, money, openEvent, relativeWeek, resetEventSnooze, snoozeEvent,
  teamView, useEventFocus, userView,
} from '../helpers';
import type { TransferOffer } from '../../../../core/types';
import '../strings';

afterEach(() => { setLang('tr'); clearFocusedEvent(); resetEventSnooze(); });

describe('money', () => {
  it('spells Turkish units out so "B" never reads as billions', () => {
    setLang('tr');
    expect(money(850)).toBe('€850');
    expect(money(1500)).toBe('€1,5 bin');
    expect(money(48_000)).toBe('€48 bin');
    expect(money(2_100_000)).toBe('€2,1 Mn');
    expect(money(3_000_000_000)).toBe('€3 Mr');
    expect(money(-500_000)).toBe('-€500 bin');
  });

  it('uses the core compact format in English', () => {
    setLang('en');
    expect(money(1500)).toBe('€2K');
    expect(money(2_100_000)).toBe('€2.1M');
  });
});

describe('effect chips', () => {
  it('turns bounded effects into labelled, toned chips', () => {
    setLang('en');
    const chips = effectChips({ money: -2500, fame: 3, morale: 4, rel: { manager: -4, agent: 2 }, xp: { shooting: 5 }, injuryWeeks: 2 });
    const by = Object.fromEntries(chips.map((c) => [c.key, c]));
    expect(by.money.value).toBe('−€3K');
    expect(by.money.tone).toBe('danger');
    expect(by.fame.value).toBe('+3');
    expect(by.fame.tone).toBe('gold');
    expect(by.morale.tone).toBe('accent');
    expect(by['rel-manager'].tone).toBe('danger');
    expect(by['rel-agent'].tone).toBe('violet');
    expect(by['xp-shooting'].label).toBe('Shooting');
    expect(by.injury.value).toBe('2 wk');
  });

  it('ignores empty or missing effects', () => {
    expect(effectChips(undefined)).toEqual([]);
    expect(effectChips({})).toEqual([]);
    expect(effectChips({ money: 0, rel: { fans: 0 } })).toEqual([]);
  });
});

describe('state selectors', () => {
  it('finds the user, their club and league', () => {
    const s = makeTestState();
    const v = userView(s);
    expect(v?.player.id).toBe('USER');
    expect(v?.club?.id).toBe('ENG-1-00');
    expect(leagueNameOf(s, v!.club)).toBe('Test Division');
    expect(userView(null)).toBeNull();
  });

  it('is clubless safe for a free agent', () => {
    const s = makeTestState();
    s.world.players.USER.clubId = null;
    const v = userView(s);
    expect(v?.club).toBeNull();
    expect(leagueNameOf(s, null)).toBe('');
  });

  it('resolves club and national team views with a graceful fallback', () => {
    const s = makeTestState();
    expect(teamView(s, 'ENG-1-02').name).toBe('Test City 2');
    s.world.nationalTeams['NT-TUR'] = {
      id: 'NT-TUR', nation: 'TUR', name: { tr: 'Türkiye', en: 'Turkey' }, kit: DEFAULT_KIT, reputation: 70, squad: [], managerName: 'X',
    };
    setLang('en');
    expect(teamView(s, 'NT-TUR')).toMatchObject({ name: 'Turkey', shortName: 'TUR' });
    expect(teamView(s, 'ghost-9')).toMatchObject({ name: 'ghost-9', shortName: 'GHO' });
  });

  it('describes message age relative to the current week', () => {
    const s = makeTestState();
    s.week = 10;
    setLang('en');
    expect(relativeWeek(s, 2026, 10)).toBe('Now');
    expect(relativeWeek(s, 2026, 9)).toBe('Last week');
    expect(relativeWeek(s, 2026, 4)).toBe('6 weeks ago');
    expect(relativeWeek(s, 2024, 4)).toContain('2024/25');
  });

  it('formats dates in the UI language and tolerates garbage', () => {
    setLang('en');
    expect(formatDate('2026-08-08')).toMatch(/8 Aug 2026/);
    expect(formatDate('nope')).toBe('');
    expect(formatDate(undefined)).toBe('');
  });

  it('attempt() swallows throws', () => {
    expect(attempt(() => { throw new Error('x'); }, 7)).toBe(7);
    expect(attempt(() => 3, 7)).toBe(3);
  });
});

describe('trial offers', () => {
  const offer = (id: string, kind: TransferOffer['kind'], status: TransferOffer['status'] = 'pending'): TransferOffer => ({
    id, kind, fromClubId: 'ENG-1-01', season: 2026, week: 0, expiresWeek: 202610, fee: 0, status, parentClubAccepts: true, note: '',
    terms: { wage: 1000, years: 2, releaseClause: null, role: 'prospect', signingBonus: 0, goalBonus: 0 },
  });

  it('prefers trial offers and ignores closed ones', () => {
    const s = makeTestState();
    s.offers = [offer('a', 'transfer'), offer('b', 'trial'), offer('c', 'trial', 'rejected'), offer('d', 'trial', 'negotiating')];
    expect(openClubOffers(s).map((o) => o.id)).toEqual(['b', 'd']);
    s.offers = [offer('a', 'transfer'), offer('x', 'loan', 'expired')];
    expect(openClubOffers(s).map((o) => o.id)).toEqual(['a']);
  });
});

describe('event focus store', () => {
  const probe = () => {
    const P = () => {
      const f = useEventFocus();
      return createElement('i', null, `${f.focused ?? '-'}|${[...f.snoozed].join(',')}`);
    };
    return renderToStaticMarkup(createElement(P));
  };

  it('focuses, snoozes and clears events', () => {
    expect(probe()).toBe('<i>-|</i>');
    openEvent('ev-1');
    expect(probe()).toBe('<i>ev-1|</i>');
    snoozeEvent('ev-1');
    expect(probe()).toBe('<i>-|ev-1</i>');
    openEvent('ev-1');
    expect(probe()).toBe('<i>ev-1|</i>');
    snoozeEvent('ev-2');
    resetEventSnooze();
    expect(probe()).toBe('<i>ev-1|</i>');
    clearFocusedEvent();
    expect(probe()).toBe('<i>-|</i>');
  });
});
