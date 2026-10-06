/**
 * Career-local data shapes (re-exported from api.ts) and shared constants.
 */
import type { AttrKey, Effects, Localized, RelKey, TraitId, TrainingFocus } from '../core/types';

export const REL_KEYS: RelKey[] = ['manager', 'teammates', 'fans', 'media', 'family', 'partner', 'agent', 'sponsors'];

export const ACTIONS_PER_WEEK = 3;

/** Money never drops below this floor (debt limit). */
export const MONEY_FLOOR = -50_000;

export interface TraitDef { id: TraitId; name: Localized; desc: Localized; icon: string; positive: boolean }

export interface ProgressNote { attr: AttrKey; delta: number }

export interface TrainingFocusDef { id: TrainingFocus; name: Localized; attrs: AttrKey[]; icon: string }

export type ShopCategory = 'car' | 'house' | 'watch' | 'fashion' | 'tech' | 'pet' | 'staff' | 'boat' | 'jet' | 'art';

export interface ShopItem {
  id: string;
  category: ShopCategory;
  name: Localized;
  desc: Localized;
  price: number;
  upkeep: number;             // weekly €
  minFame: number;
  tier: 1 | 2 | 3 | 4 | 5;
  icon: string;               // icon name from src/ui/components/icons.ts
  /** Passive weekly bonuses while owned. */
  perks: { energyRegen?: number; trainingBoost?: number; fameWeekly?: number; morale?: number; injuryResist?: number; rel?: Partial<Record<RelKey, number>> };
  /** One-off effects on purchase. */
  onBuy?: Effects;
}

export interface FinanceBreakdown { wage: number; sponsors: number; upkeep: number; tax: number; total: number }

export type ActivityCategory = 'rest' | 'social' | 'family' | 'media' | 'nightlife' | 'charity' | 'training' | 'romance';

export interface ActivityDef {
  id: string;
  category: ActivityCategory;
  name: Localized;
  desc: Localized;
  icon: string;
  energy: number;             // energy cost (negative = restores)
  cost: number;               // €
  effects: Effects;
  risk?: { chance: number; effects: Effects; text: Localized };
  minFame?: number;
}
