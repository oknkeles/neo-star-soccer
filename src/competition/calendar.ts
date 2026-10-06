/**
 * Season calendar: 52 weeks, week 0 = the first Saturday of August of the season year.
 *
 *   0          pre-season (summer window still open, weeks 0..3)
 *   1..44      club season; league on weekends, cups / Champions Cup on midweeks
 *   5,10,15,30,35  international breaks (no club football)
 *   21..25     winter window
 *   45..51     summer break + window; tournament weeks 45..50 in tournament summers
 */
import type { WeekInfo } from '../core/types';
import { t } from '../core/i18n';
import './strings';

export const WEEKS_PER_SEASON = 52;
export const LAST_CLUB_WEEK = 44;

export const INTL_BREAK_WEEKS: readonly number[] = [5, 10, 15, 30, 35];
/** Midweeks reserved for domestic cup rounds (the final is always week 42). */
export const CUP_WEEKS: readonly number[] = [8, 14, 20, 27, 33, 42];

/** Cup round weeks for a cup of `rounds` rounds: early rounds in autumn, semis in spring, final in May. */
export function cupRoundWeeks(rounds: number): number[] {
  const table: Record<number, number[]> = {
    1: [42], 2: [33, 42], 3: [27, 33, 42], 4: [14, 27, 33, 42], 5: [8, 14, 27, 33, 42], 6: [8, 14, 20, 27, 33, 42],
  };
  if (table[rounds]) return table[rounds];
  const extra: number[] = [];
  for (let i = rounds - 6; i > 0; i--) extra.push(Math.max(1, 8 - i * 3));
  return [...extra, ...table[6]];
}
/** Champions Cup group matchdays (midweek). */
export const CC_GROUP_WEEKS: readonly number[] = [3, 7, 12, 17, 23, 26];
/** Champions Cup knockout rounds (midweek, single leg): R16, QF, SF, Final (neutral). */
export const CC_KO_WEEKS: readonly number[] = [32, 36, 39, 43];
/** Summer tournament group matchdays. Each knockout round needs its own week (rounds are drawn when the previous one ends). */
export const TOURNAMENT_GROUP_SLOTS: readonly { week: number; slot: 'weekend' | 'midweek' }[] = [
  { week: 45, slot: 'weekend' },
  { week: 46, slot: 'midweek' },
  { week: 46, slot: 'weekend' },
];
export const TOURNAMENT_KO_WEEKS: readonly number[] = [47, 48, 49, 50];
export const TOURNAMENT_FIRST_WEEK = 45;
export const TOURNAMENT_LAST_WEEK = 50;

/** Which summer tournament (if any) is played at the end of `season` (World Cup 2030, 2034…; Continental Cup 2028, 2032…). */
export function tournamentOf(season: number): 'WC' | 'CONT' | null {
  const year = season + 1;
  if (year % 4 === 2) return 'WC';
  if (year % 4 === 0) return 'CONT';
  return null;
}

export function isInternationalBreak(week: number): boolean {
  return INTL_BREAK_WEEKS.includes(week);
}

export function isTransferWindow(week: number): boolean {
  return (week >= 0 && week <= 3) || (week >= 21 && week <= 25) || (week >= 45 && week <= 51);
}

/** UTC date of the first Saturday of August. */
export function firstSaturdayOfAugust(year: number): Date {
  const d = new Date(Date.UTC(year, 7, 1));
  const shift = (6 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(1 + shift);
  return d;
}

export function weekDate(season: number, week: number): string {
  const d = firstSaturdayOfAugust(season);
  d.setUTCDate(d.getUTCDate() + week * 7);
  return d.toISOString().slice(0, 10);
}

export function weekInfo(season: number, week: number): WeekInfo {
  const phase: WeekInfo['phase'] = week <= 0 ? 'preseason' : week <= LAST_CLUB_WEEK ? 'season' : 'summer';
  const tourney = tournamentOf(season);
  const label = (lang: 'tr' | 'en') => {
    if (phase === 'preseason') return t('comp.preseason', undefined, lang);
    if (phase === 'summer') return t('comp.summer', undefined, lang);
    return t('comp.week', { n: week }, lang);
  };
  return {
    season,
    week,
    date: weekDate(season, week),
    label: { tr: label('tr'), en: label('en') },
    phase,
    transferWindow: isTransferWindow(week),
    internationalBreak: isInternationalBreak(week),
    tournament: tourney !== null && week >= TOURNAMENT_FIRST_WEEK && week <= TOURNAMENT_LAST_WEEK,
  };
}
