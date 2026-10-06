/**
 * Transfers & contracts: club interest, offers (transfer / loan / free / renewal / trial),
 * contract negotiations with hidden hard limits, signing, transfer list and the
 * season-end contract housekeeping.
 */
import type {
  Club, Contract, ContractTerms, Footballer, GameState, Lang, Negotiation, OfferKind, SquadRole, TransferOffer,
} from '../core/types';
import type { Rng } from '../core/rng';
import { t } from '../core/i18n';
import { absWeek, age as ageOf, avg, clamp, formatMoney, nextId } from '../core/util';
import { overall, positionGroup } from '../core/ratings';
import {
  SEASON_END_WEEK, absAfter, clubLevel, clubOf, contractStartSeason, getFlagNum, hash01, hasTrait,
  isTransferWindowWeek, niceMoney, nowIndex, playersOf, seasonsLeft, slotTarget, userPlayer, windowKey,
} from './helpers';
import { applyEffects } from './effects';
import { fairWage, userMarketValue } from './value';
import { activeSponsors } from './finance';

export const ROLE_ORDER: SquadRole[] = ['prospect', 'rotation', 'starter', 'star'];
const roleIdx = (r: SquadRole) => ROLE_ORDER.indexOf(r);

export const isLiveOffer = (o: TransferOffer) => o.status === 'pending' || o.status === 'negotiating';

const PARENT_CONTRACT_FLAG = 'career.parentContract';

// ───────── assessments ─────────

/** Average rating of the most recent matches (this season first), and how many there were. */
export function recentForm(state: GameState, n = 8): { avg: number; apps: number } {
  const c = state.career;
  let list = c.matches.filter((m) => m.season === state.season && m.minutes > 0);
  if (list.length < 3) list = c.matches.filter((m) => m.minutes > 0);
  const recent = list.slice(-n);
  return { avg: recent.length ? avg(recent.map((m) => m.rating)) : 6.5, apps: recent.length };
}

/** Share of the club's minutes the user played this season (1 when nothing has been played yet). */
export function minutesShare(state: GameState): number {
  const p = userPlayer(state);
  if (!p.clubId) return 0;
  let games = 0;
  for (const comp of Object.values(state.competitions)) {
    if (comp.kind === 'international') continue;
    for (const f of comp.fixtures) if (f.played && f.season === state.season && (f.homeId === p.clubId || f.awayId === p.clubId)) games++;
  }
  if (games === 0) return 1;
  return clamp(p.season.minutes / (games * 90), 0, 1);
}

/** Role the user could expect at a club given the competition for places. */
export function projectedRole(state: GameState, clubId: string, p: Footballer = userPlayer(state)): SquadRole {
  const club = state.world.clubs[clubId];
  if (!club) return 'rotation';
  const ovr = overall(p);
  const { target, slots } = slotTarget(club.formation, p.position);
  const better = playersOf(state, club.squad)
    .filter((x) => x.id !== p.id && (x.position === target || x.position === p.position))
    .filter((x) => overall(x) > ovr).length;
  const level = clubLevel(state, clubId, p.id);
  const a = ageOf(p, state.season);
  let role: SquadRole;
  if (better === 0 && ovr >= level + 4) role = 'star';
  else if (better < slots) role = 'starter';
  else if (better < slots + 2) role = 'rotation';
  else role = 'prospect';
  if (a <= 19 && roleIdx(role) > 1 && ovr < level) role = 'rotation';
  return role;
}

const isAttacker = (p: Footballer) => p.position === 'ST' || p.position === 'W' || p.position === 'AM';

function contractYears(a: number, rng: Rng): number {
  if (a <= 21) return rng.int(3, 5);
  if (a <= 27) return rng.int(3, 4);
  if (a <= 30) return rng.int(2, 3);
  if (a <= 32) return rng.int(1, 2);
  return 1;
}

// ───────── offer notes ─────────

type NoteKind = 'up' | 'same' | 'down' | 'listed' | 'loan' | 'renewal' | 'renewal_great' | 'free' | 'trial';
const NOTE_VARIANTS: Record<NoteKind, number> = { up: 3, same: 2, down: 2, listed: 2, loan: 2, renewal: 2, renewal_great: 1, free: 2, trial: 3 };

function offerNote(state: GameState, kind: NoteKind, club: Club, pick: number): string {
  const mgr = state.world.managers[club.managerId];
  const n = NOTE_VARIANTS[kind];
  const i = Math.min(n - 1, Math.floor(clamp(pick, 0, 0.9999) * n)) + 1;
  return t(`career.offer.${kind}${i}`, {
    club: club.name, city: club.city, nick: club.nickname, manager: mgr ? `${mgr.firstName} ${mgr.lastName}` : club.name,
  }, state.lang);
}

// ───────── terms ─────────

function buildTerms(state: GameState, club: Club, kind: OfferKind, rng: Rng): ContractTerms {
  const p = userPlayer(state);
  const a = ageOf(p, state.season);
  const fair = fairWage(state, p, club.id);
  const value = userMarketValue(state);
  let wage = fair * rng.float(0.88, 1.1);
  if (kind === 'free') wage *= rng.float(0.82, 0.98);
  if (kind === 'loan') wage = Math.max(p.contract?.wage ?? fair, fair * 0.8);
  if (kind === 'renewal') {
    const great = recentForm(state).avg >= 7.2;
    wage = Math.max(fair * rng.float(1.0, 1.15), (p.contract?.wage ?? 0) * (great ? 1.3 : 1.1));
    if (hasTrait(p, 'loyal')) wage *= 1.08;
  }
  wage = niceMoney(Math.max(300, wage));
  const years = kind === 'loan' ? 1 : contractYears(a, rng);
  let releaseClause: number | null = null;
  if (kind !== 'loan') {
    if (club.country === 'ESP') releaseClause = niceMoney(value * rng.float(3, 5));
    else if (club.reputation < 75 && rng.chance(0.35)) releaseClause = niceMoney(value * rng.float(2.2, 4));
    if (releaseClause !== null) releaseClause = Math.max(releaseClause, 500_000);
  }
  const bonusWeeks = kind === 'free' ? rng.int(10, 20) : kind === 'renewal' ? rng.int(3, 8) : kind === 'loan' ? 0 : rng.int(4, 10);
  let signingBonus = wage * bonusWeeks;
  if (hasTrait(p, 'mercenary')) signingBonus *= 1.3;
  const goalBonus = wage * (isAttacker(p) ? rng.float(0.12, 0.3) : p.position === 'CM' ? rng.float(0.06, 0.12) : rng.float(0.02, 0.06));
  return {
    wage,
    years,
    releaseClause,
    role: projectedRole(state, club.id, p),
    signingBonus: niceMoney(signingBonus),
    goalBonus: niceMoney(goalBonus),
  };
}

function makeOffer(state: GameState, club: Club, kind: OfferKind, fee: number, terms: ContractTerms, note: string, accepts: boolean, rng: Rng): TransferOffer {
  return {
    id: nextId(state, 'off'),
    kind,
    fromClubId: club.id,
    season: state.season,
    week: state.week,
    expiresWeek: absAfter(state.season, state.week, rng.int(2, 3)),
    fee,
    terms,
    status: 'pending',
    parentClubAccepts: accepts,
    note,
  };
}

/** Would the club that owns the user sell at this fee? */
export function ownerAcceptsFee(state: GameState, fee: number): boolean {
  const p = userPlayer(state);
  const c = state.career;
  if (!p.clubId) return true;
  const value = userMarketValue(state);
  if (c.transferListed) return true;
  const clause = p.contract?.releaseClause ?? null;
  if (clause !== null && fee >= clause) return true;
  if (fee >= value * 0.9) return true;
  // expiring contracts: better to cash in than lose him for nothing
  return seasonsLeft(state, p) <= 0.6 && fee >= value * 0.5;
}

// ───────── offer generation ─────────

function liveOfferFrom(state: GameState, clubId: string): boolean {
  return state.offers.some((o) => o.fromClubId === clubId && isLiveOffer(o));
}

/** Interest "heat": how hot is the user on the market right now. */
export function marketHeat(state: GameState): number {
  const p = userPlayer(state);
  const c = state.career;
  const rf = recentForm(state);
  const a = ageOf(p, state.season);
  let heat = (rf.apps >= 3 ? (rf.avg - 6.6) * 1.4 : 0) + (p.form - 50) / 25 + c.fame / 30;
  if (c.transferListed) heat += 1.2;
  if (hasTrait(p, 'mercenary')) heat += 0.5;
  if (hasTrait(p, 'wonderkid') && a <= 21) heat += 0.6;
  if (hasTrait(p, 'loyal')) heat -= 0.3;
  return heat;
}

function candidateClubs(state: GameState, minLevel: number, maxLevel: number, excludeIds: string[]): { club: Club; level: number }[] {
  const out: { club: Club; level: number }[] = [];
  for (const club of Object.values(state.world.clubs)) {
    if (excludeIds.includes(club.id) || liveOfferFrom(state, club.id)) continue;
    const level = clubLevel(state, club.id);
    if (level >= minLevel && level <= maxLevel) out.push({ club, level });
  }
  return out;
}

function transferOffer(state: GameState, rng: Rng, heat: number): TransferOffer | null {
  const p = userPlayer(state);
  const ovr = overall(p);
  const value = userMarketValue(state);
  const curLevel = p.clubId ? clubLevel(state, p.clubId, p.id) : ovr - 6;
  const reach = Math.max(0, heat) * 2.5;
  const exclude = [p.clubId ?? '', p.contract?.loan?.parentClubId ?? ''];
  const cands = candidateClubs(state, ovr - 11, ovr + 3 + reach, exclude)
    .filter(({ club }) => club.budget >= value * 0.7);
  if (!cands.length) return null;
  const ideal = ovr + 1 + reach * 0.5;
  const myCountry = clubOf(state, p.clubId)?.country;
  const pick = rng.weighted(cands, ({ club, level }) =>
    Math.exp(-Math.abs(level - ideal) / 4) * (0.6 + club.reputation / 100) * (club.country === myCountry ? 1.25 : 1));
  const club = pick.club;
  const eager = clamp(0.9 + (ovr - pick.level) / 25 + heat * 0.05, 0.75, 1.3);
  let fee = value * rng.float(0.82, 1.2) * eager * (state.career.transferListed ? 0.85 : 1);
  const clause = p.contract?.releaseClause ?? null;
  if (clause !== null && clause <= club.budget * 0.6 && pick.level > curLevel + 3 && rng.chance(0.4)) fee = clause;
  fee = Math.min(niceMoney(fee), club.budget);
  if (fee < value * 0.4) return null;
  const terms = buildTerms(state, club, 'transfer', rng);
  const kind: NoteKind = state.career.transferListed && rng.chance(0.5) ? 'listed' : pick.level > curLevel + 3 ? 'up' : pick.level < curLevel - 3 ? 'down' : 'same';
  if (kind === 'down' && roleIdx(terms.role) < 2) terms.role = 'starter';
  return makeOffer(state, club, 'transfer', fee, terms, offerNote(state, kind, club, rng.next()), ownerAcceptsFee(state, fee), rng);
}

function loanOffer(state: GameState, rng: Rng): TransferOffer | null {
  const p = userPlayer(state);
  if (!p.clubId || p.contract?.loan) return null;
  const ovr = overall(p);
  const curLevel = clubLevel(state, p.clubId, p.id);
  const cands = candidateClubs(state, ovr - 9, Math.min(ovr + 4, curLevel - 2), [p.clubId]);
  if (!cands.length) return null;
  const { club } = rng.weighted(cands, ({ club: c, level }) => Math.exp(-Math.abs(level - ovr) / 4) * (0.5 + c.youth / 100));
  const terms = buildTerms(state, club, 'loan', rng);
  if (roleIdx(terms.role) < 1) terms.role = 'rotation';
  return makeOffer(state, club, 'loan', 0, terms, offerNote(state, 'loan', club, rng.next()), true, rng);
}

function renewalOffer(state: GameState, rng: Rng, great: boolean): TransferOffer | null {
  const p = userPlayer(state);
  const club = clubOf(state, p.clubId);
  if (!club || !p.contract || p.contract.loan) return null;
  const terms = buildTerms(state, club, 'renewal', rng);
  if (roleIdx(terms.role) < roleIdx(p.contract.role)) terms.role = p.contract.role;
  const offer = makeOffer(state, club, 'renewal', 0, terms, offerNote(state, great ? 'renewal_great' : 'renewal', club, rng.next()), true, rng);
  offer.expiresWeek = absAfter(state.season, state.week, 4);
  return offer;
}

function freeAgentOffers(state: GameState, rng: Rng): TransferOffer[] {
  const p = userPlayer(state);
  const ovr = overall(p);
  const live = state.offers.filter((o) => isLiveOffer(o)).length;
  const n = live >= 4 ? 0 : live === 0 ? rng.int(1, 3) : rng.chance(0.4) ? 1 : 0;
  const out: TransferOffer[] = [];
  for (let i = 0; i < n; i++) {
    let cands = candidateClubs(state, ovr - 14, ovr + 2 + state.career.fame / 20, []);
    cands = cands.filter((x) => !out.some((o) => o.fromClubId === x.club.id));
    if (!cands.length) break;
    const { club } = rng.weighted(cands, ({ level }) => Math.exp(-Math.abs(level - (ovr - 2)) / 5));
    const terms = buildTerms(state, club, 'free', rng);
    out.push(makeOffer(state, club, 'free', 0, terms, offerNote(state, 'free', club, rng.next()), true, rng));
  }
  return out;
}

export function generateOffers(state: GameState, rng: Rng): TransferOffer[] {
  const c = state.career;
  if (c.retired) return [];
  const p = userPlayer(state);
  const out: TransferOffer[] = [];
  const push = (o: TransferOffer | null) => { if (o) { out.push(o); state.offers.push(o); } };

  if (!p.clubId) {
    for (const o of freeAgentOffers(state, rng)) push(o);
    return out;
  }
  if (!isTransferWindowWeek(state.week)) return out;

  const wk = windowKey(state.season, state.week);
  const heat = marketHeat(state);

  // renewals from the current club
  const renewKey = `career.renewal.${wk}`;
  const left = seasonsLeft(state, p);
  const great = state.week >= SEASON_END_WEEK && recentForm(state).avg >= 7.2 && recentForm(state).apps >= 6;
  const relOk = c.relationships.manager >= 30 || hasTrait(p, 'loyal');
  if (!state.flags[renewKey] && !c.transferListed && relOk && (left <= 1.5 || (great && left <= 3.5))
    && !state.offers.some((o) => o.kind === 'renewal' && isLiveOffer(o))) {
    const chance = (left <= 1.5 ? 0.55 : 0.4) + (hasTrait(p, 'loyal') ? 0.25 : 0);
    if (rng.chance(chance)) {
      push(renewalOffer(state, rng, great));
      state.flags[renewKey] = true;
    }
  }

  // outside interest, capped per window
  const capKey = `career.offerCap.${wk}`;
  const countKey = `career.offerCount.${wk}`;
  if (typeof state.flags[capKey] !== 'number') {
    state.flags[capKey] = clamp(Math.round(0.6 + heat * 0.9 + rng.float(-0.6, 0.9)), 0, 4);
  }
  const cap = getFlagNum(state, capKey);
  let count = getFlagNum(state, countKey);
  const a = ageOf(p, state.season);
  const tries = rng.chance(0.25) ? 2 : 1;
  for (let i = 0; i < tries && count < cap; i++) {
    if (!rng.chance(0.55)) continue;
    const share = minutesShare(state);
    const wantsLoan = a <= 21 && share < 0.35 && state.week >= 8 && !c.transferListed;
    const offer = wantsLoan && rng.chance(0.55) ? loanOffer(state, rng) : transferOffer(state, rng, heat);
    if (offer) { push(offer); count++; }
  }
  state.flags[countKey] = count;
  return out;
}

export function trialOffers(state: GameState, clubIds: string[]): TransferOffer[] {
  const p = userPlayer(state);
  const ovr = overall(p);
  const out: TransferOffer[] = [];
  for (const id of clubIds) {
    const club = state.world.clubs[id];
    if (!club) continue;
    const h = hash01(`trial:${state.seed}:${id}`);
    const wage = clamp(niceMoney(500 + (club.reputation / 100) * 1_700 * (0.8 + h * 0.4)), 500, 2_500);
    const level = clubLevel(state, id, p.id);
    const terms: ContractTerms = {
      wage,
      years: h > 0.5 ? 3 : 2,
      releaseClause: null,
      role: ovr >= level - 4 ? 'rotation' : 'prospect',
      signingBonus: niceMoney(wage * (2 + h * 3)),
      goalBonus: niceMoney(isAttacker(p) ? wage * 0.15 : wage * 0.05),
    };
    const offer: TransferOffer = {
      id: nextId(state, 'off'),
      kind: 'trial',
      fromClubId: id,
      season: state.season,
      week: state.week,
      expiresWeek: absAfter(state.season, state.week, 6),
      fee: 0,
      terms,
      status: 'pending',
      parentClubAccepts: true,
      note: offerNote(state, 'trial', club, hash01(`note:${state.seed}:${id}`)),
    };
    out.push(offer);
    if (!state.offers.some((o) => o.id === offer.id)) state.offers.push(offer);
  }
  return out;
}

// ───────── negotiation ─────────

/** How badly the club wants the user (0..1). */
export function clubEagerness(state: GameState, offer: TransferOffer): number {
  const p = userPlayer(state);
  const level = clubLevel(state, offer.fromClubId, p.id);
  let e = 0.5 + (overall(p) - level) / 20 + (recentForm(state).avg - 6.6) * 0.12 + state.career.fame / 250;
  if (offer.kind === 'renewal' && hasTrait(p, 'loyal')) e += 0.1;
  if (offer.kind === 'trial') e -= 0.15;
  return clamp(e, 0.1, 1);
}

export function negotiationLimits(state: GameState, offer: TransferOffer): Negotiation['limits'] {
  const p = userPlayer(state);
  const club = state.world.clubs[offer.fromClubId];
  const a = ageOf(p, state.season);
  const fair = fairWage(state, p, offer.fromClubId);
  const value = userMarketValue(state);
  const eager = clubEagerness(state, offer);
  const budgetCap = club ? club.wageBudget * 0.25 : fair * 2;
  const floor = (v: number) => Math.max(0, Math.floor(v));

  let maxWage = Math.max(offer.terms.wage * 1.05, Math.min(budgetCap, fair * (1.12 + eager * 0.4)));
  if (offer.kind === 'trial') maxWage = Math.min(3_000, offer.terms.wage * 1.3);
  maxWage = Math.max(offer.terms.wage, floor(maxWage));

  let maxYears = a <= 23 ? 5 : a <= 29 ? 4 : a <= 31 ? 3 : a <= 33 ? 2 : 1;
  if (offer.kind === 'loan') maxYears = 1;
  if (offer.kind === 'trial') maxYears = 3;
  maxYears = Math.max(maxYears, offer.terms.years);

  let minReleaseClause: number | null;
  if (offer.kind === 'loan') minReleaseClause = null;
  else if (offer.kind === 'trial') minReleaseClause = Math.max(1_000_000, niceMoney(value * 4));
  else {
    const mult = (club?.reputation ?? 50) >= 85 ? 3 : eager > 0.7 ? 1.6 : 2.2;
    minReleaseClause = Math.max(500_000, niceMoney(value * mult));
  }
  if (minReleaseClause !== null && offer.terms.releaseClause !== null) minReleaseClause = Math.min(minReleaseClause, offer.terms.releaseClause);

  let maxSigningBonus: number;
  switch (offer.kind) {
    case 'free': maxSigningBonus = fair * (10 + eager * 14); break;
    case 'renewal': maxSigningBonus = fair * (3 + eager * 6) * (hasTrait(p, 'loyal') ? 1.3 : 1); break;
    case 'loan': maxSigningBonus = 0; break;
    case 'trial': maxSigningBonus = offer.terms.signingBonus * 1.5; break;
    default: maxSigningBonus = fair * (4 + eager * 10);
  }
  if (hasTrait(p, 'mercenary')) maxSigningBonus *= 1.25;
  maxSigningBonus = Math.max(offer.terms.signingBonus, floor(maxSigningBonus));

  const maxGoalBonus = Math.max(offer.terms.goalBonus, floor(fair * (isAttacker(p) ? 0.35 : 0.15)));

  const projected = club ? projectedRole(state, club.id, p) : offer.terms.role;
  const top = Math.min(3, Math.max(roleIdx(projected) + (eager > 0.8 ? 1 : 0), roleIdx(offer.terms.role)));
  const roles = ROLE_ORDER.slice(0, top + 1);

  return { maxWage, maxYears, minReleaseClause, maxSigningBonus, maxGoalBonus, roles };
}

const num = (v: unknown, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);

export function clampTerms(neg: Negotiation, terms: ContractTerms): ContractTerms {
  const L = neg.limits;
  const cur = neg.current;
  const wage = clamp(Math.round(num(terms?.wage, cur?.wage ?? 0)), Math.min(100, L.maxWage), L.maxWage);
  const years = clamp(Math.round(num(terms?.years, cur?.years ?? 1)), 1, Math.max(1, L.maxYears));
  const roles = L.roles.length ? L.roles : ['rotation' as SquadRole];
  let role: SquadRole = terms && ROLE_ORDER.includes(terms.role) ? terms.role : cur?.role ?? roles[0];
  if (!roles.includes(role)) {
    const allowed = roles.filter((r) => roleIdx(r) <= roleIdx(role)).sort((a, b) => roleIdx(b) - roleIdx(a));
    role = allowed[0] ?? [...roles].sort((a, b) => roleIdx(a) - roleIdx(b))[0];
  }
  let releaseClause: number | null = null;
  const askedClause = terms?.releaseClause;
  if (L.minReleaseClause !== null && typeof askedClause === 'number' && Number.isFinite(askedClause)) {
    releaseClause = Math.max(Math.round(askedClause), L.minReleaseClause);
  }
  return {
    wage,
    years,
    releaseClause,
    role,
    signingBonus: clamp(Math.round(num(terms?.signingBonus, 0)), 0, L.maxSigningBonus),
    goalBonus: clamp(Math.round(num(terms?.goalBonus, 0)), 0, L.maxGoalBonus),
  };
}

function openingLine(state: GameState, offer: TransferOffer, terms: ContractTerms, lang: Lang): string {
  const club = state.world.clubs[offer.fromClubId];
  const key = offer.kind === 'renewal' ? 'renewal' : offer.kind === 'loan' ? 'loan' : offer.kind === 'trial' ? 'trial' : offer.kind === 'free' ? 'free' : 'transfer';
  return t(`career.neg.open.${key}`, {
    club: club?.name ?? '', wage: formatMoney(terms.wage, lang), years: terms.years, role: t(`common.role.${terms.role}`, undefined, lang),
  }, lang);
}

export function startNegotiation(state: GameState, offerId: string): Negotiation {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) throw new Error(`career: offer ${offerId} not found`);
  const p = userPlayer(state);
  const c = state.career;
  const limits = negotiationLimits(state, offer);
  const eager = clubEagerness(state, offer);
  let patience = 55 + eager * 30 + (c.relationships.agent - 50) * 0.3;
  if (hasTrait(p, 'calm')) patience += 8;
  if (hasTrait(p, 'hothead')) patience -= 6;
  const neg: Negotiation = {
    offerId,
    clubId: offer.fromClubId,
    round: 0,
    maxRounds: offer.kind === 'trial' ? 3 : offer.kind === 'renewal' ? 4 : 5,
    patience: Math.round(clamp(patience, 30, 95)),
    current: { ...offer.terms },
    limits,
    lines: [],
    status: 'open',
  };
  neg.current = clampTerms(neg, offer.terms);
  neg.lines.push({ from: 'club', text: openingLine(state, offer, neg.current, state.lang), terms: { ...neg.current } });
  state.negotiation = neg;
  if (offer.status === 'pending') offer.status = 'negotiating';
  return neg;
}

/** 0 = within limits; grows with how far the ask goes beyond what the club can do. */
export function greedOf(neg: Negotiation, ask: ContractTerms): number {
  const L = neg.limits;
  let over = 0;
  over += Math.max(0, num(ask.wage, 0) / Math.max(1, L.maxWage) - 1);
  over += Math.max(0, num(ask.years, 1) - L.maxYears) * 0.08;
  const sb = num(ask.signingBonus, 0);
  if (L.maxSigningBonus > 0) over += Math.max(0, sb / L.maxSigningBonus - 1) * 0.5;
  else if (sb > 0) over += Math.min(1, sb / Math.max(1, L.maxWage * 4)) * 0.5;
  const gb = num(ask.goalBonus, 0);
  if (L.maxGoalBonus > 0) over += Math.max(0, gb / L.maxGoalBonus - 1) * 0.3;
  else if (gb > 0) over += 0.15;
  const maxRole = Math.max(...L.roles.map(roleIdx), 0);
  if (ROLE_ORDER.includes(ask.role) && roleIdx(ask.role) > maxRole) over += 0.25 * (roleIdx(ask.role) - maxRole);
  if (ask.releaseClause !== null && typeof ask.releaseClause === 'number') {
    if (L.minReleaseClause === null) over += 0.1;
    else if (ask.releaseClause < L.minReleaseClause) over += Math.min(0.5, (L.minReleaseClause / Math.max(1, ask.releaseClause) - 1) * 0.25);
  }
  return over;
}

/** Fraction of the club's leeway the ask consumes (0 = no more than the current proposal, 1 = at the limits). */
function leewayUsed(neg: Negotiation, ask: ContractTerms): number {
  const cur = neg.current;
  const L = neg.limits;
  const part = (v: number, c: number, m: number) => (m <= c ? (v > c ? 1 : 0) : clamp((v - c) / (m - c), 0, 1));
  return avg([
    part(num(ask.wage, cur.wage), cur.wage, L.maxWage) * 2,
    part(num(ask.signingBonus, cur.signingBonus), cur.signingBonus, L.maxSigningBonus),
    part(num(ask.goalBonus, cur.goalBonus), cur.goalBonus, L.maxGoalBonus),
  ]) / (4 / 3);
}

export function negotiationStep(state: GameState, ask: ContractTerms, _rng: Rng): { accepted: boolean; collapsed: boolean; terms: ContractTerms; patienceDelta: number } {
  const neg = state.negotiation;
  if (!neg || neg.status !== 'open' || neg.round >= neg.maxRounds) {
    // no rounds left: the club's last proposal stands (take it or walk away)
    return { accepted: false, collapsed: true, terms: neg?.current ?? ask, patienceDelta: 0 };
  }
  const p = userPlayer(state);
  const c = state.career;
  const cur = neg.current;
  const over = greedOf(neg, ask);
  const within = over <= 1e-6;
  const used = leewayUsed(neg, ask);

  let delta = within ? -(3 + used * 7 + neg.round) : -(6 + neg.round + Math.min(50, over * 75));
  if (c.relationships.agent >= 70) delta *= 0.75;
  else if (c.relationships.agent <= 30) delta *= 1.2;
  if (hasTrait(p, 'calm')) delta *= 0.85;
  if (hasTrait(p, 'hothead')) delta *= 1.2;
  const patienceDelta = Math.round(delta);
  const collapsed = neg.patience + patienceDelta <= 0;

  const accepted = !collapsed && within && (used <= 0.75 || neg.round >= 1);
  if (accepted) return { accepted, collapsed: false, terms: clampTerms(neg, ask), patienceDelta };

  // counter: move toward the (clamped) ask, never beyond the limits
  const target = clampTerms(neg, ask);
  const agentBonus = clamp((c.relationships.agent - 50) / 300, -0.1, 0.15);
  const concede = clamp(0.35 + agentBonus + (within ? 0.3 : 0) - Math.min(0.25, over * 0.3), 0.15, 0.85);
  const toward = (from: number, to: number) => (to <= from ? to : from + (to - from) * concede);
  const next: ContractTerms = {
    wage: Math.floor(toward(cur.wage, target.wage)),
    years: target.years === cur.years ? cur.years : cur.years + Math.sign(target.years - cur.years),
    role: roleIdx(target.role) <= roleIdx(cur.role) || concede >= 0.5 ? target.role : cur.role,
    releaseClause: target.releaseClause === null ? null : cur.releaseClause !== null || concede >= 0.5 ? target.releaseClause : null,
    signingBonus: Math.floor(toward(cur.signingBonus, target.signingBonus)),
    goalBonus: Math.floor(toward(cur.goalBonus, target.goalBonus)),
  };
  return { accepted: false, collapsed, terms: clampTerms(neg, next), patienceDelta };
}

/**
 * Convenience for UIs/tests without a narrator: run `negotiationStep` and apply it to
 * `state.negotiation` (round, patience, proposal, status, lines).
 */
export function applyNegotiationStep(state: GameState, ask: ContractTerms, rng: Rng): Negotiation | null {
  const neg = state.negotiation;
  if (!neg || neg.status !== 'open') return neg;
  const step = negotiationStep(state, ask, rng);
  neg.lines.push({ from: 'player', text: askLine(ask, state.lang), terms: { ...ask } });
  if (neg.round < neg.maxRounds) neg.round += 1;
  neg.patience = clamp(neg.patience + step.patienceDelta, 0, 100);
  neg.current = clampTerms(neg, step.terms);
  if (step.accepted) neg.status = 'agreed';
  else if (step.collapsed || neg.patience <= 0) neg.status = 'collapsed';
  const club = state.world.clubs[neg.clubId]?.name ?? '';
  neg.lines.push({ from: 'club', text: t(`career.neg.reply.${neg.status}`, { club }, state.lang), terms: { ...neg.current } });
  return neg;
}

/** A plain-text version of the user's ask (for transcripts). */
export function askLine(ask: ContractTerms, lang: Lang): string {
  return t('career.neg.ask', {
    wage: formatMoney(ask.wage, lang),
    years: ask.years,
    role: t(`common.role.${ask.role}`, undefined, lang),
    bonus: formatMoney(ask.signingBonus, lang),
    goal: formatMoney(ask.goalBonus, lang),
    clause: ask.releaseClause !== null ? t('career.neg.askClause', { v: formatMoney(ask.releaseClause, lang) }, lang) : t('career.neg.askNoClause', undefined, lang),
  }, lang);
}

// ───────── signing ─────────

const PREFERRED_NUMBERS: Record<string, number[]> = {
  ST: [9, 19, 99, 29, 39], W: [7, 11, 17, 77, 70], AM: [10, 8, 20, 21], CM: [8, 6, 14, 16, 18], DM: [6, 16, 26],
  CB: [4, 5, 15, 3, 44], FB: [2, 3, 12, 22, 23], GK: [1, 12, 13],
};

export function pickShirtNumber(state: GameState, club: Club, p: Footballer): number {
  const taken = new Set(playersOf(state, club.squad).filter((x) => x.id !== p.id).map((x) => x.shirtNumber));
  const prefs = [...(PREFERRED_NUMBERS[p.position] ?? []), p.shirtNumber];
  for (const n of prefs) if (n >= 1 && n <= 99 && !taken.has(n)) return n;
  for (let n = 2; n <= 99; n++) if (!taken.has(n)) return n;
  return p.shirtNumber;
}

/** A veteran (28+) teammate, ideally in the same position group, becomes your mentor. */
export function pickMentor(state: GameState, clubId: string, p: Footballer): string | null {
  const club = state.world.clubs[clubId];
  if (!club) return null;
  const g = positionGroup(p.position);
  let best: Footballer | null = null;
  let bestScore = -Infinity;
  for (const x of playersOf(state, club.squad)) {
    if (x.id === p.id || ageOf(x, state.season) < 28 || x.position === 'GK') continue;
    const s = overall(x) + (positionGroup(x.position) === g ? 12 : 0) + (x.position === p.position ? 4 : 0) + ageOf(x, state.season) * 0.3;
    if (s > bestScore) { bestScore = s; best = x; }
  }
  return best?.id ?? null;
}

function removeFromSquad(state: GameState, clubId: string | null | undefined, playerId: string): void {
  const club = clubOf(state, clubId);
  if (club) club.squad = club.squad.filter((id) => id !== playerId);
}

function addToSquad(state: GameState, clubId: string, playerId: string): void {
  const club = clubOf(state, clubId);
  if (club && !club.squad.includes(playerId)) club.squad.push(playerId);
}

function storeParentContract(state: GameState, contract: Contract | null): void {
  if (contract) state.flags[PARENT_CONTRACT_FLAG] = JSON.stringify(contract);
  else delete state.flags[PARENT_CONTRACT_FLAG];
}

function readParentContract(state: GameState): Contract | null {
  const raw = state.flags[PARENT_CONTRACT_FLAG];
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw) as Contract; } catch { return null; }
}

/** Move the user into a club's squad with a new contract (no fee logic). */
function joinClub(state: GameState, club: Club, contract: Contract): void {
  const p = userPlayer(state);
  const c = state.career;
  removeFromSquad(state, p.clubId, p.id);
  if (p.contract?.loan) removeFromSquad(state, p.contract.loan.parentClubId, p.id);
  p.clubId = club.id;
  p.contract = contract;
  p.shirtNumber = pickShirtNumber(state, club, p);
  addToSquad(state, club.id, p.id);
  c.mentorId = pickMentor(state, club.id, p);
  c.setPieces = { freeKicks: false, penalties: false, corners: false };
  c.transferListed = false;
  state.flags['career.joinedIdx'] = nowIndex(state);
  state.flags['career.benchStreak'] = 0;
}

export function acceptOffer(state: GameState, offerId: string, terms?: ContractTerms): void {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) throw new Error(`career: offer ${offerId} not found`);
  if (!isLiveOffer(offer)) throw new Error(`career: offer ${offerId} is ${offer.status}`);
  const club = state.world.clubs[offer.fromClubId];
  if (!club) throw new Error(`career: club ${offer.fromClubId} missing`);
  const c = state.career;
  const p = userPlayer(state);

  // final terms always pass through the hard limits
  let neg = state.negotiation && state.negotiation.offerId === offerId ? state.negotiation : null;
  if (!neg) {
    neg = { offerId, clubId: club.id, round: 0, maxRounds: 1, patience: 50, current: { ...offer.terms }, limits: negotiationLimits(state, offer), lines: [], status: 'open' };
  }
  const final = clampTerms(neg, terms ?? offer.terms);

  const startSeason = contractStartSeason(state);
  const oldClubId = p.clubId;
  const ownerId = p.contract?.loan?.parentClubId ?? p.clubId;
  const oldRep = clubOf(state, oldClubId)?.reputation ?? 0;
  const yearsAtClub = (nowIndex(state) - getFlagNum(state, 'career.joinedIdx', nowIndex(state))) / 52;
  const appearanceBonus = Math.round(final.wage * 0.08);

  if (offer.kind === 'renewal') {
    p.contract = {
      clubId: club.id, wage: final.wage, startSeason: state.season, endSeason: startSeason + final.years - 1,
      releaseClause: final.releaseClause, role: final.role, goalBonus: final.goalBonus, appearanceBonus,
    };
    applyEffects(state, { money: final.signingBonus, rel: { manager: 4, fans: hasTrait(p, 'loyal') ? 5 : 2 }, morale: 4 });
    c.transferListed = false;
  } else if (offer.kind === 'loan') {
    const parent = p.clubId;
    if (!parent || !p.contract) throw new Error('career: cannot loan out a free agent');
    storeParentContract(state, p.contract);
    joinClub(state, club, {
      clubId: club.id, wage: final.wage, startSeason: state.season, endSeason: startSeason, releaseClause: null,
      role: final.role, goalBonus: final.goalBonus, appearanceBonus, loan: { parentClubId: parent, endSeason: startSeason },
    });
    resetRelationships(state, club, offer.fee, final.role, oldRep);
  } else {
    // permanent move: transfer, free agent, trial
    if (offer.fee > 0) {
      club.budget = Math.max(0, club.budget - offer.fee);
      const owner = clubOf(state, ownerId);
      if (owner) owner.budget += offer.fee;
    }
    storeParentContract(state, null);
    joinClub(state, club, {
      clubId: club.id, wage: final.wage, startSeason: state.season, endSeason: startSeason + final.years - 1,
      releaseClause: final.releaseClause, role: final.role, goalBonus: final.goalBonus, appearanceBonus,
    });
    applyEffects(state, { money: final.signingBonus });
    resetRelationships(state, club, offer.fee, final.role, oldRep);
    if (oldClubId && hasTrait(p, 'loyal') && yearsAtClub >= 2) applyEffects(state, { morale: -6 });
  }

  // sensible clean-up of other offers
  for (const o of state.offers) {
    if (o.id === offer.id || !isLiveOffer(o)) continue;
    if (offer.kind === 'renewal' ? o.kind === 'renewal' : true) o.status = 'withdrawn';
  }
  offer.status = 'accepted';
  offer.terms = { ...final };
  state.negotiation = null;
  p.value = userMarketValue(state);
}

function resetRelationships(state: GameState, club: Club, fee: number, role: SquadRole, oldRep: number): void {
  const c = state.career;
  const p = userPlayer(state);
  const r = c.relationships;
  r.manager = Math.round(clamp(50 + (r.manager - 50) * 0.3 + (role === 'star' ? 6 : role === 'starter' ? 3 : 0), 0, 100));
  r.teammates = Math.round(clamp(45 + (r.teammates - 45) * 0.3 + (hasTrait(p, 'leader') ? 5 : 0), 0, 100));
  let fans = 35 + c.fame * 0.25 + (fee >= 20_000_000 ? 6 : 0) - (hasTrait(p, 'mercenary') ? 6 : 0) + (hasTrait(p, 'fan_favourite') ? 5 : 0);
  if (c.genesis.hometownClubId === club.id) fans += 15;
  r.fans = Math.round(clamp(fans, 20, 75));
  const fame = clamp(fee / 15_000_000, 0, 4) + (club.reputation > oldRep + 10 ? 1 : 0);
  applyEffects(state, { fame, followers: Math.round(1_000 + c.followers * 0.03 + fee / 2_000), morale: 5 });
}

export function rejectOffer(state: GameState, offerId: string): void {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return;
  if (state.negotiation?.offerId === offerId) state.negotiation = null;
  if (!isLiveOffer(offer)) return;
  offer.status = 'rejected';
  const p = userPlayer(state);
  if (offer.kind === 'renewal') {
    applyEffects(state, { rel: { manager: -4, fans: hasTrait(p, 'loyal') ? 0 : -2 } });
  } else if (offer.kind === 'transfer' && p.clubId) {
    const myClub = state.world.clubs[p.clubId];
    if (myClub?.derbyRivals.includes(offer.fromClubId)) applyEffects(state, { rel: { fans: 3 } });
    else if (hasTrait(p, 'loyal')) applyEffects(state, { rel: { fans: 1 } });
  }
}

export function setTransferListed(state: GameState, on: boolean): void {
  const c = state.career;
  const p = userPlayer(state);
  if (c.transferListed === on || (on && !p.clubId)) return;
  c.transferListed = on;
  if (on) applyEffects(state, { rel: { manager: -8, fans: hasTrait(p, 'fan_favourite') ? -2 : -5, teammates: -2 }, morale: -2 });
  else applyEffects(state, { rel: { manager: 3, fans: 1 } });
}

/** Expire offers, end loans and contracts, drop finished sponsor deals. Returns localized notes. */
export function contractHousekeeping(state: GameState): string[] {
  const c = state.career;
  const notes: string[] = [];
  const now = absWeek(state.season, state.week);
  const p = userPlayer(state);

  for (const o of state.offers) {
    if (!isLiveOffer(o) || o.expiresWeek >= now) continue;
    if (o.kind === 'trial' && !p.clubId) continue; // a new career keeps its trial invitations
    o.status = 'expired';
    if (state.negotiation?.offerId === o.id) state.negotiation = null;
    notes.push(t('career.contract.offerExpired', { club: state.world.clubs[o.fromClubId]?.name ?? '' }));
  }

  if (c.retired) return notes;
  const seasonOver = state.week >= SEASON_END_WEEK;

  // sponsor deals that ran out
  const before = c.sponsors.length;
  const keep = seasonOver ? c.sponsors.filter((d) => d.endSeason > state.season) : activeSponsors(state);
  for (const d of c.sponsors) if (!keep.includes(d)) notes.push(t('career.contract.sponsorEnd', { brand: d.brand }));
  if (keep.length !== before) c.sponsors = keep;

  if (!seasonOver || !p.contract || !p.clubId) return notes;

  // loan spell over → back to the parent club (or free if that deal ended too)
  const loan = p.contract.loan;
  if (loan && loan.endSeason <= state.season) {
    const parent = readParentContract(state);
    const parentClub = clubOf(state, loan.parentClubId);
    storeParentContract(state, null);
    if (parent && parentClub && parent.endSeason > state.season) {
      removeFromSquad(state, p.clubId, p.id);
      p.clubId = parentClub.id;
      p.contract = parent;
      p.shirtNumber = pickShirtNumber(state, parentClub, p);
      addToSquad(state, parentClub.id, p.id);
      c.mentorId = pickMentor(state, parentClub.id, p);
      c.setPieces = { freeKicks: false, penalties: false, corners: false };
      notes.push(t('career.contract.loanEnd', { club: parentClub.name }));
      return notes;
    }
    becomeFreeAgent(state);
    notes.push(t('career.contract.free'));
    return notes;
  }

  if (p.contract.endSeason <= state.season) {
    becomeFreeAgent(state);
    notes.push(t('career.contract.free'));
  }
  return notes;
}

function becomeFreeAgent(state: GameState): void {
  const p = userPlayer(state);
  const c = state.career;
  removeFromSquad(state, p.clubId, p.id);
  if (p.contract?.loan) removeFromSquad(state, p.contract.loan.parentClubId, p.id);
  p.clubId = null;
  p.contract = null;
  c.mentorId = null;
  c.transferListed = false;
  c.setPieces = { freeKicks: false, penalties: false, corners: false };
  for (const o of state.offers) if (isLiveOffer(o) && (o.kind === 'renewal' || o.kind === 'loan')) o.status = 'withdrawn';
  p.value = userMarketValue(state);
}
