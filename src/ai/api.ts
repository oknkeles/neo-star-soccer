/**
 * AI module — Claude-powered narrator. Implements the Narrator contract by calling the
 * Claude Messages API from the browser with the user's own API key (official SDK,
 * dangerouslyAllowBrowser), structured JSON outputs validated with zod, strict timeouts,
 * a small request queue, a circuit breaker that pauses Claude after hard failures, and
 * graceful fallback to narrative/templateNarrator on any failure, refusal, or when the
 * feature is disabled. Owner: ai agent.
 */
import type { Narrator } from '../core/narrative-types';
import type { AIFeature } from '../core/types';
import { getSettings, onSettingsChange } from '../core/settings';
import { t } from '../core/i18n';
import { describeAIError, toAIError } from './errors';
import {
  createClaudeNarrator, DEFAULT_MAX_CONCURRENT, DEFAULT_TIMEOUT_MS, settingsConfigKey,
  type AITuning, type ClaudeNarrator, type ClaudeTransport,
} from './narrator';
import { Breaker, Limiter, StatusTracker, withTimeout, type AIStatus } from './runtime';
import './strings';

export type { AIStatus } from './runtime';
export { createClaudeNarrator, DEFAULT_TIMEOUT_MS, DEFAULT_MAX_CONCURRENT, DEFAULT_MAX_QUEUE_WAIT_MS } from './narrator';
export type {
  AITuning, ClaudeNarrator, ClaudeNarratorOptions, ClaudeRequest, ClaudeResponse, ClaudeTransport,
} from './narrator';
export { AIError, describeAIError, type AIErrorKind } from './errors';
export { clampEffects, clampTerms, negotiationMandate, EFFECT_LIMITS, type Mandate } from './clamp';
export { SYSTEM_PROMPT } from './prompts';

// Shared runtime: every Claude request in the app goes through one queue, one breaker and one status.
const status = new StatusTracker();
const limiter = new Limiter(DEFAULT_MAX_CONCURRENT);
const breaker = new Breaker();
let timeoutMs = DEFAULT_TIMEOUT_MS;

// A new key or model lifts any pause right away (the breaker would also notice lazily).
onSettingsChange(() => {
  if (!breaker.isOpen(settingsConfigKey())) status.setCooldown(null);
});

/** Lazily loads the SDK (code-split) on the first real request. */
const lazySdkTransport: ClaudeTransport = async (req) => (await import('./transport')).sdkTransport(req);

let narrator: ClaudeNarrator | null = null;

function defaultNarrator(): ClaudeNarrator {
  narrator ??= createClaudeNarrator({
    call: lazySdkTransport,
    kind: () => (getSettings().ai.enabled ? 'claude' : 'template'),
    status,
    limiter,
    breaker,
    timeoutMs,
  });
  return narrator;
}

/**
 * The narrator the game should use right now. For each method: if `aiEnabled(feature)`
 * use Claude, else (or on error/timeout) the template narrator. Never rejects.
 *
 * The returned object is a stable singleton whose `kind` follows `settings.ai.enabled`
 * live, so it is safe to cache; feature toggles are also checked on every call.
 */
export function getNarrator(): Narrator {
  return defaultNarrator();
}

/**
 * Ping the API with the current settings (used by the Settings screen). An explicit test
 * also lifts any pause left by an earlier failure; a failed test pauses Claude again.
 */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  if (!getSettings().ai.apiKey.trim()) return { ok: false, message: t('ai.test.noKey') };
  breaker.reset();
  status.setCooldown(null);
  status.enqueue(null);
  let error: string | null = null;
  try {
    const { pingClaude, modelLabel } = await import('./transport');
    const ms = Math.min(timeoutMs, 20_000);
    const model = await limiter.run(() => {
      status.start();
      return withTimeout((signal) => pingClaude(ms, signal), ms);
    });
    return { ok: true, message: t('ai.test.ok', { model: modelLabel(model) }) };
  } catch (e) {
    const err = toAIError(e);
    status.setCooldown(breaker.trip(err.kind, settingsConfigKey()));
    error = describeAIError(err);
    return { ok: false, message: t('ai.test.fail', { error }) };
  } finally {
    status.settle(error);
  }
}

export function aiStatus(): AIStatus {
  return status.get();
}

/** Subscribe to status changes (not called immediately; read aiStatus() for the initial value). */
export function onAIStatus(fn: (s: AIStatus) => void): () => void {
  return status.subscribe(fn);
}

/** Runtime tuning: per-request timeout, max queue wait (ms) and max concurrent requests. */
export function configureAI(o: AITuning): void {
  if (o.timeoutMs !== undefined && o.timeoutMs > 0) timeoutMs = o.timeoutMs;
  if (o.maxConcurrent !== undefined && o.maxConcurrent >= 1) limiter.max = o.maxConcurrent;
  defaultNarrator().configure(o);
}

/** Lift a pause left by an earlier failure (e.g. after the player fixed their key). */
export function resumeAI(): void {
  breaker.reset();
  status.setCooldown(null);
}

/** Localized label for a feature toggle (Settings screen). */
export function aiFeatureLabel(feature: AIFeature): { label: string; description: string } {
  return { label: t(`ai.feature.${feature}`), description: t(`ai.feature.${feature}.desc`) };
}
