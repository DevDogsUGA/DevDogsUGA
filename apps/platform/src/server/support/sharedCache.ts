/**
 * A short-lived cache for Discord reads, shared by every request the Worker
 * serves in one Cloudflare data center.
 *
 * Why not the tools the app already has: `"use cache"` is backed by KV here,
 * whose edge reads can lag by about a minute, far too stale for a chat that
 * polls every ten seconds; and vinext's `cacheForRequest` only lives for one
 * request. Two tiers instead:
 *
 * 1. Memory, per isolate. Only settled JSON values are shared, never an
 *    in-flight promise: workerd ties pending I/O to the request that started
 *    it, so a second request awaiting the first one's Discord fetch hangs if
 *    the first is cancelled (the same class of wedge as the shared Postgres
 *    pool, ba3cf3e9). A cold burst can therefore make a few duplicate calls;
 *    the TTL bounds it.
 * 2. The Workers Cache API (`caches.default`), shared by every isolate in the
 *    data center. Absent under Node (tests, scripts), where tier 1 carries on
 *    alone.
 *
 * Values must be JSON. Entries expire by TTL; a write that must be seen at
 * once (a visitor's own reply) calls `evict`, which clears both tiers in the
 * data center that handled the write. Other data centers catch up within
 * the TTL, which is why the TTLs here are seconds, not minutes.
 */

/** The subset of the Cache API this uses, so tests can hand in a fake. */
export interface CacheStore {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  delete(request: Request): Promise<boolean>;
}

interface Entry {
  value: unknown;
  expiresAt: number;
}

/** Past this, expired entries are swept on write. Keys are per thread. */
const MEMORY_SWEEP_SIZE = 500;

/** A URL that can never be fetched for real; the Cache API only keys on URLs. */
const KEY_ORIGIN = "https://support-cache.invalid";

function defaultStore(): CacheStore | null {
  const storage = (globalThis as { caches?: { default?: CacheStore } }).caches;
  return storage?.default ?? null;
}

export function createSharedCache(
  options: { store?: CacheStore | null; now?: () => number } = {},
) {
  const now = options.now ?? Date.now;
  const store = options.store === undefined ? defaultStore() : options.store;
  const memory = new Map<string, Entry>();

  const request = (key: string) =>
    new Request(`${KEY_ORIGIN}/${encodeURIComponent(key)}`);

  function remember(key: string, value: unknown, ttlMs: number) {
    if (memory.size >= MEMORY_SWEEP_SIZE) {
      const at = now();
      for (const [k, entry] of memory)
        if (entry.expiresAt <= at) memory.delete(k);
    }
    memory.set(key, { value, expiresAt: now() + ttlMs });
  }

  async function fromStore(key: string): Promise<{ value: unknown } | null> {
    if (!store) return null;
    const hit = await store.match(request(key)).catch(() => undefined);
    if (!hit) return null;
    const expiresAt = Number(hit.headers.get("x-expires-at"));
    // The Cache API honors max-age itself, but only to the second; the
    // stamp keeps a 5s entry from living to 5.99s in memory afterwards.
    if (!expiresAt || expiresAt <= now()) return null;
    return { value: await hit.json() };
  }

  async function toStore(key: string, value: unknown, ttlMs: number) {
    if (!store) return;
    const response = new Response(JSON.stringify(value), {
      headers: {
        "content-type": "application/json",
        "cache-control": `max-age=${Math.max(1, Math.ceil(ttlMs / 1000))}`,
        "x-expires-at": String(now() + ttlMs),
      },
    });
    // A failed put costs a future Discord call, never this response.
    await store.put(request(key), response).catch(() => undefined);
  }

  return {
    /**
     * The cached value for `key`, or `load()`'s result, stored for `ttlMs`.
     * Callers must treat the value as read-only: it is shared.
     */
    async get<T>(
      key: string,
      ttlMs: number,
      load: () => Promise<T>,
    ): Promise<T> {
      const entry = memory.get(key);
      if (entry && entry.expiresAt > now()) return entry.value as T;

      const stored = await fromStore(key);
      if (stored) {
        remember(key, stored.value, ttlMs);
        return stored.value as T;
      }
      const value = await load();
      remember(key, value, ttlMs);
      await toStore(key, value, ttlMs);
      return value;
    },

    /** Drops `key` from this isolate and this data center's cache. */
    async evict(key: string): Promise<void> {
      memory.delete(key);
      if (store) await store.delete(request(key)).catch(() => false);
    },
  };
}

export type SharedCache = ReturnType<typeof createSharedCache>;

/** The Worker's one instance. Module scope, so it outlives each request. */
export const sharedCache = createSharedCache();
