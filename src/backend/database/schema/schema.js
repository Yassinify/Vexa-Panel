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
    updated_at INTEGER NOT NULL,
    edited_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    edited_at INTEGER
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

// Databases created before users.edited_at existed keep their old table, because
// CREATE TABLE IF NOT EXISTS never alters one, so the column is added here when it is
// missing. NULL means the user was never edited.
async function ensureUsersEditedAtColumn(env) {
  const { results } = await env.DB.prepare(`PRAGMA table_info(users)`).all();
  if (results.some((col) => col.name === "edited_at")) return;
  try {
    await env.DB.prepare(`ALTER TABLE users ADD COLUMN edited_at INTEGER`).run();
  } catch (err) {
    // Another isolate may have added it between the check and the ALTER.
    if (!/duplicate column/i.test(String(err && err.message))) throw err;
  }
}

// Same for nodes.edited_at: databases created before it existed get the column added here.
// NULL means the node was never edited.
async function ensureNodesEditedAtColumn(env) {
  const { results } = await env.DB.prepare(`PRAGMA table_info(nodes)`).all();
  if (results.some((col) => col.name === "edited_at")) return;
  try {
    await env.DB.prepare(`ALTER TABLE nodes ADD COLUMN edited_at INTEGER`).run();
  } catch (err) {
    // Another isolate may have added it between the check and the ALTER.
    if (!/duplicate column/i.test(String(err && err.message))) throw err;
  }
}

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
      await ensureUsersEditedAtColumn(env);
      await ensureNodesEditedAtColumn(env);
    })().catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
}
