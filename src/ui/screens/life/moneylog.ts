/**
 * Tiny per-save balance log kept in this browser (the game state stores no money history).
 * Only used for the finance sparkline; every storage access is guarded.
 */
export interface MoneyPoint { k: number; v: number }

const key = (saveId: string) => `nss.life.money.${saveId}`;

/** Insert/replace a point (k = season*100 + week), keep sorted and capped. */
export function mergePoint(list: MoneyPoint[], p: MoneyPoint, cap = 150): MoneyPoint[] {
  const next = list.filter((x) => x.k !== p.k);
  next.push(p);
  next.sort((a, b) => a.k - b.k);
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export function loadMoney(saveId: string): MoneyPoint[] {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(key(saveId));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as MoneyPoint[]).filter((x) => Number.isFinite(x?.k) && Number.isFinite(x?.v)) : [];
  } catch {
    return [];
  }
}

export function recordMoney(saveId: string, p: MoneyPoint): MoneyPoint[] {
  const next = mergePoint(loadMoney(saveId), p);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key(saveId), JSON.stringify(next));
  } catch { /* storage unavailable: the chart just shows the projection */ }
  return next;
}

/** Straight-line projection of `weeks` future balances from the weekly net. */
export function projectMoney(balance: number, weeklyNet: number, weeks = 12): number[] {
  return Array.from({ length: weeks + 1 }, (_, i) => balance + weeklyNet * i);
}
