/**
 * A tiny text grammar for the procedural narrator.
 *
 *   fill('[Ve gol|GOL]! {player:gen} müthiş vuruşu!', { player: 'Deniz Yıldız' }, rng, 'tr')
 *     → 'GOL! Deniz Yıldız'ın müthiş vuruşu!'
 *
 *  - `[a|b|c]`  random alternative (nestable, `[a|]` = optional)
 *  - `{slot}`   slot value; modifiers chain with ':' →
 *       gen/dat/acc/loc/abl/ins/lik  Turkish case suffix with apostrophe (vowel harmony aware);
 *                                    in English `gen` gives the possessive, the rest are no-ops
 *       first / last                 first or last word (e.g. surname for commentary)
 *       up / cap / low               casing (Turkish-aware: i → İ)
 */
import type { Lang, Localized } from '../core/types';
import { Rng } from '../core/rng';

export type SlotValue = string | number | null | undefined;
export type Slots = Record<string, SlotValue>;
/** Variant bank: several interchangeable templates per language. */
export type Bank = Record<Lang, readonly string[]>;
export type Loc = Localized;

// ───────── seeding ─────────

/** FNV-1a 32-bit hash. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic generator derived from arbitrary inputs (same inputs → same prose). */
export function rngFrom(...parts: SlotValue[]): Rng {
  return new Rng(hashStr(parts.map((p) => (p === null || p === undefined ? '~' : String(p))).join('|')));
}

// ───────── casing ─────────

export const upper = (s: string, lang: Lang) => s.toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en-GB');
export const lower = (s: string, lang: Lang) => s.toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en-GB');
export function cap(s: string, lang: Lang): string {
  if (!s) return s;
  const i = s.search(/\S/);
  if (i < 0) return s;
  return s.slice(0, i) + upper(s[i], lang) + s.slice(i + 1);
}

// ───────── Turkish suffixes ─────────

export type TrCase = 'gen' | 'dat' | 'acc' | 'loc' | 'abl' | 'ins' | 'lik';

const ONES = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];

/** The last spoken word of a number, which is what the suffix harmonises with. */
function spokenTail(n: number): string {
  n = Math.abs(Math.floor(n));
  if (n === 0) return 'sıfır';
  if (n % 10 !== 0) return ONES[n % 10];
  if (n % 100 !== 0) return TENS[(n % 100) / 10];
  if (n % 1000 !== 0) return 'yüz';
  if (n % 1_000_000 !== 0) return 'bin';
  return 'milyon';
}

const VOWELS = 'aeıioöuü';
const BACK = 'aıou';
const ROUNDED = 'oöuü';
const HARD = 'fstkçşhp';

/** Suffix only (without apostrophe) for `word` in the given case. */
export function trSuffixOnly(word: string, kind: TrCase): string {
  let base = word.trim().replace(/[^\p{L}\p{N}]+$/u, '');
  const num = base.match(/(\d+)$/);
  if (num) base = spokenTail(parseInt(num[1], 10));
  base = base.toLocaleLowerCase('tr-TR')
    .replace(/[âà]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[îï]/g, 'i').replace(/[ôó]/g, 'o').replace(/[ûú]/g, 'u')
    .replace(/ã/g, 'a').replace(/õ/g, 'o').replace(/ñ/g, 'n').replace(/ß/g, 's').replace(/ä/g, 'e');
  let lastV = '';
  for (let i = base.length - 1; i >= 0; i--) {
    if (VOWELS.includes(base[i])) { lastV = base[i]; break; }
  }
  if (!lastV) lastV = 'e'; // acronyms are read letter by letter, mostly front vowels
  const last = base[base.length - 1] ?? 'e';
  const endsVowel = VOWELS.includes(last);
  const hard = HARD.includes(last);
  const back = BACK.includes(lastV);
  const round = ROUNDED.includes(lastV);
  const a2 = back ? 'a' : 'e';
  const i4 = back ? (round ? 'u' : 'ı') : round ? 'ü' : 'i';
  switch (kind) {
    case 'gen': return endsVowel ? `n${i4}n` : `${i4}n`;
    case 'dat': return endsVowel ? `y${a2}` : a2;
    case 'acc': return endsVowel ? `y${i4}` : i4;
    case 'loc': return `${hard ? 't' : 'd'}${a2}`;
    case 'abl': return `${hard ? 't' : 'd'}${a2}n`;
    case 'ins': return endsVowel ? `yl${a2}` : `l${a2}`;
    case 'lik': return `l${i4}k`;
  }
}

/** Proper-noun inflection: `Ankara` + dat → `Ankara'ya`. */
export function trSuffix(word: string, kind: TrCase): string {
  if (!word) return word;
  // Common nouns (fallback phrases such as 'hocan', 'annen') take the suffix without an apostrophe.
  const first = word.trim()[0] ?? '';
  const common = first !== first.toLocaleUpperCase('tr-TR') && first === first.toLocaleLowerCase('tr-TR');
  return `${word}${common ? '' : "'"}${trSuffixOnly(word, kind)}`;
}

export function enPossessive(word: string): string {
  if (!word) return word;
  return /s$/i.test(word) ? `${word}'` : `${word}'s`;
}

const TR_CASES = new Set<string>(['gen', 'dat', 'acc', 'loc', 'abl', 'ins', 'lik']);

export function inflect(value: string, mods: string[], lang: Lang): string {
  let v = value;
  for (const m of mods) {
    if (m === 'first') v = v.split(/\s+/)[0] ?? v;
    else if (m === 'last') { const parts = v.split(/\s+/); v = parts[parts.length - 1] ?? v; }
    else if (m === 'up') v = upper(v, lang);
    else if (m === 'low') v = lower(v, lang);
    else if (m === 'cap') v = cap(v, lang);
    else if (TR_CASES.has(m)) {
      if (lang === 'tr') v = trSuffix(v, m as TrCase);
      else if (m === 'gen') v = enPossessive(v);
    }
  }
  return v;
}

// ───────── templates ─────────

const ALT = /\[([^[\]]*)\]/;
const SLOT = /\{(\w+)((?::\w+)*)\}/g;

/** Expand alternatives and slots, then tidy whitespace/punctuation. */
export function fill(tpl: string, slots: Slots, rng: Rng, lang: Lang): string {
  let s = tpl;
  let guard = 0;
  while (ALT.test(s) && guard++ < 200) {
    s = s.replace(ALT, (_m, body: string) => rng.pick(body.split('|')));
  }
  s = s.replace(SLOT, (_m, key: string, modStr: string) => {
    const raw = slots[key];
    if (raw === null || raw === undefined || raw === '') return '';
    const mods = modStr ? modStr.split(':').filter(Boolean) : [];
    return inflect(String(raw), mods, lang);
  });
  return tidy(s);
}

export function tidy(s: string): string {
  return s
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.!?;:…])/g, '$1')
    .replace(/\( +/g, '(')
    .replace(/ +\)/g, ')')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n /g, '\n');
}

/** Pick one template from a bank in `lang` and fill it. */
export function say(bank: Bank, lang: Lang, slots: Slots, rng: Rng): string {
  const list = bank[lang].length ? bank[lang] : bank.en;
  return fill(rng.pick(list), slots, rng, lang);
}

/** Fill a localized single template. */
export function sayL(loc: Loc, lang: Lang, slots: Slots, rng: Rng): string {
  return fill(loc[lang] || loc.en, slots, rng, lang);
}

/** Pick `n` distinct items. */
export function pickN<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  rng.shuffle(copy);
  return copy.slice(0, Math.max(0, Math.min(n, copy.length)));
}

/** Join sentences, capitalising each. */
export function paragraph(sentences: string[], lang: Lang): string {
  return sentences.filter((x) => x && x.trim()).map((x) => cap(x.trim(), lang)).join(' ');
}

// ───────── structured facts ("k=v | k=v") ─────────

/** Encode facts as `key=value | key=value` — readable by humans, Claude and the template narrator. */
export function encodeFacts(obj: Record<string, SlotValue | boolean>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${String(v).replace(/[|=]/g, '/')}`)
    .join(' | ');
}

export function parseFacts(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s || !s.includes('=')) return out;
  for (const part of s.split('|')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

export const num = (v: string | undefined, d = 0): number => {
  const n = v === undefined ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

// ───────── slot-aware picking ─────────

export function usedSlots(tpl: string): string[] {
  return [...tpl.matchAll(/\{(\w+)/g)].map((m) => m[1]);
}

/** Pick a template whose slots are all filled, so lines never read with holes in them. */
export function pickFilled(list: readonly string[], slots: Slots, rng: Rng, soft: ReadonlySet<string> = new Set()): string {
  const has = (k: string) => soft.has(k) || (slots[k] !== undefined && slots[k] !== null && slots[k] !== '');
  const ok = list.filter((tpl) => usedSlots(tpl).every(has));
  return rng.pick(ok.length ? ok : list);
}

/** `say` that avoids templates with unfilled slots. */
export function sayF(bank: Bank, lang: Lang, slots: Slots, rng: Rng, soft?: ReadonlySet<string>): string {
  const list = bank[lang].length ? bank[lang] : bank.en;
  return fill(pickFilled(list, slots, rng, soft), slots, rng, lang);
}

/** Turkish-safe token check used by keyword heuristics. */
export const normText = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/[’`]/g, "'");
