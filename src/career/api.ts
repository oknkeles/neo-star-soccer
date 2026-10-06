/**
 * CAREER module — everything about the user's player and life: effects, progression,
 * training, energy/injuries, relationships, selection by the manager, economy (wages,
 * sponsors, shop, lifestyle activities), transfers & contracts (offers, negotiation
 * logic with hard limits), national team call-ups, career goals, traits, legacy.
 * Owner: career agent. Pure game logic, no UI, no LLM calls.
 *
 * Implementation lives in sibling files; this file is the module's public surface.
 * Types such as ShopItem / ActivityDef / TraitDef are declared in `model.ts`.
 */
import './strings';

// ───────── basics ─────────

/** The user's Footballer record (throws if the world has no such player). */
export { userPlayer } from './helpers';

/**
 * Apply bounded effects to the user (money, fame, followers, energy, morale, form,
 * relationships, xp, injury, flags). Clamps every meter. Returns localized short notes
 * such as '+3 Taraftar' for toasts.
 */
export { applyEffects } from './effects';

/** Clamp untrusted effects (e.g. from the LLM) to sane per-event limits. */
export { sanitizeEffects, sanitizeEffectsFor, relationshipLabel } from './effects';

export { REL_KEYS, ACTIONS_PER_WEEK, MONEY_FLOOR } from './model';
export type {
  TraitDef, ProgressNote, TrainingFocusDef, ShopCategory, ShopItem, FinanceBreakdown, ActivityCategory, ActivityDef,
} from './model';

export { TRAITS, traitDef, traitAttrMult } from './traits';

// ───────── progression ─────────

/** Convert xp into attribute points (respecting potential, age and traits). */
export { applyXp, xpMultiplier, ageGrowthMultiplier, potentialGapMultiplier, attrCap } from './xp';

export {
  TRAINING_FOCUSES, trainWeek, applyDrill, drillAvailable, weeklyRecovery, rollInjury, userSeasonAgeing,
} from './progression';
export { INJURIES, injuryName } from './injuries';

// ───────── match integration ─────────

/** Will the manager start / bench / drop the user for this fixture? (also refreshes `career.setPieces`) */
export { selectionFor, squadStanding } from './selection';

/**
 * After a user match: xp, form, morale, fame, followers, relationship changes, match
 * bonuses into money, user match log, injury roll. Returns localized notes.
 */
export { afterUserMatch } from './match';

// ───────── economy & lifestyle ─────────

export { SHOP_ITEMS, shopItem, ownsItem, itemPerks, resaleValue, buyItem, sellItem } from './shop';
export type { PerkTotals } from './shop';

export {
  weeklyFinances, applyWeeklyFinances, maybeSponsorOffer, acceptSponsor, incomeTax, activeSponsors,
  SPONSOR_CATEGORIES, sponsorCategoryName,
} from './finance';
export type { SponsorCategory } from './finance';

export { ACTIVITIES, activityDef, activityAvailability, canDoActivity, doActivity } from './activities';

// ───────── transfers & contracts ─────────

export { marketValue, userMarketValue, valueWithFame, fairWage } from './value';

export {
  generateOffers, trialOffers, startNegotiation, negotiationStep, applyNegotiationStep, clampTerms, acceptOffer,
  rejectOffer, setTransferListed, contractHousekeeping, negotiationLimits, clubEagerness, greedOf, askLine,
  ownerAcceptsFee, marketHeat, projectedRole, recentForm, minutesShare, pickMentor, pickShirtNumber, isLiveOffer, ROLE_ORDER,
} from './transfers';

// ───────── national team ─────────

/** During/just before an international break: decide call-up (overall vs nation pool, fame, form). */
export { nationalCallup, callupChance, callupThreshold } from './national';

// ───────── goals, legacy ─────────

export {
  makeCareerGoals, checkCareerGoals, isGoalMet, goalProgress, hallOfFameScore, legacyTier, retirementStatus,
  retirementReason, careerTotals, trophyKind, GOAL_TEMPLATE_IDS,
} from './legacy';
export type { CareerTotals, TrophyKind } from './legacy';
