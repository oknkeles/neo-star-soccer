import type { AIFeature } from '../core/types';
import { AIError, type AIErrorKind } from './errors';

export interface AIStatus {
  /** Requests actually sent to Claude. */
  calls: number;
  failures: number;
  /** Requests queued or in flight. */
  pending: number;
  /** Localized message of the most recent failure; cleared by the next success. */
  lastError: string | null;
  lastFeature: AIFeature | null;
  /** While set (epoch ms), Claude is paused after a hard failure and the built-in narrator answers. */
  cooldownUntil: number | null;
}

const EMPTY: AIStatus = { calls: 0, failures: 0, pending: 0, lastError: null, lastFeature: null, cooldownUntil: null };

/** Observable counters for the AI indicator in the UI. */
export class StatusTracker {
  private s: AIStatus = { ...EMPTY };
  private listeners = new Set<(s: AIStatus) => void>();

  get(): AIStatus {
    return { ...this.s };
  }

  subscribe(fn: (s: AIStatus) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** A request entered the queue. */
  enqueue(feature: AIFeature | null): void {
    this.s.pending += 1;
    if (feature) this.s.lastFeature = feature;
    this.emit();
  }

  /** A queued request is being sent. */
  start(): void {
    this.s.calls += 1;
    this.emit();
  }

  /** A request completed with usable output. */
  succeed(): void {
    this.s.pending = Math.max(0, this.s.pending - 1);
    this.s.lastError = null;
    this.emit();
  }

  /** A request failed; `message` is player-facing. */
  fail(message: string): void {
    this.s.pending = Math.max(0, this.s.pending - 1);
    this.s.failures += 1;
    this.s.lastError = message;
    this.emit();
  }

  /** A request left the queue without being sent (shed load or paused). */
  drop(): void {
    this.s.pending = Math.max(0, this.s.pending - 1);
    this.emit();
  }

  /** Shorthand: `null` = success, a string = failure. */
  settle(error: string | null): void {
    if (error === null) this.succeed();
    else this.fail(error);
  }

  clearError(): void {
    if (this.s.lastError === null) return;
    this.s.lastError = null;
    this.emit();
  }

  setCooldown(until: number | null): void {
    if (this.s.cooldownUntil === until) return;
    this.s.cooldownUntil = until;
    this.emit();
  }

  reset(): void {
    this.s = { ...EMPTY };
    this.emit();
  }

  private emit(): void {
    const snap = this.get();
    for (const fn of this.listeners) {
      try { fn(snap); } catch { /* a broken listener must not break the narrator */ }
    }
  }
}

/** FIFO concurrency gate: at most `max` requests in flight, the rest wait their turn. */
export class Limiter {
  private active = 0;
  private waiting: (() => void)[] = [];

  constructor(private cap: number) {}

  get max(): number { return this.cap; }
  /** Raising the cap admits waiters immediately; lowering it lets in-flight calls drain. */
  set max(n: number) {
    this.cap = Math.max(1, Math.round(n));
    while (this.active < this.cap && this.waiting.length) {
      this.active += 1;
      this.waiting.shift()!();
    }
  }

  get inFlight(): number { return this.active; }
  get queued(): number { return this.waiting.length; }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.cap) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    // Hand the slot straight to the next waiter so a newcomer can't sneak past the cap.
    const next = this.active <= this.cap ? this.waiting.shift() : undefined;
    if (next) next();
    else this.active -= 1;
  }
}

/** Run `fn` with an abort signal; reject with AIError('timeout') after `ms`. */
export function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Settle first: aborting may synchronously reject `work` with a less useful error.
      reject(new AIError('timeout'));
      ctrl.abort();
    }, ms);
  });
  let work: Promise<T>;
  try {
    work = fn(ctrl.signal);
  } catch (e) {
    work = Promise.reject(e);
  }
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * How long Claude stays paused after each kind of failure. Request-specific problems
 * (refusal, unreadable output, a bad request, a slow answer) never pause anything.
 */
export const COOLDOWN_MS: Partial<Record<AIErrorKind, number>> = {
  auth: 10 * 60_000,
  permission: 10 * 60_000,
  not_found: 10 * 60_000,
  billing: 10 * 60_000,
  rate_limit: 30_000,
  overloaded: 20_000,
  connection: 15_000,
  server: 10_000,
};

/**
 * Circuit breaker: after a hard failure (bad key, no credit, rate limit, offline…) the
 * narrator stops calling Claude for a while instead of making every weekly update wait on
 * a request that is bound to fail. Changing the key or model closes it immediately.
 */
export class Breaker {
  private until = 0;
  private key = '';

  constructor(private readonly now: () => number = Date.now) {}

  /** True while calls made under `configKey` should be skipped. */
  isOpen(configKey: string): boolean {
    if (this.until === 0) return false;
    if (configKey !== this.key || this.now() >= this.until) {
      this.until = 0;
      return false;
    }
    return true;
  }

  /** Record a failure; returns the pause end (epoch ms) or null if this kind does not pause. */
  trip(kind: AIErrorKind, configKey: string): number | null {
    const ms = COOLDOWN_MS[kind];
    if (!ms) return null;
    const until = this.now() + ms;
    this.until = configKey === this.key ? Math.max(this.until, until) : until;
    this.key = configKey;
    return this.until;
  }

  /** Pause end (epoch ms) if currently open, else null. */
  openUntil(): number | null {
    return this.until > this.now() ? this.until : null;
  }

  reset(): void {
    this.until = 0;
  }
}
