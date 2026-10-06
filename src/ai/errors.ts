import { t } from '../core/i18n';
import './strings';

/** Why a Claude call did not produce usable output. */
export type AIErrorKind =
  | 'auth' | 'permission' | 'not_found' | 'rate_limit' | 'overloaded' | 'billing' | 'bad_request'
  | 'connection' | 'timeout' | 'server' | 'refusal' | 'invalid_output' | 'unknown';

/** Transport-neutral error. The SDK transport converts typed SDK errors into this. */
export class AIError extends Error {
  readonly kind: AIErrorKind;
  readonly status?: number;
  readonly detail?: string;

  constructor(kind: AIErrorKind, detail?: string, status?: number) {
    super(detail ? `${kind}: ${detail}` : kind);
    this.name = 'AIError';
    this.kind = kind;
    this.detail = detail;
    this.status = status;
  }
}

export function toAIError(err: unknown): AIError {
  if (err instanceof AIError) return err;
  const detail = err instanceof Error ? err.message : String(err);
  return new AIError('unknown', detail);
}

const shortDetail = (s: string | undefined) => {
  const one = (s ?? '').replace(/\s+/g, ' ').trim();
  return one.length > 140 ? `${one.slice(0, 139)}…` : one || '—';
};

/** Localized, player-facing description of an AI error. */
export function describeAIError(e: AIError): string {
  switch (e.kind) {
    case 'auth': return t('ai.err.auth');
    case 'permission': return t('ai.err.permission');
    case 'not_found': return t('ai.err.notFound');
    case 'rate_limit': return t('ai.err.rateLimit');
    case 'overloaded': return t('ai.err.overloaded');
    case 'billing': return t('ai.err.billing');
    case 'bad_request': return t('ai.err.badRequest', { detail: shortDetail(e.detail) });
    case 'connection': return t('ai.err.connection');
    case 'timeout': return t('ai.err.timeout');
    case 'server': return t('ai.err.server', { status: e.status ?? '?' });
    case 'refusal': return t('ai.err.refusal');
    case 'invalid_output': return t('ai.err.invalid');
    default: return t('ai.err.unknown', { detail: shortDetail(e.detail) });
  }
}
