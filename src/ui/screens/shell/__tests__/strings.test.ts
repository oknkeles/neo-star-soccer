/** i18n coverage: every `shell.*` key the shell UI uses exists in both languages, with aligned parameters. */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hasKey, missingKeys, t } from '../../../../core/i18n';
import '../strings';

const SHELL_DIR = join(__dirname, '..');
const UI_DIR = join(__dirname, '..', '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    if (f === '__tests__') continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

function sources(): { file: string; text: string }[] {
  const own = [
    join(UI_DIR, 'Layout.tsx'), join(UI_DIR, 'GlobalOverlays.tsx'), join(UI_DIR, 'components', 'Avatar.tsx'),
    ...['Title', 'NewCareer', 'Hub', 'Settings', 'Inbox', 'Press'].map((n) => join(UI_DIR, 'screens', `${n}Screen.tsx`)),
    ...walk(SHELL_DIR),
  ];
  return own.map((file) => ({ file, text: readFileSync(file, 'utf8') }));
}

const LITERAL = /\bt\(\s*'(shell\.[A-Za-z0-9_.]+)'/g;
const TEMPLATE = /\bt\(\s*`(shell\.[A-Za-z0-9_.]*)\$\{/g;

function shellKeys(): string[] {
  const text = readFileSync(join(SHELL_DIR, 'strings.ts'), 'utf8');
  return [...new Set([...text.matchAll(/'([A-Za-z0-9_.]+)':\s*['"`]/g)].map((m) => `shell.${m[1]}`))];
}

describe('shell strings', () => {
  it('registers the same keys in Turkish and English', () => {
    const missing = missingKeys();
    expect(missing.tr.filter((k) => k.startsWith('shell.'))).toEqual([]);
    expect(missing.en.filter((k) => k.startsWith('shell.'))).toEqual([]);
  });

  it('defines every literal key the UI uses', () => {
    const lost: string[] = [];
    for (const { file, text } of sources()) {
      for (const m of text.matchAll(LITERAL)) if (!hasKey(m[1])) lost.push(`${file.split('/').slice(-2).join('/')} → ${m[1]}`);
    }
    expect(lost).toEqual([]);
  });

  it('has keys behind every dynamic key prefix', () => {
    const prefixes = new Set<string>();
    for (const { text } of sources()) for (const m of text.matchAll(TEMPLATE)) prefixes.add(m[1]);
    const keys = shellKeys();
    expect([...prefixes].filter((p) => !keys.some((k) => k.startsWith(p)))).toEqual([]);
  });

  it('covers every enum the UI indexes dynamically', () => {
    const enums: Record<string, string[]> = {
      'shell.pos.': ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'],
      'shell.posShort.': ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'W', 'ST'],
      'shell.weather.': ['clear', 'cloudy', 'rain', 'snow', 'fog'],
      'shell.offerKind.': ['transfer', 'loan', 'free', 'renewal', 'trial'],
      'shell.inbox.kind.': ['offer', 'event', 'info', 'sponsor', 'callup', 'award', 'contract', 'manager', 'press', 'injury', 'story'],
      'shell.inbox.f.': ['all', 'offers', 'events', 'sponsors', 'press', 'other'],
      'shell.inbox.offerStatus.': ['pending', 'negotiating', 'accepted', 'rejected', 'expired', 'withdrawn', 'blocked'],
      'shell.press.occ.': ['pre_match', 'post_match', 'transfer', 'scandal', 'milestone', 'unveiling'],
      'shell.role.': ['father', 'mother', 'sibling', 'partner', 'friend', 'agent', 'journalist', 'director'],
    };
    const lost: string[] = [];
    for (const [prefix, ids] of Object.entries(enums)) for (const id of ids) if (!hasKey(prefix + id)) lost.push(prefix + id);
    expect(lost).toEqual([]);
  });

  it('keeps values non-empty and parameters aligned between languages', () => {
    const keys = shellKeys();
    expect(keys.length).toBeGreaterThan(250);
    const bad: string[] = [];
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const k of keys) {
      const tr = t(k, undefined, 'tr');
      const en = t(k, undefined, 'en');
      if (!tr.trim() || !en.trim()) bad.push(`${k} (empty)`);
      if (tr === k || en === k) bad.push(`${k} (unresolved)`);
      if (params(tr) !== params(en)) bad.push(`${k} (params ${params(tr)} vs ${params(en)})`);
    }
    expect(bad).toEqual([]);
  });

  it('writes Turkish with its own letters and English without them', () => {
    const keys = shellKeys();
    const tr = keys.map((k) => t(k, undefined, 'tr')).join(' ');
    const en = keys.map((k) => t(k, undefined, 'en')).join(' ');
    expect(tr).toMatch(/[çğıöşüİ]/);
    expect(en).not.toMatch(/[çğışİ]/);
  });
});
