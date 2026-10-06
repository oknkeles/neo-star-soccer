import type { Competition, TableRow } from '../core/types';
import { emptyRow } from './helpers';

export function compareRows(a: TableRow, b: TableRow): number {
  return (
    b.points - a.points ||
    (b.gf - b.ga) - (a.gf - a.ga) ||
    b.gf - a.gf ||
    b.won - a.won ||
    a.teamId.localeCompare(b.teamId)
  );
}

/** Sorted copy of a table (points, goal difference, goals for, wins, id). */
export function sortedTable(comp: Competition, group?: string): TableRow[] {
  const key = group ?? (comp.tables.main ? 'main' : Object.keys(comp.tables)[0]);
  const rows = key ? comp.tables[key] : undefined;
  return rows ? rows.slice().sort(compareRows) : [];
}

/** Table key ('main' or group letter) holding both teams, if any. */
export function tableKeyFor(comp: Competition, homeId: string, awayId: string): string | null {
  for (const key of Object.keys(comp.tables)) {
    const rows = comp.tables[key];
    if (rows.some((r) => r.teamId === homeId) && rows.some((r) => r.teamId === awayId)) return key;
  }
  return null;
}

function rowOf(rows: TableRow[], teamId: string): TableRow {
  let row = rows.find((r) => r.teamId === teamId);
  if (!row) {
    row = emptyRow(teamId);
    rows.push(row);
  }
  return row;
}

export function recordTableResult(rows: TableRow[], homeId: string, awayId: string, hg: number, ag: number): void {
  const h = rowOf(rows, homeId);
  const a = rowOf(rows, awayId);
  h.played++; a.played++;
  h.gf += hg; h.ga += ag;
  a.gf += ag; a.ga += hg;
  const push = (r: TableRow, res: 'W' | 'D' | 'L') => {
    r.form.push(res);
    if (r.form.length > 5) r.form.splice(0, r.form.length - 5);
  };
  if (hg > ag) { h.won++; a.lost++; h.points += 3; push(h, 'W'); push(a, 'L'); }
  else if (hg < ag) { a.won++; h.lost++; a.points += 3; push(h, 'L'); push(a, 'W'); }
  else { h.drawn++; a.drawn++; h.points++; a.points++; push(h, 'D'); push(a, 'D'); }
}
