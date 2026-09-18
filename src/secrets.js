// =====================================================================
// VEXA — Secret generation, password rotation, login
// =====================================================================

import { json, safeJson } from "./http.js";
import { deriveKey, timingSafeEqual, randomHex } from "./crypto.js";
import { signJwt } from "./jwt.js";
import {
  checkLoginRateLimit,
  resolveAuthConfig,
  initAuthConfigIfAbsent,
  updateAuthConfigPasswordHash,
} from "./d1.js";

// Required Variables/Secrets for the panel to function at all. ADMIN_SALT
// and ADMIN_PASSWORD_HASH gate login, JWT_SECRET signs/verifies sessions.
//
// This checks Cloudflare Secrets ONLY — it is NOT "is authentication
// configured" in general (a D1-backed deployment can be fully configured
// with zero Secrets bound; see resolveAuthConfig() in d1.js). It stays
// Secret-only because src/router.js's page/route gating already depends
// on exactly this meaning; broadening it here would silently change that
// gating without router.js's own checkpoint having reviewed it (DK-18,
// Task 2B-61 checkpoint 2).
export function secretsConfigured(env) {
  return Boolean(env.ADMIN_SALT && env.ADMIN_PASSWORD_HASH && env.JWT_SECRET);
}

// Rotates the admin password. Behavior depends on which source
// resolveAuthConfig() reports the effective configuration came from:
//   - "secrets": unchanged from before DK-18 — the Worker cannot write
//     its own Cloudflare Secret, so the new hash is returned for the
//     admin to paste into the Dashboard themselves.
//   - "d1": the Worker CAN write D1 itself, so the new hash is persisted
//     directly via updateAuthConfigPasswordHash() and nothing is returned
//     for manual copying. adminSalt and jwtSecret are left untouched in
//     both cases — rotating only the password hash keeps existing JWT
//     sessions valid, same guarantee the Secret-backed path always had.
export async function handleChangePassword(request, env) {
  const config = await resolveAuthConfig(env);
  if (!config) {
    return json({ error: "not_configured" }, 400);
  }

  const body = await safeJson(request);
  const password =
    body && typeof body.password === "string" ? body.password : "";

  const adminPasswordHash = await deriveKey(password, config.adminSalt);

  if (config.source === "d1") {
    await updateAuthConfigPasswordHash(env, adminPasswordHash);
    return json({ persisted: true });
  }

  return json({
    values: {
      ADMIN_PASSWORD_HASH: adminPasswordHash,
    },
  });
}

// Legacy Secret-backed flow, UNCHANGED (DK-18 does not touch this
// function or its call contract): a stateless generator that computes a
// candidate salt/hash/JWT secret and returns them for the admin to paste
// into Cloudflare Dashboard Secrets. src/router.js calls this with just
// `request` (no env) today, for both first-time setup and authenticated
// regeneration — see that file's /api/secret/generate handler.
//
// D1-backed initial setup is intentionally a SEPARATE function
// (handleInitializeD1Auth, below) rather than a branch inside this one:
// overloading this function's behavior on whether a caller happens to
// pass env would make router.js's existing single-argument call site
// silently ambiguous. Keeping them separate leaves this function's
// current contract byte-for-byte intact.
export async function handleGenerateSecrets(request) {
  const body = await safeJson(request);
  const password =
    body && typeof body.password === "string" ? body.password : "";

  const adminSalt = randomHex(16);
  const adminPasswordHash = await deriveKey(password, adminSalt);
  const jwtSecret = randomHex(32);
  return json({
    values: {
      ADMIN_PASSWORD_HASH: adminPasswordHash,
      ADMIN_SALT: adminSalt,
      JWT_SECRET: jwtSecret,
    },
  });
}

// DK-18: D1-backed initial-setup path, used only when a deployment has no
// complete Secret configuration. This is a NEW export — src/router.js
// does not call it yet, since wiring a route to it is a router-gating
// decision that belongs to router.js's own checkpoint (see this task's
// "Important bootstrap constraint" note). It is implemented here now so
// that checkpoint can call it directly once ready, rather than deferring
// the whole D1-setup implementation to that later file.
//
// Never returns adminSalt/adminPasswordHash/jwtSecret: D1 persists them
// itself, so there is nothing for the admin to manually copy into a
// Dashboard Secret the way the legacy Secret-backed flow requires.
export async function handleInitializeD1Auth(request, env) {
  if (secretsConfigured(env)) {
    // Secret-backed deployment already has a complete, authoritative
    // configuration. D1 must never be silently seeded from Secret values
    // (no auto-migration) — see resolveAuthConfig()'s precedence rule.
    return json({ error: "secrets_configured" }, 400);
  }

  const existing = await resolveAuthConfig(env);
  if (existing) {
    // auth_config already initialized. Re-running setup must not
    // silently regenerate salt/JWT secret out from under an existing
    // installation — a real password change goes through
    // handleChangePassword() instead.
    return json({ error: "already_configured" }, 400);
  }

  const body = await safeJson(request);
  const password =
    body && typeof body.password === "string" ? body.password : "";

  const adminSalt = randomHex(16);
  const jwtSecret = randomHex(32);
  const adminPasswordHash = await deriveKey(password, adminSalt);

  // initAuthConfigIfAbsent() re-reads after its atomic INSERT OR IGNORE,
  // so if a concurrent first-setup request won the race instead, this
  // call still returns without error — it just means this candidate
  // wasn't the one persisted. Either way, the persisted configuration
  // (not necessarily this request's own candidate) is what every future
  // login must use, which is exactly what resolveAuthConfig() reads.
  await initAuthConfigIfAbsent(env, { adminSalt, adminPasswordHash, jwtSecret });

  return json({ configured: true });
}

export async function handleLogin(request, env) {
  // Resolves to the Secret-backed configuration if all three Secrets are
  // present, otherwise the persisted D1 configuration, otherwise null.
  // Replaces the old direct secretsConfigured(env) + env.ADMIN_SALT/
  // env.ADMIN_PASSWORD_HASH/env.JWT_SECRET reads so login works
  // identically for either source without duplicating the precedence
  // rule here (see src/d1.js's resolveAuthConfig()).
  const config = await resolveAuthConfig(env);
  if (!config) {
    return json({ error: "not_configured" }, 400);
  }

  const allowed = await checkLoginRateLimit(request, env);
  if (!allowed) return json({ error: "too_many_attempts" }, 429);

  const body = await safeJson(request);
  if (!body || !body.password || typeof body.password !== "string") {
    return json({ error: "password_required" }, 400);
  }

  const computedHash = await deriveKey(body.password, config.adminSalt);
  const valid = timingSafeEqual(computedHash, config.adminPasswordHash);

  if (!valid) return json({ error: "invalid_credentials" }, 401);

  const token = await signJwt({ sub: "admin" }, config.jwtSecret);
  return json({ token });
}
