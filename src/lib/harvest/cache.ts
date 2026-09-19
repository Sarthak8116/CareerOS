import "server-only";

/**
 * Server-side Harvest response cache.
 *
 * Every Apify call costs money, so nothing is fetched twice inside the TTL.
 * Entries are keyed by the stable identity of the thing fetched — a LinkedIn
 * profile URL, a company identifier — and carry the `fetchedAt` stamp that ends
 * up in the record's provenance, so a cached record is never presented as
 * fresher than it is.
 *
 * Scope is one server process. That is deliberate: the durable copy of this
 * data is the Campaign itself, persisted through `lib/store.ts` exactly like
 * every other campaign field. This cache only stops repeat calls within a
 * session; the Supabase-backed store will replace it behind the same helpers.
 */

/** How long a cached Harvest response stays reusable. */
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Hard ceiling so a long-running server can never grow this without bound. */
const MAX_ENTRIES = 500;

interface Entry<T> {
  value: T;
  fetchedAt: string;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

/** Normalize a LinkedIn URL so the same profile always hits the same key. */
export function cacheKey(kind: string, identity: string): string {
  const normalized = identity
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
  return `${kind}:${normalized}`;
}

function evictIfNeeded() {
  if (store.size <= MAX_ENTRIES) return;
  // Drop the oldest insertions first (Map preserves insertion order).
  const overflow = store.size - MAX_ENTRIES;
  let removed = 0;
  for (const key of store.keys()) {
    store.delete(key);
    if (++removed >= overflow) break;
  }
}

/** Read a live (non-expired) entry, or `undefined`. */
export function readCache<T>(key: string): { value: T; fetchedAt: string } | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return { value: hit.value as T, fetchedAt: hit.fetchedAt };
}

/** Store a value with the stamp that will be used as its provenance time. */
export function writeCache<T>(key: string, value: T, fetchedAt: string): void {
  store.set(key, { value, fetchedAt, expiresAt: Date.now() + TTL_MS });
  evictIfNeeded();
}

/**
 * Reuse a cached response if there is one, otherwise fetch and cache it.
 * Returns the value alongside the `fetchedAt` that belongs in provenance —
 * for a cache hit that is the ORIGINAL fetch time, not now.
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<{ value: T; fetchedAt: string; cached: boolean }> {
  const hit = readCache<T>(key);
  if (hit) return { ...hit, cached: true };

  const fetchedAt = new Date().toISOString();
  const value = await fetcher();
  writeCache(key, value, fetchedAt);
  return { value, fetchedAt, cached: false };
}

/** Test/reset helper. Not used by application code. */
export function clearCache(): void {
  store.clear();
}
