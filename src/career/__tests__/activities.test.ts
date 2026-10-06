import { describe, expect, it } from 'vitest';
import { ACTIVITIES, ACTIONS_PER_WEEK, buyItem, canDoActivity, doActivity, userPlayer } from '../api';
import { Rng } from '../../core/rng';
import type { TraitId } from '../../core/types';
import { makeRng, setUser, stateWith } from './kit';

describe('canDoActivity', () => {
  it('rejects unknown ids, missing energy, money, fame, actions and injuries', () => {
    const s = stateWith();
    expect(canDoActivity(s, 'nope').ok).toBe(false);
    s.career.energy = 2;
    expect(canDoActivity(s, 'night_club')).toMatchObject({ ok: false });
    s.career.energy = 90;
    s.career.money = 10;
    expect(canDoActivity(s, 'night_club').ok).toBe(false);
    s.career.money = 1e6;
    expect(canDoActivity(s, 'night_vip').ok).toBe(false);
    s.career.fame = 80;
    expect(canDoActivity(s, 'night_vip').ok).toBe(true);
    userPlayer(s).injury = { key: 'knock', weeksLeft: 2, severity: 1 };
    expect(canDoActivity(s, 'train_extra').ok).toBe(false);
    expect(canDoActivity(s, 'rest_home').ok).toBe(true);
    userPlayer(s).injury = null;
    s.career.actionsLeft = 0;
    expect(canDoActivity(s, 'rest_home').ok).toBe(false);
  });

  it('gates romance behind having (or not having) a partner', () => {
    const s = stateWith();
    expect(canDoActivity(s, 'romance_dinner').ok).toBe(false);
    expect(canDoActivity(s, 'romance_meet').ok).toBe(true);
    s.career.people.push({ id: 'PER-1', name: 'Ada', role: 'partner', personality: 'warm', bio: '', relationship: 80 });
    s.career.partnerId = 'PER-1';
    s.career.relationships.partner = 80;
    expect(canDoActivity(s, 'romance_meet').ok).toBe(false);
    expect(canDoActivity(s, 'romance_dinner').ok).toBe(true);
  });
});

describe('doActivity', () => {
  it('spends an action, energy and money and returns text + notes', () => {
    const s = stateWith();
    s.career.money = 10_000;
    s.career.energy = 60;
    const r = doActivity(s, makeRng(1), 'social_mangal');
    expect(r.ok).toBe(true);
    expect(r.text.length).toBeGreaterThan(5);
    expect(s.career.actionsLeft).toBe(ACTIONS_PER_WEEK - 1);
    expect(s.career.money).toBe(10_000 - 600);
    expect(s.career.energy).toBeLessThan(60);
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it('rest restores energy; a failed attempt costs nothing', () => {
    const s = stateWith();
    s.career.energy = 30;
    doActivity(s, makeRng(1), 'rest_home');
    expect(s.career.energy).toBeGreaterThan(30);
    s.career.actionsLeft = 0;
    const money = s.career.money;
    const r = doActivity(s, makeRng(1), 'rest_home');
    expect(r.ok).toBe(false);
    expect(r.text.length).toBeGreaterThan(0);
    expect(s.career.money).toBe(money);
  });

  it('only ever consumes the three weekly actions', () => {
    const s = stateWith();
    let done = 0;
    for (let i = 0; i < 6; i++) if (doActivity(s, makeRng(i), 'family_breakfast').ok) done++;
    expect(done).toBe(ACTIONS_PER_WEEK);
  });

  it('romance can start a relationship and creates the partner Person', () => {
    let found = false;
    for (let seed = 0; seed < 40 && !found; seed++) {
      const s = stateWith();
      s.career.money = 5_000;
      const r = doActivity(s, new Rng(seed), 'romance_meet');
      if (s.career.partnerId) {
        found = true;
        const partner = s.career.people.find((p) => p.id === s.career.partnerId);
        expect(partner).toBeDefined();
        expect(partner!.role).toBe('partner');
        expect(partner!.name.length).toBeGreaterThan(3);
        expect(s.career.relationships.partner).toBeGreaterThan(0);
        expect(r.text).toContain(partner!.name);
      }
    }
    expect(found).toBe(true);
  });

  it('proposing needs a strong bond and can end in marriage', () => {
    const s = stateWith();
    s.career.money = 100_000;
    s.career.people.push({ id: 'PER-1', name: 'Ada', role: 'partner', personality: 'warm', bio: '', relationship: 95 });
    s.career.partnerId = 'PER-1';
    s.career.relationships.partner = 60;
    expect(canDoActivity(s, 'romance_propose').ok).toBe(false);
    s.career.relationships.partner = 99;
    let married = false;
    for (let seed = 0; seed < 20 && !married; seed++) {
      s.career.actionsLeft = 3;
      s.flags['career.act.romance_propose'] = -1000;
      doActivity(s, new Rng(seed), 'romance_propose');
      married = !!s.flags['career.married'];
    }
    expect(married).toBe(true);
  });

  it('commercial shoots pay by fame; extra training grants xp', () => {
    const s = stateWith();
    s.career.fame = 50;
    s.career.money = 0;
    doActivity(s, makeRng(1), 'media_commercial');
    expect(s.career.money).toBeGreaterThan(10_000);
    const t = stateWith();
    doActivity(t, makeRng(1), 'train_extra');
    expect(Object.keys(t.career.xp).length).toBeGreaterThan(0);
  });

  it('repeating high-cooldown activities is blocked', () => {
    const s = stateWith();
    s.career.fame = 80;
    s.career.money = 1e6;
    expect(doActivity(s, makeRng(1), 'night_vip').ok).toBe(true);
    expect(canDoActivity(s, 'night_vip').ok).toBe(false);
    expect(canDoActivity(s, 'night_vip').reason).toBeTruthy();
  });
});

describe('risky activities and traits', () => {
  const scandals = (traits: TraitId[], id: string, runs = 600) => {
    let n = 0;
    for (let seed = 0; seed < runs; seed++) {
      const s = stateWith();
      setUser(s, { traits });
      s.career.money = 1e6;
      s.career.energy = 100;
      s.career.fame = 50;
      const before = { ...s.career.relationships };
      const r = doActivity(s, new Rng(seed), id);
      if (r.ok && s.career.relationships.manager < before.manager) n++;
    }
    return n;
  };

  it('party animals attract far more nightlife scandals; bodyguards and PR help', () => {
    expect(scandals(['party_animal'], 'night_club')).toBeGreaterThan(scandals([], 'night_club') * 1.4);
  });

  it('glass bones suffer more from extreme sports', () => {
    const hurt = (traits: TraitId[]) => {
      let n = 0;
      for (let seed = 0; seed < 800; seed++) {
        const s = stateWith();
        setUser(s, { traits });
        s.career.money = 1e6;
        doActivity(s, new Rng(seed), 'social_paragliding');
        if (userPlayer(s).injury) n++;
      }
      return n;
    };
    expect(hurt(['glass_bones'])).toBeGreaterThan(hurt([]));
  });

  it('owning a bodyguard cuts the scandal rate', () => {
    const run = (guard: boolean) => {
      let n = 0;
      for (let seed = 0; seed < 600; seed++) {
        const s = stateWith();
        s.career.money = 1e8;
        s.career.fame = 100;
        if (guard) buyItem(s, 's_bodyguard');
        s.career.money = 1e6;
        s.career.energy = 100;
        const m = s.career.relationships.manager;
        doActivity(s, new Rng(seed), 'night_club');
        if (s.career.relationships.manager < m) n++;
      }
      return n;
    };
    expect(run(true)).toBeLessThan(run(false));
  });

  it('every activity is playable on a rich, rested state without throwing', () => {
    for (const a of ACTIVITIES) {
      const s = stateWith();
      s.career.money = 1e7;
      s.career.fame = 100;
      s.career.energy = 100;
      s.career.people.push({ id: 'PER-1', name: 'Ada', role: 'partner', personality: 'warm', bio: '', relationship: 90 });
      if (a.id !== 'romance_meet') { s.career.partnerId = 'PER-1'; s.career.relationships.partner = 90; }
      const r = doActivity(s, makeRng(3), a.id);
      if (!r.ok && a.id !== 'social_mentor') expect(r.text, a.id).toBeTruthy();
    }
  });
});
