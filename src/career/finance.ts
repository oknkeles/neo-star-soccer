/**
 * Money in and out every week: wages, sponsor deals, upkeep, progressive income tax.
 * Sponsorship proposals with invented brands.
 */
import type { CountryCode, GameState, SponsorDeal } from '../core/types';
import type { Rng } from '../core/rng';
import { getLang, t } from '../core/i18n';
import { clamp, formatMoney, nextId } from '../core/util';
import type { FinanceBreakdown } from './model';
import { MONEY_FLOOR } from './model';
import { SEASON_END_WEEK, clubOf, hasTrait, niceMoney, userPlayer } from './helpers';
import { itemPerks, sellItem, shopItem } from './shop';
import { applyEffects } from './effects';

/** Weekly progressive brackets: [upper bound, rate]. */
const TAX_BRACKETS: [number, number][] = [
  [1_000, 0],
  [5_000, 0.15],
  [20_000, 0.25],
  [100_000, 0.35],
  [Infinity, 0.42],
];

/** Country tweaks to the tax burden. */
const COUNTRY_TAX: Record<CountryCode, number> = {
  ENG: 1.0, ESP: 1.02, ITA: 0.95, GER: 1.02, FRA: 1.08, POR: 0.9, NED: 0.95, TUR: 0.85,
};

export function incomeTax(gross: number, country?: CountryCode): number {
  if (gross <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of TAX_BRACKETS) {
    if (gross > lower) tax += (Math.min(gross, upper) - lower) * rate;
    lower = upper;
  }
  return Math.round(tax * (country ? COUNTRY_TAX[country] ?? 1 : 1));
}

export function activeSponsors(state: GameState): SponsorDeal[] {
  return state.career.sponsors.filter((d) => d.endSeason >= state.season);
}

export function weeklyFinances(state: GameState): FinanceBreakdown {
  const c = state.career;
  const p = userPlayer(state);
  const wage = c.retired ? 0 : p.contract?.wage ?? 0;
  const sponsors = activeSponsors(state).reduce((a, d) => a + d.weekly, 0);
  const upkeep = itemPerks(state).upkeep;
  const country = clubOf(state, p.clubId)?.country;
  const tax = incomeTax(wage + sponsors, country);
  return { wage, sponsors, upkeep, tax, total: wage + sponsors - upkeep - tax };
}

/** When debts hit the floor, the most expensive-to-keep item goes (staff first). */
function repossess(state: GameState): void {
  const owned = state.career.inventory
    .map((o) => shopItem(o.itemId))
    .filter((x): x is NonNullable<typeof x> => !!x && x.upkeep > 0)
    .sort((a, b) => (b.category === 'staff' ? 1 : 0) - (a.category === 'staff' ? 1 : 0) || b.upkeep - a.upkeep);
  const victim = owned[0];
  if (!victim) return;
  const { refund } = sellItem(state, victim.id);
  const lang = getLang();
  state.inbox.push({
    id: nextId(state, 'msg'),
    season: state.season,
    week: state.week,
    kind: 'info',
    from: t('career.fin.from'),
    subject: t('career.fin.repoSubject'),
    body: t('career.fin.repoBody', { item: victim.name[lang], refund: formatMoney(refund, lang) }),
    read: false,
  });
}

export function applyWeeklyFinances(state: GameState): FinanceBreakdown {
  const f = weeklyFinances(state);
  if (f.total !== 0) applyEffects(state, { money: f.total });
  if (state.career.money <= MONEY_FLOOR && f.total < 0) repossess(state);
  return f;
}

// ───────── sponsors ─────────

export type SponsorCategory = 'boots' | 'drinks' | 'watches' | 'cars' | 'gaming' | 'fashion' | 'telecom';

const BRANDS: Record<SponsorCategory, string[]> = {
  boots: ['Strikeforce', 'Volta Boots', 'Kartal Spor', 'Aerostep', 'Nova Cleats', 'Falso Pro'],
  drinks: ['Zest Energy', 'Buzdağı Soda', 'Volt Cola', 'Hydra+', 'Şelale Su', 'Nar Fresh'],
  watches: ['Chronex', 'Saat Kulesi Atelier', 'Meridian Time', 'Valtério Genève'],
  cars: ['Torq Motors', 'Anka Otomotiv', 'Velora', 'Boreal EV'],
  gaming: ['PixelForge', 'GoalRush Mobile', 'Arcadia Games', 'Rabona Studios'],
  fashion: ['Urban Kaftan', 'Maison Lumen', 'Boğaziçi Denim', 'Nordvik Apparel'],
  telecom: ['Hızlı Hat', 'Nexa Mobile', 'Orbit Telecom', 'Kuzey 5G'],
};

const CATEGORY_FACTOR: Record<SponsorCategory, number> = {
  boots: 1.2, drinks: 0.9, watches: 1.0, cars: 1.1, gaming: 0.8, fashion: 1.0, telecom: 0.9,
};

export const SPONSOR_CATEGORIES = Object.keys(BRANDS) as SponsorCategory[];

export function sponsorCategoryName(cat: string): string {
  return t(`career.spcat.${cat}`);
}

export function maybeSponsorOffer(state: GameState, rng: Rng): SponsorDeal | null {
  const c = state.career;
  if (c.retired || c.fame < 3) return null;
  const p = userPlayer(state);
  const active = activeSponsors(state);
  if (active.length >= 4) return null;
  let chance = 0.04 + c.fame / 400 + Math.max(0, p.form - 60) / 400 + (c.relationships.sponsors - 50) / 1000;
  if (hasTrait(p, 'media_darling')) chance *= 1.4;
  if (!rng.chance(clamp(chance, 0, 0.45))) return null;

  const taken = new Set(active.map((d) => d.category));
  const free = SPONSOR_CATEGORIES.filter((cat) => !taken.has(cat));
  if (!free.length) return null;
  const category = rng.pick(free);
  const brand = rng.pick(BRANDS[category]);
  let weekly = (200 + Math.pow(c.fame, 2.5) * 1.2) * CATEGORY_FACTOR[category] * rng.float(0.8, 1.2);
  if (hasTrait(p, 'media_darling')) weekly *= 1.2;
  weekly *= 0.85 + c.relationships.sponsors / 333;
  const minFame = Math.max(0, Math.floor(c.fame / 5) * 5 - 10);
  const deal: SponsorDeal = {
    id: nextId(state, 'sp'),
    brand,
    category,
    weekly: Math.max(100, niceMoney(weekly)),
    endSeason: (state.week >= SEASON_END_WEEK ? state.season + 1 : state.season) + rng.int(0, 2),
    requirement: `★ ${minFame}+`,
  };
  return deal;
}

export function acceptSponsor(state: GameState, deal: SponsorDeal): void {
  const c = state.career;
  // one brand per category: the new deal replaces the old one
  c.sponsors = c.sponsors.filter((d) => d.category !== deal.category && d.id !== deal.id);
  c.sponsors.push({ ...deal });
  applyEffects(state, { rel: { sponsors: 3, agent: 1 }, followers: Math.round(deal.weekly * 0.5) });
}
