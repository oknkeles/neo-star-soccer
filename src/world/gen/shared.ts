import type { Position, StatLine } from '../../core/types';

export const emptyLine = (): StatLine => ({
  apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, ratingSum: 0, motm: 0, yellow: 0, red: 0, cleanSheets: 0,
});

export const POSITIONS: Position[] = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'];

/** Strip diacritics and non-letters, uppercase: 'İzmir' → 'IZMIR'. */
export function asciiUpper(s: string): string {
  return s
    .replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/ß/g, 'ss').replace(/ø/g, 'o').replace(/Ø/g, 'O')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
}

/** Round money to a "nice" figure: 3 significant digits, never below 5K steps. */
export function niceMoney(v: number): number {
  if (v >= 100_000_000) return Math.round(v / 5_000_000) * 5_000_000;
  if (v >= 10_000_000) return Math.round(v / 1_000_000) * 1_000_000;
  if (v >= 1_000_000) return Math.round(v / 100_000) * 100_000;
  if (v >= 100_000) return Math.round(v / 10_000) * 10_000;
  return Math.max(5_000, Math.round(v / 5_000) * 5_000);
}
