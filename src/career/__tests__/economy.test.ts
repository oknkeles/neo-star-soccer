import { describe, expect, it } from 'vitest';
import {
  ACTIONS_PER_WEEK, SHOP_ITEMS, acceptSponsor, activeSponsors, applyWeeklyFinances, buyItem, incomeTax, itemPerks, maybeSponsorOffer,
  resaleValue, sellItem, shopItem, userPlayer, weeklyFinances,
} from '../api';
import { Rng } from '../../core/rng';
import { makeRng, stateWith } from './kit';

describe('shop', () => {
  it('refuses without money, fame or twice', () => {
    const s = stateWith();
    s.career.money = 500;
    expect(buyItem(s, 'w_smart')).toMatchObject({ ok: false });
    expect(buyItem(s, 'w_smart').reason).toBeTruthy();
    s.career.money = 5e7;
    s.career.fame = 0;
    expect(buyItem(s, 'j_own').ok).toBe(false);
    expect(buyItem(s, 'nope').ok).toBe(false);
    s.career.fame = 100;
    expect(buyItem(s, 'w_smart').ok).toBe(true);
    expect(buyItem(s, 'w_smart').ok).toBe(false);
  });

  it('buying pays, records and applies one-off effects', () => {
    const s = stateWith();
    s.career.money = 100_000;
    s.career.fame = 30;
    const it = shopItem('car_anadol')!;
    const followers = s.career.followers;
    expect(buyItem(s, 'car_anadol')).toEqual({ ok: true });
    expect(s.career.money).toBe(100_000 - it.price);
    expect(s.career.inventory).toEqual([{ itemId: 'car_anadol', boughtSeason: s.season, boughtWeek: s.week }]);
    expect(s.career.followers).toBeGreaterThan(followers);
  });

  it('selling refunds 60% (staff nothing) and removes the item', () => {
    const s = stateWith();
    s.career.money = 1e7;
    s.career.fame = 100;
    buyItem(s, 'car_suv');
    const before = s.career.money;
    const it = shopItem('car_suv')!;
    expect(sellItem(s, 'car_suv')).toEqual({ ok: true, refund: Math.round(it.price * 0.6) });
    expect(s.career.money).toBe(before + Math.round(it.price * 0.6));
    expect(s.career.inventory).toHaveLength(0);
    expect(sellItem(s, 'car_suv')).toEqual({ ok: false, refund: 0 });
    buyItem(s, 's_chef');
    const staff = SHOP_ITEMS.find((i) => i.category === 'staff')!;
    expect(resaleValue(staff)).toBe(0);
  });

  it('aggregates perks with caps', () => {
    const s = stateWith();
    s.career.money = 1e9;
    s.career.fame = 100;
    for (const i of SHOP_ITEMS) buyItem(s, i.id);
    const perks = itemPerks(s);
    expect(perks.upkeep).toBe(SHOP_ITEMS.reduce((a, i) => a + i.upkeep, 0));
    expect(perks.trainingBoost).toBeLessThanOrEqual(0.4);
    expect(perks.morale).toBeLessThanOrEqual(8);
    expect(perks.injuryResist).toBeLessThanOrEqual(0.5);
    expect(perks.energyRegen).toBeGreaterThan(0);
  });
});

describe('weekly finances', () => {
  it('income tax is progressive and zero for tiny incomes', () => {
    expect(incomeTax(800, 'ENG')).toBe(0);
    expect(incomeTax(12_000, 'ENG')).toBe(2_350);
    const rate = (g: number) => incomeTax(g, 'ENG') / g;
    expect(rate(3_000)).toBeLessThan(rate(30_000));
    expect(rate(30_000)).toBeLessThan(rate(300_000));
  });

  it('nets wage + sponsors − upkeep − tax and applies it to the balance', () => {
    const s = stateWith();
    s.career.money = 10_000;
    userPlayer(s).contract!.wage = 12_000;
    s.career.sponsors.push({ id: 'sp1', brand: 'Zest Energy', category: 'drinks', weekly: 1_000, endSeason: s.season });
    s.career.sponsors.push({ id: 'sp0', brand: 'Old Deal', category: 'boots', weekly: 5_000, endSeason: s.season - 1 });
    s.career.money = 1e8;
    s.career.fame = 100;
    buyItem(s, 'car_suv');
    s.career.money = 10_000;
    const f = weeklyFinances(s);
    expect(f.wage).toBe(12_000);
    expect(f.sponsors).toBe(1_000);
    expect(f.upkeep).toBe(shopItem('car_suv')!.upkeep);
    expect(f.tax).toBe(incomeTax(13_000, 'ENG'));
    expect(f.total).toBe(f.wage + f.sponsors - f.upkeep - f.tax);
    expect(applyWeeklyFinances(s)).toEqual(f);
    expect(s.career.money).toBe(10_000 + f.total);
  });

  it('free agents earn no wage; debts stop at the floor and costly things get repossessed', () => {
    const s = stateWith();
    s.career.money = 1e8;
    s.career.fame = 100;
    buyItem(s, 'h_yali');
    userPlayer(s).contract = null;
    userPlayer(s).clubId = null;
    s.career.money = -49_000;
    expect(weeklyFinances(s).wage).toBe(0);
    for (let i = 0; i < 4; i++) applyWeeklyFinances(s);
    expect(s.career.money).toBeGreaterThanOrEqual(-50_000);
    expect(s.career.inventory.some((o) => o.itemId === 'h_yali')).toBe(false);
    expect(s.inbox.length).toBeGreaterThan(0);
  });
});

describe('sponsors', () => {
  it('offers need some fame and grow with it', () => {
    const lowFame = stateWith();
    lowFame.career.fame = 1;
    expect(maybeSponsorOffer(lowFame, makeRng(1))).toBeNull();

    const avgWeekly = (fame: number) => {
      const out: number[] = [];
      for (let seed = 0; seed < 400 && out.length < 25; seed++) {
        const s = stateWith();
        s.career.fame = fame;
        const d = maybeSponsorOffer(s, new Rng(seed));
        if (d) out.push(d.weekly);
      }
      expect(out.length).toBeGreaterThan(3);
      return out.reduce((a, b) => a + b, 0) / out.length;
    };
    expect(avgWeekly(70)).toBeGreaterThan(avgWeekly(20) * 2);
  });

  it('deals use invented brands in the known categories and replace the same category', () => {
    const s = stateWith();
    s.career.fame = 60;
    const rng = makeRng(2);
    let deal = null;
    for (let i = 0; i < 200 && !deal; i++) deal = maybeSponsorOffer(s, rng);
    expect(deal).not.toBeNull();
    expect(['boots', 'drinks', 'watches', 'cars', 'gaming', 'fashion', 'telecom']).toContain(deal!.category);
    expect(deal!.endSeason).toBeGreaterThanOrEqual(s.season);
    acceptSponsor(s, deal!);
    expect(activeSponsors(s)).toHaveLength(1);
    acceptSponsor(s, { ...deal!, id: 'sp-other', weekly: 1 });
    expect(s.career.sponsors).toHaveLength(1);
    expect(s.career.sponsors[0].id).toBe('sp-other');
  });

  it('never proposes more than four concurrent deals', () => {
    const s = stateWith();
    s.career.fame = 90;
    const rng = makeRng(8);
    for (let i = 0; i < 400; i++) {
      const d = maybeSponsorOffer(s, rng);
      if (d) acceptSponsor(s, d);
    }
    expect(activeSponsors(s).length).toBeLessThanOrEqual(4);
  });
});

describe('constants', () => {
  it('has three actions per week', () => expect(ACTIONS_PER_WEEK).toBe(3));
});
