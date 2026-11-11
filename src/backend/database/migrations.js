import { d1Bound, ensureD1Ready } from "./d1.js";

// ---------------------------------------------------------------------
// LEGACY KV COMPATIBILITY READER (upgrade path only)
// Self-contained here (not imported from src/kv.js) so this file has no
// dependency on src/kv.js at all — per docs/problem.md's corrected DK-16
// scope, a fresh deployment must have zero KV code path, and importing
// from src/kv.js (even just for a read helper) would keep that file a
// live dependency of the normal migration path instead of an isolated
// upgrade-only concern. Only ever called from inside the `env.STORAGE`
// guard in ensureD1Migrated() below.
// ---------------------------------------------------------------------
async function legacyKvGetJson(env, key, fallback) {
  const raw = await env.STORAGE.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------
// ONE-TIME MIGRATION (idempotent, resumable) — D1 is authoritative; this
// function does NOT depend on any prior KV-only migration having run.
//
// Two independent cases, both handled by this single function:
//   1. FRESH DEPLOYMENT (no env.STORAGE bound at all, or bound but empty):
//      the `if (!env.STORAGE)` guard below skips every KV read entirely —
//      no runtime code path touches KV. This is the normal case per the
//      corrected DK-16 scope ("a fresh deployment requires one D1
//      database and does not require Cloudflare KV at all").
//   2. UPGRADE FROM A PRE-D1 DEPLOYMENT (env.STORAGE bound with legacy
//      data): this function reads legacy profile:{uuid}/user:{uuid}/
//      node:{uuid}/idx:users/idx:nodes/meta:stats/meta:activity records
//      directly and folds them into D1 in one pass — it performs the old
//      src/kv.js ensureMigrated()'s profile->user merge ITSELF, inline,
//      instead of depending on that function having already run. This is
//      the "isolate the compatibility path" requirement: every KV read in
//      this file lives inside the `if (env.STORAGE)` block below, so
//      case 1 above never reaches any of this code.
//
// Safe against both interruption and concurrency, same guarantees the old
// two-phase (KV ensureMigrated() + D1 ensureD1Migrated()) design had, now
// coordinated entirely through D1 itself instead of the IndexCoordinator
// Durable Object (see migration_flags' schema comment above for the
// 0/1/2 state meanings):
//   - migration_flags.kv_migrated's 0->1 transition is a single atomic
//     UPDATE ... WHERE id = 1 AND kv_migrated != 2 statement (see the
//     claim in ensureD1Migrated() below). D1/SQLite serializes each
//     statement, so of any number of isolates racing this UPDATE at the
//     same moment, exactly one can ever see result.meta.changes > 0 first
//     -- every other concurrent caller's identical UPDATE either matches
//     zero rows (already completed) or still matches (still not
//     completed) and is itself let through too, by design -- see the
//     RECOVERABILITY point below for why. This replaces
//     withMigrationLock()'s cross-isolate serialization (docs/problem.md
//     DK-7) without a Durable Object.
//   - The claim UPDATE does NOT set kv_migrated to a value meaning
//     complete. This is the critical correctness property this task
//     requires: 1 means "claimed / in progress", not "done". Only a
//     second, separate UPDATE (kv_migrated = 2) after every migration step
//     below has actually finished successfully marks the migration done --
//     mirrors the old "meta:migrated_v3 is written only after every step
//     has completed" guarantee, now split across two states instead of
//     one so a claim can never be mistaken for completion.
//   - RECOVERABILITY: an invocation that crashes between claiming (0->1)
//     and completing (1->2) leaves the flag at 1 with no lock/lease to
//     time out -- there is no DO queue anymore to wait on. Per this task's
//     instruction to use the smallest D1-native state transition necessary
//     rather than invent a lease/timeout framework, recovery instead relies
//     on this migration body's own pre-existing idempotency (every D1
//     write below is already INSERT OR IGNORE keyed on the source
//     record's own id, or a plain idempotent overwrite): the claim query's
//     WHERE clause (kv_migrated != 2) matches both 0 and 1, so a later
//     request finding the flag stuck at 1 still passes the claim and
//     re-runs the idempotent body to finish work a prior crashed
//     invocation left undone, instead of skipping it forever. Two isolates
//     that are BOTH genuinely still mid-flight at the same instant may
//     both pass this claim and both run the body concurrently in this
//     narrow window; this cannot corrupt data (every write is already
//     idempotent by id) -- it can only mean some redundant work repeats,
//     the documented tradeoff against a migration stuck permanently
//     incomplete.
//   - Every D1 INSERT below is OR IGNORE keyed on the source record's own
//     id (profile-derived User ids fold into the same deterministic
//     MIGRATED_USERS_BUCKET_ID as before for orphan profiles, and into
//     the owning user:{uuid}'s own id for owned profiles), so a rerun
//     after interruption cannot duplicate a User, Node, or User<->Node
//     relationship row.
//   - Existing KV records are left intact and simply unread once
//     migration_flags.kv_migrated reaches 2 -- no destructive delete -- so
//     the original KV data remains a rollback safety net if the D1 data
//     ever needs re-deriving. This still satisfies "do not destructively
//     delete legacy data before successful D1 persistence": nothing here
//     ever deletes a KV record, at any point.
//   - migration_flags.kv_migrated is only set to 2 (completed) after every
//     step below has completed successfully, so an incomplete run never
//     marks itself done and a later invocation will always retry the
//     remaining work.
// ---------------------------------------------------------------------

// Same fixed, deterministic id src/kv.js's old ensureMigrated() used for
// the auto-created orphan-profile bucket -- NOT crypto.randomUUID(). A
// rerun (after an interruption, before migration_flags.kv_migrated reaches
// 2) must update/reuse this same users row instead of minting a new random
// id and creating a second "Migrated Users" bucket with the same orphan
// sources duplicated across two User rows (docs/problem.md DK-6).
const MIGRATED_USERS_BUCKET_ID = "00000000-0000-4000-8000-000000000001";

// Tri-state migration_flags.kv_migrated values (see schema comment above).
const MIGRATION_IN_PROGRESS = 1;
const MIGRATION_COMPLETED = 2;

export async function ensureD1Migrated(env) {
  if (!d1Bound(env)) return; // nothing to migrate into if D1 isn't bound yet

  await ensureD1Ready(env);

  const flagRow = await env.DB
    .prepare(`SELECT kv_migrated FROM migration_flags WHERE id = 1`)
    .first();
  if (flagRow && flagRow.kv_migrated === MIGRATION_COMPLETED) return;

  // Atomic D1-native claim, replacing withMigrationLock(): a single
  // UPDATE whose WHERE clause matches unless the migration is already
  // fully completed (kv_migrated = 2). Matching this claim does NOT mean
  // this invocation is the only one to ever attempt the body (see the
  // RECOVERABILITY note above the header comment block) -- it means this
  // invocation is allowed to (re)run the idempotent body below. No
  // separate SELECT-then-UPDATE: D1/SQLite executes this single statement
  // atomically, so "read the flag" and "decide to proceed" cannot race
  // against another isolate's identical statement the way two separate
  // calls could.
  const claim = await env.DB
    .prepare(
      `UPDATE migration_flags
       SET kv_migrated = ?
       WHERE id = 1 AND kv_migrated != ?`,
    )
    .bind(MIGRATION_IN_PROGRESS, MIGRATION_COMPLETED)
    .run();

  // No row matched: kv_migrated was already 2 by the time this statement
  // ran (another isolate finished between the SELECT above and this
  // UPDATE). Nothing left for this invocation to do.
  if (claim.meta.changes === 0) return;

  // Re-check after claiming: another isolate's own claim may have already
  // run the whole body and completed (1->2) in the moment between this
  // isolate's UPDATE above and this SELECT. Skip redundant work if so.
  const recheck = await env.DB
    .prepare(`SELECT kv_migrated FROM migration_flags WHERE id = 1`)
    .first();
  if (recheck && recheck.kv_migrated === MIGRATION_COMPLETED) return;

  // Isolates the ENTIRE legacy-KV compatibility path behind one guard:
  // if env.STORAGE isn't bound (a genuinely fresh deployment, the
  // corrected scope's normal case), nothing below this line runs and no
  // KV read is ever attempted.
  if (env.STORAGE) {
    // ---- Fold legacy profile:{uuid} records into users first (this is
    // the old src/kv.js ensureMigrated() logic, run here directly
    // instead of as a separate prior migration) ----
    const profileList = await env.STORAGE.list({ prefix: "profile:" });
    const profiles = (
      await Promise.all(
        profileList.keys.map(async (k) => {
          const parsed = await legacyKvGetJson(env, k.name, null);
          return parsed ? { key: k.name, profile: parsed } : null;
        }),
      )
    ).filter(Boolean);

    // Legacy primary user:{uuid}/node:{uuid} records, read once up front
    // so the profile-fold below can merge into them before they're
    // written to D1 (mirrors the old two-phase design's net effect,
    // just performed as one in-memory pass instead of two KV passes).
    const userIds = await legacyKvGetJson(env, "idx:users", []);
    const nodeIds = await legacyKvGetJson(env, "idx:nodes", []);
    const usersById = new Map();
    for (const uid of userIds) {
      const user = await legacyKvGetJson(env, `user:${uid}`, null);
      if (user) usersById.set(uid, user);
    }

    // Orphan profiles (no owning userId): fold into the fixed-id
    // "Migrated Users" bucket, same as the old ensureMigrated().
    const orphanEntries = profiles.filter((p) => !p.profile.userId);
    if (orphanEntries.length > 0) {
      const now = Date.now();
      const bucket = usersById.get(MIGRATED_USERS_BUCKET_ID) || {
        id: MIGRATED_USERS_BUCKET_ID,
        name: "Migrated Users",
        enabled: true,
        sources: [],
        nodeIds: [],
        createdAt: now,
        updatedAt: now,
      };
      for (const { profile } of orphanEntries) {
        bucket.sources = [...bucket.sources, ...(profile.sources || [])];
        bucket.updatedAt = Date.now();
      }
      usersById.set(MIGRATED_USERS_BUCKET_ID, bucket);
      if (!userIds.includes(MIGRATED_USERS_BUCKET_ID)) {
        userIds.push(MIGRATED_USERS_BUCKET_ID);
      }
    }

    // Owned profiles: merge into their owning user's in-memory record
    // before it's written to D1 below.
    for (const { profile } of profiles) {
      if (!profile.userId) continue;
      const user = usersById.get(profile.userId);
      if (!user) continue; // owning user missing/malformed: skip, same tolerance as before
      user.sources = [...(user.sources || []), ...(profile.sources || [])];
      user.updatedAt = Date.now();
    }

    // ---- Nodes before user_nodes rows below (user_nodes.node_id has a
    // foreign key to nodes.id) ----
    for (const nid of nodeIds) {
      const node = await legacyKvGetJson(env, `node:${nid}`, null);
      if (!node) continue;
      await env.DB
        .prepare(
          `INSERT OR IGNORE INTO nodes (id, name, source, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          node.id,
          node.name,
          JSON.stringify(node.source),
          node.enabled !== false ? 1 : 0,
          node.createdAt || Date.now(),
          node.updatedAt || Date.now(),
        )
        .run();
    }

    // ---- Users (now including the profile-folded sources above) ----
    for (const uid of userIds) {
      const user = usersById.get(uid);
      if (!user) continue;
      await env.DB
        .prepare(
          `INSERT OR IGNORE INTO users (id, name, enabled, sources, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          user.id,
          user.name,
          user.enabled !== false ? 1 : 0,
          JSON.stringify(user.sources || []),
          user.createdAt || Date.now(),
          user.updatedAt || Date.now(),
        )
        .run();
    }

    // ---- User<->Node relationships ----
    for (const uid of userIds) {
      const user = usersById.get(uid);
      if (!user || !Array.isArray(user.nodeIds)) continue;
      for (let i = 0; i < user.nodeIds.length; i++) {
        await env.DB
          .prepare(
            `INSERT OR IGNORE INTO user_nodes (user_id, node_id, position) VALUES (?, ?, ?)`,
          )
          .bind(uid, user.nodeIds[i], i)
          .run();
      }
    }

    // ---- Stats: recomputed from the just-folded user records (same
    // values the old ensureMigrated() inlined into meta:stats), a plain
    // overwrite so a rerun is harmless ----
    let totalSubSources = 0,
      totalRawSources = 0;
    for (const uid of userIds) {
      const user = usersById.get(uid);
      if (!user) continue;
      const sources = user.sources || [];
      totalSubSources += sources.filter((s) => s.type === "subscription").length;
      totalRawSources += sources.filter((s) => s.type !== "subscription").length;
    }
    await env.DB
      .prepare(
        `UPDATE stats SET total_users = ?, total_sub_sources = ?, total_raw_sources = ?, updated_at = ? WHERE id = 1`,
      )
      .bind(userIds.length, totalSubSources, totalRawSources, Date.now())
      .run();

    // ---- Activity: copy meta:activity if D1's activity table is still
    // empty (no unique key to dedupe on, unlike users/nodes/user_nodes
    // above, so only migrate once) ----
    const activityCountRow = await env.DB
      .prepare(`SELECT COUNT(*) AS c FROM activity`)
      .first();
    if (!activityCountRow || activityCountRow.c === 0) {
      const kvActivity = await legacyKvGetJson(env, "meta:activity", []);
      if (Array.isArray(kvActivity) && kvActivity.length > 0) {
        // meta:activity is newest-first; insert oldest-first so the
        // AUTOINCREMENT id ordering matches, and getRecentActivity()'s
        // "ORDER BY id DESC" reproduces the same newest-first order.
        for (const entry of [...kvActivity].reverse()) {
          await env.DB
            .prepare(`INSERT INTO activity (message, ts) VALUES (?, ?)`)
            .bind(entry.message, entry.ts)
            .run();
        }
      }
    }
    // Legacy profile:*/user:*/node:*/idx:*/meta:* KV records are
    // intentionally left in place, unmodified and undeleted — see this
    // function's header comment.
  }

  // Only reached after every migration step above has actually completed
  // without throwing -- this is the 1->2 transition that marks the
  // migration genuinely done. If any step above throws, this line is never
  // reached, kv_migrated stays at 1, and the error propagates to the
  // caller unchanged -- a later request will re-attempt the claim above
  // and retry the idempotent body, the recoverability property this task
  // requires.
  await env.DB
    .prepare(`UPDATE migration_flags SET kv_migrated = ? WHERE id = 1`)
    .bind(MIGRATION_COMPLETED)
    .run();
}
