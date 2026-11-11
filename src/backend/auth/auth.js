
// ---------------------------------------------------------------------
// AUTH CONFIG (DK-18) — D1-backed fallback for ADMIN_SALT/
// ADMIN_PASSWORD_HASH/JWT_SECRET when a deployment does not have all
// three configured as Cloudflare Secrets. The shared precedence resolver
// (resolveAuthConfig(), below) lives here rather than in src/secrets.js
// because src/jwt.js also needs to resolve JWT_SECRET the same way, and
// src/secrets.js already imports from src/jwt.js — putting the resolver
// in secrets.js would force jwt.js to import it back from there,
// creating a secrets.js <-> jwt.js cycle. This file has no dependency on
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
// for why this lives here instead of secrets.js.
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
