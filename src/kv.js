// =====================================================================
// VEXA — KV data-model helpers, migration, stats, activity log, caches
// =====================================================================

import { bytesToHex } from "./crypto.js";
import { addUserId, withMigrationLock, withStatsLock } from "./index-coordinator.js";

// The KV namespace binding (Variable name: STORAGE) that backs every read
// and write in this Worker. Nothing else can run without it.
export function kvBound(env) {
  return Boolean(env.STORAGE);
}

// ---------------------------------------------------------------------
// DATA MODEL: Users (sources live directly on the user, no separate
// profile layer) and Nodes (reusable Name+Source pairs assignable to many
// Users via their nodeIds[] -- see src/nodes.js for the Node CRUD layer)
//   user:{uuid} -> {id, name, enabled, sources[], nodeIds[], createdAt, updatedAt}
//   node:{uuid} -> {id, name, source, enabled, createdAt, updatedAt}
//   idx:users   -> [userId, ...]              (avoids KV.list() for the users list)
//   idx:nodes   -> [nodeId, ...]               (avoids KV.list() for the nodes list)
//   meta:stats     -> cached dashboard summary, updated incrementally on writes
//   meta:activity  -> capped (20) recent-activity feed
//   meta:migrated_v3 -> one-time migration flag
// ---------------------------------------------------------------------
export async function kvGetJson(env, key, fallback) {
  const raw = await env.STORAGE.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function kvPutJson(env, key, value) {
  await env.STORAGE.put(key, JSON.stringify(value));
}

// Fixed, deterministic id for the auto-created orphan-profile bucket (see
// ensureMigrated() below) -- NOT crypto.randomUUID(). A rerun of migration
// (after an interruption, before meta:migrated_v3 is set) must update/reuse
// this same user:{uuid} record instead of minting a new random id and
// creating a second "Migrated Users" bucket with the same orphan sources
// duplicated across two User records (docs/problem.md DK-6). Shaped like
// any other User id (matches the [a-f0-9-]{36} route pattern in
// src/api-router.js) so it works with every existing User code path.
const MIGRATED_USERS_BUCKET_ID = "00000000-0000-4000-8000-000000000001";

// Runs once ever (gated by meta:migrated_v3). This is the ONLY place this
// file still does a KV.list() — every request after migration reads the
// idx:* records instead. Pre-existing profile:{uuid} records (from the old
// Users → Profiles → Sources model) are merged into their owning user's
// sources[] and then deleted; orphaned profiles (no userId) are bucketed
// under one auto-created "Migrated Users" account so nothing disappears.
//
// Safe against both interruption and concurrency (docs/problem.md DK-6,
// DK-7):
//   - The whole side-effect body runs inside withMigrationLock(), which
//     serializes entry across every Worker isolate via the
//     IndexCoordinator Durable Object (src/index-coordinator.js) -- two
//     concurrent calls can no longer both pass the unset-flag check and
//     both migrate (DK-7). The flag is re-checked once the lock is held,
//     so a caller that queued behind a just-finished migration returns
//     immediately instead of redoing the work.
//   - Each profile:{uuid} record (orphan or owned) is deleted immediately
//     after its sources are successfully folded into the owning User
//     record, not in a separate later bulk-delete pass. A rerun after an
//     interruption therefore only ever finds profile:* records that were
//     never actually merged -- there is no window where a record is both
//     merged and still present to be reprocessed (DK-6).
//   - The orphan bucket uses a fixed id (MIGRATED_USERS_BUCKET_ID) instead
//     of crypto.randomUUID(), so a rerun updates the same record instead
//     of creating a second bucket with duplicated orphan sources (DK-6).
//   - meta:migrated_v3 is still written only after every step above has
//     completed successfully, so an incomplete run never marks itself
//     done and a later invocation will always retry the remaining work.
export async function ensureMigrated(env) {
  if (await env.STORAGE.get("meta:migrated_v3")) return;

  await withMigrationLock(env, async () => {
    // Re-check inside the lock: another isolate may have completed the
    // whole migration (or been queued ahead of us here) while we were
    // waiting to acquire it.
    if (await env.STORAGE.get("meta:migrated_v3")) return;

    const list = await env.STORAGE.list({ prefix: "profile:" });
    const profiles = (
      await Promise.all(
        list.keys.map(async (k) => {
          // kvGetJson() isolates a malformed record to a null fallback
          // instead of throwing (docs/problem.md DK-8), so one bad
          // profile:* record can't reject this whole Promise.all and
          // abort migration for every other (valid) profile.
          const parsed = await kvGetJson(env, k.name, null);
          return parsed ? { key: k.name, profile: parsed } : null;
        }),
      )
    ).filter(Boolean);

    // Orphan profiles (no owning userId): fold into the fixed-id "Migrated
    // Users" bucket, deleting each source profile:* record immediately
    // after it's folded in -- see the DK-6 note above.
    const orphanEntries = profiles.filter((p) => !p.profile.userId);
    if (orphanEntries.length > 0) {
      const existingBucket = await kvGetJson(
        env,
        `user:${MIGRATED_USERS_BUCKET_ID}`,
        null,
      );
      const now = Date.now();
      const bucket = existingBucket || {
        id: MIGRATED_USERS_BUCKET_ID,
        name: "Migrated Users",
        enabled: true,
        sources: [],
        createdAt: now,
        updatedAt: now,
      };
      for (const { key, profile } of orphanEntries) {
        bucket.sources = [...bucket.sources, ...(profile.sources || [])];
        bucket.updatedAt = Date.now();
        await kvPutJson(env, `user:${bucket.id}`, bucket);
        await env.STORAGE.delete(key);
      }
      // idx:users add is idempotent (src/index-coordinator.js's #addId) --
      // safe to call again on a rerun even if the bucket already exists.
      await addUserId(env, bucket.id);
    }

    // Owned profiles: merge into their owning user:{uuid}, deleting each
    // profile:* record immediately after its own merge succeeds -- not in
    // a separate later loop -- so a rerun never re-reads an already-merged
    // record (docs/problem.md DK-6's root cause).
    for (const { key, profile } of profiles) {
      if (!profile.userId) continue;
      // kvGetJson() returns null for both a missing and a malformed
      // user:{uuid} record, so the existing continue below already
      // covers both cases the same way a missing record always did --
      // a malformed owning User record can no longer throw and abort
      // the whole migration (docs/problem.md DK-8).
      const user = await kvGetJson(env, `user:${profile.userId}`, null);
      if (!user) continue;
      user.sources = [...(user.sources || []), ...(profile.sources || [])];
      user.updatedAt = Date.now();
      await kvPutJson(env, `user:${profile.userId}`, user);
      await env.STORAGE.delete(key);
    }

    const oldIdxList = await env.STORAGE.list({
      prefix: "idx:userProfiles:",
    });
    for (const k of oldIdxList.keys) await env.STORAGE.delete(k.name);

    await recomputeStats(env);
    await env.STORAGE.put("meta:migrated_v3", "1");
  });
}

// Full recompute — only used by the migration above. Everyday mutations use
// adjustStats() below instead, so a dashboard load never has to walk every
// user's sources.
export async function recomputeStats(env) {
  const userIds = await kvGetJson(env, "idx:users", []);
  let totalSubSources = 0,
    totalRawSources = 0;
  for (const uid of userIds) {
    const user = await kvGetJson(env, `user:${uid}`, null);
    if (!user) continue;
    const sources = user.sources || [];
    totalSubSources += sources.filter((s) => s.type === "subscription").length;
    totalRawSources += sources.filter((s) => s.type !== "subscription").length;
  }
  const stats = {
    totalUsers: userIds.length,
    totalSubSources,
    totalRawSources,
    updatedAt: Date.now(),
  };
  await kvPutJson(env, "meta:stats", stats);
  return stats;
}

export async function adjustStats(env, delta) {
  // Secondary bookkeeping (docs/how-program-work.md §3: "cached dashboard
  // summary", not primary state) -- caught and logged locally so a KV
  // failure here can't turn an already-successful primary User mutation
  // into a 500 (docs/problem.md DK-9). Primary-mutation KV calls in
  // users.js/nodes.js remain unguarded and must still propagate/fail
  // normally.
  // The whole read -> mutate -> write body is additionally serialized
  // across every Worker isolate via withStatsLock() (docs/problem.md
  // DK-10), the same IndexCoordinator Durable Object pattern already used
  // for idx:users/idx:nodes (DK-2) and the migration body (DK-6/DK-7) --
  // two concurrent adjustStats() calls can no longer both read the same
  // pre-update meta:stats value and have one write clobber the other's
  // increment. Does not add retries and does not alter this function's
  // delta-clamping/default-object behavior.
  try {
    return await withStatsLock(env, async () => {
      const stats = await kvGetJson(env, "meta:stats", {
        totalUsers: 0,
        totalSubSources: 0,
        totalRawSources: 0,
      });
      for (const key of Object.keys(delta))
        stats[key] = Math.max(0, (stats[key] || 0) + delta[key]);
      stats.updatedAt = Date.now();
      await kvPutJson(env, "meta:stats", stats);
      return stats;
    });
  } catch (err) {
    console.error("adjustStats failed (non-fatal):", err);
  }
}

export async function recordActivity(env, message) {
  // Same DK-9 rationale as adjustStats() above: meta:activity is a
  // secondary dashboard feed, not primary state, so a KV failure here is
  // logged and swallowed rather than propagated.
  try {
    const activity = await kvGetJson(env, "meta:activity", []);
    activity.unshift({ message, ts: Date.now() });
    await kvPutJson(env, "meta:activity", activity.slice(0, 20));
  } catch (err) {
    console.error("recordActivity failed (non-fatal):", err);
  }
}

// ---------------------------------------------------------------------
// Subscription fallback cache + login rate limiting (both KV-backed)
// ---------------------------------------------------------------------
export const SUB_CACHE_TTL_SECONDS = 60 * 60 * 24 * 14; // keep a fallback copy for 2 weeks

export async function subCacheKeyFor(url) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url),
  );
  return `subcache:${bytesToHex(new Uint8Array(digest))}`;
}

export async function checkLoginRateLimit(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `ratelimit:login:${ip}`;
  const current = parseInt((await env.STORAGE.get(key)) || "0", 10);
  if (current >= 10) return false;
  await env.STORAGE.put(key, String(current + 1), { expirationTtl: 300 });
  return true;
}
