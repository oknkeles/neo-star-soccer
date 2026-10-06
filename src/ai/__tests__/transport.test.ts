import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateSettings } from '../../core/settings';
import { AIError } from '../errors';
import type { ClaudeRequest } from '../narrator';
import * as schemas from '../schemas';
import {
  classifySdkError, getClient, isFrontierModel, pingClaude, resolveModel, sdkTransport, SERVER_FALLBACK_BETA, THINKING_HEADROOM,
} from '../transport';

const KEY = 'sk-ant-test-0123456789';
const headers = new Headers();

function req(): ClaudeRequest {
  return {
    feature: 'chat', system: 'SYS', prompt: 'PROMPT', schema: schemas.ChatSchema, maxTokens: 600, timeoutMs: 1000,
    signal: new AbortController().signal,
  };
}

function useModel(model: string) {
  updateSettings((s) => { s.ai.apiKey = KEY; s.ai.model = model; s.ai.enabled = true; });
}

afterEach(() => {
  vi.restoreAllMocks();
  updateSettings((s) => { s.ai.apiKey = ''; s.ai.enabled = false; s.ai.model = 'claude-opus-5-5'; });
});

describe('models', () => {
  it('resolves unknown ids to the default and flags frontier models', () => {
    expect(resolveModel('gpt-whatever')).toBe('claude-opus-5-5');
    expect(resolveModel('claude-haiku-4-5')).toBe('claude-haiku-4-5');
    expect(isFrontierModel('claude-opus-5-5')).toBe(true);
    expect(isFrontierModel('claude-sonnet-5-5')).toBe(true);
    expect(isFrontierModel('claude-haiku-4-5')).toBe(false);
  });

  it('reuses the client until the key changes', () => {
    const a = getClient('k1-aaaaaaaaaaaa');
    expect(getClient('k1-aaaaaaaaaaaa')).toBe(a);
    expect(getClient('k2-bbbbbbbbbbbb')).not.toBe(a);
  });
});

describe('error classification', () => {
  const cases: [unknown, string][] = [
    [new Anthropic.AuthenticationError(401, undefined, 'bad key', headers), 'auth'],
    [new Anthropic.PermissionDeniedError(403, undefined, 'no', headers), 'permission'],
    [new Anthropic.NotFoundError(404, undefined, 'model', headers), 'not_found'],
    [new Anthropic.RateLimitError(429, undefined, 'slow down', headers), 'rate_limit'],
    [new Anthropic.BadRequestError(400, undefined, 'credit', headers, 'billing_error'), 'billing'],
    [new Anthropic.BadRequestError(400, undefined, 'invalid', headers), 'bad_request'],
    [new Anthropic.InternalServerError(529, undefined, 'overloaded', headers), 'overloaded'],
    [new Anthropic.InternalServerError(500, undefined, 'oops', headers), 'server'],
    [new Anthropic.APIConnectionTimeoutError(), 'timeout'],
    [new Anthropic.APIConnectionError({ message: 'offline' }), 'connection'],
    [new Anthropic.APIUserAbortError(), 'timeout'],
    [new Anthropic.AnthropicError('Failed to parse structured output'), 'invalid_output'],
    [new Error('weird'), 'unknown'],
  ];
  it.each(cases)('%s → %s', (err, kind) => {
    expect(classifySdkError(err).kind).toBe(kind);
  });

  it('passes AIErrors through', () => {
    const e = new AIError('refusal');
    expect(classifySdkError(e)).toBe(e);
  });
});

describe('sdkTransport request shape', () => {
  it('Opus 5.5: beta parse with server-side fallback, effort low, cached system, no thinking/sampling params', async () => {
    useModel('claude-opus-5-5');
    const client = getClient(KEY);
    const parse = vi.spyOn(client.beta.messages, 'parse').mockResolvedValue({
      stop_reason: 'end_turn', parsed_output: { reply: 'Selam' }, content: [{ type: 'text', text: '{"reply":"Selam"}' }],
    } as never);
    const res = await sdkTransport(req());
    expect(res).toEqual({ stopReason: 'end_turn', parsed: { reply: 'Selam' }, text: '{"reply":"Selam"}' });
    const [params, options] = parse.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.max_tokens).toBe(600 + THINKING_HEADROOM);
    expect(params.betas).toEqual([SERVER_FALLBACK_BETA]);
    expect(params.fallbacks).toBe('default');
    expect(params.output_config).toMatchObject({ effort: 'low' });
    expect((params.output_config as { format: { type: string } }).format.type).toBe('json_schema');
    expect(params.system).toEqual([{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }]);
    expect(params.messages).toEqual([{ role: 'user', content: 'PROMPT' }]);
    for (const k of ['thinking', 'temperature', 'top_p', 'top_k']) expect(params).not.toHaveProperty(k);
    expect(options).toMatchObject({ timeout: 1000 });
  });

  it('Haiku 4.5: standard parse, no effort, no fallback beta', async () => {
    useModel('claude-haiku-4-5');
    const client = getClient(KEY);
    const beta = vi.spyOn(client.beta.messages, 'parse');
    const parse = vi.spyOn(client.messages, 'parse').mockResolvedValue({
      stop_reason: 'refusal', parsed_output: null, content: [],
    } as never);
    const res = await sdkTransport(req());
    expect(res.stopReason).toBe('refusal');
    expect(beta).not.toHaveBeenCalled();
    const [params] = parse.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params.model).toBe('claude-haiku-4-5');
    expect(params.max_tokens).toBe(600);
    expect(params.output_config).not.toHaveProperty('effort');
    expect(params).not.toHaveProperty('betas');
    expect(params).not.toHaveProperty('fallbacks');
  });

  it('converts SDK errors into AIErrors', async () => {
    useModel('claude-sonnet-5-5');
    const client = getClient(KEY);
    vi.spyOn(client.beta.messages, 'parse').mockRejectedValue(new Anthropic.RateLimitError(429, undefined, 'slow', headers));
    await expect(sdkTransport(req())).rejects.toMatchObject({ kind: 'rate_limit' });
  });

  it('refuses to call without a key', async () => {
    updateSettings((s) => { s.ai.apiKey = '  '; });
    await expect(sdkTransport(req())).rejects.toMatchObject({ kind: 'auth' });
  });

  it('pingClaude sends a tiny request', async () => {
    useModel('claude-haiku-4-5');
    const client = getClient(KEY);
    const create = vi.spyOn(client.messages, 'create').mockResolvedValue({ stop_reason: 'end_turn', content: [] } as never);
    await expect(pingClaude(1000, new AbortController().signal)).resolves.toBe('claude-haiku-4-5');
    const [params] = create.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params.max_tokens).toBeLessThanOrEqual(64);
    expect(params).not.toHaveProperty('output_config');
  });
});

describe('schemas are API-compatible', () => {
  const forbidden = ['minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minItems', 'maxItems'];

  function walk(node: unknown, path: string, problems: string[]) {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    for (const k of forbidden) if (k in n) problems.push(`${path}: ${k}`);
    if (n.type === 'object') {
      if (n.additionalProperties !== false) problems.push(`${path}: additionalProperties`);
      const props = Object.keys((n.properties as object) ?? {});
      const req = (n.required as string[]) ?? [];
      for (const p of props) if (!req.includes(p)) problems.push(`${path}.${p}: optional`);
    }
    for (const [k, v] of Object.entries(n)) {
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${k}[${i}]`, problems));
      else if (typeof v === 'object') walk(v, `${path}.${k}`, problems);
    }
  }

  const all = {
    GenesisSchema: schemas.GenesisSchema, NewsSchema: schemas.NewsSchema, SocialSchema: schemas.SocialSchema,
    PressQuestionsSchema: schemas.PressQuestionsSchema, PressEvalSchema: schemas.PressEvalSchema,
    NegotiationSchema: schemas.NegotiationSchema, EventSchema: schemas.EventSchema, ChatSchema: schemas.ChatSchema,
    BiographySchema: schemas.BiographySchema,
  };
  it.each(Object.entries(all))('%s: strict objects, no unsupported constraints', (_name, schema) => {
    const problems: string[] = [];
    walk(zodOutputFormat(schema).schema, '$', problems);
    expect(problems).toEqual([]);
  });

  it('tolerates out-of-list enum values instead of failing the whole response', () => {
    const r = schemas.PressEvalSchema.safeParse({ tone: 'smug', effects: { fame: 0, morale: 0, followers: 0, rel: [] }, headline: 'h', feedback: 'f' });
    expect(r.success && r.data.tone).toBe('diplomatic');
  });
});

describe('wire format (fake fetch)', () => {
  function fakeFetch(text: string, stopReason = 'end_turn') {
    const requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      });
      const message = {
        id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: stopReason, stop_sequence: null,
        content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 },
      };
      return new Response(JSON.stringify(message), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
    });
    vi.stubGlobal('fetch', fetchFn);
    return requests;
  }

  afterEach(() => { vi.unstubAllGlobals(); });

  it('Opus 5.5 sends the fallback beta header, fallbacks and a strict JSON schema; parses the reply', async () => {
    const requests = fakeFetch('{"reply":"Selam hocam"}');
    const key = 'sk-ant-wire-opus-000001';
    updateSettings((s) => { s.ai.apiKey = key; s.ai.model = 'claude-opus-5-5'; s.ai.enabled = true; });
    const res = await sdkTransport(req());
    expect(res.parsed).toEqual({ reply: 'Selam hocam' });
    expect(requests).toHaveLength(1);
    const r = requests[0];
    expect(r.url).toContain('/v1/messages');
    expect(r.headers.get('anthropic-beta')).toContain(SERVER_FALLBACK_BETA);
    expect(r.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(r.body).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: { effort: 'low', format: { type: 'json_schema' } } });
    expect(r.body).not.toHaveProperty('betas');
    for (const k of ['thinking', 'temperature', 'top_p', 'top_k']) expect(r.body).not.toHaveProperty(k);
  });

  it('Haiku 4.5 uses the plain endpoint without effort or betas', async () => {
    const requests = fakeFetch('{"reply":"ok"}');
    const key = 'sk-ant-wire-haiku-00001';
    updateSettings((s) => { s.ai.apiKey = key; s.ai.model = 'claude-haiku-4-5'; s.ai.enabled = true; });
    const res = await sdkTransport(req());
    expect(res.parsed).toEqual({ reply: 'ok' });
    const r = requests[0];
    expect(r.headers.get('anthropic-beta')).toBeNull();
    expect(r.body).toMatchObject({ model: 'claude-haiku-4-5', max_tokens: 600 });
    expect(r.body.output_config).not.toHaveProperty('effort');
    expect(r.body).not.toHaveProperty('fallbacks');
  });

  it('truncated JSON surfaces as invalid_output', async () => {
    fakeFetch('{"reply":"yar', 'max_tokens');
    updateSettings((s) => { s.ai.apiKey = 'sk-ant-wire-trunc-00001'; s.ai.model = 'claude-sonnet-5-5'; s.ai.enabled = true; });
    await expect(sdkTransport(req())).rejects.toMatchObject({ kind: 'invalid_output' });
  });
});
