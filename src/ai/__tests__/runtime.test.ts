import { describe, expect, it } from 'vitest';
import { AIError } from '../errors';
import { Breaker, COOLDOWN_MS, Limiter, StatusTracker, withTimeout } from '../runtime';

describe('StatusTracker', () => {
  it('tracks the request lifecycle and clears the error on the next success', () => {
    const s = new StatusTracker();
    s.enqueue('news');
    s.start();
    s.fail('boom');
    expect(s.get()).toMatchObject({ calls: 1, failures: 1, pending: 0, lastError: 'boom', lastFeature: 'news' });
    s.enqueue('chat');
    s.start();
    s.succeed();
    expect(s.get()).toMatchObject({ calls: 2, failures: 1, pending: 0, lastError: null, lastFeature: 'chat' });
  });

  it('drops leave counters alone and pending never goes negative', () => {
    const s = new StatusTracker();
    s.enqueue('social');
    s.drop();
    s.drop();
    expect(s.get()).toMatchObject({ calls: 0, failures: 0, pending: 0 });
  });

  it('notifies listeners with snapshots and survives a throwing listener', () => {
    const s = new StatusTracker();
    const seen: number[] = [];
    s.subscribe(() => { throw new Error('bad listener'); });
    const off = s.subscribe((snap) => seen.push(snap.pending));
    s.enqueue(null);
    off();
    s.drop();
    expect(seen).toEqual([1]);
  });
});

describe('Breaker', () => {
  function clock(start = 1_000) {
    let t = start;
    return { now: () => t, advance: (ms: number) => { t += ms; } };
  }

  it('pauses after hard failures until the cooldown ends', () => {
    const c = clock();
    const b = new Breaker(c.now);
    expect(b.trip('rate_limit', 'k')).toBe(1_000 + COOLDOWN_MS.rate_limit!);
    expect(b.isOpen('k')).toBe(true);
    c.advance(COOLDOWN_MS.rate_limit! - 1);
    expect(b.isOpen('k')).toBe(true);
    c.advance(1);
    expect(b.isOpen('k')).toBe(false);
    expect(b.openUntil()).toBeNull();
  });

  it('ignores request-specific failures', () => {
    const b = new Breaker(() => 0);
    for (const kind of ['refusal', 'invalid_output', 'bad_request', 'timeout', 'unknown'] as const) {
      expect(b.trip(kind, 'k')).toBeNull();
    }
    expect(b.isOpen('k')).toBe(false);
  });

  it('closes as soon as the key or model changes', () => {
    const b = new Breaker(() => 0);
    b.trip('auth', 'old-key|opus');
    expect(b.isOpen('old-key|opus')).toBe(true);
    expect(b.isOpen('new-key|opus')).toBe(false);
    expect(b.isOpen('old-key|opus')).toBe(false);
  });

  it('can be reset explicitly', () => {
    const b = new Breaker(() => 0);
    b.trip('connection', 'k');
    b.reset();
    expect(b.isOpen('k')).toBe(false);
  });
});

describe('Limiter & withTimeout', () => {
  it('raising the cap admits waiters immediately', async () => {
    const l = new Limiter(1);
    let release!: () => void;
    const first = l.run(() => new Promise<void>((r) => { release = r; }));
    let secondStarted = false;
    const second = l.run(async () => { secondStarted = true; });
    await Promise.resolve();
    expect(l.queued).toBe(1);
    l.max = 2;
    await second;
    expect(secondStarted).toBe(true);
    release();
    await first;
    expect(l.inFlight).toBe(0);
  });

  it('aborts the signal and rejects with a timeout AIError', async () => {
    let aborted = false;
    const p = withTimeout((signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
    }), 10);
    await expect(p).rejects.toBeInstanceOf(AIError);
    await expect(p).rejects.toMatchObject({ kind: 'timeout' });
    expect(aborted).toBe(true);
  });

  it('turns a synchronous throw into a rejection', async () => {
    await expect(withTimeout(() => { throw new Error('sync'); }, 50)).rejects.toThrow('sync');
  });
});
