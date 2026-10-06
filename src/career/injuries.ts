import type { Injury } from '../core/types';
import { t } from '../core/i18n';

/** Injury catalogue by severity (keys resolve to 'career.inj.<key>'). */
export const INJURIES: Record<1 | 2 | 3, { key: string; weeks: [number, number] }[]> = {
  1: [
    { key: 'knock', weeks: [1, 1] },
    { key: 'bruised_ankle', weeks: [1, 2] },
    { key: 'tight_hamstring', weeks: [1, 2] },
    { key: 'calf_strain', weeks: [2, 3] },
  ],
  2: [
    { key: 'hamstring', weeks: [3, 6] },
    { key: 'groin', weeks: [3, 5] },
    { key: 'ankle_sprain', weeks: [3, 6] },
    { key: 'thigh_strain', weeks: [3, 5] },
    { key: 'concussion', weeks: [2, 4] },
  ],
  3: [
    { key: 'acl', weeks: [24, 36] },
    { key: 'metatarsal', weeks: [8, 12] },
    { key: 'achilles', weeks: [16, 26] },
    { key: 'shoulder', weeks: [6, 10] },
    { key: 'meniscus', weeks: [8, 14] },
  ],
};

export function injuryName(key: string): string {
  return t(`career.inj.${key}`);
}

export function severityForWeeks(weeks: number): 1 | 2 | 3 {
  return weeks <= 2 ? 1 : weeks <= 7 ? 2 : 3;
}

/** Deterministic injury of a given length (used by effects that specify weeks only). */
export function injuryForWeeks(weeks: number): Injury {
  const severity = severityForWeeks(weeks);
  const pool = INJURIES[severity];
  // pick the entry whose typical range best matches the length
  let best = pool[0];
  let bestDist = Infinity;
  for (const e of pool) {
    const mid = (e.weeks[0] + e.weeks[1]) / 2;
    const d = Math.abs(mid - weeks);
    if (d < bestDist) { best = e; bestDist = d; }
  }
  return { key: best.key, weeksLeft: weeks, severity };
}
