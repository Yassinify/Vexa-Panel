// =====================================================================
// VEXA — Secret generation, password rotation, login
// =====================================================================

import { json, safeJson } from "./http.js";
import { deriveKey, timingSafeEqual, randomHex } from "./crypto.js";
import { signJwt } from "./jwt.js";
import { checkLoginRateLimit } from "./kv.js";

// Required Variables/Secrets for the panel to function at all. ADMIN_SALT
// and ADMIN_PASSWORD_HASH gate login, JWT_SECRET signs/verifies sessions.
export function secretsConfigured(env) {
  return Boolean(env.ADMIN_SALT && env.ADMIN_PASSWORD_HASH && env.JWT_SECRET);
}

export async function handleChangePassword(request, env) {
  const body = await safeJson(request);
  const password =
    body && typeof body.password === "string" ? body.password : "";
  if (password.length < 8) {
    return json({ error: "password_too_short" }, 400);
  }

  const adminPasswordHash = await deriveKey(password, env.ADMIN_SALT);
  return json({
    values: {
      ADMIN_PASSWORD_HASH: adminPasswordHash,
    },
  });
}

export async function handleGenerateSecrets(request) {
  const body = await safeJson(request);
  const password =
    body && typeof body.password === "string" ? body.password : "";
  if (password.length < 8) {
    return json({ error: "password_too_short" }, 400);
  }

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

export async function handleLogin(request, env) {
  // Nothing to authenticate against yet if the admin secrets haven't been
  // configured — fail deliberately instead of letting deriveKey() below
  // throw on an undefined ADMIN_SALT.
  if (!secretsConfigured(env)) {
    return json({ error: "not_configured" }, 400);
  }

  const allowed = await checkLoginRateLimit(request, env);
  if (!allowed) return json({ error: "too_many_attempts" }, 429);

  const body = await safeJson(request);
  if (!body || !body.password || typeof body.password !== "string") {
    return json({ error: "password_required" }, 400);
  }

  const computedHash = await deriveKey(body.password, env.ADMIN_SALT);
  const valid = timingSafeEqual(computedHash, env.ADMIN_PASSWORD_HASH);

  if (!valid) return json({ error: "invalid_credentials" }, 401);

  const token = await signJwt({ sub: "admin" }, env.JWT_SECRET);
  return json({ token });
}
