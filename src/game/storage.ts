/**
 * Save storage adapters. The game persists to IndexedDB (idb-keyval) in the browser and
 * falls back to an in-memory map when IndexedDB is missing (vitest/node, private mode,
 * blocked storage). Tests inject `memoryStorage()` directly.
 */
import { createStore, del as idbDel, get as idbGet, set as idbSet, type UseStore } from 'idb-keyval';

export interface SaveStorage {
  readonly kind: 'indexeddb' | 'memory' | 'auto';
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

const clone = <T>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : (JSON.parse(JSON.stringify(v)) as T));

/** Volatile storage (values are deep-cloned so callers can't alias stored saves). */
export function memoryStorage(): SaveStorage {
  const map = new Map<string, unknown>();
  return {
    kind: 'memory',
    async get<T>(key: string) { return map.has(key) ? clone(map.get(key) as T) : undefined; },
    async set(key, value) { map.set(key, clone(value)); },
    async del(key) { map.delete(key); },
  };
}

export function indexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/** IndexedDB storage via idb-keyval. The store is opened lazily (opening touches indexedDB). */
export function idbStorage(dbName = 'neo-star-soccer', storeName = 'saves'): SaveStorage {
  let store: UseStore | null = null;
  const s = () => (store ??= createStore(dbName, storeName));
  return {
    kind: 'indexeddb',
    get: <T>(key: string) => idbGet<T>(key, s()),
    set: (key, value) => idbSet(key, value, s()),
    del: (key) => idbDel(key, s()),
  };
}

/**
 * IndexedDB when it works, otherwise memory. If IndexedDB fails at runtime (quota, blocked,
 * Safari private mode) we switch to memory for the rest of the session and keep playing.
 */
export function autoStorage(): SaveStorage {
  const mem = memoryStorage();
  let primary: SaveStorage | null = indexedDbAvailable() ? idbStorage() : null;
  const run = async <T>(op: (st: SaveStorage) => Promise<T>): Promise<T> => {
    if (primary) {
      try {
        return await op(primary);
      } catch (e) {
        console.warn('[game] IndexedDB unavailable, falling back to memory saves', e);
        primary = null;
      }
    }
    return op(mem);
  };
  return {
    kind: 'auto',
    get: <T>(key: string) => run((st) => st.get<T>(key)),
    set: (key, value) => run((st) => st.set(key, value)),
    del: (key) => run((st) => st.del(key)),
  };
}
