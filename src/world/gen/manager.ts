import type { Manager, ManagerTemperament, NationCode, TacticalStyle } from '../../core/types';
import type { Rng } from '../../core/rng';
import { clamp } from '../../core/util';
import { randomName } from './names';

const STYLES: { s: TacticalStyle; w: number }[] = [
  { s: 'balanced', w: 22 }, { s: 'possession', w: 18 }, { s: 'counter', w: 18 }, { s: 'pressing', w: 16 },
  { s: 'defensive', w: 14 }, { s: 'direct', w: 12 },
];
const TEMPERAMENTS: { t: ManagerTemperament; w: number; youth: number }[] = [
  { t: 'calm', w: 28, youth: 2 }, { t: 'fiery', w: 18, youth: -4 }, { t: 'demanding', w: 20, youth: -12 },
  { t: 'mentor', w: 14, youth: 20 }, { t: 'pragmatic', w: 20, youth: -8 },
];

export interface ManagerGenOptions {
  /** Preferred tactical philosophy (e.g. the club's style). */
  style?: TacticalStyle;
  /** Anchor for `trustsYouth` (e.g. derived from the club's academy). */
  youthHint?: number;
  clubId?: string | null;
}

export function generateManager(
  rng: Rng, id: string, nation: NationCode, season: number, reputation: number, opts: ManagerGenOptions = {},
): Manager {
  const name = randomName(rng, nation);
  const rep = clamp(Math.round(reputation), 1, 100);
  const temper = rng.weighted(TEMPERAMENTS, (x) => x.w);
  const style = opts.style && rng.chance(0.88) ? opts.style : rng.weighted(STYLES, (x) => x.w).s;
  const age = clamp(Math.round(rng.normal(50 + (rep - 50) / 12, 7.5)), 34, 73);
  const trusts = clamp(Math.round((opts.youthHint ?? 50) * 0.5 + 25 + temper.youth + rng.normal(0, 13)), 4, 97);
  return {
    id, firstName: name.first, lastName: name.last, nation, birthYear: season - age, style,
    temperament: temper.t, trustsYouth: trusts, reputation: rep, clubId: opts.clubId ?? null,
  };
}
