// ---------------------------------------------------------------------
// SUBSCRIPTION FALLBACK CACHE — replaces src/kv.js's
// subCacheKeyFor()/SUB_CACHE_TTL_SECONDS + the raw env.STORAGE.get/put
// calls src/merge.js used to make directly. Cache-key derivation (sha256
// of the source URL) is unchanged so existing cache keys, if any legacy
// KV cache data is ever inspected, would still be computed the same way;
// only the storage side moved.
// ---------------------------------------------------------------------
export const SUB_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14-day fallback, same as the old KV TTL

export async function subCacheKeyFor(url) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Stores/overwrites the cached node list for one cache key, with a fresh
// TTL from now — same "last successful fetch wins" semantics KV's put()
// had. Cache-write failures are swallowed here (mirrors merge.js's old
// try/catch around its own KV put): a cache-write failure must not fail
// the merge that triggered it.
export async function putSubscriptionCache(env, cacheKey, nodes) {
  try {
    const now = Date.now();
    await env.DB
      .prepare(
        `INSERT INTO subscription_cache (cache_key, nodes, fetched_at, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET nodes = excluded.nodes,
           fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`,
      )
      .bind(cacheKey, JSON.stringify(nodes), now, now + SUB_CACHE_TTL_MS)
      .run();
  } catch (err) {
    console.error("putSubscriptionCache (D1) failed (non-fatal):", err);
  }
}

// Returns { nodes, fetchedAt } for a still-fresh cache entry, or null if
// missing/expired/on error — same fallback contract src/merge.js's old
// env.STORAGE.get() + JSON.parse() pair had (a read failure or expiry both
// just mean "no fallback available", not a thrown error).
export async function getSubscriptionCache(env, cacheKey) {
  try {
    const row = await env.DB
      .prepare(`SELECT nodes, fetched_at, expires_at FROM subscription_cache WHERE cache_key = ?`)
      .bind(cacheKey)
      .first();
    if (!row) return null;
    if (row.expires_at <= Date.now()) return null; // expired: treat like a miss
    return { nodes: JSON.parse(row.nodes), fetchedAt: row.fetched_at };
  } catch (err) {
    console.error("getSubscriptionCache (D1) failed (non-fatal):", err);
    return null;
  }
}
