import type { Lang, Localized } from './types';

/**
 * Tiny i18n registry. Each module registers its own namespace so no single giant
 * dictionary file becomes a merge hotspot:
 *
 *   registerStrings('hub', { tr: { title: 'Kariyer Merkezi' }, en: { title: 'Career Hub' } });
 *   t('hub.title')                       → 'Kariyer Merkezi'
 *   t('hub.goals', { n: 3 })             → '{n} gol' with {n} replaced
 *
 * Turkish is the primary language; English must be provided for every key.
 */
type Dict = Record<string, string>;

const dicts: Record<Lang, Dict> = { tr: {}, en: {} };
let current: Lang = 'tr';
const listeners = new Set<(l: Lang) => void>();

export function registerStrings(ns: string, strings: Record<Lang, Dict>): void {
  for (const lang of ['tr', 'en'] as Lang[]) {
    const src = strings[lang] ?? {};
    for (const k of Object.keys(src)) dicts[lang][`${ns}.${k}`] = src[k];
  }
}

export function hasKey(key: string): boolean {
  return key in dicts[current] || key in dicts.en;
}

export function t(key: string, params?: Record<string, string | number>, lang: Lang = current): string {
  let s = dicts[lang][key] ?? dicts.en[key] ?? dicts.tr[key] ?? key;
  if (params) {
    for (const p of Object.keys(params)) s = s.split(`{${p}}`).join(String(params[p]));
  }
  return s;
}

/** Pick the current-language string from a Localized record. */
export function tl(v: Localized | string): string {
  return typeof v === 'string' ? v : v[current] ?? v.en;
}

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  listeners.forEach((fn) => fn(l));
}

export function onLangChange(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** For tests: list keys missing in one language. */
export function missingKeys(): { tr: string[]; en: string[] } {
  const all = new Set([...Object.keys(dicts.tr), ...Object.keys(dicts.en)]);
  return {
    tr: [...all].filter((k) => !(k in dicts.tr)),
    en: [...all].filter((k) => !(k in dicts.en)),
  };
}
