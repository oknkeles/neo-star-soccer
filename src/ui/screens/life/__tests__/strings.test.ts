/** i18n coverage: every `life.*` / `common.*`-style key used by the screens exists in both languages. */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getLang, hasKey, missingKeys, t } from '../../../../core/i18n';
import '../strings';

const SCREENS_DIR = join(__dirname, '..', '..');
const LIFE_DIR = join(__dirname, '..');
const SCREEN_FILES = ['Training', 'Lifestyle', 'People', 'Transfers', 'Competitions', 'News', 'Social', 'Career', 'Club', 'Legacy'].map((n) => join(SCREENS_DIR, `${n}Screen.tsx`));

function sources(): { file: string; text: string }[] {
  const files = [...SCREEN_FILES];
  for (const f of readdirSync(LIFE_DIR)) {
    const p = join(LIFE_DIR, f);
    if (statSync(p).isFile() && /\.(ts|tsx)$/.test(f)) files.push(p);
  }
  return files.map((file) => ({ file, text: readFileSync(file, 'utf8') }));
}

const LITERAL = /\bt\(\s*'(life\.[A-Za-z0-9_.]+)'/g;
const TEMPLATE = /\bt\(\s*`(life\.[A-Za-z0-9_.]*)\$\{/g;

describe('life strings', () => {
  it('registers the same keys in Turkish and English', () => {
    const missing = missingKeys();
    expect(missing.tr.filter((k) => k.startsWith('life.'))).toEqual([]);
    expect(missing.en.filter((k) => k.startsWith('life.'))).toEqual([]);
  });

  it('defines every literal key the screens use', () => {
    const lost: string[] = [];
    for (const { file, text } of sources()) {
      for (const m of text.matchAll(LITERAL)) if (!hasKey(m[1])) lost.push(`${file.split('/').slice(-2).join('/')} → ${m[1]}`);
    }
    expect(lost).toEqual([]);
  });

  it('has at least one key behind every dynamic key prefix', () => {
    const all = new Set<string>();
    for (const { text } of sources()) for (const m of text.matchAll(TEMPLATE)) all.add(m[1]);
    const keys = collectLifeKeys();
    expect([...all].filter((prefix) => !keys.some((k) => k.startsWith(prefix)))).toEqual([]);
  });

  it('keeps values non-empty and parameters aligned between languages', () => {
    const lang = getLang();
    expect(['tr', 'en']).toContain(lang);
    const keys = collectLifeKeys();
    expect(keys.length).toBeGreaterThan(300);
    const bad: string[] = [];
    for (const k of keys) {
      const tr = t(k, undefined, 'tr');
      const en = t(k, undefined, 'en');
      if (!tr.trim() || !en.trim()) bad.push(`${k} (empty)`);
      const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
      if (params(tr) !== params(en)) bad.push(`${k} (params ${params(tr)} vs ${params(en)})`);
    }
    expect(bad).toEqual([]);
  });
});

// The registry is private; rebuild the key list from the string pack files instead.
function collectLifeKeys(): string[] {
  const dir = join(LIFE_DIR, 'strings');
  const keys = new Set<string>();
  for (const f of readdirSync(dir)) {
    const text = readFileSync(join(dir, f), 'utf8');
    for (const m of text.matchAll(/^\s*(?:'([A-Za-z0-9_.]+)'|"([A-Za-z0-9_.]+)")\s*:/gm)) keys.add(`life.${m[1] ?? m[2]}`);
    for (const m of text.matchAll(/[,{]\s*'([A-Za-z0-9_.]+)'\s*:/g)) keys.add(`life.${m[1]}`);
  }
  return [...keys].filter((k) => hasKey(k));
}
