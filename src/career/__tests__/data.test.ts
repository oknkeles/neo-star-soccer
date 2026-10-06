import { describe, expect, it } from 'vitest';
import { missingKeys } from '../../core/i18n';
import { ICONS } from '../../ui/components/icons';
import type { TraitId } from '../../core/types';
import { ACTIVITIES, GOAL_TEMPLATE_IDS, INJURIES, SHOP_ITEMS, TRAINING_FOCUSES, TRAITS } from '../api';

const ALL_TRAITS: TraitId[] = [
  'big_game', 'glass_bones', 'late_bloomer', 'wonderkid', 'leader', 'showman', 'hothead', 'iron_man', 'set_piece_specialist',
  'clinical', 'playmaker', 'speedster', 'fan_favourite', 'media_darling', 'family_first', 'party_animal', 'workaholic',
  'loyal', 'mercenary', 'calm', 'trickster', 'aerial_threat',
];

describe('data tables', () => {
  it('defines every trait with TR+EN text, a valid icon and a polarity', () => {
    expect(TRAITS.map((t) => t.id).sort()).toEqual([...ALL_TRAITS].sort());
    for (const t of TRAITS) {
      expect(t.name.tr.length).toBeGreaterThan(2);
      expect(t.name.en.length).toBeGreaterThan(2);
      expect(t.desc.tr.length).toBeGreaterThan(20);
      expect(t.desc.en.length).toBeGreaterThan(20);
      expect(t.icon in ICONS, `${t.id} icon ${t.icon}`).toBe(true);
      expect(typeof t.positive).toBe('boolean');
    }
    expect(TRAITS.some((t) => !t.positive)).toBe(true);
  });

  it('has the eight training focuses with icons and attributes', () => {
    expect(TRAINING_FOCUSES.map((f) => f.id).sort()).toEqual(['balanced', 'defending', 'dribbling', 'mental', 'passing', 'physical', 'setpieces', 'shooting']);
    for (const f of TRAINING_FOCUSES) {
      expect(f.attrs.length).toBeGreaterThan(0);
      expect(f.icon in ICONS).toBe(true);
    }
  });

  it('ships a rich shop spanning all categories and tiers', () => {
    expect(SHOP_ITEMS.length).toBeGreaterThanOrEqual(45);
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
    expect(new Set(SHOP_ITEMS.map((i) => i.category))).toEqual(new Set(['car', 'house', 'watch', 'fashion', 'tech', 'pet', 'staff', 'boat', 'jet', 'art']));
    expect(new Set(SHOP_ITEMS.map((i) => i.tier))).toEqual(new Set([1, 2, 3, 4, 5]));
    const prices = SHOP_ITEMS.map((i) => i.price);
    expect(Math.min(...prices)).toBeLessThanOrEqual(2_500);
    expect(Math.max(...prices)).toBeGreaterThanOrEqual(60_000_000);
    for (const i of SHOP_ITEMS) {
      expect(i.icon in ICONS, `${i.id} icon ${i.icon}`).toBe(true);
      expect(i.name.tr && i.name.en && i.desc.tr && i.desc.en).toBeTruthy();
      expect(i.price).toBeGreaterThan(0);
      expect(i.upkeep).toBeGreaterThanOrEqual(0);
      expect(i.minFame).toBeGreaterThanOrEqual(0);
    }
  });

  it('includes Turkish-flavoured items and the staff roster', () => {
    const tr = SHOP_ITEMS.map((i) => i.name.tr).join(' | ');
    expect(tr).toMatch(/Anadol/);
    expect(tr).toMatch(/Yalı/);
    expect(tr).toMatch(/Kapadokya/);
    const staff = SHOP_ITEMS.filter((i) => i.category === 'staff').map((i) => i.name.en.toLowerCase()).join(' | ');
    for (const word of ['chef', 'physio', 'coach', 'pr', 'bodyguard']) expect(staff).toContain(word);
  });

  it('ships ~22+ activities across the eight categories', () => {
    expect(ACTIVITIES.length).toBeGreaterThanOrEqual(22);
    expect(new Set(ACTIVITIES.map((a) => a.id)).size).toBe(ACTIVITIES.length);
    expect(new Set(ACTIVITIES.map((a) => a.category))).toEqual(new Set(['rest', 'social', 'family', 'media', 'nightlife', 'charity', 'training', 'romance']));
    expect(ACTIVITIES.some((a) => a.risk)).toBe(true);
    for (const a of ACTIVITIES) {
      expect(a.icon in ICONS, `${a.id} icon ${a.icon}`).toBe(true);
      expect(a.name.tr && a.name.en && a.desc.tr && a.desc.en).toBeTruthy();
      if (a.risk) expect(a.risk.text.tr && a.risk.text.en).toBeTruthy();
    }
  });

  it('has an injury catalogue and a goal catalogue', () => {
    for (const sev of [1, 2, 3] as const) expect(INJURIES[sev].length).toBeGreaterThan(2);
    expect(GOAL_TEMPLATE_IDS.length).toBeGreaterThanOrEqual(20);
  });

  it('keeps TR and EN registries in sync for the career namespace', () => {
    const miss = missingKeys();
    expect(miss.tr.filter((k) => k.startsWith('career.'))).toEqual([]);
    expect(miss.en.filter((k) => k.startsWith('career.'))).toEqual([]);
  });

  it('uses proper Turkish characters in the data', () => {
    const blob = [...TRAITS.map((t) => t.name.tr + t.desc.tr), ...SHOP_ITEMS.map((i) => i.name.tr + i.desc.tr), ...ACTIVITIES.map((a) => a.name.tr + a.desc.tr)].join(' ');
    for (const ch of ['ç', 'ğ', 'ı', 'İ', 'ö', 'ş', 'ü']) expect(blob).toContain(ch);
  });
});
