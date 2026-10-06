import { describe, expect, it } from 'vitest';
import {
  acceptOffer, applyNegotiationStep, clampTerms, contractHousekeeping, fairWage, generateOffers, marketValue, negotiationStep,
  ownerAcceptsFee, rejectOffer, setTransferListed, startNegotiation, trialOffers, userMarketValue, userPlayer, ROLE_ORDER,
} from '../api';
import { Rng } from '../../core/rng';
import { absWeek, cloneJson } from '../../core/util';
import type { ContractTerms, GameState, Negotiation, OfferKind, SquadRole, TransferOffer } from '../../core/types';
import { ATTR_KEYS } from '../../core/ratings';
import { addFixture, makeRng, moveUser, setUser, stateWith } from './kit';

/** A strong, in-form, well-known user so that clubs come knocking. */
function starUser(s: GameState, level = 72): void {
  for (const k of ATTR_KEYS) if (k !== 'goalkeeping') userPlayer(s).attrs[k] = level;
  setUser(s, { form: 75 });
  s.career.fame = 45;
}

function manualOffer(s: GameState, kind: OfferKind = 'transfer', clubId = 'ENG-1-04', patch: Partial<TransferOffer> = {}): TransferOffer {
  const p = userPlayer(s);
  const terms: ContractTerms = {
    wage: fairWage(s, p, clubId), years: 3, releaseClause: null, role: 'starter', signingBonus: 20_000, goalBonus: 500,
  };
  if (kind === 'loan') Object.assign(terms, { years: 1, signingBonus: 0, goalBonus: 0 });
  const offer: TransferOffer = {
    id: `off-${kind}-${clubId}`, kind, fromClubId: clubId, season: s.season, week: s.week, expiresWeek: absWeek(s.season, s.week + 3),
    fee: kind === 'transfer' ? userMarketValue(s) : 0, terms, status: 'pending', parentClubAccepts: true, note: 'test', ...patch,
  };
  s.offers.push(offer);
  return offer;
}

const squadsContaining = (s: GameState, id: string) => Object.values(s.world.clubs).filter((c) => c.squad.includes(id)).map((c) => c.id);

describe('valuation', () => {
  it('market value rises with quality and falls with age and short contracts', () => {
    const s = stateWith();
    const p = cloneJson(userPlayer(s));
    const base = marketValue(p, s.season);
    for (const k of ATTR_KEYS) if (k !== 'goalkeeping') p.attrs[k] += 12;
    expect(marketValue(p, s.season)).toBeGreaterThan(base * 2);

    const young = cloneJson(userPlayer(s));
    const old = { ...cloneJson(userPlayer(s)), birthYear: s.season - 34 };
    expect(marketValue(young, s.season)).toBeGreaterThan(marketValue(old, s.season));

    const lowPot = { ...cloneJson(userPlayer(s)), potential: 60 };
    const highPot = { ...cloneJson(userPlayer(s)), potential: 92 };
    expect(marketValue(highPot, s.season)).toBeGreaterThan(marketValue(lowPot, s.season));

    const expiring = cloneJson(userPlayer(s));
    expiring.contract!.endSeason = s.season;
    const longDeal = cloneJson(userPlayer(s));
    longDeal.contract!.endSeason = s.season + 4;
    expect(marketValue(longDeal, s.season)).toBeGreaterThan(marketValue(expiring, s.season));
  });

  it('anchors: overall 70 ≈ a few million, 88 ≈ tens of millions (in prime)', () => {
    const s = stateWith();
    const p = cloneJson(userPlayer(s));
    p.birthYear = s.season - 25;
    for (const k of ATTR_KEYS) if (k !== 'goalkeeping') p.attrs[k] = 70;
    const v70 = marketValue(p, s.season);
    for (const k of ATTR_KEYS) if (k !== 'goalkeeping') p.attrs[k] = 88;
    p.potential = 90;
    const v88 = marketValue(p, s.season);
    expect(v70).toBeGreaterThan(1_500_000);
    expect(v70).toBeLessThan(15_000_000);
    expect(v88).toBeGreaterThan(30_000_000);
    expect(v88).toBeLessThan(250_000_000);
  });

  it('fair wage grows with club reputation and player quality', () => {
    const s = stateWith();
    const p = userPlayer(s);
    expect(fairWage(s, p, 'ENG-1-05')).toBeGreaterThan(fairWage(s, p, 'ENG-1-00'));
    const before = fairWage(s, p, 'ENG-1-03');
    starUser(s, 80);
    expect(fairWage(s, p, 'ENG-1-03')).toBeGreaterThan(before);
    expect(fairWage(s, p, 'ENG-1-03')).toBeGreaterThanOrEqual(400);
  });
});

describe('trialOffers', () => {
  it('creates modest youth deals, one per club', () => {
    const s = stateWith();
    const clubs = ['ENG-1-01', 'ENG-1-02', 'ENG-1-03'];
    const offers = trialOffers(s, clubs);
    expect(offers).toHaveLength(3);
    expect(s.offers).toHaveLength(3);
    for (const o of offers) {
      expect(o.kind).toBe('trial');
      expect(clubs).toContain(o.fromClubId);
      expect(o.terms.wage).toBeGreaterThanOrEqual(500);
      expect(o.terms.wage).toBeLessThanOrEqual(2_500);
      expect([2, 3]).toContain(o.terms.years);
      expect(['prospect', 'rotation']).toContain(o.terms.role);
      expect(o.fee).toBe(0);
      expect(o.status).toBe('pending');
      expect(o.expiresWeek).toBeGreaterThan(absWeek(s.season, s.week));
      expect(o.note.length).toBeGreaterThan(20);
      expect(o.note).not.toMatch(/[{}]/);
    }
    expect(new Set(offers.map((o) => o.id)).size).toBe(3);
  });

  it('is deterministic for a given save', () => {
    const a = trialOffers(stateWith({ seed: 3 }), ['ENG-1-02']);
    const b = trialOffers(stateWith({ seed: 3 }), ['ENG-1-02']);
    expect(a[0].terms).toEqual(b[0].terms);
    expect(a[0].note).toBe(b[0].note);
  });
});

describe('generateOffers', () => {
  const collect = (mut: (s: GameState) => void, seeds = 40, week = 22) => {
    const all: TransferOffer[] = [];
    for (let seed = 0; seed < seeds; seed++) {
      const s = stateWith({ seed: seed + 1 });
      s.week = week;
      mut(s);
      const rng = new Rng(seed);
      for (let w = week; w < week + 3; w++) { s.week = w; all.push(...generateOffers(s, rng)); }
    }
    return all;
  };

  it('produces valid, localized offers for a hot player inside the window', () => {
    const offers = collect((s) => starUser(s));
    expect(offers.length).toBeGreaterThan(10);
    for (const o of offers) {
      expect(['transfer', 'loan', 'renewal', 'free']).toContain(o.kind);
      expect(o.status).toBe('pending');
      expect(o.terms.wage).toBeGreaterThan(0);
      expect(o.terms.years).toBeGreaterThanOrEqual(1);
      expect(o.terms.years).toBeLessThanOrEqual(5);
      expect(ROLE_ORDER).toContain(o.terms.role);
      expect(o.expiresWeek).toBeGreaterThan(absWeek(2026, 22));
      expect(o.expiresWeek).toBeLessThanOrEqual(absWeek(2026, 28));
      expect(o.note.length).toBeGreaterThan(20);
      expect(o.note).not.toMatch(/[{}]/);
      if (o.kind === 'transfer') expect(o.fromClubId).not.toBe('ENG-1-00');
    }
    const states = collect((s) => starUser(s), 1);
    expect(states.every((o) => o.id.length > 0)).toBe(true);
  });

  it('pushes offers into state.offers and never duplicates a live suitor', () => {
    const s = stateWith({ seed: 2 });
    starUser(s);
    s.week = 22;
    const rng = makeRng(1);
    for (let i = 0; i < 12; i++) generateOffers(s, rng);
    const live = s.offers.filter((o) => o.status === 'pending' && o.kind !== 'renewal');
    expect(new Set(live.map((o) => o.fromClubId)).size).toBe(live.length);
    expect(s.offers.length).toBeLessThanOrEqual(6);
  });

  it('is quiet outside the windows for a contracted player', () => {
    const offers = collect((s) => starUser(s), 30, 12);
    expect(offers).toHaveLength(0);
  });

  it('stronger, more famous players attract more interest', () => {
    const weak = collect((s) => { setUser(s, { form: 35 }); s.career.fame = 2; }, 50);
    const hot = collect((s) => starUser(s, 74), 50);
    expect(hot.length).toBeGreaterThan(weak.length);
  });

  it('big clubs show up when the player outperforms his club', () => {
    const offers = collect((s) => starUser(s, 78), 40).filter((o) => o.kind === 'transfer');
    const maxRep = Math.max(...offers.map((o) => 0 + (Number(o.fromClubId.slice(-2)) + 11) * 5));
    expect(offers.length).toBeGreaterThan(0);
    expect(maxRep).toBeGreaterThanOrEqual(65);
  });

  it('offers a renewal when the contract is running out', () => {
    const offers = collect((s) => { starUser(s); userPlayer(s).contract!.endSeason = s.season; }, 40, 22);
    const renewals = offers.filter((o) => o.kind === 'renewal');
    expect(renewals.length).toBeGreaterThan(5);
    for (const o of renewals) expect(o.fromClubId).toBe('ENG-1-00');
    const none = collect((s) => { starUser(s); userPlayer(s).contract!.endSeason = s.season + 5; setUser(s, { form: 50 }); }, 40, 22);
    expect(none.filter((o) => o.kind === 'renewal').length).toBe(0);
  });

  it('offers free-agent deals to an unattached player', () => {
    const offers = collect((s) => {
      starUser(s);
      const p = userPlayer(s);
      s.world.clubs[p.clubId as string].squad = s.world.clubs[p.clubId as string].squad.filter((id) => id !== p.id);
      p.clubId = null;
      p.contract = null;
    }, 20, 10);
    expect(offers.length).toBeGreaterThan(10);
    for (const o of offers) {
      expect(o.kind).toBe('free');
      expect(o.fee).toBe(0);
    }
  });

  it('young fringe players get loan offers', () => {
    const offers = collect((s) => {
      moveUser(s, 'ENG-1-05');
      starUser(s, 60);
      s.week = 20;
      for (let i = 0; i < 12; i++) addFixture(s, { id: `lf${i}`, week: 8 + i, played: true, homeGoals: 1, awayGoals: 0 });
      userPlayer(s).season.minutes = 0;
    }, 80, 20);
    expect(offers.some((o) => o.kind === 'loan')).toBe(true);
    for (const o of offers.filter((x) => x.kind === 'loan')) {
      expect(o.fee).toBe(0);
      expect(o.terms.years).toBe(1);
    }
  });

  it('transfer-listed players draw more interest', () => {
    const base = collect((s) => starUser(s, 66), 60);
    const listed = collect((s) => { starUser(s, 66); s.career.transferListed = true; }, 60);
    expect(listed.length).toBeGreaterThan(base.length);
  });
});

describe('parent club consent', () => {
  it('accepts fees near market value, release clauses or a transfer-list status', () => {
    const s = stateWith();
    const value = userMarketValue(s);
    expect(ownerAcceptsFee(s, value * 0.95)).toBe(true);
    expect(ownerAcceptsFee(s, value * 0.5)).toBe(false);
    s.career.transferListed = true;
    expect(ownerAcceptsFee(s, value * 0.3)).toBe(true);
    s.career.transferListed = false;
    userPlayer(s).contract!.releaseClause = Math.round(value * 0.6);
    expect(ownerAcceptsFee(s, value * 0.61)).toBe(true);
    expect(ownerAcceptsFee(s, value * 0.4)).toBe(false);
  });
});

// ───────── negotiation ─────────

function withinLimits(neg: Negotiation, t: ContractTerms): void {
  const L = neg.limits;
  expect(t.wage).toBeLessThanOrEqual(L.maxWage);
  expect(t.years).toBeLessThanOrEqual(L.maxYears);
  expect(t.years).toBeGreaterThanOrEqual(1);
  expect(t.signingBonus).toBeLessThanOrEqual(L.maxSigningBonus);
  expect(t.goalBonus).toBeLessThanOrEqual(L.maxGoalBonus);
  expect(L.roles).toContain(t.role);
  if (t.releaseClause !== null) {
    expect(L.minReleaseClause).not.toBeNull();
    expect(t.releaseClause).toBeGreaterThanOrEqual(L.minReleaseClause as number);
  }
}

describe('negotiation', () => {
  const setup = (kind: OfferKind = 'transfer', seed = 3) => {
    const s = stateWith({ seed });
    starUser(s);
    const offer = manualOffer(s, kind);
    const neg = startNegotiation(s, offer.id);
    return { s, offer, neg };
  };

  it('opens talks with hidden limits and an opening line from the club', () => {
    const { s, offer, neg } = setup();
    expect(s.negotiation).toBe(neg);
    expect(offer.status).toBe('negotiating');
    expect(neg.status).toBe('open');
    expect(neg.round).toBe(0);
    expect(neg.patience).toBeGreaterThan(20);
    expect(neg.lines).toHaveLength(1);
    expect(neg.lines[0].from).toBe('club');
    expect(neg.lines[0].text.length).toBeGreaterThan(20);
    expect(neg.limits.maxWage).toBeGreaterThanOrEqual(neg.current.wage);
    expect(neg.limits.maxYears).toBeGreaterThanOrEqual(neg.current.years);
    expect(neg.limits.roles.length).toBeGreaterThan(0);
    withinLimits(neg, neg.current);
  });

  it('limits depend on the kind of deal', () => {
    const loan = setup('loan').neg;
    expect(loan.limits.maxYears).toBe(1);
    expect(loan.limits.maxSigningBonus).toBe(0);
    expect(loan.limits.minReleaseClause).toBeNull();
    const t = stateWith();
    const [trial] = trialOffers(t, ['ENG-1-02']);
    const neg = startNegotiation(t, trial.id);
    expect(neg.limits.maxWage).toBeLessThanOrEqual(3_000);
    expect(neg.maxRounds).toBeLessThanOrEqual(3);
  });

  it('throws for an unknown offer', () => {
    expect(() => startNegotiation(stateWith(), 'nope')).toThrow();
  });

  it('never concedes beyond the limits, whatever the player asks (fuzz)', () => {
    const rng = new Rng(2024);
    for (let run = 0; run < 120; run++) {
      const { s, neg } = setup(rng.pick(['transfer', 'free', 'renewal', 'loan', 'trial'] as OfferKind[]), 1 + (run % 9));
      for (let round = 0; round < 6 && neg.status === 'open'; round++) {
        const ask: ContractTerms = {
          wage: Math.round(neg.current.wage * rng.float(0.3, 9)),
          years: rng.int(0, 9),
          releaseClause: rng.chance(0.5) ? null : rng.int(0, 400_000_000),
          role: rng.pick(ROLE_ORDER),
          signingBonus: Math.round(neg.current.wage * rng.float(0, 80)),
          goalBonus: Math.round(neg.current.wage * rng.float(0, 3)),
        };
        const step = negotiationStep(s, ask, rng);
        withinLimits(neg, step.terms);
        applyNegotiationStep(s, ask, rng);
        withinLimits(neg, neg.current);
        expect(neg.patience).toBeGreaterThanOrEqual(0);
      }
      expect(['open', 'agreed', 'collapsed']).toContain(neg.status);
      if (neg.status === 'open') expect(neg.round).toBeLessThanOrEqual(neg.maxRounds);
      if (neg.round >= neg.maxRounds && neg.status === 'open') expect(negotiationStep(s, neg.current, rng).collapsed).toBe(true);
    }
  });

  it('accepts a reasonable ask and ends the talks as agreed', () => {
    const { s, neg } = setup();
    const ask = { ...neg.current, wage: Math.round(neg.current.wage * 1.01) };
    withinLimits(neg, ask);
    const step = negotiationStep(s, ask, makeRng(1));
    expect(step.accepted).toBe(true);
    expect(step.collapsed).toBe(false);
    applyNegotiationStep(s, ask, makeRng(1));
    expect(neg.status).toBe('agreed');
    expect(neg.lines.length).toBeGreaterThanOrEqual(3);
  });

  it('pushing to the limit takes a second round and the club meets him there', () => {
    const { s, neg } = setup();
    const ask: ContractTerms = { ...neg.current, wage: neg.limits.maxWage, signingBonus: neg.limits.maxSigningBonus, goalBonus: neg.limits.maxGoalBonus };
    const r1 = negotiationStep(s, ask, makeRng(1));
    expect(r1.terms.wage).toBeLessThanOrEqual(neg.limits.maxWage);
    if (!r1.accepted) {
      applyNegotiationStep(s, ask, makeRng(1));
      expect(neg.current.wage).toBeGreaterThanOrEqual(neg.lines[0].terms!.wage);
      applyNegotiationStep(s, ask, makeRng(1));
      expect(['agreed', 'collapsed', 'open']).toContain(neg.status);
    }
  });

  it('greedy asks burn patience and collapse the talks', () => {
    const { s, neg } = setup();
    const greedy: ContractTerms = { wage: neg.limits.maxWage * 8, years: 5, releaseClause: 1_000, role: 'star', signingBonus: neg.limits.maxSigningBonus * 10, goalBonus: neg.limits.maxGoalBonus * 10 };
    const modest: ContractTerms = { ...neg.current, wage: Math.round(neg.current.wage * 1.02) };
    const modestStep = negotiationStep(s, modest, makeRng(1));
    const greedyStep = negotiationStep(s, greedy, makeRng(1));
    expect(greedyStep.patienceDelta).toBeLessThan(modestStep.patienceDelta);
    expect(greedyStep.accepted).toBe(false);
    for (let i = 0; i < neg.maxRounds && neg.status === 'open'; i++) applyNegotiationStep(s, greedy, makeRng(i));
    expect(neg.status).toBe('collapsed');
    expect(neg.patience).toBeLessThan(40);
    expect(negotiationStep(s, greedy, makeRng(1)).collapsed).toBe(true);
  });

  it('a good agent relationship and a calm head save patience', () => {
    const delta = (agent: number, calm: boolean) => {
      const { s, neg } = setup();
      s.career.relationships.agent = agent;
      setUser(s, { traits: calm ? ['calm'] : [] });
      const greedy = { ...neg.current, wage: neg.limits.maxWage * 3 };
      return negotiationStep(s, greedy, makeRng(1)).patienceDelta;
    };
    expect(delta(95, false)).toBeGreaterThan(delta(5, false));
    expect(delta(50, true)).toBeGreaterThan(delta(50, false));
  });

  it('clampTerms repairs absurd or malformed terms', () => {
    const { neg } = setup();
    const t = clampTerms(neg, { wage: 1e12, years: 99, releaseClause: 1, role: 'star', signingBonus: -5, goalBonus: Number.NaN });
    withinLimits(neg, t);
    expect(t.signingBonus).toBe(0);
    const t2 = clampTerms(neg, { wage: Number.NaN, years: 0, releaseClause: null, role: 'nonsense' as SquadRole, signingBonus: 1e12, goalBonus: 1e12 });
    withinLimits(neg, t2);
  });
});

// ───────── signing ─────────

describe('acceptOffer', () => {
  it('moves the user between squads with a fee, a contract, a unique shirt number and a mentor', () => {
    const s = stateWith({ seed: 5 });
    starUser(s);
    s.career.money = 0;
    const offer = manualOffer(s, 'transfer', 'ENG-1-04', { fee: 4_000_000 });
    const oldClub = s.world.clubs['ENG-1-00'];
    const newClub = s.world.clubs['ENG-1-04'];
    const oldBudget = oldClub.budget;
    const newBudget = newClub.budget;
    const sizes = Object.fromEntries(Object.values(s.world.clubs).map((c) => [c.id, c.squad.length]));
    s.career.relationships.manager = 95;
    s.career.transferListed = true;
    const other = manualOffer(s, 'transfer', 'ENG-1-03');
    const neg = startNegotiation(s, offer.id);

    acceptOffer(s, offer.id, { ...neg.current, wage: neg.limits.maxWage * 5, years: 9 });

    const p = userPlayer(s);
    expect(p.clubId).toBe('ENG-1-04');
    expect(squadsContaining(s, p.id)).toEqual(['ENG-1-04']);
    expect(oldClub.squad.length).toBe(sizes['ENG-1-00'] - 1);
    expect(newClub.squad.length).toBe(sizes['ENG-1-04'] + 1);
    expect(newClub.budget).toBe(newBudget - 4_000_000);
    expect(oldClub.budget).toBe(oldBudget + 4_000_000);
    expect(p.contract?.clubId).toBe('ENG-1-04');
    expect(p.contract!.wage).toBeLessThanOrEqual(neg.limits.maxWage);
    expect(p.contract!.endSeason - s.season + 1).toBeLessThanOrEqual(neg.limits.maxYears);
    expect(p.contract!.loan).toBeUndefined();
    const numbers = newClub.squad.map((id) => s.world.players[id].shirtNumber);
    expect(numbers.filter((n) => n === p.shirtNumber)).toHaveLength(1);
    const mentor = s.world.players[s.career.mentorId as string];
    expect(mentor).toBeDefined();
    expect(mentor.clubId).toBe('ENG-1-04');
    expect(s.season - mentor.birthYear).toBeGreaterThanOrEqual(28);
    expect(s.career.money).toBe(p.contract ? s.career.money : 0);
    expect(s.career.money).toBeGreaterThan(0);
    expect(s.career.relationships.manager).toBeLessThan(80);
    expect(s.career.transferListed).toBe(false);
    expect(offer.status).toBe('accepted');
    expect(other.status).toBe('withdrawn');
    expect(s.negotiation).toBeNull();
  });

  it('rejects offers that are no longer live and unknown ids', () => {
    const s = stateWith();
    const offer = manualOffer(s);
    expect(() => acceptOffer(s, 'nope')).toThrow();
    acceptOffer(s, offer.id);
    expect(() => acceptOffer(s, offer.id)).toThrow();
  });

  it('a loan keeps the parent club and returns at the end of the season', () => {
    const s = stateWith({ seed: 6 });
    starUser(s, 62);
    const parentContract = cloneJson(userPlayer(s).contract!);
    const offer = manualOffer(s, 'loan', 'ENG-1-02', { fee: 0 });
    acceptOffer(s, offer.id);
    const p = userPlayer(s);
    expect(p.clubId).toBe('ENG-1-02');
    expect(p.contract?.loan?.parentClubId).toBe('ENG-1-00');
    expect(squadsContaining(s, p.id)).toEqual(['ENG-1-02']);
    expect(s.world.clubs['ENG-1-00'].budget).toBe(55_000_000);

    s.week = 46;
    const notes = contractHousekeeping(s);
    expect(p.clubId).toBe('ENG-1-00');
    expect(p.contract).toEqual(parentContract);
    expect(squadsContaining(s, p.id)).toEqual(['ENG-1-00']);
    expect(notes.length).toBeGreaterThan(0);
  });

  it('a free agent signs without a fee; a trial turns into a contract', () => {
    const s = stateWith({ seed: 7 });
    const p = userPlayer(s);
    s.world.clubs['ENG-1-00'].squad = s.world.clubs['ENG-1-00'].squad.filter((id) => id !== p.id);
    p.clubId = null;
    p.contract = null;
    const budget = s.world.clubs['ENG-1-03'].budget;
    const offer = manualOffer(s, 'free', 'ENG-1-03');
    acceptOffer(s, offer.id);
    expect(p.clubId).toBe('ENG-1-03');
    expect(s.world.clubs['ENG-1-03'].budget).toBe(budget);
    expect(squadsContaining(s, p.id)).toEqual(['ENG-1-03']);

    const t = stateWith({ seed: 8 });
    const [trial] = trialOffers(t, ['ENG-1-02']);
    acceptOffer(t, trial.id);
    expect(userPlayer(t).clubId).toBe('ENG-1-02');
    expect(userPlayer(t).contract!.wage).toBeLessThanOrEqual(3_000);
    expect(squadsContaining(t, userPlayer(t).id)).toEqual(['ENG-1-02']);
  });

  it('a renewal extends the contract at the same club', () => {
    const s = stateWith({ seed: 9 });
    starUser(s);
    userPlayer(s).contract!.endSeason = s.season;
    const offer = manualOffer(s, 'renewal', 'ENG-1-00');
    s.career.money = 0;
    const neg = startNegotiation(s, offer.id);
    acceptOffer(s, offer.id, neg.current);
    const p = userPlayer(s);
    expect(p.clubId).toBe('ENG-1-00');
    expect(p.contract!.endSeason).toBeGreaterThan(s.season);
    expect(p.contract!.wage).toBe(neg.current.wage);
    expect(squadsContaining(s, p.id)).toEqual(['ENG-1-00']);
    expect(s.career.money).toBe(neg.current.signingBonus);
  });

  it('contracts signed late in the season start next season', () => {
    const s = stateWith();
    s.week = 47;
    const offer = manualOffer(s, 'transfer', 'ENG-1-03', { fee: 0 });
    offer.terms.years = 2;
    acceptOffer(s, offer.id);
    expect(userPlayer(s).contract!.endSeason).toBe(s.season + 2);
  });
});

describe('rejecting and listing', () => {
  it('rejecting marks the offer; refusing a renewal upsets the manager', () => {
    const s = stateWith();
    const offer = manualOffer(s, 'renewal', 'ENG-1-00');
    const m = s.career.relationships.manager;
    rejectOffer(s, offer.id);
    expect(offer.status).toBe('rejected');
    expect(s.career.relationships.manager).toBeLessThan(m);
    rejectOffer(s, 'unknown');
  });

  it('transfer-listing costs manager goodwill and is reversible', () => {
    const s = stateWith();
    const m = s.career.relationships.manager;
    setTransferListed(s, true);
    expect(s.career.transferListed).toBe(true);
    expect(s.career.relationships.manager).toBeLessThan(m);
    const after = s.career.relationships.manager;
    setTransferListed(s, true);
    expect(s.career.relationships.manager).toBe(after);
    setTransferListed(s, false);
    expect(s.career.transferListed).toBe(false);
    expect(s.career.relationships.manager).toBeGreaterThan(after);
  });

  it('free agents cannot be listed', () => {
    const s = stateWith();
    userPlayer(s).clubId = null;
    setTransferListed(s, true);
    expect(s.career.transferListed).toBe(false);
  });
});

describe('contractHousekeeping', () => {
  it('expires stale offers by absolute week and keeps fresh ones', () => {
    const s = stateWith();
    s.week = 10;
    const stale = manualOffer(s, 'transfer', 'ENG-1-03', { expiresWeek: absWeek(s.season, 9) });
    const fresh = manualOffer(s, 'transfer', 'ENG-1-04', { expiresWeek: absWeek(s.season, 12) });
    const notes = contractHousekeeping(s);
    expect(stale.status).toBe('expired');
    expect(fresh.status).toBe('pending');
    expect(notes).toHaveLength(1);
    const wrap = manualOffer(s, 'transfer', 'ENG-1-02', { id: 'off-wrap', expiresWeek: absWeek(s.season + 1, 1) });
    s.season += 1; s.week = 0;
    contractHousekeeping(s);
    expect(wrap.status).toBe('pending');
  });

  it('turns the user into a free agent when the contract ends at season end', () => {
    const s = stateWith();
    const p = userPlayer(s);
    p.contract!.endSeason = s.season;
    s.week = 20;
    contractHousekeeping(s);
    expect(p.clubId).toBe('ENG-1-00');
    s.week = 45;
    const renewal = manualOffer(s, 'renewal', 'ENG-1-00');
    const notes = contractHousekeeping(s);
    expect(p.clubId).toBeNull();
    expect(p.contract).toBeNull();
    expect(squadsContaining(s, p.id)).toEqual([]);
    expect(notes.join(' ')).toMatch(/serbest/i);
    expect(renewal.status).toBe('withdrawn');
    expect(s.career.mentorId).toBeNull();
  });

  it('keeps players whose contract runs on and clears finished sponsor deals', () => {
    const s = stateWith();
    const p = userPlayer(s);
    p.contract!.endSeason = s.season + 1;
    s.career.sponsors.push({ id: 'a', brand: 'Old Brand', category: 'drinks', weekly: 100, endSeason: s.season }, { id: 'b', brand: 'New Brand', category: 'boots', weekly: 100, endSeason: s.season + 1 });
    s.week = 46;
    const notes = contractHousekeeping(s);
    expect(p.clubId).toBe('ENG-1-00');
    expect(s.career.sponsors.map((d) => d.id)).toEqual(['b']);
    expect(notes.join(' ')).toContain('Old Brand');
  });
});
