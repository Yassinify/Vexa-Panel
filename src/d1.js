
export function d1Bound(env) {
  return Boolean(env.DB);
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    sources TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_nodes (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (user_id, node_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_user_nodes_user ON user_nodes(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_nodes_node ON user_nodes(node_id)`,
  `CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_users INTEGER NOT NULL DEFAULT 0,
    total_sub_sources INTEGER NOT NULL DEFAULT 0,
    total_raw_sources INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    ts INTEGER NOT NULL
  )`,
  // One row per UTC day (YYYY-MM-DD) holding the last total user count
  // recorded that day; see recordUserGrowthSnapshot() below.
  `CREATE TABLE IF NOT EXISTS user_growth (
    day TEXT PRIMARY KEY,
    total_users INTEGER NOT NULL
  )`,
  // Replaces KV's subcache:{sha256} (src/merge.js). cache_key is the same
  // sha256-of-source-URL this project already used as a KV key (see
  // subCacheKeyFor() below) so cache-key semantics are unchanged. nodes is
  // the same JSON-stringified node array KV stored; expires_at replaces
  // KV's native expirationTtl (D1 has no TTL primitive, so expiry is a
  // plain column checked/enforced by this file's own code, same pattern as
  // login_rate_limit below).
  `CREATE TABLE IF NOT EXISTS subscription_cache (
    cache_key TEXT PRIMARY KEY,
    nodes TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_subscription_cache_expires ON subscription_cache(expires_at)`,
  // Replaces KV's ratelimit:login:{ip} (src/secrets.js). One row per IP;
  // window_start anchors the current 5-minute window (mirrors KV's
  // 300-second expirationTtl, which reset the counter to 0 once the TTL
  // elapsed) and attempts counts logins within that window. See
  // checkLoginRateLimit() below for the atomic increment/window-reset.
  `CREATE TABLE IF NOT EXISTS login_rate_limit (
    ip TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL
  )`,
  // Replaces KV's meta:migrated_v3 (legacy profile->user)/meta:migrated_d1
  // (KV->D1) flags with a D1 column on one fixed row, so the one-time
  // migration's own done-flag no longer requires KV either. kv_migrated is
  // tri-state (not boolean), replacing the old IndexCoordinator Durable
  // Object lock with a D1-native atomic claim (see ensureD1Migrated()
  // below): 0 = not started, 1 = in progress (claimed by some invocation,
  // possibly still running or possibly interrupted before completing),
  // 2 = completed. The state transition 0->1 is the atomic single-UPDATE
  // claim that used to be withMigrationLock()'s job; 1->2 is only written
  // after the full migration body below has actually finished successfully.
  `CREATE TABLE IF NOT EXISTS migration_flags (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    kv_migrated INTEGER NOT NULL DEFAULT 0
  )`,
  `INSERT OR IGNORE INTO migration_flags (id, kv_migrated) VALUES (1, 0)`,
  // DK-18: singleton row for D1-backed authentication configuration, same
  // CHECK (id = 1) convention as stats/migration_flags above. No default
  // row is inserted here (unlike stats/migration_flags) because there is
  // no valid "empty" auth_config — a row only ever gets created once real
  // salt/hash/secret values exist (see initAuthConfigIfAbsent() below);
  // inserting a placeholder row here would let a deployment authenticate
  // against empty-string values.
  `CREATE TABLE IF NOT EXISTS auth_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    admin_salt TEXT NOT NULL,
    admin_password_hash TEXT NOT NULL,
    jwt_secret TEXT NOT NULL
  )`,
  // The one and only stats row, created once. Every later change is a
  // plain UPDATE ... WHERE id = 1 (see adjustStats() below) — never a
  // second INSERT — so this OR IGNORE never needs to fire again after the
  // first successful bootstrap.
  `INSERT OR IGNORE INTO stats (id, total_users, total_sub_sources, total_raw_sources, updated_at)
   VALUES (1, 0, 0, 0, 0)`,
];

let schemaReadyPromise = null;

// Runs the schema bootstrap at most once per isolate (cached in
// schemaReadyPromise). On failure the cache is cleared so the next call
// retries instead of permanently believing a failed bootstrap succeeded.
export function ensureD1Ready(env) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      for (const stmt of SCHEMA_STATEMENTS) {
        await env.DB.prepare(stmt).run();
      }
    })().catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
}

// ---------------------------------------------------------------------
// AUTH CONFIG (DK-18) — D1-backed fallback for ADMIN_SALT/
// ADMIN_PASSWORD_HASH/JWT_SECRET when a deployment does not have all
// three configured as Cloudflare Secrets. The shared precedence resolver
// (resolveAuthConfig(), below) lives here rather than in src/secrets.js
// because src/jwt.js also needs to resolve JWT_SECRET the same way, and
// src/secrets.js already imports from src/jwt.js — putting the resolver
// in secrets.js would force jwt.js to import it back from there,
// creating a secrets.js <-> jwt.js cycle. d1.js has no dependency on
// either of those files, so both can import the resolver from here
// without one. This file otherwise stays storage-only, same layering as
// every other table here.
// ---------------------------------------------------------------------
export async function getAuthConfigRow(env) {
  return env.DB
    .prepare(`SELECT admin_salt, admin_password_hash, jwt_secret FROM auth_config WHERE id = 1`)
    .first();
}

// Atomically creates the singleton auth_config row from the given
// candidate values IF NO ROW EXISTS YET, then always returns the row that
// actually ended up persisted — which is the caller's own candidate only
// if this call's INSERT is the one that wins the race. Concurrent callers
// must NEVER use their own in-memory candidate directly: only the value
// read back here, after the INSERT, is guaranteed to match what every
// other isolate will also read. This is what makes concurrent first-run
// initialization race-safe (D1/SQLite serializes each statement, so of
// any number of isolates calling this at once, exactly one INSERT
// actually inserts — every other one is a no-op against the row the first
// one created — see docs/problem.md's DK-18 entry for the full reasoning,
// same pattern as ensureD1Migrated()'s migration_flags claim above).
// No retry loop is needed or used: a single INSERT OR IGNORE plus a
// single re-read is sufficient, since D1 requires no compare-and-swap
// retry the way KV would have.
export async function initAuthConfigIfAbsent(env, candidate) {
  await env.DB
    .prepare(
      `INSERT OR IGNORE INTO auth_config (id, admin_salt, admin_password_hash, jwt_secret)
       VALUES (1, ?, ?, ?)`,
    )
    .bind(candidate.adminSalt, candidate.adminPasswordHash, candidate.jwtSecret)
    .run();
  // Always re-read after the INSERT OR IGNORE, regardless of whether this
  // call's own candidate was the one that won — the persisted row is the
  // only value any caller (winner or loser of the race) may use.
  return getAuthConfigRow(env);
}

// Password change for a D1-backed deployment: updates ONLY
// admin_password_hash, leaving admin_salt and jwt_secret untouched — same
// "rotate only the hash" behavior src/secrets.js's Secret-backed
// handleChangePassword() already has today (ADMIN_SALT/JWT_SECRET stay
// fixed across a password change so existing JWT sessions remain valid).
export async function updateAuthConfigPasswordHash(env, adminPasswordHash) {
  await env.DB
    .prepare(`UPDATE auth_config SET admin_password_hash = ? WHERE id = 1`)
    .bind(adminPasswordHash)
    .run();
}

// Shared authentication configuration resolver (DK-18). This is the
// single source of truth for "what salt/hash/JWT secret should this
// request authenticate against", used by BOTH src/secrets.js (login,
// password change, setup) and src/jwt.js (requireAuth's JWT_SECRET) so
// the two never diverge on precedence. See this section's header comment
// for why this lives in d1.js instead of secrets.js.
//
// Precedence:
//   1. All three Cloudflare Secrets present (env.ADMIN_SALT,
//      env.ADMIN_PASSWORD_HASH, env.JWT_SECRET) -> use them as-is,
// source: "secrets". D1's auth_config row is not read or initialized in
//      this case — an existing Secret-backed installation must keep
// working exactly as it does today, untouched by D1.
//   2. Any of the three Secrets missing (including a PARTIAL set — e.g.
//      only ADMIN_SALT set) -> the Secret set as a whole is treated as
//      absent. Partial Secret values are never mixed with D1 values (a
//      half-Secret, half-D1 config would let one field rotate out of
//      sync with the other two with no way to detect it). Resolve
//      entirely from the D1 auth_config row instead, source: "d1".
//   3. No complete Secrets AND no D1 row yet (fresh deployment, setup not
//      run) -> returns null. This function deliberately does NOT
//      generate or persist a row here: it has no admin-supplied password
//      to hash, and fabricating one would let an unrelated caller
//      silently mint credentials nobody knows. Initialization is the
//      setup flow's job (src/secrets.js), via initAuthConfigIfAbsent()
//      above, once it actually has a password to hash. Callers (login,
//      requireAuth) must treat a null return as "authentication is not
//      configured yet" using their own existing error conventions —
//      this storage-layer function returns data, not an HTTP response.
export async function resolveAuthConfig(env) {
  if (env.ADMIN_SALT && env.ADMIN_PASSWORD_HASH && env.JWT_SECRET) {
    return {
      adminSalt: env.ADMIN_SALT,
      adminPasswordHash: env.ADMIN_PASSWORD_HASH,
      jwtSecret: env.JWT_SECRET,
      source: "secrets",
    };
  }

  const row = await getAuthConfigRow(env);
  if (!row) return null; // not configured yet — see precedence case 3 above

  return {
    adminSalt: row.admin_salt,
    adminPasswordHash: row.admin_password_hash,
    jwtSecret: row.jwt_secret,
    source: "d1",
  };
}

// ---------------------------------------------------------------------
// ROW <-> APPLICATION OBJECT MAPPING
// Keeps users.js/nodes.js/merge.js/public-sub.js working with the exact
// same {id, name, enabled, sources/source, nodeIds, createdAt, updatedAt}
// shapes they used against KV — only the storage calls change.
// ---------------------------------------------------------------------
export function rowToUser(row, nodeIds) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled !== 0,
    sources: JSON.parse(row.sources || "[]"),
    nodeIds: nodeIds || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToNode(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    source: JSON.parse(row.source),
    enabled: row.enabled !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------
// USERS — thin SQL wrappers. nodeIds[] is fetched/replaced separately via
// getUserNodeIds()/setUserNodeIds() below (see USER<->NODE RELATIONSHIP).
// ---------------------------------------------------------------------
export async function getUserRowById(env, id) {
  return env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first();
}

export async function listUserRows(env) {
  const { results } = await env.DB
    .prepare(`SELECT * FROM users ORDER BY created_at ASC`)
    .all();
  return results;
}

export async function insertUserRow(env, user) {
  await env.DB
    .prepare(
      `INSERT INTO users (id, name, enabled, sources, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      user.id,
      user.name,
      user.enabled !== false ? 1 : 0,
      JSON.stringify(user.sources || []),
      user.createdAt,
      user.updatedAt,
    )
    .run();
}

// Full-record replace (name, enabled, sources, updated_at) — mirrors the
// old KV pattern of writing the whole user:{uuid} record back on every
// update, since D1's per-statement atomicity makes a partial-field UPDATE
// no safer than a full one here and keeps this wrapper's shape identical
// to insertUserRow() above.
export async function updateUserRow(env, user) {
  await env.DB
    .prepare(
      `UPDATE users SET name = ?, enabled = ?, sources = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(
      user.name,
      user.enabled !== false ? 1 : 0,
      JSON.stringify(user.sources || []),
      user.updatedAt,
      user.id,
    )
    .run();
}

// ON DELETE CASCADE on user_nodes.user_id removes this User's relationship
// rows automatically — no separate cleanup call needed here.
export async function deleteUserRow(env, id) {
  await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();
}

// ---------------------------------------------------------------------
// NODES — thin SQL wrappers. The nodes.name UNIQUE constraint (schema
// above) is what now enforces DK-15's duplicate-name guarantee; callers
// should catch a constraint-violation error from insertNodeRow()/
// renameNodeRow() and translate it to the existing 409 duplicate_name
// response instead of pre-checking with a separate query.
// ---------------------------------------------------------------------
export async function getNodeRowById(env, id) {
  return env.DB.prepare(`SELECT * FROM nodes WHERE id = ?`).bind(id).first();
}

export async function listNodeRows(env) {
  const { results } = await env.DB
    .prepare(`SELECT * FROM nodes ORDER BY created_at ASC`)
    .all();
  return results;
}

export async function insertNodeRow(env, node) {
  await env.DB
    .prepare(
      `INSERT INTO nodes (id, name, source, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      node.id,
      node.name,
      JSON.stringify(node.source),
      node.enabled !== false ? 1 : 0,
      node.createdAt,
      node.updatedAt,
    )
    .run();
}

export async function updateNodeRow(env, node) {
  await env.DB
    .prepare(
      `UPDATE nodes SET name = ?, source = ?, enabled = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(
      node.name,
      JSON.stringify(node.source),
      node.enabled !== false ? 1 : 0,
      node.updatedAt,
      node.id,
    )
    .run();
}

// ON DELETE CASCADE on user_nodes.node_id removes every User's reference
// to this Node automatically — this is what replaces deleteNode()'s old
// per-user cascade loop (and the withUserLock() it needed) entirely.
export async function deleteNodeRow(env, id) {
  await env.DB.prepare(`DELETE FROM nodes WHERE id = ?`).bind(id).run();
}

// ---------------------------------------------------------------------
// USER<->NODE RELATIONSHIP (replaces user.nodeIds[] as a JSON array)
// ---------------------------------------------------------------------
export async function getUserNodeIds(env, userId) {
  const { results } = await env.DB
    .prepare(`SELECT node_id FROM user_nodes WHERE user_id = ? ORDER BY position ASC`)
    .bind(userId)
    .all();
  return results.map((r) => r.node_id);
}

// Replaces the full ordered set for one User as a single atomic batch
// (delete-then-insert) — D1's batch() runs every statement in one
// transaction (all-or-nothing), so no reader ever observes a
// half-replaced relationship. Statements in a batch cannot depend on each
// other's results, which is fine here: every value (userId, nodeIds,
// positions) is already known before the batch is built.
export async function setUserNodeIds(env, userId, nodeIds) {
  const stmts = [
    env.DB.prepare(`DELETE FROM user_nodes WHERE user_id = ?`).bind(userId),
    ...nodeIds.map((nodeId, i) =>
      env.DB
        .prepare(`INSERT INTO user_nodes (user_id, node_id, position) VALUES (?, ?, ?)`)
        .bind(userId, nodeId, i),
    ),
  ];
  await env.DB.batch(stmts);
}

// DK-19: atomic combination of updateUserRow() + setUserNodeIds() for
// updateUser()'s "request supplied nodeIds" branch. Before this helper,
// those were two separate D1 calls — setUserNodeIds() was atomic for its
// own delete+insert, but nothing wrapped it together with the preceding
// User row UPDATE, so a failure between the two calls could leave the
// User row persisted with the new name/enabled/sources/updated_at while
// user_nodes still held the old relationship set. Building one
// env.DB.batch() array containing the User UPDATE followed by the same
// delete-then-insert statements setUserNodeIds() already uses closes that
// gap: D1 runs the whole batch as one all-or-nothing transaction, so both
// halves commit together or neither does. nodeIds must already be the
// validated/deduplicated list (see resolveValidNodeIds() in users.js) —
// this function only persists, it does not validate.
export async function updateUserWithNodes(env, user, nodeIds) {
  const stmts = [
    env.DB
      .prepare(
        `UPDATE users SET name = ?, enabled = ?, sources = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(
        user.name,
        user.enabled !== false ? 1 : 0,
        JSON.stringify(user.sources || []),
        user.updatedAt,
        user.id,
      ),
    env.DB.prepare(`DELETE FROM user_nodes WHERE user_id = ?`).bind(user.id),
    ...nodeIds.map((nodeId, i) =>
      env.DB
        .prepare(`INSERT INTO user_nodes (user_id, node_id, position) VALUES (?, ?, ?)`)
        .bind(user.id, nodeId, i),
    ),
  ];
  await env.DB.batch(stmts);
}

// DK-20: atomic combination of insertUserRow() + setUserNodeIds() for
// createUser()'s initial persistence. Before this helper, those were two
// separate D1 calls (the second only made when nodeIds was non-empty) —
// a failure between them (or the Worker stopping between the two
// `await`s) could leave a durable User row persisted with none of its
// requested user_nodes rows, while the stats/activity calls after them in
// createUser() never ran either, since the throw happened first. Building
// one env.DB.batch() array containing the User INSERT followed by the
// same per-id INSERT INTO user_nodes statements setUserNodeIds() uses
// closes that gap the same way DK-19's updateUserWithNodes() above does:
// D1 runs the whole batch as one all-or-nothing transaction, so the User
// row and its initial relationships commit together or neither does.
// Unlike updateUserWithNodes(), no DELETE FROM user_nodes statement is
// needed here — user.id is freshly generated by createUser(), so no
// pre-existing user_nodes rows can exist for it yet. Called
// unconditionally (nodeIds may be empty), in which case the batch simply
// contains only the User INSERT — an empty nodeIds.map() contributes no
// extra statements, so this is not a special case the caller needs to
// branch on. nodeIds must already be the validated/deduplicated list (see
// resolveValidNodeIds() in users.js) — this function only persists, it
// does not validate.
export async function insertUserWithNodes(env, user, nodeIds) {
  const stmts = [
    env.DB
      .prepare(
        `INSERT INTO users (id, name, enabled, sources, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        user.id,
        user.name,
        user.enabled !== false ? 1 : 0,
        JSON.stringify(user.sources || []),
        user.createdAt,
        user.updatedAt,
      ),
    ...nodeIds.map((nodeId, i) =>
      env.DB
        .prepare(`INSERT INTO user_nodes (user_id, node_id, position) VALUES (?, ?, ?)`)
        .bind(user.id, nodeId, i),
    ),
  ];
  await env.DB.batch(stmts);
}

// ---------------------------------------------------------------------
// STATS — replaces src/kv.js's recomputeStats()/adjustStats(). A plain
// UPDATE ... SET x = x + ? is one atomic SQLite statement, so the DK-10
// lost-update race the old withStatsLock() existed to close cannot occur
// here — no application-level lock is used or needed.
// ---------------------------------------------------------------------
const STATS_COLUMNS = {
  totalUsers: "total_users",
  totalSubSources: "total_sub_sources",
  totalRawSources: "total_raw_sources",
};

export async function getStatsRow(env) {
  const row = await env.DB.prepare(`SELECT * FROM stats WHERE id = 1`).first();
  if (!row)
    return { totalUsers: 0, totalSubSources: 0, totalRawSources: 0, updatedAt: 0 };
  return {
    totalUsers: row.total_users,
    totalSubSources: row.total_sub_sources,
    totalRawSources: row.total_raw_sources,
    updatedAt: row.updated_at,
  };
}

// delta is the same {totalUsers, totalSubSources, totalRawSources}-keyed
// partial object src/kv.js's old adjustStats() accepted. Non-fatal on
// failure, same DK-9 rationale as before: a stats-write failure must not
// turn an already-successful primary User/Node mutation into a 500.
export async function adjustStats(env, delta) {
  try {
    const keys = Object.keys(delta).filter((k) => STATS_COLUMNS[k]);
    if (keys.length === 0) return;
    const sets = keys
      .map((k) => `${STATS_COLUMNS[k]} = MAX(0, ${STATS_COLUMNS[k]} + ?)`)
      .join(", ");
    await env.DB
      .prepare(`UPDATE stats SET ${sets}, updated_at = ? WHERE id = 1`)
      .bind(...keys.map((k) => delta[k]), Date.now())
      .run();
  } catch (err) {
    console.error("adjustStats (D1) failed (non-fatal):", err);
  }
}

// ---------------------------------------------------------------------
// ACTIVITY — replaces src/kv.js's recordActivity(). Same DK-9 non-fatal
// handling; capped at ACTIVITY_CAP rows via an explicit DELETE instead of
// the old array-slice(0, 20).
// ---------------------------------------------------------------------
const ACTIVITY_CAP = 20;

export async function recordActivity(env, message) {
  try {
    await env.DB
      .prepare(`INSERT INTO activity (message, ts) VALUES (?, ?)`)
      .bind(message, Date.now())
      .run();
    await env.DB
      .prepare(
        `DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT ?)`,
      )
      .bind(ACTIVITY_CAP)
      .run();
  } catch (err) {
    console.error("recordActivity (D1) failed (non-fatal):", err);
  }
}

export async function getRecentActivity(env, limit = ACTIVITY_CAP) {
  const { results } = await env.DB
    .prepare(`SELECT message, ts FROM activity ORDER BY id DESC LIMIT ?`)
    .bind(limit)
    .all();
  return results;
}

// ---------------------------------------------------------------------
// LIVE COUNTS (Dashboard) — plain SELECT COUNT(*) queries rather than
// more stats-table columns kept in sync via adjustStats(). The Dashboard
// is a low-traffic, admin-only read, so a live count per request is cheap
// and always exactly correct — no extra write-path bookkeeping (node
// create/delete, user enable/disable) needed to keep a cached counter
// from drifting.
// ---------------------------------------------------------------------
export async function getNodeCount(env) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM nodes`).first();
  return row ? row.c : 0;
}

export async function getActiveUserCount(env) {
  const row = await env.DB
    .prepare(`SELECT COUNT(*) AS c FROM users WHERE enabled = 1`)
    .first();
  return row ? row.c : 0;
}

// ---------------------------------------------------------------------
// USER GROWTH (Dashboard chart) — one row per UTC calendar day holding
// the total user count last recorded that day. Rows are written lazily
// (no cron), so a day nobody touched has no row and getUserGrowth()
// carries the previous value forward. Nothing before the first snapshot
// is invented.
// ---------------------------------------------------------------------
const MS_PER_DAY = 86400000;

function utcDayString(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Non-fatal, same DK-9 rationale as adjustStats(): a failed snapshot must
// not fail the request that triggered it.
export async function recordUserGrowthSnapshot(env, totalUsers) {
  try {
    await env.DB
      .prepare(
        `INSERT INTO user_growth (day, total_users) VALUES (?, ?)
         ON CONFLICT(day) DO UPDATE SET total_users = excluded.total_users`,
      )
      .bind(utcDayString(Date.now()), totalUsers)
      .run();
  } catch (err) {
    console.error("recordUserGrowthSnapshot (D1) failed (non-fatal):", err);
  }
}

// Returns [{ day, totalUsers }] for the last `days` UTC days, oldest
// first. Days before the first known value are omitted (no backfill).
export async function getUserGrowth(env, days = 7) {
  const now = Date.now();
  const dayList = [];
  for (let i = days - 1; i >= 0; i--) {
    dayList.push(utcDayString(now - i * MS_PER_DAY));
  }
  // The newest row before the window seeds the carry-forward value.
  const seedRow = await env.DB
    .prepare(
      `SELECT total_users FROM user_growth WHERE day < ? ORDER BY day DESC LIMIT 1`,
    )
    .bind(dayList[0])
    .first();
  const { results } = await env.DB
    .prepare(
      `SELECT day, total_users FROM user_growth WHERE day >= ? ORDER BY day ASC`,
    )
    .bind(dayList[0])
    .all();
  const byDay = new Map(results.map((r) => [r.day, r.total_users]));
  let last = seedRow ? seedRow.total_users : null;
  const series = [];
  for (const day of dayList) {
    if (byDay.has(day)) last = byDay.get(day);
    if (last !== null) series.push({ day, totalUsers: last });
  }
  return series;
}

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

// ---------------------------------------------------------------------
// LOGIN RATE LIMITING — replaces src/kv.js's checkLoginRateLimit(). Same
// policy as before, preserved exactly:
//   - max 10 attempts per IP
//   - a SLIDING 5-minute window: KV's expirationTtl:300 was refreshed on
//     every successful (allowed) attempt's put(), so window_start here is
//     likewise refreshed to "now" on every allowed attempt, not just the
//     first — a fixed window would let the count reset mid-window and
//     allow more than 10 attempts in some 5-minute spans, which the old
//     KV behavior never did.
//   - a rejected attempt (already at/over the cap within the window) does
//     NOT increment the counter — matches the old `if (current >= 10)
//     return false` short-circuit, which read but never wrote on that
//     branch.
// D1 has no compare-and-swap primitive, so this uses a single atomic
// UPDATE (guarded by a WHERE clause that only matches when the attempt is
// still allowed) followed by checking whether that UPDATE actually
// matched a row — not a separate SELECT-then-UPDATE — so two concurrent
// requests from the same IP cannot both read a stale count and both
// increment past the cap (D1/SQLite serializes each statement).
// ---------------------------------------------------------------------
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10;
const LOGIN_RATE_LIMIT_WINDOW_MS = 1000 * 60 * 5; // 5 minutes, same as the old KV expirationTtl

export async function checkLoginRateLimit(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();

  // Ensure a row exists for this IP without disturbing an existing,
  // still-fresh row (OR IGNORE leaves an existing row untouched).
  await env.DB
    .prepare(`INSERT OR IGNORE INTO login_rate_limit (ip, attempts, window_start) VALUES (?, 0, ?)`)
    .bind(ip, now)
    .run();

  // Atomically increment ONLY when allowed: either the existing window has
  // expired (sliding window resets to attempts=1, window_start=now, same
  // as a fresh IP), or the window is still fresh and attempts < the cap
  // (plain increment, window_start refreshed to "now" — the sliding
  // behavior). If neither condition holds (still-fresh window, already at
  // the cap), the WHERE clause matches no row and this UPDATE is a no-op,
  // mirroring the old code's "read but don't write" rejection path.
  const result = await env.DB
    .prepare(
      `UPDATE login_rate_limit
       SET attempts = CASE WHEN ? - window_start >= ? THEN 1 ELSE attempts + 1 END,
           window_start = ?
       WHERE ip = ? AND (? - window_start >= ? OR attempts < ?)`,
    )
    .bind(now, LOGIN_RATE_LIMIT_WINDOW_MS, now, ip, now, LOGIN_RATE_LIMIT_WINDOW_MS, LOGIN_RATE_LIMIT_MAX_ATTEMPTS)
    .run();

  return result.meta.changes > 0;
}

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
const MIGRATION_NOT_STARTED = 0;
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
