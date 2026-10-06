/**
 * Claude Messages API transport (official SDK, browser mode). Loaded lazily from api.ts so
 * players without an API key never download the SDK.
 *
 * - Opus 5.5 / Sonnet 5.5: beta Messages API with server-side refusal fallback
 *   (`fallbacks: 'default'`, beta `server-side-fallback-2026-07-01`) and effort 'low'.
 *   Thinking stays at its adaptive default (it cannot be disabled on Opus 5.5).
 * - Haiku 4.5: standard Messages API, no effort parameter.
 * Both use structured outputs via zod and `messages.parse` → `parsed_output`.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { AI_MODELS, getSettings } from '../core/settings';
import { AIError } from './errors';
import type { ClaudeRequest, ClaudeResponse } from './narrator';

export type ModelId = (typeof AI_MODELS)[number]['id'];
export const DEFAULT_MODEL: ModelId = 'claude-opus-5-5';
export const SERVER_FALLBACK_BETA = 'server-side-fallback-2026-07-01';
/**
 * Opus 5.5 always thinks (adaptive, kept short by effort 'low') and those tokens count
 * against max_tokens, so frontier models get a little headroom on top of the task budget.
 */
export const THINKING_HEADROOM = 512;

export function resolveModel(id: string | undefined): ModelId {
  return (AI_MODELS.find((m) => m.id === id)?.id ?? DEFAULT_MODEL) as ModelId;
}

/** Opus 5.5 and Sonnet 5.5 take `effort` and support the server-side refusal fallback; Haiku 4.5 takes neither. */
export const isFrontierModel = (m: ModelId) => m === 'claude-opus-5-5' || m === 'claude-sonnet-5-5';

export function modelLabel(id: string): string {
  return AI_MODELS.find((m) => m.id === id)?.label ?? id;
}

let client: Anthropic | null = null;
let clientKey = '';

/** One client per API key; recreated when the key changes. */
export function getClient(apiKey: string): Anthropic {
  if (!client || clientKey !== apiKey) {
    client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
    clientKey = apiKey;
  }
  return client;
}

/** Map typed SDK errors (most specific first) onto transport-neutral AIErrors. */
export function classifySdkError(err: unknown, aborted = false): AIError {
  if (err instanceof AIError) return err;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new AIError('timeout');
  if (err instanceof Anthropic.APIUserAbortError) return new AIError('timeout', aborted ? undefined : err.message);
  if (err instanceof Anthropic.AuthenticationError) return new AIError('auth', err.message, 401);
  if (err instanceof Anthropic.PermissionDeniedError) return new AIError('permission', err.message, 403);
  if (err instanceof Anthropic.NotFoundError) return new AIError('not_found', err.message, 404);
  if (err instanceof Anthropic.RateLimitError) return new AIError('rate_limit', err.message, 429);
  if (err instanceof Anthropic.APIConnectionError) return new AIError('connection', err.message);
  if (err instanceof Anthropic.APIError) {
    if (err.type === 'billing_error') return new AIError('billing', err.message, err.status);
    if (err.type === 'overloaded_error' || err.status === 529) return new AIError('overloaded', err.message, err.status);
    if (err instanceof Anthropic.BadRequestError) return new AIError('bad_request', err.message, 400);
    return new AIError('server', err.message, err.status);
  }
  // Non-HTTP SDK error: in practice a structured output that failed to parse.
  if (err instanceof Anthropic.AnthropicError) return new AIError('invalid_output', err.message);
  return new AIError('unknown', err instanceof Error ? err.message : String(err));
}

function lastText(content: readonly { type: string }[]): string | null {
  for (let i = content.length - 1; i >= 0; i--) {
    const b = content[i] as { type: string; text?: unknown };
    if (b.type === 'text' && typeof b.text === 'string') return b.text;
  }
  return null;
}

/** The narrator transport backed by the real API, using the current settings. */
export async function sdkTransport(req: ClaudeRequest): Promise<ClaudeResponse> {
  const settings = getSettings();
  const apiKey = settings.ai.apiKey.trim();
  if (!apiKey) throw new AIError('auth', 'missing key');
  const model = resolveModel(settings.ai.model);
  const c = getClient(apiKey);
  const system = [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }];
  const messages = [{ role: 'user' as const, content: req.prompt }];
  const options = { timeout: req.timeoutMs, signal: req.signal };
  try {
    if (isFrontierModel(model)) {
      const res = await c.beta.messages.parse({
        model,
        max_tokens: req.maxTokens + THINKING_HEADROOM,
        system,
        messages,
        output_config: { format: betaZodOutputFormat(req.schema), effort: 'low' },
        betas: [SERVER_FALLBACK_BETA],
        fallbacks: 'default',
      }, options);
      return { stopReason: res.stop_reason, parsed: res.parsed_output, text: lastText(res.content) };
    }
    const res = await c.messages.parse({
      model,
      max_tokens: req.maxTokens,
      system,
      messages,
      output_config: { format: zodOutputFormat(req.schema) },
    }, options);
    return { stopReason: res.stop_reason, parsed: res.parsed_output, text: lastText(res.content) };
  } catch (e) {
    throw classifySdkError(e, req.signal.aborted);
  }
}

/** Smallest possible round-trip to validate key + model. Throws AIError on failure. */
export async function pingClaude(timeoutMs: number, signal: AbortSignal): Promise<ModelId> {
  const settings = getSettings();
  const apiKey = settings.ai.apiKey.trim();
  if (!apiKey) throw new AIError('auth', 'missing key');
  const model = resolveModel(settings.ai.model);
  const c = getClient(apiKey);
  try {
    await c.messages.create({
      model,
      max_tokens: 64,
      messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
      ...(isFrontierModel(model) ? { output_config: { effort: 'low' as const } } : {}),
    }, { timeout: timeoutMs, signal });
    return model;
  } catch (e) {
    throw classifySdkError(e, signal.aborted);
  }
}
