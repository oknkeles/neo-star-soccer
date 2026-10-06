import type { NationCode } from '../core/types';
import { NATIONS_DATA } from './data/nations';
import type { NationDef } from './types';

/** ~48 football nations (data lives in data/nations.ts). */
export const NATIONS: NationDef[] = NATIONS_DATA;

let index: Map<NationCode, NationDef> | null = null;
let indexedLength = -1;
const synthetic = new Map<NationCode, NationDef>();

function nationIndex(): Map<NationCode, NationDef> {
  if (!index || indexedLength !== NATIONS.length) {
    index = new Map(NATIONS.map((n) => [n.code, n]));
    indexedLength = NATIONS.length;
  }
  return index;
}

export function findNation(code: NationCode): NationDef | undefined {
  return nationIndex().get(code);
}

/** Lookup that never throws: unknown codes get a neutral placeholder nation so callers keep working. */
export function getNation(code: NationCode): NationDef {
  const found = nationIndex().get(code);
  if (found) return found;
  let s = synthetic.get(code);
  if (!s) {
    s = {
      code, name: { tr: code, en: code }, flag: '🏳️', continent: 'EU', reputation: 50,
      kit: { primary: '#2a64c8', secondary: '#f7f7f4', style: 'plain' }, cities: [],
    };
    synthetic.set(code, s);
  }
  return s;
}
