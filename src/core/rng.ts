import type { RngState } from './types';

/**
 * Seeded, serializable PRNG (sfc32). Use `Rng` everywhere instead of Math.random so
 * careers are reproducible from their seed and saves resume deterministically.
 */
export class Rng {
  private s: RngState;

  constructor(seedOrState: number | RngState) {
    if (Array.isArray(seedOrState)) {
      this.s = [...seedOrState] as RngState;
    } else {
      const seed = seedOrState >>> 0;
      this.s = [0x9e3779b9, 0x243f6a88, 0xb7e15162, seed];
      for (let i = 0; i < 15; i++) this.next();
    }
  }

  /** Current state, to store back into GameState.rng. */
  state(): RngState {
    return [...this.s] as RngState;
  }

  /** Float in [0, 1). */
  next(): number {
    let [a, b, c, d] = this.s;
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    this.s = [a, b, c, d];
    return t / 4294967296;
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(min + (max - min + 1) * this.next());
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick on empty array');
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Weighted pick; weights ≤ 0 are ignored. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  /** Gaussian via Box–Muller. */
  normal(mean = 0, sd = 1): number {
    const u = Math.max(1e-12, this.next());
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Poisson-distributed integer (Knuth), fine for small lambdas such as goal counts. */
  poisson(lambda: number): number {
    const L = Math.exp(-Math.max(0, lambda));
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L && k < 50);
    return k - 1;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Derive an independent child generator (e.g. one per match moment). */
  fork(): Rng {
    return new Rng((this.next() * 4294967296) >>> 0);
  }

  /** A fresh 32-bit seed. */
  seed(): number {
    return (this.next() * 4294967296) >>> 0;
  }
}

/** Seed from wall-clock + Math.random — only for creating a NEW career. */
export function freshSeed(): number {
  return ((Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0);
}
