import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { missingKeys, t } from '../../core/i18n';
import { updateSettings } from '../../core/settings';
import { aiFeatureLabel, aiStatus, getNarrator, onAIStatus, resumeAI, testConnection } from '../api';
import { getClient } from '../transport';
import { hashString, pickSpice, SYSTEM_PROMPT } from '../prompts';

afterEach(() => {
  vi.restoreAllMocks();
  resumeAI();
  updateSettings((s) => { s.ai.enabled = false; s.ai.apiKey = ''; s.ai.model = 'claude-opus-5-5'; });
});

describe('public api', () => {
  it('returns a stable narrator whose kind follows settings', () => {
    const n = getNarrator();
    expect(getNarrator()).toBe(n);
    expect(n.kind).toBe('template');
    updateSettings((s) => { s.ai.enabled = true; });
    expect(n.kind).toBe('claude');
  });

  it('testConnection without a key fails fast with a localized message', async () => {
    const r = await testConnection();
    expect(r).toEqual({ ok: false, message: t('ai.test.noKey') });
  });

  it('testConnection reports success with the model label', async () => {
    const key = 'sk-ant-api-test-ok-000';
    updateSettings((s) => { s.ai.apiKey = key; s.ai.model = 'claude-sonnet-5-5'; });
    vi.spyOn(getClient(key).messages, 'create').mockResolvedValue({ stop_reason: 'end_turn', content: [] } as never);
    const r = await testConnection();
    expect(r.ok).toBe(true);
    expect(r.message).toContain('Claude Sonnet 5.5');
    expect(aiStatus()).toMatchObject({ pending: 0, lastError: null, cooldownUntil: null });
  });

  it('testConnection explains an invalid key and pauses Claude until resumed', async () => {
    const key = 'sk-ant-api-test-bad-000';
    updateSettings((s) => { s.ai.apiKey = key; });
    vi.spyOn(getClient(key).messages, 'create').mockRejectedValue(new Anthropic.AuthenticationError(401, undefined, 'invalid x-api-key', new Headers()));
    const r = await testConnection();
    expect(r).toEqual({ ok: false, message: t('ai.test.fail', { error: t('ai.err.auth') }) });
    expect(aiStatus().lastError).toBe(t('ai.err.auth'));
    expect(aiStatus().cooldownUntil).toBeGreaterThan(Date.now());
    resumeAI();
    expect(aiStatus().cooldownUntil).toBeNull();
  });

  it('exposes status snapshots and unsubscribable listeners', () => {
    const s = aiStatus();
    expect(s).toMatchObject({ pending: 0 });
    let hits = 0;
    const off = onAIStatus(() => { hits++; });
    off();
    expect(hits).toBe(0);
    expect(aiStatus()).not.toBe(aiStatus());
  });

  it('labels every feature in both languages', () => {
    expect(aiFeatureLabel('negotiation').label).toBeTruthy();
    const missing = missingKeys();
    expect(missing.tr.filter((k) => k.startsWith('ai.'))).toEqual([]);
    expect(missing.en.filter((k) => k.startsWith('ai.'))).toEqual([]);
  });
});

describe('prompts', () => {
  it('system prompt pins the fictional-world and language rules', () => {
    expect(SYSTEM_PROMPT).toMatch(/fictional/);
    expect(SYSTEM_PROMPT).toMatch(/Turkish/);
    expect(SYSTEM_PROMPT).toMatch(/PG-13/);
  });

  it('variety spice is deterministic and rotates with the salt', () => {
    const list = ['a', 'b', 'c'];
    expect(pickSpice(list, 'key', 0)).toBe(pickSpice(list, 'key', 0));
    expect(new Set([0, 1, 2].map((s) => pickSpice(list, 'key', s))).size).toBe(3);
    expect(hashString('x')).not.toBe(hashString('y'));
  });
});
