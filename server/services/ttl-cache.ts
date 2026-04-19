/**
 * Tiny in-memory TTL cache.
 *
 * Used to throttle expensive repeated operations (git shellouts, process
 * discovery) so that a stuck filesystem or slow `ps` doesn't hammer us
 * on every request. Entries expire lazily on `get()`.
 *
 * ShipLoop plan task 4.
 *
 * @module server/services/ttl-cache
 */

export interface TtlCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
}

export function ttlCache<T>(ttlMs: number): TtlCache<T> {
  const store = new Map<string, { value: T; at: number }>();
  return {
    get(key: string): T | undefined {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() - entry.at > ttlMs) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: T): void {
      store.set(key, { value, at: Date.now() });
    },
    delete(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
  };
}
