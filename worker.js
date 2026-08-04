// =====================================================================
// VEXA — VPN Subscription Manager (single-file Cloudflare Worker)
// =====================================================================
//

const VEXA_VERSION = "3.2.1";

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      console.error(err);
      return json({ error: "internal_error" }, 500);
    }
  },
};

// ---------------------------------------------------------------------
// ROUTER
// ---------------------------------------------------------------------
async function route(request, env, ctx) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  if (method === "OPTIONS") {
    return withCors(request, new Response(null, { status: 204 }), env);
  }

  // The KV binding is required for every other feature (sessions, users,
  // profiles, secret generation). If it isn't bound yet, stop here and walk
  // the admin through binding it rather than letting every downstream call
  // fail with an opaque internal_error.
  if (!kvBound(env)) {
    if (pathname === "/api/version") {
      return withCors(request, json({ version: VEXA_VERSION }), env);
    }
    if (pathname.startsWith("/api/") || pathname.startsWith("/sub/")) {
      return withCors(request, json({ error: "kv_not_configured" }, 503), env);
    }
    return htmlResponse(renderKvSetupGuide());
  }

  // Per-user combined subscription link — merges every profile owned by the
  // user into a single output. Checked before the generic /sub/:profileId
  // route below since both share the /sub/ prefix.
  if (pathname.startsWith("/sub/user/") && method === "GET") {
    return handlePublicUserSub(pathname.split("/sub/user/")[1], env, url);
  }

  if (pathname.startsWith("/sub/") && method === "GET") {
    return handlePublicSub(pathname.split("/sub/")[1], env, url);
  }

  // Required Cloudflare Variables/Secrets missing → force the admin through
  // the setup page rather than serving a panel that can't log anyone in.
  if (
    (pathname === "/" ||
      pathname === "/index.html" ||
      pathname === "/login" ||
      pathname === "/panel") &&
    !secretsConfigured(env)
  ) {
    return Response.redirect(`${url.origin}/secret`, 302);
  }

  if (
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/login" ||
    pathname === "/panel"
  ) {
    return htmlResponse(renderApp());
  }

  if ((pathname === "/secret" || pathname === "/secrets") && method === "GET") {
    return htmlResponse(renderSecretPage(secretsConfigured(env)));
  }

  // Dedicated deep link for the panel's Settings → "Change Panel Password"
  // action. Nothing to change if secrets were never generated in the first
  // place, so send the admin through initial setup instead.
  if (pathname === "/change-panel-password" && method === "GET") {
    if (!secretsConfigured(env)) {
      return Response.redirect(`${url.origin}/secret`, 302);
    }
    return htmlResponse(renderChangePanelPasswordPage());
  }

  // Generating new secret values never reads or writes any existing secret
  // (it's a stateless generator — the Worker can't write its own Variables
  // and Secrets at runtime, only the admin can paste these into the
  // Cloudflare dashboard). In setup mode nothing is configured yet, so
  // there's nothing to protect and no admin session could exist. Once
  // secrets ARE configured, regenerating requires a valid admin session so
  // a stranger who finds /secret can't spam-generate values (they still
  // can't apply them, but there's no reason to let them try).
  if (pathname === "/api/secret/generate" && method === "POST") {
    if (secretsConfigured(env)) {
      const authResult = await requireAuth(request, env);
      if (authResult instanceof Response)
        return withCors(request, authResult, env);
    }
    return withCors(request, await handleGenerateSecrets(request), env);
  }

  // Rotates only ADMIN_PASSWORD_HASH, reusing the existing ADMIN_SALT — a
  // day-to-day "change my password" action that doesn't touch JWT_SECRET
  // or force every other secret to be re-pasted into Cloudflare. Requires
  // secrets to already be configured (nothing to rotate otherwise) and a
  // valid admin session.
  if (pathname === "/api/secret/change-password" && method === "POST") {
    if (!secretsConfigured(env)) {
      return withCors(request, json({ error: "not_configured" }, 400), env);
    }
    const authResult = await requireAuth(request, env);
    if (authResult instanceof Response)
      return withCors(request, authResult, env);
    return withCors(request, await handleChangePassword(request, env), env);
  }

  if (pathname === "/api/login" && method === "POST") {
    return withCors(request, await handleLogin(request, env), env);
  }

  // Public and unauthenticated on purpose — a version string isn't
  // sensitive, and this lets the deployed build be checked with curl
  // (or a monitoring probe) without needing to load the UI or log in.
  if (pathname === "/api/version" && method === "GET") {
    return withCors(request, json({ version: VEXA_VERSION }), env);
  }

  if (pathname.startsWith("/api/")) {
    const authResult = await requireAuth(request, env);
    if (authResult instanceof Response)
      return withCors(request, authResult, env);
    return withCors(
      request,
      await handleApi(pathname, method, request, env, authResult),
      env,
    );
  }

  return json({ error: "not_found" }, 404);
}

// Required Variables/Secrets for the panel to function at all. ADMIN_SALT
// and ADMIN_PASSWORD_HASH gate login, JWT_SECRET signs/verifies sessions.
function secretsConfigured(env) {
  return Boolean(env.ADMIN_SALT && env.ADMIN_PASSWORD_HASH && env.JWT_SECRET);
}

// The KV namespace binding (Variable name: STORAGE) that backs every read
// and write in this Worker. Nothing else can run without it.
function kvBound(env) {
  return Boolean(env.STORAGE);
}

// ---------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------
function withCors(request, response, env) {
  const origin = request.headers.get("Origin");
  const selfOrigin = new URL(request.url).origin;
  const headers = new Headers(response.headers);

  // Only echo back the Worker's own origin (the panel serves its own UI),
  // never a wildcard, per the security requirement.
  if (origin && origin === selfOrigin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return new Response(response.body, { status: response.status, headers });
}

// ---------------------------------------------------------------------
// RESPONSE HELPERS
// ---------------------------------------------------------------------
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function htmlResponse(html) {
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// CRYPTO: PBKDF2 password verification
// ---------------------------------------------------------------------
const PBKDF2_ITERATIONS = 100000;

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function deriveKey(password, saltHex) {
  const enc = new TextEncoder();
  const salt = hexToBytes(saltHex);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ---------------------------------------------------------------------
// JWT (manual HMAC-SHA256, no dependencies)
// ---------------------------------------------------------------------
function base64UrlEncode(input) {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function signJwt(payload, secret, expiresInSeconds = 3600 * 48) {
  const header = { alg: "HS256", typ: "JWT" };
  const fullPayload = { ...payload, exp: nowSeconds() + expiresInSeconds };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await hmacKey(secret);
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput),
  );
  const encodedSig = base64UrlEncode(new Uint8Array(sigBuffer));

  return `${signingInput}.${encodedSig}`;
}

async function verifyJwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed_token");
  const [encodedHeader, encodedPayload, encodedSig] = parts;

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(encodedSig),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new Error("bad_signature");

  const payload = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(encodedPayload)),
  );
  if (payload.exp && nowSeconds() > payload.exp) throw new Error("expired");

  return payload;
}

async function requireAuth(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match) return json({ error: "missing_token" }, 401);

  try {
    return await verifyJwt(match[1], env.JWT_SECRET);
  } catch (e) {
    return json({ error: "invalid_token" }, 401);
  }
}

async function subCacheKeyFor(url) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url),
  );
  return `subcache:${bytesToHex(new Uint8Array(digest))}`;
}

const SUB_CACHE_TTL_SECONDS = 60 * 60 * 24 * 14; // keep a fallback copy for 2 weeks
async function checkLoginRateLimit(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `ratelimit:login:${ip}`;
  const current = parseInt((await env.STORAGE.get(key)) || "0", 10);
  if (current >= 10) return false;
  await env.STORAGE.put(key, String(current + 1), { expirationTtl: 300 });
  return true;
}

// ---------------------------------------------------------------------
// SECRET GENERATION (used by GET /secret's UI, via POST /api/secret/generate)
// ---------------------------------------------------------------------
function randomHex(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToHex(bytes);
}

async function handleChangePassword(request, env) {
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

async function handleGenerateSecrets(request) {
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

async function handleLogin(request, env) {
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

// ---------------------------------------------------------------------
// DATA MODEL: Users → Profiles → Sources
//   user:{uuid}              -> {id, name, createdAt, updatedAt}
//   profile:{uuid}           -> {id, userId, name, sources[], createdAt, updatedAt}  (unchanged key shape)
//   idx:users                -> [userId, ...]                    (avoids KV.list() for the users list)
//   idx:userProfiles:{uuid}  -> [profileId, ...]                 (avoids KV.list() per user)
//   meta:stats               -> cached dashboard summary, updated incrementally on writes
//   meta:activity            -> capped (20) recent-activity feed
//   meta:migrated_v2         -> one-time migration flag
// ---------------------------------------------------------------------
async function kvGetJson(env, key, fallback) {
  const raw = await env.STORAGE.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function kvPutJson(env, key, value) {
  await env.STORAGE.put(key, JSON.stringify(value));
}

// Runs once ever (gated by meta:migrated_v2). This is the ONLY place this
// file still does a KV.list() — every request after migration reads the
// idx:* records instead. Pre-existing profiles (no userId) are bucketed
// under one auto-created "Migrated Users" account so nothing disappears.
async function ensureMigrated(env) {
  const flag = await env.STORAGE.get("meta:migrated_v2");
  if (flag) return;

  const list = await env.STORAGE.list({ prefix: "profile:" });
  const existingProfiles = (
    await Promise.all(
      list.keys.map(async (k) => {
        const raw = await env.STORAGE.get(k.name);
        return raw ? JSON.parse(raw) : null;
      }),
    )
  ).filter(Boolean);

  const orphans = existingProfiles.filter((p) => !p.userId);
  let userIds = await kvGetJson(env, "idx:users", []);

  if (orphans.length > 0) {
    const now = Date.now();
    const migratedUser = {
      id: crypto.randomUUID(),
      name: "Migrated Users",
      createdAt: now,
      updatedAt: now,
    };
    await kvPutJson(env, `user:${migratedUser.id}`, migratedUser);
    userIds = [...userIds, migratedUser.id];
    const profileIds = [];
    for (const p of orphans) {
      p.userId = migratedUser.id;
      await env.STORAGE.put(`profile:${p.id}`, JSON.stringify(p));
      profileIds.push(p.id);
    }
    await kvPutJson(env, `idx:userProfiles:${migratedUser.id}`, profileIds);
  }

  await kvPutJson(env, "idx:users", userIds);
  await recomputeStats(env);
  await env.STORAGE.put("meta:migrated_v2", "1");
}

// Full recompute — only used by the migration above. Everyday mutations use
// adjustStats() below instead, so a dashboard load never has to walk every
// profile.
async function recomputeStats(env) {
  const userIds = await kvGetJson(env, "idx:users", []);
  let totalProfiles = 0,
    totalSubSources = 0,
    totalRawSources = 0;
  for (const uid of userIds) {
    const profileIds = await kvGetJson(env, `idx:userProfiles:${uid}`, []);
    totalProfiles += profileIds.length;
    for (const pid of profileIds) {
      const raw = await env.STORAGE.get(`profile:${pid}`);
      if (!raw) continue;
      const p = JSON.parse(raw);
      totalSubSources += p.sources.filter(
        (s) => s.type === "subscription",
      ).length;
      totalRawSources += p.sources.filter(
        (s) => s.type !== "subscription",
      ).length;
    }
  }
  const stats = {
    totalUsers: userIds.length,
    totalProfiles,
    totalSubSources,
    totalRawSources,
    updatedAt: Date.now(),
  };
  await kvPutJson(env, "meta:stats", stats);
  return stats;
}

async function adjustStats(env, delta) {
  const stats = await kvGetJson(env, "meta:stats", {
    totalUsers: 0,
    totalProfiles: 0,
    totalSubSources: 0,
    totalRawSources: 0,
  });
  for (const key of Object.keys(delta))
    stats[key] = Math.max(0, (stats[key] || 0) + delta[key]);
  stats.updatedAt = Date.now();
  await kvPutJson(env, "meta:stats", stats);
  return stats;
}

async function recordActivity(env, message) {
  const activity = await kvGetJson(env, "meta:activity", []);
  activity.unshift({ message, ts: Date.now() });
  await kvPutJson(env, "meta:activity", activity.slice(0, 20));
}

// ---------------------------------------------------------------------
// API ROUTER
// ---------------------------------------------------------------------
async function handleApi(pathname, method, request, env, authPayload) {
  await ensureMigrated(env);

  if (pathname === "/api/stats" && method === "GET") return getStats(env);

  if (pathname === "/api/users" && method === "GET") return listUsers(env);
  if (pathname === "/api/users" && method === "POST")
    return createUser(request, env);

  const userDuplicateMatch = pathname.match(
    /^\/api\/users\/([a-f0-9-]{36})\/duplicate$/,
  );
  if (userDuplicateMatch && method === "POST")
    return duplicateUser(userDuplicateMatch[1], env);

  const userProfilesMatch = pathname.match(
    /^\/api\/users\/([a-f0-9-]{36})\/profiles$/,
  );
  if (userProfilesMatch) {
    const userId = userProfilesMatch[1];
    if (method === "GET") return listProfilesForUser(userId, env);
    if (method === "POST") return createProfile(userId, request, env);
  }

  const userMatch = pathname.match(/^\/api\/users\/([a-f0-9-]{36})$/);
  if (userMatch) {
    const id = userMatch[1];
    if (method === "GET") return getUser(id, env);
    if (method === "PUT") return updateUser(id, request, env);
    if (method === "DELETE") return deleteUser(id, env);
  }

  // Back-compat flat listing across every user — used by merge-preview style
  // tooling, not by the redesigned UI (which always lists profiles scoped
  // to a user via /api/users/:id/profiles).
  if (pathname === "/api/profiles" && method === "GET") {
    return listAllProfiles(env);
  }

  const profileDuplicateMatch = pathname.match(
    /^\/api\/profiles\/([a-f0-9-]{36})\/duplicate$/,
  );
  if (profileDuplicateMatch && method === "POST")
    return duplicateProfile(profileDuplicateMatch[1], env);

  const profileMatch = pathname.match(/^\/api\/profiles\/([a-f0-9-]{36})$/);
  if (profileMatch) {
    const id = profileMatch[1];
    if (method === "GET") return getProfile(id, env);
    if (method === "PUT") return updateProfile(id, request, env);
    if (method === "DELETE") return deleteProfile(id, env);
  }

  if (pathname === "/api/merge-preview" && method === "POST") {
    return mergePreviewHandler(request, env);
  }

  return json({ error: "not_found" }, 404);
}

// ---------------------------------------------------------------------
// USERS CRUD
// ---------------------------------------------------------------------
async function listUsers(env) {
  const userIds = await kvGetJson(env, "idx:users", []);
  const users = await Promise.all(
    userIds.map(async (id) => {
      const raw = await env.STORAGE.get(`user:${id}`);
      if (!raw) return null;
      const user = JSON.parse(raw);
      const profileIds = await kvGetJson(env, `idx:userProfiles:${id}`, []);
      return {
        id: user.id,
        name: user.name,
        enabled: user.enabled !== false,
        profileCount: profileIds.length,
        primaryProfileId: profileIds[0] || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    }),
  );
  return json({ users: users.filter(Boolean) });
}

async function createUser(request, env) {
  const body = await safeJson(request);
  if (!body || !body.name || typeof body.name !== "string") {
    return json({ error: "name_required" }, 400);
  }
  const now = Date.now();
  const user = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
  await kvPutJson(env, `user:${user.id}`, user);
  await kvPutJson(env, `idx:userProfiles:${user.id}`, []);
  const userIds = await kvGetJson(env, "idx:users", []);
  userIds.push(user.id);
  await kvPutJson(env, "idx:users", userIds);
  await adjustStats(env, { totalUsers: 1 });
  await recordActivity(env, `Created user "${user.name}"`);
  return json({ user, profileCount: 0 }, 201);
}

async function getUser(id, env) {
  const raw = await env.STORAGE.get(`user:${id}`);
  if (!raw) return json({ error: "not_found" }, 404);
  const user = JSON.parse(raw);
  user.enabled = user.enabled !== false;
  return json({ user });
}

async function updateUser(id, request, env) {
  const raw = await env.STORAGE.get(`user:${id}`);
  if (!raw) return json({ error: "not_found" }, 404);
  const user = JSON.parse(raw);
  const body = await safeJson(request);
  let toggled = false;
  // Name is locked after creation — intentionally ignore body.name here even
  // if a client sends one, so the name can't be changed via a stale/crafted
  // request either.
  if (
    body &&
    typeof body.enabled === "boolean" &&
    body.enabled !== (user.enabled !== false)
  ) {
    user.enabled = body.enabled;
    toggled = true;
  }
  user.updatedAt = Date.now();
  await kvPutJson(env, `user:${id}`, user);
  if (toggled)
    await recordActivity(
      env,
      `${user.enabled ? "Enabled" : "Disabled"} user "${user.name}"`,
    );
  user.enabled = user.enabled !== false;
  return json({ user });
}

async function deleteUser(id, env) {
  const raw = await env.STORAGE.get(`user:${id}`);
  if (!raw) return json({ error: "not_found" }, 404);
  const user = JSON.parse(raw);
  const profileIds = await kvGetJson(env, `idx:userProfiles:${id}`, []);
  let subCount = 0,
    rawCount = 0;
  for (const pid of profileIds) {
    const pRaw = await env.STORAGE.get(`profile:${pid}`);
    if (pRaw) {
      const p = JSON.parse(pRaw);
      subCount += p.sources.filter((s) => s.type === "subscription").length;
      rawCount += p.sources.filter((s) => s.type !== "subscription").length;
    }
    await env.STORAGE.delete(`profile:${pid}`);
  }
  await env.STORAGE.delete(`idx:userProfiles:${id}`);
  await env.STORAGE.delete(`user:${id}`);
  const userIds = await kvGetJson(env, "idx:users", []);
  await kvPutJson(
    env,
    "idx:users",
    userIds.filter((uid) => uid !== id),
  );
  await adjustStats(env, {
    totalUsers: -1,
    totalProfiles: -profileIds.length,
    totalSubSources: -subCount,
    totalRawSources: -rawCount,
  });
  await recordActivity(
    env,
    `Deleted user "${user.name}" (${profileIds.length} profile(s))`,
  );
  return json({ success: true });
}

async function duplicateUser(id, env) {
  const raw = await env.STORAGE.get(`user:${id}`);
  if (!raw) return json({ error: "not_found" }, 404);
  const source = JSON.parse(raw);
  const now = Date.now();
  const clone = {
    id: crypto.randomUUID(),
    name: `${source.name} (copy)`,
    enabled: source.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };
  await kvPutJson(env, `user:${clone.id}`, clone);

  const profileIds = await kvGetJson(env, `idx:userProfiles:${id}`, []);
  const newProfileIds = [];
  let subCount = 0,
    rawCount = 0;
  for (const pid of profileIds) {
    const pRaw = await env.STORAGE.get(`profile:${pid}`);
    if (!pRaw) continue;
    const p = JSON.parse(pRaw);
    const clonedProfile = {
      ...p,
      id: crypto.randomUUID(),
      userId: clone.id,
      createdAt: now,
      updatedAt: now,
    };
    await env.STORAGE.put(
      `profile:${clonedProfile.id}`,
      JSON.stringify(clonedProfile),
    );
    newProfileIds.push(clonedProfile.id);
    subCount += p.sources.filter((s) => s.type === "subscription").length;
    rawCount += p.sources.filter((s) => s.type !== "subscription").length;
  }
  await kvPutJson(env, `idx:userProfiles:${clone.id}`, newProfileIds);

  const userIds = await kvGetJson(env, "idx:users", []);
  userIds.push(clone.id);
  await kvPutJson(env, "idx:users", userIds);
  await adjustStats(env, {
    totalUsers: 1,
    totalProfiles: newProfileIds.length,
    totalSubSources: subCount,
    totalRawSources: rawCount,
  });
  await recordActivity(env, `Duplicated user "${source.name}"`);
  return json({ user: clone, profileCount: newProfileIds.length }, 201);
}

// ---------------------------------------------------------------------
// PROFILE CRUD (KV: profile:{uuid}, scoped under a user)
// ---------------------------------------------------------------------
function summarizeProfile(p) {
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    subCount: p.sources.filter((s) => s.type === "subscription").length,
    rawCount: p.sources.filter((s) => s.type !== "subscription").length,
    updatedAt: p.updatedAt,
  };
}

async function listProfilesForUser(userId, env) {
  const profileIds = await kvGetJson(env, `idx:userProfiles:${userId}`, []);
  const profiles = await Promise.all(
    profileIds.map(async (id) => {
      const raw = await env.STORAGE.get(`profile:${id}`);
      return raw ? JSON.parse(raw) : null;
    }),
  );
  return json({ profiles: profiles.filter(Boolean).map(summarizeProfile) });
}

async function listAllProfiles(env) {
  const userIds = await kvGetJson(env, "idx:users", []);
  const all = [];
  for (const uid of userIds) {
    const profileIds = await kvGetJson(env, `idx:userProfiles:${uid}`, []);
    for (const pid of profileIds) {
      const raw = await env.STORAGE.get(`profile:${pid}`);
      if (raw) all.push(summarizeProfile(JSON.parse(raw)));
    }
  }
  return json({ profiles: all });
}

function looksLikeXrayJson(str) {
  const looksObj = str.startsWith("{") && str.endsWith("}");
  const looksArr = str.startsWith("[") && str.endsWith("]");
  if (!looksObj && !looksArr) return false;
  try {
    const data = JSON.parse(str);
    if (looksArr) {
      // Array of full client configs (e.g. BPB Panel's multi-config export)
      // or a bare array of outbound objects.
      return (
        Array.isArray(data) &&
        data.length > 0 &&
        data.some(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            (Array.isArray(entry.outbounds) || entry.protocol),
        )
      );
    }
    return Boolean(Array.isArray(data.outbounds) || data.protocol);
  } catch {
    return false;
  }
}

function classifySourceString(str) {
  const rawProtocols = [
    "vless://",
    "vmess://",
    "ss://",
    "trojan://",
    "ssr://",
    "hysteria2://",
    "hy2://",
    "tuic://",
    "hysteria://",
    "wireguard://",
    "socks://",
    "naive+https://",
    "naive+quic://",
  ];
  if (rawProtocols.some((p) => str.startsWith(p)))
    return { type: "raw", value: str };
  if (str.startsWith("http://") || str.startsWith("https://"))
    return { type: "subscription", url: str };
  if (looksLikeXrayJson(str)) return { type: "json", value: str };
  if (/^proxies:\s*(\[\s*\])?\s*$/m.test(str))
    return { type: "yaml", value: str };
  return null;
}

function normalizeSources(sources) {
  if (!Array.isArray(sources)) return { sources: [], invalid: [] };
  const invalid = [];
  const valid = [];
  for (const s of sources) {
    const classified =
      typeof s === "string" ? classifySourceString(s.trim()) : s;
    if (
      !classified ||
      (classified.type === "subscription" ? !classified.url : !classified.value)
    ) {
      if (typeof s === "string" && s.trim())
        invalid.push({ value: s.trim(), reason: "unrecognized_format" });
      continue;
    }
    if (classified.type === "raw") {
      const check = validateNodeUri(classified.value);
      if (!check.valid) {
        invalid.push({ value: classified.value, reason: check.reason });
        continue;
      }
    }
    if (classified.type === "json") {
      const { nodes } = parseXrayJsonSource(classified.value);
      if (nodes.length === 0) {
        invalid.push({
          value: classified.value,
          reason: "no_parseable_outbounds",
        });
        continue;
      }
    }
    if (classified.type === "yaml") {
      const uris = parseClashYamlSource(classified.value);
      if (uris.length === 0) {
        invalid.push({
          value: classified.value,
          reason: "no_parseable_proxies",
        });
        continue;
      }
    }
    valid.push(classified);
  }
  return { sources: valid, invalid };
}

async function createProfile(userId, request, env) {
  const userRaw = await env.STORAGE.get(`user:${userId}`);
  if (!userRaw) return json({ error: "user_not_found" }, 404);

  const body = await safeJson(request);
  if (!body || !body.name || typeof body.name !== "string") {
    return json({ error: "name_required" }, 400);
  }

  const { sources, invalid } = normalizeSources(body.sources);
  const now = Date.now();
  const profile = {
    id: crypto.randomUUID(),
    userId,
    name: body.name.trim(),
    sources,
    createdAt: now,
    updatedAt: now,
  };

  await env.STORAGE.put(`profile:${profile.id}`, JSON.stringify(profile));
  const profileIds = await kvGetJson(env, `idx:userProfiles:${userId}`, []);
  profileIds.push(profile.id);
  await kvPutJson(env, `idx:userProfiles:${userId}`, profileIds);

  const user = JSON.parse(userRaw);
  user.updatedAt = now;
  await kvPutJson(env, `user:${userId}`, user);

  await adjustStats(env, {
    totalProfiles: 1,
    totalSubSources: sources.filter((s) => s.type === "subscription").length,
    totalRawSources: sources.filter((s) => s.type !== "subscription").length,
  });
  await recordActivity(env, `Created profile "${profile.name}"`);

  return json({ profile, invalidSources: invalid }, 201);
}

async function getProfile(id, env) {
  const raw = await env.STORAGE.get(`profile:${id}`);
  if (!raw) return json({ error: "not_found" }, 404);
  return json({ profile: JSON.parse(raw) });
}

async function updateProfile(id, request, env) {
  const existingRaw = await env.STORAGE.get(`profile:${id}`);
  if (!existingRaw) return json({ error: "not_found" }, 404);
  const existing = JSON.parse(existingRaw);
  const beforeSub = existing.sources.filter(
    (s) => s.type === "subscription",
  ).length;
  const beforeRaw = existing.sources.filter(
    (s) => s.type !== "subscription",
  ).length;

  const body = await safeJson(request);
  let invalid = [];
  // Name is locked after creation — intentionally ignore body.name here even
  // if a client sends one, so the name can't be changed via a stale/crafted
  // request either.
  if (body && body.sources) {
    const result = normalizeSources(body.sources);
    existing.sources = result.sources;
    invalid = result.invalid;
  }
  existing.updatedAt = Date.now();

  await env.STORAGE.put(`profile:${id}`, JSON.stringify(existing));

  const afterSub = existing.sources.filter(
    (s) => s.type === "subscription",
  ).length;
  const afterRaw = existing.sources.filter(
    (s) => s.type !== "subscription",
  ).length;
  await adjustStats(env, {
    totalSubSources: afterSub - beforeSub,
    totalRawSources: afterRaw - beforeRaw,
  });
  await recordActivity(env, `Updated profile "${existing.name}"`);

  return json({ profile: existing, invalidSources: invalid });
}

async function deleteProfile(id, env) {
  const existingRaw = await env.STORAGE.get(`profile:${id}`);
  if (!existingRaw) return json({ error: "not_found" }, 404);
  const existing = JSON.parse(existingRaw);
  await env.STORAGE.delete(`profile:${id}`);

  if (existing.userId) {
    const profileIds = await kvGetJson(
      env,
      `idx:userProfiles:${existing.userId}`,
      [],
    );
    await kvPutJson(
      env,
      `idx:userProfiles:${existing.userId}`,
      profileIds.filter((pid) => pid !== id),
    );
  }

  const subCount = existing.sources.filter(
    (s) => s.type === "subscription",
  ).length;
  const rawCount = existing.sources.filter(
    (s) => s.type !== "subscription",
  ).length;
  await adjustStats(env, {
    totalProfiles: -1,
    totalSubSources: -subCount,
    totalRawSources: -rawCount,
  });
  await recordActivity(env, `Deleted profile "${existing.name}"`);

  return json({ success: true });
}

async function duplicateProfile(id, env) {
  const raw = await env.STORAGE.get(`profile:${id}`);
  if (!raw) return json({ error: "not_found" }, 404);
  const source = JSON.parse(raw);
  const now = Date.now();
  const clone = {
    ...source,
    id: crypto.randomUUID(),
    name: `${source.name} (copy)`,
    createdAt: now,
    updatedAt: now,
  };
  await env.STORAGE.put(`profile:${clone.id}`, JSON.stringify(clone));

  if (clone.userId) {
    const profileIds = await kvGetJson(
      env,
      `idx:userProfiles:${clone.userId}`,
      [],
    );
    profileIds.push(clone.id);
    await kvPutJson(env, `idx:userProfiles:${clone.userId}`, profileIds);
  }

  await adjustStats(env, {
    totalProfiles: 1,
    totalSubSources: clone.sources.filter((s) => s.type === "subscription")
      .length,
    totalRawSources: clone.sources.filter((s) => s.type !== "subscription")
      .length,
  });
  await recordActivity(env, `Duplicated profile "${source.name}"`);

  return json({ profile: clone }, 201);
}

async function getStats(env) {
  const stats = await kvGetJson(env, "meta:stats", {
    totalUsers: 0,
    totalProfiles: 0,
    totalSubSources: 0,
    totalRawSources: 0,
  });
  const activity = await kvGetJson(env, "meta:activity", []);
  return json({
    stats,
    activity,
    version: VEXA_VERSION,
  });
}

// ---------------------------------------------------------------------
// PARSING + MERGE LOGIC
// ---------------------------------------------------------------------
function tryBase64Decode(str) {
  try {
    const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(normalized);
    if (/:\/\//.test(bin)) return bin;
    return null;
  } catch {
    return null;
  }
}

async function fetchSubscriptionNodes(url) {
  const resp = await fetch(url, { headers: { "User-Agent": "v2rayNG/1.8.0" } });
  if (!resp.ok) throw new Error(`fetch_failed:${resp.status}`);
  const text = await resp.text();
  const trimmed = text.trim();

  // Some self-hosted panels serve a raw Xray/V2Ray config.json (a single
  // outbound object, a full config, or — e.g. BPB Panel — an array of full
  // configs) at the subscription URL instead of a URI list.
  const looksJsonBody =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
  if (looksJsonBody) {
    const { nodes: jsonNodes } = parseXrayJsonSource(trimmed);
    if (jsonNodes.length > 0) {
      return jsonNodes
        .map((n) => {
          try {
            return generateNodeUri(n);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    }
    // The body is JSON-shaped but yielded no parseable proxy outbounds
    // (invalid/truncated JSON, or an unrecognized outbound shape). Do NOT
    // fall through to the plain-text line splitter below: on pretty-printed
    // JSON, "://" appears inside ordinary property values (DNS server
    // addresses, probe URLs, etc.), so that fallback would silently harvest
    // those as if they were proxy links instead of reporting the failure.
    throw new Error("xray_json_unparseable");
  }

  const decoded = tryBase64Decode(trimmed);
  const body = decoded ?? text;

  // Clash/Mihomo/Stash-format YAML subscription: a "proxies:" list instead
  // of a URI list or Xray JSON. Checked after the base64/JSON branches
  // (this text won't match either) and before line-based URI splitting,
  // since a YAML body has no "://" lines for that fallback to find anyway.
  if (/^proxies:\s*(\[\s*\])?\s*$/m.test(body)) {
    const yamlUris = parseClashYamlSource(body);
    if (yamlUris.length > 0) return yamlUris;
  }

  // Plain-text / base64 line-list subscription: keep only lines that are
  // themselves a proxy link (start with a known scheme), not just any line
  // that happens to contain "://" somewhere in its value — a body that
  // isn't actually a URI list (stray prose, a misformatted JSON fragment,
  // an HTML error page, etc.) could otherwise leak non-link text through.
  const KNOWN_NODE_SCHEMES =
    /^(vless|vmess|ss|ssr|trojan|hysteria2|hy2|tuic|hysteria|wireguard|socks):\/\/|^naive\+(https|quic):\/\//i;
  return body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && KNOWN_NODE_SCHEMES.test(l));
}

function splitOnce(str, sep) {
  const idx = str.indexOf(sep);
  if (idx === -1) return [str, ""];
  return [str.slice(0, idx), str.slice(idx + 1)];
}

// Robust base64 decode: tolerates URL-safe alphabet, stray whitespace/newlines,
// and missing padding (all common in hand-copied or third-party generated links).
function robustAtob(str) {
  let s = str.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return atob(s);
}

// Query params that actually change the transport/identity of a node and so
// must be part of the dedup fingerprint. Two nodes with the same host/uuid
// but different values here (e.g. different SNI, different path, different
// security mode) are different nodes, not duplicates.
const FINGERPRINT_QUERY_KEYS = [
  "security",
  "sni",
  "type",
  "path",
  "host",
  "serviceName",
  "flow",
  "alpn",
  "fp",
  "pbk",
  "sid",
  "headerType",
  "mode",
];

function normalizeQueryForFingerprint(searchStr) {
  if (!searchStr) return "";
  const params = new URLSearchParams(searchStr);
  const pairs = [];
  for (const key of FINGERPRINT_QUERY_KEYS) {
    const val = params.get(key);
    if (val) pairs.push(`${key}=${decodeURIComponent(val).toLowerCase()}`);
  }
  pairs.sort();
  return pairs.join("&");
}

// Normalizes Shadowsocks userinfo to method:password regardless of whether
// the link encoded it as SIP002 (method:password base64'd before '@') or
// left it as plain method:password before '@'.
function normalizeSsUserinfo(creds) {
  if (creds.includes(":")) return creds; // already plain method:password
  try {
    const decoded = robustAtob(creds);
    if (decoded.includes(":")) return decoded;
  } catch {
    // fall through
  }
  return creds;
}

function fingerprintNode(uri) {
  try {
    if (uri.startsWith("vmess://")) {
      const payload = JSON.parse(robustAtob(uri.slice("vmess://".length)));
      // Include network/tls-relevant fields so distinct transport configs
      // pointing at the same host/id aren't collapsed into one node.
      const net = (payload.net || "").toLowerCase();
      const tls = (payload.tls || "").toLowerCase();
      const path = payload.path || "";
      const sni = payload.sni || payload.host || "";
      return `vmess:${payload.add}:${payload.port}:${payload.id}:${net}:${tls}:${path}:${sni}`;
    }
    if (uri.startsWith("vless://") || uri.startsWith("trojan://")) {
      const withoutProto = uri.split("://")[1];
      const beforeHash = withoutProto.split("#")[0];
      const [creds, rest] = splitOnce(beforeHash, "@");
      const [hostPortRaw, search] = splitOnce(rest, "?");
      // A bare "/" (RFC3986 authority terminator) commonly precedes the query
      // string, e.g. "host:443/?security=tls" — strip it before fingerprinting.
      const hostPort = hostPortRaw.split("/")[0];
      const protocol = uri.startsWith("vless://") ? "vless" : "trojan";
      const queryFp = normalizeQueryForFingerprint(search);
      return `${protocol}:${hostPort}:${creds}:${queryFp}`;
    }
    if (uri.startsWith("ss://")) {
      const withoutProto = uri.slice("ss://".length).split("#")[0];
      if (withoutProto.includes("@")) {
        const [creds, rest] = splitOnce(withoutProto, "@");
        const [hostPortRaw, search] = splitOnce(rest, "?");
        const hostPort = hostPortRaw.split("/")[0];
        const normalizedCreds = normalizeSsUserinfo(creds);
        const queryFp = normalizeQueryForFingerprint(search);
        return `ss:${hostPort}:${normalizedCreds}:${queryFp}`;
      }
      // Legacy fully-base64 form: ss://BASE64(method:password@host:port)
      const decoded = robustAtob(withoutProto);
      return `ss:${decoded}`;
    }
    if (uri.startsWith("ssr://")) {
      const decoded = robustAtob(uri.slice("ssr://".length).split("#")[0]);
      return `ssr:${decoded.split("/")[0]}`;
    }
    if (uri.startsWith("hysteria2://") || uri.startsWith("hy2://")) {
      const withoutProto = uri.split("://")[1].split("#")[0];
      const [beforeQueryRaw, search] = splitOnce(withoutProto, "?");
      const beforeQuery = beforeQueryRaw.split("/")[0]; // drop a bare "/" before the query
      const [creds, hostPort] = splitOnce(beforeQuery, "@");
      const queryFp = normalizeQueryForFingerprint(search);
      return `hy2:${hostPort}:${creds}:${queryFp}`;
    }
    if (uri.startsWith("tuic://")) {
      const withoutProto = uri.slice("tuic://".length).split("#")[0];
      const [beforeQueryRaw, search] = splitOnce(withoutProto, "?");
      const beforeQuery = beforeQueryRaw.split("/")[0];
      const [creds, hostPort] = splitOnce(beforeQuery, "@");
      const queryFp = normalizeQueryForFingerprint(search);
      return `tuic:${hostPort}:${creds}:${queryFp}`;
    }
    if (uri.startsWith("hysteria://")) {
      // Hysteria v1 has no userinfo in the authority — auth is a query
      // param ("auth=...") rather than "auth@host" — so the fingerprint
      // is just host:port plus the normalized query (auth included).
      const withoutProto = uri.slice("hysteria://".length).split("#")[0];
      const [hostPort, search] = splitOnce(withoutProto, "?");
      const queryFp = normalizeQueryForFingerprint(search);
      return `hysteria:${hostPort}:${queryFp}`;
    }
    if (uri.startsWith("wireguard://")) {
      const withoutProto = uri.slice("wireguard://".length).split("#")[0];
      const [beforeQueryRaw, search] = splitOnce(withoutProto, "?");
      const beforeQuery = beforeQueryRaw.split("/")[0];
      const hostPort = splitOnce(beforeQuery, "@")[1] || beforeQuery;
      const pubkey = new URLSearchParams(search).get("publickey") || "";
      return `wireguard:${hostPort}:${pubkey}`;
    }
    if (uri.startsWith("socks://")) {
      const withoutProto = uri.slice("socks://".length).split("#")[0];
      const beforeQuery = splitOnce(withoutProto, "?")[0].split("/")[0];
      const [credsRaw, hostPort] = beforeQuery.includes("@")
        ? splitOnce(beforeQuery, "@")
        : ["", beforeQuery];
      const creds = credsRaw ? normalizeSsUserinfo(credsRaw) : "";
      return `socks:${hostPort}:${creds}`;
    }
    if (uri.startsWith("naive+https://") || uri.startsWith("naive+quic://")) {
      const scheme = uri.startsWith("naive+https://") ? "https" : "quic";
      const withoutProto = uri.slice(uri.indexOf("://") + 3).split("#")[0];
      const beforeQuery = splitOnce(withoutProto, "?")[0].split("/")[0];
      const [credsRaw, hostPort] = beforeQuery.includes("@")
        ? splitOnce(beforeQuery, "@")
        : ["", beforeQuery];
      const creds = credsRaw ? decodeURIComponent(credsRaw) : "";
      return `naive:${scheme}:${hostPort}:${creds}`;
    }
    return `raw:${uri}`;
  } catch {
    return `raw:${uri}`;
  }
}

// ---------------------------------------------------------------------
// VALIDATION — shape-check a raw node URI before it's accepted into a
// profile, so malformed entries don't silently reach exported subscriptions
// and break end-client parsers.
// ---------------------------------------------------------------------
function validateNodeUri(uri) {
  try {
    if (uri.startsWith("vmess://")) {
      const payload = JSON.parse(robustAtob(uri.slice("vmess://".length)));
      if (!payload.add || !payload.port || !payload.id) {
        return { valid: false, reason: "vmess_missing_fields" };
      }
      return { valid: true };
    }
    if (uri.startsWith("vless://") || uri.startsWith("trojan://")) {
      const withoutProto = uri.split("://")[1];
      if (!withoutProto || !withoutProto.includes("@")) {
        return { valid: false, reason: "missing_userinfo" };
      }
      const [creds, rest] = splitOnce(withoutProto.split("#")[0], "@");
      // A bare "/" (RFC3986 authority terminator) commonly precedes the query
      // string, e.g. "host:443/?security=tls" — strip it before splitting port.
      const hostPortRaw = splitOnce(rest, "?")[0];
      const [host, port] = splitOnce(hostPortRaw.split("/")[0], ":");
      if (!creds || !host || !port || isNaN(Number(port))) {
        return { valid: false, reason: "malformed_host_port" };
      }
      return { valid: true };
    }
    if (uri.startsWith("ss://")) {
      const withoutProto = uri.slice("ss://".length).split("#")[0];
      if (withoutProto.includes("@")) {
        const [creds, rest] = splitOnce(withoutProto, "@");
        const hostPortRaw2 = splitOnce(rest, "?")[0];
        const [host, port] = splitOnce(hostPortRaw2.split("/")[0], ":");
        if (!creds || !host || !port || isNaN(Number(port))) {
          return { valid: false, reason: "malformed_host_port" };
        }
        return { valid: true };
      }
      const decoded = robustAtob(withoutProto);
      if (!decoded.includes("@") || !decoded.includes(":")) {
        return { valid: false, reason: "malformed_legacy_ss" };
      }
      return { valid: true };
    }
    if (uri.startsWith("ssr://")) {
      const decoded = robustAtob(uri.slice("ssr://".length).split("#")[0]);
      const parts = decoded.split("/")[0].split(":");
      if (parts.length < 6) return { valid: false, reason: "malformed_ssr" };
      return { valid: true };
    }
    if (uri.startsWith("hysteria2://") || uri.startsWith("hy2://")) {
      const withoutProto = uri.split("://")[1].split("#")[0];
      // A bare "/" (or a path) is commonly present before the query string
      // (e.g. "host:443/?sni=..."), since the URI authority component ends
      // at the first "/". Strip it before splitting out the port.
      const beforeQuery = splitOnce(withoutProto, "?")[0].split("/")[0];
      const [creds, hostPort] = splitOnce(beforeQuery, "@");
      const [host, portField] = splitOnce(hostPort, ":");
      // Hysteria2 supports "port hopping": a port range ("1000-2000") or a
      // comma-separated list ("1000,2000,3000") instead of a single port.
      const portOk = portField && /^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(portField);
      if (!creds || !host || !portOk) {
        return { valid: false, reason: "malformed_host_port" };
      }
      return { valid: true };
    }
    if (uri.startsWith("tuic://")) {
      // tuic://uuid:password@host:port?params — same authority shape as
      // vless/trojan (userinfo before "@", host:port after), just with a
      // colon-joined uuid:password pair instead of a single credential.
      const withoutProto = uri.slice("tuic://".length).split("#")[0];
      if (!withoutProto.includes("@")) {
        return { valid: false, reason: "missing_userinfo" };
      }
      const [creds, rest] = splitOnce(withoutProto, "@");
      const hostPortRaw = splitOnce(rest, "?")[0];
      const [host, port] = splitOnce(hostPortRaw.split("/")[0], ":");
      let decodedCreds = "";
      try {
        decodedCreds = decodeURIComponent(creds || "");
      } catch {
        decodedCreds = creds || "";
      }
      if (
        !decodedCreds ||
        !decodedCreds.includes(":") ||
        !host ||
        !port ||
        isNaN(Number(port))
      ) {
        return { valid: false, reason: "malformed_host_port" };
      }
      return { valid: true };
    }
    if (uri.startsWith("hysteria://")) {
      const withoutProto = uri.slice("hysteria://".length).split("#")[0];
      const hostPortRaw = splitOnce(withoutProto, "?")[0];
      const [host, port] = splitOnce(hostPortRaw.split("/")[0], ":");
      if (!host || !port || isNaN(Number(port))) {
        return { valid: false, reason: "malformed_host_port" };
      }
      return { valid: true };
    }
    if (uri.startsWith("wireguard://")) {
      const withoutProto = uri.slice("wireguard://".length).split("#")[0];
      const [beforeQueryRaw, search] = splitOnce(withoutProto, "?");
      const beforeQuery = beforeQueryRaw.split("/")[0];
      const [privKey, hostPort] = splitOnce(beforeQuery, "@");
      const [host, port] = splitOnce(hostPort, ":");
      const params = new URLSearchParams(search);
      if (
        !privKey ||
        !host ||
        !port ||
        isNaN(Number(port)) ||
        !params.get("publickey")
      ) {
        return { valid: false, reason: "malformed_wireguard_link" };
      }
      return { valid: true };
    }
    if (uri.startsWith("socks://")) {
      // socks://[base64(user:pass)@]host:port#remark — auth is optional
      // (many public/self-hosted SOCKS5 proxies are open, no userinfo at all).
      const withoutProto = uri.slice("socks://".length).split("#")[0];
      const beforeQuery = splitOnce(withoutProto, "?")[0].split("/")[0];
      const hostPortRaw = beforeQuery.includes("@")
        ? splitOnce(beforeQuery, "@")[1]
        : beforeQuery;
      const [host, port] = splitOnce(hostPortRaw, ":");
      if (!host || !port || isNaN(Number(port))) {
        return { valid: false, reason: "malformed_host_port" };
      }
      return { valid: true };
    }
    if (uri.startsWith("naive+https://") || uri.startsWith("naive+quic://")) {
      // naive+https://[user:pass@]host:port[?padding=...][#remark] — auth is
      // optional at the URI-shape level (a Caddy forwardproxy server could be
      // configured without basic_auth), matching this file's socks:// stance.
      const withoutProto = uri.slice(uri.indexOf("://") + 3).split("#")[0];
      const beforeQuery = splitOnce(withoutProto, "?")[0].split("/")[0];
      const hostPortRaw = beforeQuery.includes("@")
        ? splitOnce(beforeQuery, "@")[1]
        : beforeQuery;
      const [host, port] = splitOnce(hostPortRaw, ":");
      if (!host || !port || isNaN(Number(port))) {
        return { valid: false, reason: "malformed_host_port" };
      }
      return { valid: true };
    }
    // Unknown scheme handled elsewhere by classifySourceString; if it got
    // this far it's a raw:// fallback we don't validate structurally.
    return { valid: true };
  } catch {
    return { valid: false, reason: "parse_error" };
  }
}

// ---------------------------------------------------------------------
// PARSE / GENERATE — structured round-trip for VLESS/VMess/Trojan/Shadowsocks
// and Hysteria2. parseNodeUri(uri) -> { protocol, ...fields } | null
// generateNodeUri(node) -> canonical uri string
// Used for canonical re-export (cleans up junk params, normalizes casing)
// and as the foundation for JSON/Xray-format import/export.
// ---------------------------------------------------------------------
function parseNodeUri(uri) {
  const check = validateNodeUri(uri);
  if (!check.valid) return null;

  try {
    if (uri.startsWith("vmess://")) {
      const payload = JSON.parse(robustAtob(uri.slice("vmess://".length)));
      return {
        protocol: "vmess",
        address: payload.add,
        port: Number(payload.port),
        id: payload.id,
        alterId: Number(payload.aid || 0),
        network: payload.net || "tcp",
        type: payload.type || "none",
        host: payload.host || "",
        path: payload.path || "",
        tls: payload.tls || "",
        sni: payload.sni || "",
        remark: payload.ps || "",
      };
    }
    if (uri.startsWith("vless://") || uri.startsWith("trojan://")) {
      const protocol = uri.startsWith("vless://") ? "vless" : "trojan";
      const withoutProto = uri.split("://")[1];
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      const [creds, rest] = splitOnce(beforeHash, "@");
      const [hostPortRaw, search] = splitOnce(rest, "?");
      // A bare "/" (RFC3986 authority terminator) commonly precedes the query
      // string, e.g. "host:443/?security=tls" — strip it before splitting port.
      const [host, port] = splitOnce(hostPortRaw.split("/")[0], ":");
      const params = new URLSearchParams(search);
      return {
        protocol,
        address: host,
        port: Number(port),
        id: creds,
        security: params.get("security") || "",
        sni: params.get("sni") || "",
        network: params.get("type") || "tcp",
        path: params.get("path") ? decodeURIComponent(params.get("path")) : "",
        host_header: params.get("host") || "",
        serviceName: params.get("serviceName") || "",
        flow: params.get("flow") || "",
        alpn: params.get("alpn") || "",
        fp: params.get("fp") || "",
        pbk: params.get("pbk") || "",
        sid: params.get("sid") || "",
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("ss://")) {
      const withoutProto = uri.slice("ss://".length);
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      if (beforeHash.includes("@")) {
        const [creds, rest] = splitOnce(beforeHash, "@");
        const [hostPortRaw, search] = splitOnce(rest, "?");
        const [host, port] = splitOnce(hostPortRaw.split("/")[0], ":");
        const normalized = normalizeSsUserinfo(creds);
        const [method, password] = splitOnce(normalized, ":");
        return {
          protocol: "shadowsocks",
          address: host,
          port: Number(port),
          method,
          password,
          plugin: new URLSearchParams(search).get("plugin") || "",
          remark: hash ? decodeURIComponent(hash) : "",
        };
      }
      const decoded = robustAtob(beforeHash);
      const [methodPass, hostPort] = splitOnce(decoded, "@");
      const [method, password] = splitOnce(methodPass, ":");
      const [host, port] = splitOnce(hostPort, ":");
      return {
        protocol: "shadowsocks",
        address: host,
        port: Number(port),
        method,
        password,
        plugin: "",
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("hysteria2://") || uri.startsWith("hy2://")) {
      const withoutProto = uri.split("://")[1];
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      const [beforeQueryRaw, search] = splitOnce(beforeHash, "?");
      const beforeQuery = beforeQueryRaw.split("/")[0]; // drop a bare "/" before the query
      const [auth, hostPort] = splitOnce(beforeQuery, "@");
      // Hysteria2 supports port-hopping ("host:1000-2000" or "host:1000,2000,3000");
      // keep the full port field intact and only split out the host for storage,
      // re-joining on generate rather than assuming a single numeric port.
      const firstColon = hostPort.indexOf(":");
      const host = firstColon === -1 ? hostPort : hostPort.slice(0, firstColon);
      const portField = firstColon === -1 ? "" : hostPort.slice(firstColon + 1);
      const params = new URLSearchParams(search);
      return {
        protocol: "hysteria2",
        address: host,
        portField,
        port: Number(portField.split(/[-,]/)[0]) || 0,
        auth: decodeURIComponent(auth || ""),
        sni: params.get("sni") || params.get("peer") || "",
        insecure: params.get("insecure") === "1",
        obfs: params.get("obfs") || "",
        obfsPassword: params.get("obfs-password") || "",
        pinSHA256: params.get("pinSHA256") || "",
        alpn: params.get("alpn") || "",
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("tuic://")) {
      const withoutProto = uri.slice("tuic://".length);
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      const [creds, rest] = splitOnce(beforeHash, "@");
      const [hostPortRaw, search] = splitOnce(rest, "?");
      const [host, port] = splitOnce(hostPortRaw.split("/")[0], ":");
      const [uuid, password] = splitOnce(decodeURIComponent(creds), ":");
      const params = new URLSearchParams(search);
      return {
        protocol: "tuic",
        address: host,
        port: Number(port),
        uuid,
        password: password || "",
        congestionControl: params.get("congestion_control") || "bbr",
        udpRelayMode: params.get("udp_relay_mode") || "native",
        sni: params.get("sni") || "",
        alpn: params.get("alpn") || "",
        allowInsecure: params.get("allow_insecure") === "1",
        disableSni: params.get("disable_sni") === "1",
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("hysteria://")) {
      const withoutProto = uri.slice("hysteria://".length);
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      const [hostPortRaw, search] = splitOnce(beforeHash, "?");
      const [host, port] = splitOnce(hostPortRaw.split("/")[0], ":");
      const params = new URLSearchParams(search);
      return {
        protocol: "hysteria",
        address: host,
        port: Number(port),
        auth: params.get("auth") || "",
        sni: params.get("peer") || params.get("sni") || "",
        insecure: params.get("insecure") === "1",
        upmbps: params.get("upmbps") || "",
        downmbps: params.get("downmbps") || "",
        obfs: params.get("obfs") || "",
        obfsParam: params.get("obfsParam") || "",
        alpn: params.get("alpn") || "",
        transportProtocol: params.get("protocol") || "udp",
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("wireguard://")) {
      const withoutProto = uri.slice("wireguard://".length);
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      const [privKey, rest] = splitOnce(beforeHash, "@");
      const [hostPort, search] = splitOnce(rest, "?");
      const [host, port] = splitOnce(hostPort, ":");
      const params = new URLSearchParams(search);
      return {
        protocol: "wireguard",
        address: host,
        port: Number(port),
        privateKey: decodeURIComponent(privKey || ""),
        publicKey: params.get("publickey") || "",
        presharedKey: params.get("presharedkey") || "",
        localAddress: params.get("address") || "",
        mtu: params.get("mtu") || "",
        reserved: params.get("reserved") || "",
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("socks://")) {
      const withoutProto = uri.slice("socks://".length);
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      const beforeQuery = splitOnce(beforeHash, "?")[0];
      let username = "",
        password = "",
        hostPort;
      if (beforeQuery.includes("@")) {
        const [credsRaw, rest] = splitOnce(beforeQuery, "@");
        const creds = normalizeSsUserinfo(credsRaw);
        [username, password] = splitOnce(creds, ":");
        hostPort = rest;
      } else {
        hostPort = beforeQuery;
      }
      const [host, port] = splitOnce(hostPort.split("/")[0], ":");
      return {
        protocol: "socks",
        address: host,
        port: Number(port),
        username,
        password,
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("naive+https://") || uri.startsWith("naive+quic://")) {
      const scheme = uri.startsWith("naive+https://") ? "https" : "quic";
      const withoutProto = uri.slice(uri.indexOf("://") + 3);
      const [beforeHash, hash] = splitOnce(withoutProto, "#");
      const [beforeQuery, query] = splitOnce(beforeHash, "?");
      let username = "",
        password = "",
        hostPort;
      if (beforeQuery.includes("@")) {
        const [credsRaw, rest] = splitOnce(beforeQuery, "@");
        const creds = decodeURIComponent(credsRaw);
        [username, password] = splitOnce(creds, ":");
        hostPort = rest;
      } else {
        hostPort = beforeQuery;
      }
      const [host, port] = splitOnce(hostPort.split("/")[0], ":");
      const params = new URLSearchParams(query);
      return {
        protocol: "naiveproxy",
        transport: scheme, // "https" or "quic" — which naive+ variant this is
        address: host,
        port: Number(port),
        username,
        password,
        padding: params.get("padding") || "",
        remark: hash ? decodeURIComponent(hash) : "",
      };
    }
    if (uri.startsWith("ssr://")) {
      const decoded = robustAtob(uri.slice("ssr://".length).split("#")[0]);
      const [mainPart, queryPart] = splitOnce(decoded, "/?");
      const segments = mainPart.split(":");
      if (segments.length < 6) return null;
      const [host, port, protocol, method, obfs, passwordB64] = segments;
      const params = new URLSearchParams(queryPart || "");
      return {
        protocol: "shadowsocksr",
        address: host,
        port: Number(port),
        ssrProtocol: protocol,
        method,
        obfs,
        password: robustAtob(passwordB64),
        obfsParam: params.get("obfsparam")
          ? robustAtob(params.get("obfsparam"))
          : "",
        protoParam: params.get("protoparam")
          ? robustAtob(params.get("protoparam"))
          : "",
        remark: params.get("remarks") ? robustAtob(params.get("remarks")) : "",
      };
    }
    return null; // SSR/etc: not yet supported for structured parse
  } catch {
    return null;
  }
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function generateNodeUri(node) {
  const remarkSuffix = node.remark ? "#" + encodeURIComponent(node.remark) : "";

  if (node.protocol === "vmess") {
    const payload = {
      v: "2",
      ps: node.remark || "",
      add: node.address,
      port: String(node.port),
      id: node.id,
      aid: String(node.alterId || 0),
      net: node.network || "tcp",
      type: node.type || "none",
      host: node.host || "",
      path: node.path || "",
      tls: node.tls || "",
      sni: node.sni || "",
    };
    return "vmess://" + utf8ToBase64(JSON.stringify(payload));
  }

  if (node.protocol === "vless" || node.protocol === "trojan") {
    const params = new URLSearchParams();
    if (node.security) params.set("security", node.security);
    if (node.sni) params.set("sni", node.sni);
    if (node.network && node.network !== "tcp")
      params.set("type", node.network);
    if (node.path) params.set("path", node.path);
    if (node.host_header) params.set("host", node.host_header);
    if (node.serviceName) params.set("serviceName", node.serviceName);
    if (node.flow) params.set("flow", node.flow);
    if (node.alpn) params.set("alpn", node.alpn);
    if (node.fp) params.set("fp", node.fp);
    if (node.pbk) params.set("pbk", node.pbk);
    if (node.sid) params.set("sid", node.sid);
    const qs = params.toString();
    return `${node.protocol}://${node.id}@${node.address}:${node.port}${qs ? "?" + qs : ""}${remarkSuffix}`;
  }

  if (node.protocol === "shadowsocks") {
    // SIP022 (AEAD-2022 ciphers) requires plain "method:password" userinfo —
    // the spec explicitly forbids Base64URL-encoding it, unlike legacy/AEAD
    // Shadowsocks where Base64 is the conventional SIP002 form.
    const is2022 = (node.method || "").startsWith("2022-");
    const userinfo = is2022
      ? `${node.method}:${node.password}`
      : utf8ToBase64(`${node.method}:${node.password}`).replace(/=+$/, "");
    const pluginQs = node.plugin
      ? `?plugin=${encodeURIComponent(node.plugin)}`
      : "";
    return `ss://${userinfo}@${node.address}:${node.port}${pluginQs}${remarkSuffix}`;
  }

  if (node.protocol === "hysteria2") {
    const params = new URLSearchParams();
    if (node.sni) params.set("sni", node.sni);
    if (node.insecure) params.set("insecure", "1");
    if (node.obfs) params.set("obfs", node.obfs);
    if (node.obfsPassword) params.set("obfs-password", node.obfsPassword);
    if (node.pinSHA256) params.set("pinSHA256", node.pinSHA256);
    if (node.alpn) params.set("alpn", node.alpn);
    const qs = params.toString();
    const portField = node.portField || String(node.port);
    return `hysteria2://${encodeURIComponent(node.auth || "")}@${node.address}:${portField}${qs ? "?" + qs : ""}${remarkSuffix}`;
  }

  if (node.protocol === "tuic") {
    const params = new URLSearchParams();
    if (node.congestionControl && node.congestionControl !== "bbr")
      params.set("congestion_control", node.congestionControl);
    if (node.udpRelayMode && node.udpRelayMode !== "native")
      params.set("udp_relay_mode", node.udpRelayMode);
    if (node.sni) params.set("sni", node.sni);
    if (node.alpn) params.set("alpn", node.alpn);
    if (node.allowInsecure) params.set("allow_insecure", "1");
    if (node.disableSni) params.set("disable_sni", "1");
    const qs = params.toString();
    const creds = `${node.uuid}:${node.password || ""}`;
    return `tuic://${encodeURIComponent(creds)}@${node.address}:${node.port}${qs ? "?" + qs : ""}${remarkSuffix}`;
  }

  if (node.protocol === "hysteria") {
    const params = new URLSearchParams();
    if (node.auth) params.set("auth", node.auth);
    if (node.sni) params.set("peer", node.sni);
    if (node.insecure) params.set("insecure", "1");
    if (node.upmbps) params.set("upmbps", node.upmbps);
    if (node.downmbps) params.set("downmbps", node.downmbps);
    if (node.obfs) params.set("obfs", node.obfs);
    if (node.obfsParam) params.set("obfsParam", node.obfsParam);
    if (node.alpn) params.set("alpn", node.alpn);
    if (node.transportProtocol && node.transportProtocol !== "udp")
      params.set("protocol", node.transportProtocol);
    const qs = params.toString();
    return `hysteria://${node.address}:${node.port}${qs ? "?" + qs : ""}${remarkSuffix}`;
  }

  if (node.protocol === "wireguard") {
    const params = new URLSearchParams();
    if (node.publicKey) params.set("publickey", node.publicKey);
    if (node.presharedKey) params.set("presharedkey", node.presharedKey);
    if (node.localAddress) params.set("address", node.localAddress);
    if (node.mtu) params.set("mtu", node.mtu);
    if (node.reserved) params.set("reserved", node.reserved);
    const qs = params.toString();
    return `wireguard://${encodeURIComponent(node.privateKey || "")}@${node.address}:${node.port}${qs ? "?" + qs : ""}${remarkSuffix}`;
  }

  if (node.protocol === "socks") {
    const auth = node.username
      ? `${utf8ToBase64(`${node.username}:${node.password || ""}`).replace(/=+$/, "")}@`
      : "";
    return `socks://${auth}${node.address}:${node.port}${remarkSuffix}`;
  }

  if (node.protocol === "naiveproxy") {
    // NaiveProxy has no official URI spec (klzgrad/naiveproxy#86 was never
    // adopted upstream) — this follows the de facto convention used by
    // NaiveSharp/Qv2ray-plugin-NaiveProxy: plain (non-base64) user:pass
    // userinfo, percent-encoded like vless/trojan rather than base64 like
    // socks. "quic" is naive's alternate QUIC transport variant.
    const scheme = node.transport === "quic" ? "naive+quic" : "naive+https";
    const auth = node.username
      ? `${encodeURIComponent(node.username)}:${encodeURIComponent(node.password || "")}@`
      : "";
    const params = new URLSearchParams();
    if (node.padding) params.set("padding", node.padding);
    const qs = params.toString();
    return `${scheme}://${auth}${node.address}:${node.port}${qs ? "?" + qs : ""}${remarkSuffix}`;
  }

  throw new Error("unsupported_protocol_for_generation");
}

// ---------------------------------------------------------------------
// JSON / V2Ray / XRAY OUTBOUND SUPPORT
// Converts a single Xray/V2Ray-style outbound object (or a full config.json
// containing an "outbounds" array) to/from the same internal node shape used
// by parseNodeUri/generateNodeUri, so JSON sources interoperate with URI
// sources transparently (same fingerprinting, same canonical export).
// Reference shapes (Xray-core, current as of writing):
//   VLESS/VMess: settings.vnext[0].{address,port,users[0]}
//   Trojan/SS:   settings.servers[0].{address,port,password,method}
//   streamSettings.{network,security,tlsSettings,realitySettings,wsSettings,
//                    grpcSettings,tcpSettings,xhttpSettings}
// ---------------------------------------------------------------------
function extractTransportFields(streamSettings) {
  const ss = streamSettings || {};
  const network = ss.network || "tcp";
  let path = "",
    host = "",
    serviceName = "";

  if (network === "ws" && ss.wsSettings) {
    path = ss.wsSettings.path || "";
    host =
      (ss.wsSettings.headers && ss.wsSettings.headers.Host) ||
      ss.wsSettings.host ||
      "";
  } else if (network === "grpc" && ss.grpcSettings) {
    serviceName = ss.grpcSettings.serviceName || "";
  } else if (
    (network === "xhttp" || network === "splithttp") &&
    ss.xhttpSettings
  ) {
    path = ss.xhttpSettings.path || "";
    host = ss.xhttpSettings.host || "";
  } else if (
    network === "tcp" &&
    ss.tcpSettings &&
    ss.tcpSettings.header &&
    ss.tcpSettings.header.type === "http"
  ) {
    const req = ss.tcpSettings.header.request;
    if (req) {
      path = (req.path && req.path[0]) || "";
      host = (req.headers && req.headers.Host && req.headers.Host[0]) || "";
    }
  }

  const security = ss.security || "";
  let sni = "",
    fp = "",
    pbk = "",
    sid = "",
    alpn = "";
  if (security === "tls" && ss.tlsSettings) {
    sni = ss.tlsSettings.serverName || "";
    fp = ss.tlsSettings.fingerprint || "";
    alpn = Array.isArray(ss.tlsSettings.alpn)
      ? ss.tlsSettings.alpn.join(",")
      : ss.tlsSettings.alpn || "";
  } else if (security === "reality" && ss.realitySettings) {
    sni = ss.realitySettings.serverName || "";
    fp = ss.realitySettings.fingerprint || "";
    pbk = ss.realitySettings.publicKey || ss.realitySettings.password || "";
    sid = ss.realitySettings.shortId || "";
  }

  return {
    network,
    path,
    host,
    serviceName,
    security,
    sni,
    fp,
    pbk,
    sid,
    alpn,
  };
}

function buildStreamSettings(node) {
  const streamSettings = { network: node.network || "tcp" };

  if (node.network === "ws") {
    streamSettings.wsSettings = {
      path: node.path || "/",
      headers: node.host_header ? { Host: node.host_header } : {},
    };
  } else if (node.network === "grpc") {
    streamSettings.grpcSettings = { serviceName: node.serviceName || "" };
  } else if (node.network === "xhttp") {
    streamSettings.xhttpSettings = {
      path: node.path || "/",
      host: node.host_header || "",
    };
  }

  if (node.security === "tls") {
    streamSettings.security = "tls";
    streamSettings.tlsSettings = {
      serverName: node.sni || "",
      ...(node.fp ? { fingerprint: node.fp } : {}),
      ...(node.alpn ? { alpn: node.alpn.split(",") } : {}),
    };
  } else if (node.security === "reality") {
    streamSettings.security = "reality";
    streamSettings.realitySettings = {
      serverName: node.sni || "",
      fingerprint: node.fp || "",
      publicKey: node.pbk || "",
      shortId: node.sid || "",
    };
  }

  return streamSettings;
}

// Parses one Xray/V2Ray outbound object into the internal node shape.
// Returns null for protocols/shapes it doesn't recognize (mirrors
// parseNodeUri's behavior for unsupported protocols).
function parseXrayOutbound(outbound) {
  if (!outbound || typeof outbound !== "object") return null;
  const protocol = outbound.protocol;
  const settings = outbound.settings || {};
  const transport = extractTransportFields(outbound.streamSettings);

  try {
    if (protocol === "vless" || protocol === "vmess") {
      // Xray accepts both the verbose vnext[] form and (for single-server
      // cases) a simplified flat form; support both.
      const server = (settings.vnext && settings.vnext[0]) || settings;
      const user = (server.users && server.users[0]) || server;
      if (!server.address || !server.port || !user) return null;

      if (protocol === "vless") {
        if (!user.id) return null;
        return {
          protocol: "vless",
          address: server.address,
          port: Number(server.port),
          id: user.id,
          security: transport.security,
          sni: transport.sni,
          network: transport.network,
          path: transport.path,
          host_header: transport.host,
          serviceName: transport.serviceName,
          flow: user.flow || "",
          alpn: transport.alpn,
          fp: transport.fp,
          pbk: transport.pbk,
          sid: transport.sid,
          remark: outbound.tag || "",
        };
      }

      // vmess
      if (!user.id) return null;
      return {
        protocol: "vmess",
        address: server.address,
        port: Number(server.port),
        id: user.id,
        alterId: Number(user.alterId || 0),
        network: transport.network,
        type: "none",
        host: transport.host,
        path: transport.path,
        tls: transport.security === "tls" ? "tls" : "",
        sni: transport.sni,
        remark: outbound.tag || "",
      };
    }

    if (protocol === "trojan") {
      const server = (settings.servers && settings.servers[0]) || settings;
      if (!server.address || !server.port || !server.password) return null;
      return {
        protocol: "trojan",
        address: server.address,
        port: Number(server.port),
        id: server.password,
        security: transport.security || "tls",
        sni: transport.sni,
        network: transport.network,
        path: transport.path,
        host_header: transport.host,
        serviceName: transport.serviceName,
        flow: "",
        alpn: transport.alpn,
        fp: transport.fp,
        pbk: transport.pbk,
        sid: transport.sid,
        remark: outbound.tag || "",
      };
    }

    if (protocol === "shadowsocks") {
      const server = (settings.servers && settings.servers[0]) || settings;
      if (!server.address || !server.port || !server.password || !server.method)
        return null;
      return {
        protocol: "shadowsocks",
        address: server.address,
        port: Number(server.port),
        method: server.method,
        password: server.password,
        plugin: server.plugin || "",
        remark: outbound.tag || "",
      };
    }

    // V2Fly's separate "shadowsocks2022" protocol name (Xray-core folds 2022
    // ciphers into the unified "shadowsocks" protocol above and is already
    // handled by that branch — this covers the distinct V2Fly-flavored shape:
    // a flat settings object with "psk" instead of "password", plus an
    // optional "ipsk" array for SIP023 multi-user identity PSKs). We map psk
    // -> password so it flows through the same internal node shape and can
    // be re-exported as a normal ss:// SIP002 link; ipsk is preserved on the
    // node (comma-joined) since there's no standardized way to encode a
    // multi-identity PSK chain in a share link — it round-trips through JSON
    // export but is dropped on URI export.
    if (protocol === "shadowsocks2022") {
      if (
        !settings.address ||
        !settings.port ||
        !settings.psk ||
        !settings.method
      )
        return null;
      return {
        protocol: "shadowsocks",
        address: settings.address,
        port: Number(settings.port),
        method: settings.method,
        password: settings.psk,
        plugin: "",
        ipsk: Array.isArray(settings.ipsk) ? settings.ipsk.join(",") : "",
        xrayVariant: "shadowsocks2022",
        remark: outbound.tag || "",
      };
    }

    // Xray-core's native "wireguard" outbound (distinct shape from the URI
    // link above: settings holds the local interface config directly, with
    // one peer in settings.peers[0] — Xray-core doesn't support multiple
    // peers per outbound, so only the first is used).
    if (protocol === "wireguard") {
      const peer = (settings.peers && settings.peers[0]) || {};
      if (!peer.endpoint || !settings.secretKey || !peer.publicKey) return null;
      const [address, portStr] = splitOnce(peer.endpoint, ":");
      if (!address || !portStr) return null;
      return {
        protocol: "wireguard",
        address,
        port: Number(portStr),
        privateKey: settings.secretKey,
        publicKey: peer.publicKey,
        presharedKey: peer.preSharedKey || "",
        localAddress: Array.isArray(settings.address)
          ? settings.address.join(",")
          : settings.address || "",
        mtu: settings.mtu ? String(settings.mtu) : "",
        reserved: Array.isArray(settings.reserved)
          ? settings.reserved.join(",")
          : "",
        allowedIPs: Array.isArray(peer.allowedIPs)
          ? peer.allowedIPs.join(",")
          : "",
        remark: outbound.tag || "",
      };
    }

    if (protocol === "socks") {
      const server = (settings.servers && settings.servers[0]) || settings;
      if (!server.address || !server.port) return null;
      const user = (server.users && server.users[0]) || {};
      return {
        protocol: "socks",
        address: server.address,
        port: Number(server.port),
        username: user.user || "",
        password: user.pass || "",
        remark: outbound.tag || "",
      };
    }

    // Xray-core's native "http" outbound — identical settings shape to
    // "socks" above (servers[0].{address,port,users[0].{user,pass}}).
    // JSON-only, deliberately: unlike socks/wireguard/etc., there's no safe
    // node-link scheme to add for this one — "http://" and "https://" are
    // already committed elsewhere in this file to mean "fetch this as a
    // subscription URL" (see classifySourceString/fetchSubscriptionNodes),
    // checked before any node-scheme detection. Registering "http://" as a
    // proxy-link prefix here would silently break every existing HTTP/HTTPS
    // subscription import instead of adding a feature.
    if (protocol === "http") {
      const server = (settings.servers && settings.servers[0]) || settings;
      if (!server.address || !server.port) return null;
      const user = (server.users && server.users[0]) || {};
      return {
        protocol: "http",
        address: server.address,
        port: Number(server.port),
        username: user.user || "",
        password: user.pass || "",
        remark: outbound.tag || "",
      };
    }

    return null; // protocol not yet supported for JSON import (Step 5 territory)
  } catch {
    return null;
  }
}

// Generates a full Xray outbound object from the internal node shape —
// the inverse of parseXrayOutbound. Throws on unsupported protocols to
// match generateNodeUri's behavior.
function generateXrayOutbound(node) {
  const tag = node.remark || undefined;

  if (node.protocol === "vless") {
    return {
      ...(tag ? { tag } : {}),
      protocol: "vless",
      settings: {
        vnext: [
          {
            address: node.address,
            port: node.port,
            users: [
              {
                id: node.id,
                encryption: "none",
                ...(node.flow ? { flow: node.flow } : {}),
              },
            ],
          },
        ],
      },
      streamSettings: buildStreamSettings(node),
    };
  }

  if (node.protocol === "vmess") {
    return {
      ...(tag ? { tag } : {}),
      protocol: "vmess",
      settings: {
        vnext: [
          {
            address: node.address,
            port: node.port,
            users: [
              { id: node.id, alterId: node.alterId || 0, security: "auto" },
            ],
          },
        ],
      },
      streamSettings: buildStreamSettings({
        ...node,
        security: node.tls === "tls" ? "tls" : "",
        host_header: node.host,
      }),
    };
  }

  if (node.protocol === "trojan") {
    return {
      ...(tag ? { tag } : {}),
      protocol: "trojan",
      settings: {
        servers: [
          { address: node.address, port: node.port, password: node.id },
        ],
      },
      streamSettings: buildStreamSettings({
        ...node,
        security: node.security || "tls",
      }),
    };
  }

  if (node.protocol === "shadowsocks") {
    if (node.xrayVariant === "shadowsocks2022") {
      return {
        ...(tag ? { tag } : {}),
        protocol: "shadowsocks2022",
        settings: {
          address: node.address,
          port: node.port,
          method: node.method,
          psk: node.password,
          ...(node.ipsk ? { ipsk: node.ipsk.split(",") } : {}),
        },
      };
    }
    return {
      ...(tag ? { tag } : {}),
      protocol: "shadowsocks",
      settings: {
        servers: [
          {
            address: node.address,
            port: node.port,
            method: node.method,
            password: node.password,
          },
        ],
      },
    };
  }

  if (node.protocol === "wireguard") {
    return {
      ...(tag ? { tag } : {}),
      protocol: "wireguard",
      settings: {
        secretKey: node.privateKey,
        address: node.localAddress ? node.localAddress.split(",") : [],
        peers: [
          {
            publicKey: node.publicKey,
            endpoint: `${node.address}:${node.port}`,
            ...(node.presharedKey ? { preSharedKey: node.presharedKey } : {}),
            allowedIPs: node.allowedIPs
              ? node.allowedIPs.split(",")
              : ["0.0.0.0/0"],
          },
        ],
        ...(node.mtu ? { mtu: Number(node.mtu) } : {}),
        ...(node.reserved
          ? { reserved: node.reserved.split(",").map(Number) }
          : {}),
      },
    };
  }

  if (node.protocol === "socks") {
    return {
      ...(tag ? { tag } : {}),
      protocol: "socks",
      settings: {
        servers: [
          {
            address: node.address,
            port: node.port,
            ...(node.username
              ? { users: [{ user: node.username, pass: node.password || "" }] }
              : {}),
          },
        ],
      },
    };
  }

  if (node.protocol === "http") {
    return {
      ...(tag ? { tag } : {}),
      protocol: "http",
      settings: {
        servers: [
          {
            address: node.address,
            port: node.port,
            ...(node.username
              ? { users: [{ user: node.username, pass: node.password || "" }] }
              : {}),
          },
        ],
      },
    };
  }

  throw new Error("unsupported_protocol_for_generation");
}

// Pulls the proxy outbounds out of one Xray/V2Ray-shaped object: either a
// full config (with an "outbounds" array) or a single bare outbound object.
// `configRemark` is a full config's own "remarks"/"ps" field — e.g. BPB
// Panel labels each exported config "VLESS - Domain : 443" while its single
// outbound just gets a generic tag like "proxy". The human-meaningful
// config-level label is what a client would actually display, so it takes
// priority over a generic per-outbound tag; a config with several proxy
// outbounds (a "URL test" / best-ping style config bundling multiple
// servers) still gets each outbound's own distinguishing tag appended so
// entries from that config don't all collapse to one identical name.
const GENERIC_TAG_RE = /^(proxy|out|outbound)(-\d+)?$/i;
function extractOutboundsFromConfig(data, configRemark) {
  const outbounds = Array.isArray(data.outbounds)
    ? data.outbounds
    : data.protocol
      ? [data]
      : [];

  const proxyOutbounds = outbounds.filter(
    (ob) => !["freedom", "blackhole", "dns", "loopback"].includes(ob.protocol),
  );
  const multiple = proxyOutbounds.length > 1;

  return proxyOutbounds.map((ob) => {
    if (!configRemark) return ob;
    const tagIsGeneric = !ob.tag || GENERIC_TAG_RE.test(ob.tag);
    if (!tagIsGeneric) return ob; // outbound already has a meaningful tag of its own
    const label =
      multiple && ob.tag ? `${configRemark} (${ob.tag})` : configRemark;
    return { ...ob, tag: label };
  });
}

// Accepts any of:
//   - a single bare outbound object: { protocol, settings, ... }
//   - a full Xray config.json:       { outbounds: [...], ... }
//   - an array of either of the above (e.g. BPB Panel's multi-config export,
//     where each array entry is a complete client config with its own
//     "remarks" label and a single proxy outbound)
// and returns an array of parsed nodes, skipping entries it can't parse
// rather than failing the whole import.
function parseXrayJsonSource(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return { nodes: [], errors: ["invalid_json"] };
  }

  let proxyOutbounds = [];
  if (Array.isArray(data)) {
    for (const entry of data) {
      if (!entry || typeof entry !== "object") continue;
      proxyOutbounds.push(
        ...extractOutboundsFromConfig(entry, entry.remarks || entry.ps),
      );
    }
  } else {
    proxyOutbounds = extractOutboundsFromConfig(data, data.remarks || data.ps);
  }

  const nodes = [];
  const errors = [];
  for (const ob of proxyOutbounds) {
    const parsed = parseXrayOutbound(ob);
    if (parsed) nodes.push(parsed);
    else errors.push(`unparsed_outbound:${ob.protocol || "unknown"}`);
  }
  return { nodes, errors };
}

// ---------------------------------------------------------------------
// CLASH / MIHOMO / STASH YAML SUBSCRIPTION SUPPORT
// Many self-hosted and public subscription servers serve a Clash-format
// YAML config (a top-level "proxies:" list) instead of a URI list or Xray
// JSON. There's no YAML dependency available in a single-file Worker, so
// this is a minimal, dependency-free parser for exactly the subset real
// Clash/Mihomo proxy lists use: a block or flow sequence of maps, each with
// at most one level of nesting (ws-opts/reality-opts/grpc-opts/headers).
// It is NOT a general YAML parser and should not be used as one.
// ---------------------------------------------------------------------
function stripYamlComment(line) {
  let inSingle = false,
    inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "#" && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i);
    }
  }
  return line;
}

function unquoteYamlScalar(raw) {
  let s = raw.trim();
  if (s === "") return "";
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1);
  }
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

function parseYamlFlowMap(str) {
  const inner = str.trim().replace(/^\{/, "").replace(/\}$/, "");
  const obj = {};
  const parts = [];
  let buf = "",
    inS = false,
    inD = false;
  for (const ch of inner) {
    if (ch === "'" && !inD) inS = !inS;
    else if (ch === '"' && !inS) inD = !inD;
    if (ch === "," && !inS && !inD) {
      parts.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  for (const part of parts) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const key = part
      .slice(0, idx)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    obj[key] = unquoteYamlScalar(part.slice(idx + 1));
  }
  return obj;
}

function parseYamlBlockMapLines(lines) {
  const obj = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const indent = line.length - line.trimStart().length;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }
    const key = trimmed
      .slice(0, colonIdx)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    const rest = trimmed.slice(colonIdx + 1).trim();

    if (rest === "" || rest === "|" || rest === ">") {
      const nested = [];
      let j = i + 1;
      while (j < lines.length) {
        const l2 = lines[j];
        if (!l2.trim()) {
          j++;
          continue;
        }
        const indent2 = l2.length - l2.trimStart().length;
        if (indent2 <= indent) break;
        nested.push(l2);
        j++;
      }
      obj[key] = nested.length ? parseYamlBlockMapLines(nested) : "";
      i = j;
    } else if (rest.startsWith("{") && rest.endsWith("}")) {
      obj[key] = parseYamlFlowMap(rest);
      i++;
    } else {
      obj[key] = unquoteYamlScalar(rest);
      i++;
    }
  }
  return obj;
}

// Extracts the top-level "proxies:" block/flow sequence from raw YAML text
// and returns an array of plain JS proxy objects. Returns [] if no such key
// is found — callers treat that as "not a Clash-format subscription".
function parseClashProxiesYaml(yamlText) {
  const rawLines = yamlText.split(/\r?\n/).map(stripYamlComment);

  let start = -1;
  for (let i = 0; i < rawLines.length; i++) {
    if (
      /^proxies:\s*(\[\s*\])?\s*$/.test(rawLines[i]) &&
      !/^\s/.test(rawLines[i])
    ) {
      start = i;
      break;
    }
  }
  if (start === -1) return [];

  const blockLines = [];
  for (let i = start + 1; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.trim() === "") {
      blockLines.push(line);
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent === 0) break;
    blockLines.push(line);
  }

  let baseIndent = null;
  for (const l of blockLines) {
    if (!l.trim()) continue;
    baseIndent = l.length - l.trimStart().length;
    break;
  }
  if (baseIndent === null) return [];

  const items = [];
  let current = null;
  for (const line of blockLines) {
    if (!line.trim()) {
      if (current) current.push(line);
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent === baseIndent && line.trimStart().startsWith("-")) {
      if (current) items.push(current);
      current = [];
      const stripped = line.trimStart();
      const dashLen = stripped.match(/^-\s*/)[0].length;
      const firstContent = stripped.slice(dashLen);
      const dashIndent = baseIndent + dashLen;
      if (firstContent.trim() !== "") {
        current.push(" ".repeat(dashIndent) + firstContent);
      }
    } else if (current) {
      current.push(line);
    }
  }
  if (current) items.push(current);

  const proxies = [];
  for (const itemLines of items) {
    if (itemLines.length === 0) continue;
    const first = itemLines[0].trim();
    if (first.startsWith("{") && first.endsWith("}")) {
      proxies.push(parseYamlFlowMap(first));
    } else {
      proxies.push(parseYamlBlockMapLines(itemLines));
    }
  }
  return proxies;
}

// Converts one parsed Clash/Mihomo proxy object into the same internal node
// shape parseNodeUri/parseXrayOutbound produce, so it flows straight through
// the existing generateNodeUri. Returns null for proxy types not yet
// supported (e.g. clash-only types like socks5/http/snell — Step 5 territory
// for socks5/http; snell has no vexa-side URI format to export to).
function clashProxyToNode(p) {
  if (!p || typeof p !== "object" || !p.type || !p.server || !p.port)
    return null;

  const wsOpts = p["ws-opts"] || {};
  const grpcOpts = p["grpc-opts"] || {};
  const realityOpts = p["reality-opts"] || {};
  const network = p.network || (wsOpts.path || wsOpts.headers ? "ws" : "tcp");
  const wsHost =
    (wsOpts.headers && (wsOpts.headers.Host || wsOpts.headers.host)) || "";
  const isReality = Boolean(realityOpts["public-key"]);
  const isTls = Boolean(p.tls) || isReality;

  try {
    if (p.type === "vless") {
      if (!p.uuid) return null;
      return {
        protocol: "vless",
        address: p.server,
        port: Number(p.port),
        id: p.uuid,
        security: isReality ? "reality" : isTls ? "tls" : "",
        sni: p.servername || p.sni || "",
        network,
        path: wsOpts.path || "",
        host_header: wsHost,
        serviceName: grpcOpts["grpc-service-name"] || "",
        flow: p.flow || "",
        alpn: Array.isArray(p.alpn) ? p.alpn.join(",") : p.alpn || "",
        fp: p["client-fingerprint"] || "",
        pbk: realityOpts["public-key"] || "",
        sid: realityOpts["short-id"] || "",
        remark: p.name || "",
      };
    }

    if (p.type === "vmess") {
      if (!p.uuid) return null;
      return {
        protocol: "vmess",
        address: p.server,
        port: Number(p.port),
        id: p.uuid,
        alterId: Number(p.alterId || 0),
        network,
        type: "none",
        host: wsHost,
        path: wsOpts.path || "",
        tls: isTls ? "tls" : "",
        sni: p.servername || p.sni || "",
        remark: p.name || "",
      };
    }

    if (p.type === "trojan") {
      if (!p.password) return null;
      return {
        protocol: "trojan",
        address: p.server,
        port: Number(p.port),
        id: p.password,
        security: "tls",
        sni: p.sni || p.servername || "",
        network,
        path: wsOpts.path || "",
        host_header: wsHost,
        serviceName: grpcOpts["grpc-service-name"] || "",
        flow: "",
        alpn: Array.isArray(p.alpn) ? p.alpn.join(",") : p.alpn || "",
        fp: p["client-fingerprint"] || "",
        pbk: "",
        sid: "",
        remark: p.name || "",
      };
    }

    if (p.type === "ss") {
      if (!p.cipher || !p.password) return null;
      return {
        protocol: "shadowsocks",
        address: p.server,
        port: Number(p.port),
        method: p.cipher,
        password: String(p.password),
        plugin: p.plugin || "",
        remark: p.name || "",
      };
    }

    return null;
  } catch {
    return null;
  }
}

// Parses a full Clash-format YAML subscription body into canonical node
// URIs, reusing generateNodeUri for the actual serialization. Returns []
// (not an error) when the text has no "proxies:" list, so callers can
// treat that as "not this format" and fall through to other parsers.
function parseClashYamlSource(yamlText) {
  const proxies = parseClashProxiesYaml(yamlText);
  const uris = [];
  for (const p of proxies) {
    const node = clashProxyToNode(p);
    if (!node) continue;
    try {
      uris.push(generateNodeUri(node));
    } catch {
      /* unsupported combo, skip */
    }
  }
  return uris;
}

async function mergeProfileNodes(profile, env) {
  const allNodes = [];
  const errors = [];

  for (const source of profile.sources) {
    if (source.type === "raw") {
      allNodes.push(source.value);
    } else if (source.type === "subscription") {
      const cacheKey = env ? await subCacheKeyFor(source.url) : null;
      try {
        const nodes = await fetchSubscriptionNodes(source.url);
        allNodes.push(...nodes);
        // Remember this successful fetch so a later outage of this same
        // source can fall back to it instead of silently dropping nodes.
        if (cacheKey) {
          try {
            await env.STORAGE.put(
              cacheKey,
              JSON.stringify({ nodes, fetchedAt: Date.now() }),
              {
                expirationTtl: SUB_CACHE_TTL_SECONDS,
              },
            );
          } catch {
            /* cache write failure shouldn't fail the merge itself */
          }
        }
      } catch (e) {
        let usedCache = false;
        let cacheAgeMs = null;
        if (cacheKey) {
          try {
            const cachedRaw = await env.STORAGE.get(cacheKey);
            if (cachedRaw) {
              const cached = JSON.parse(cachedRaw);
              allNodes.push(...cached.nodes);
              usedCache = true;
              cacheAgeMs = Date.now() - cached.fetchedAt;
            }
          } catch {
            /* cache read/parse failure: fall through to reporting the error below */
          }
        }
        errors.push({
          url: source.url,
          error: e.message,
          usedCache,
          cacheAgeMs,
        });
      }
    } else if (source.type === "json") {
      const { nodes: jsonNodes } = parseXrayJsonSource(source.value);
      for (const n of jsonNodes) {
        try {
          allNodes.push(generateNodeUri(n));
        } catch {
          // protocol parsed from JSON but has no URI generator yet (shouldn't
          // happen for vless/vmess/trojan/shadowsocks); skip rather than fail
        }
      }
    } else if (source.type === "yaml") {
      allNodes.push(...parseClashYamlSource(source.value));
    }
  }

  const seen = new Set();
  const deduped = [];
  let duplicateCount = 0;

  for (const node of allNodes) {
    const fp = fingerprintNode(node);
    if (seen.has(fp)) {
      duplicateCount++;
      continue;
    }
    seen.add(fp);
    deduped.push(node);
  }

  return {
    nodes: deduped,
    totalFetched: allNodes.length,
    duplicatesRemoved: duplicateCount,
    sourceErrors: errors,
  };
}

async function mergePreviewHandler(request, env) {
  const body = await safeJson(request);
  if (!body || !body.profileId)
    return json({ error: "profile_id_required" }, 400);

  const raw = await env.STORAGE.get(`profile:${body.profileId}`);
  if (!raw) return json({ error: "not_found" }, 404);

  const profile = JSON.parse(raw);
  const result = await mergeProfileNodes(profile, env);

  return json({
    totalNodes: result.nodes.length,
    totalFetched: result.totalFetched,
    duplicatesRemoved: result.duplicatesRemoved,
    sourceErrors: result.sourceErrors,
    subUrl: `/sub/${profile.id}`,
  });
}

// ---------------------------------------------------------------------
// PUBLIC /sub/:id ROUTE
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// SING-BOX / CLASH OUTPUT — converts our parsed node objects (see
// parseNodeUri above) into sing-box outbound objects / Clash proxy maps.
// Only the protocols listed below can be structurally converted; anything
// else (SSR, WireGuard, TUIC, naive+, plain socks, etc.) is skipped rather
// than guessed at, since a wrong config is worse than a missing node.
// ---------------------------------------------------------------------
function uniqueName(base, used) {
  let name = base && base.trim() ? base.trim() : "node";
  let i = 2;
  while (used.has(name)) {
    name = `${base || "node"} (${i++})`;
  }
  used.add(name);
  return name;
}

function nodeToSingboxOutbound(node, tag) {
  const common = { tag, server: node.address, server_port: node.port };
  switch (node.protocol) {
    case "vmess":
      return {
        ...common,
        type: "vmess",
        uuid: node.id,
        alter_id: node.alterId || 0,
        security: "auto",
        tls:
          node.tls === "tls"
            ? {
                enabled: true,
                server_name: node.sni || node.host || node.address,
              }
            : undefined,
        transport:
          node.network && node.network !== "tcp"
            ? {
                type: node.network === "ws" ? "ws" : node.network,
                path: node.path || "",
                headers: node.host ? { Host: node.host } : undefined,
              }
            : undefined,
      };
    case "vless":
      return {
        ...common,
        type: "vless",
        uuid: node.id,
        flow: node.flow || undefined,
        tls:
          node.security === "tls" || node.security === "reality"
            ? {
                enabled: true,
                server_name: node.sni || node.address,
                reality:
                  node.security === "reality"
                    ? {
                        enabled: true,
                        public_key: node.pbk || "",
                        short_id: node.sid || "",
                      }
                    : undefined,
                utls: node.fp
                  ? { enabled: true, fingerprint: node.fp }
                  : undefined,
              }
            : undefined,
        transport:
          node.network && node.network !== "tcp"
            ? {
                type: node.network === "ws" ? "ws" : node.network,
                path: node.path || "",
                headers: node.host_header
                  ? { Host: node.host_header }
                  : undefined,
                service_name:
                  node.network === "grpc" ? node.serviceName || "" : undefined,
              }
            : undefined,
      };
    case "trojan":
      return {
        ...common,
        type: "trojan",
        password: node.id,
        tls: { enabled: true, server_name: node.sni || node.address },
        transport:
          node.network && node.network !== "tcp"
            ? {
                type: node.network === "ws" ? "ws" : node.network,
                path: node.path || "",
                headers: node.host_header
                  ? { Host: node.host_header }
                  : undefined,
                service_name:
                  node.network === "grpc" ? node.serviceName || "" : undefined,
              }
            : undefined,
      };
    case "shadowsocks":
      return {
        ...common,
        type: "shadowsocks",
        method: node.method,
        password: node.password,
      };
    case "hysteria2":
      return {
        ...common,
        type: "hysteria2",
        password: node.auth || "",
        tls: {
          enabled: true,
          server_name: node.sni || node.address,
          insecure: !!node.insecure,
        },
        obfs: node.obfs
          ? { type: node.obfs, password: node.obfsPassword || "" }
          : undefined,
      };
    case "hysteria":
      return {
        ...common,
        type: "hysteria",
        up_mbps: node.upmbps ? Number(node.upmbps) : undefined,
        down_mbps: node.downmbps ? Number(node.downmbps) : undefined,
        obfs: node.obfs || undefined,
        auth_str: node.auth || undefined,
        tls: {
          enabled: true,
          server_name: node.sni || node.address,
          insecure: !!node.insecure,
        },
      };
    case "tuic":
      return {
        ...common,
        type: "tuic",
        uuid: node.uuid,
        password: node.password || "",
        congestion_control: node.congestionControl || "bbr",
        udp_relay_mode: node.udpRelayMode || "native",
        tls: {
          enabled: true,
          server_name: node.sni || node.address,
          insecure: !!node.allowInsecure,
          disable_sni: !!node.disableSni,
        },
      };
    case "wireguard":
      return {
        ...common,
        type: "wireguard",
        local_address: node.localAddress
          ? node.localAddress
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        private_key: node.privateKey,
        peer_public_key: node.publicKey,
        pre_shared_key: node.presharedKey || undefined,
        mtu: node.mtu ? Number(node.mtu) : undefined,
      };
    default:
      return null;
  }
}

function nodeToClashProxy(node, name) {
  const common = { name, server: node.address, port: node.port };
  switch (node.protocol) {
    case "vmess":
      return {
        ...common,
        type: "vmess",
        uuid: node.id,
        alterId: node.alterId || 0,
        cipher: "auto",
        tls: node.tls === "tls",
        network: node.network || "tcp",
        "ws-opts":
          node.network === "ws"
            ? {
                path: node.path || "",
                headers: node.host ? { Host: node.host } : undefined,
              }
            : undefined,
        servername: node.sni || undefined,
      };
    case "vless":
      return {
        ...common,
        type: "vless",
        uuid: node.id,
        flow: node.flow || undefined,
        tls: node.security === "tls" || node.security === "reality",
        network: node.network || "tcp",
        servername: node.sni || undefined,
        "client-fingerprint": node.fp || undefined,
        "ws-opts":
          node.network === "ws"
            ? {
                path: node.path || "",
                headers: node.host_header
                  ? { Host: node.host_header }
                  : undefined,
              }
            : undefined,
        "grpc-opts":
          node.network === "grpc"
            ? { "grpc-service-name": node.serviceName || "" }
            : undefined,
        "reality-opts":
          node.security === "reality"
            ? { "public-key": node.pbk || "", "short-id": node.sid || "" }
            : undefined,
      };
    case "trojan":
      return {
        ...common,
        type: "trojan",
        password: node.id,
        sni: node.sni || undefined,
        network:
          node.network && node.network !== "tcp" ? node.network : undefined,
        "ws-opts":
          node.network === "ws"
            ? {
                path: node.path || "",
                headers: node.host_header
                  ? { Host: node.host_header }
                  : undefined,
              }
            : undefined,
        "grpc-opts":
          node.network === "grpc"
            ? { "grpc-service-name": node.serviceName || "" }
            : undefined,
      };
    case "shadowsocks":
      return {
        ...common,
        type: "ss",
        cipher: node.method,
        password: node.password,
      };
    case "hysteria2":
      return {
        ...common,
        type: "hysteria2",
        password: node.auth || "",
        sni: node.sni || undefined,
        "skip-cert-verify": !!node.insecure,
        obfs: node.obfs || undefined,
        "obfs-password": node.obfsPassword || undefined,
      };
    case "hysteria":
      return {
        ...common,
        type: "hysteria",
        "auth-str": node.auth || undefined,
        up: node.upmbps || undefined,
        down: node.downmbps || undefined,
        obfs: node.obfs || undefined,
        sni: node.sni || undefined,
        "skip-cert-verify": !!node.insecure,
      };
    case "tuic":
      return {
        ...common,
        type: "tuic",
        uuid: node.uuid,
        password: node.password || "",
        "congestion-controller": node.congestionControl || "bbr",
        "udp-relay-mode": node.udpRelayMode || "native",
        sni: node.sni || undefined,
        "disable-sni": !!node.disableSni,
        "skip-cert-verify": !!node.allowInsecure,
      };
    case "wireguard":
      return {
        ...common,
        type: "wireguard",
        ip: node.localAddress
          ? node.localAddress.split(",")[0].split("/")[0].trim()
          : undefined,
        "private-key": node.privateKey,
        "public-key": node.publicKey,
        "preshared-key": node.presharedKey || undefined,
        mtu: node.mtu ? Number(node.mtu) : undefined,
      };
    case "shadowsocksr":
      return {
        ...common,
        type: "ssr",
        cipher: node.method,
        password: node.password,
        protocol: node.ssrProtocol,
        obfs: node.obfs,
        "protocol-param": node.protoParam || undefined,
        "obfs-param": node.obfsParam || undefined,
      };
    default:
      return null;
  }
}

// Drops any key whose value is undefined so the emitted JSON/YAML is clean
// instead of littered with "key: undefined".
function pruneUndefined(obj) {
  if (Array.isArray(obj)) return obj.map(pruneUndefined);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      out[k] = pruneUndefined(v);
    }
    return out;
  }
  return obj;
}

function buildSingboxConfig(nodes, title) {
  const used = new Set();
  const outbounds = [];
  for (const uri of nodes) {
    const parsed = parseNodeUri(uri);
    if (!parsed) continue;
    const tag = uniqueName(
      parsed.remark || `${parsed.protocol}-${parsed.address}`,
      used,
    );
    const ob = nodeToSingboxOutbound(parsed, tag);
    if (ob) outbounds.push(pruneUndefined(ob));
  }
  const tags = outbounds.map((o) => o.tag);
  const config = {
    log: { level: "info" },
    outbounds: [
      {
        type: "selector",
        tag: title || "select",
        outbounds: ["auto", ...tags],
        default: "auto",
      },
      { type: "urltest", tag: "auto", outbounds: tags },
      ...outbounds,
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" },
    ],
    route: { rules: [], final: title || "select" },
  };
  return { json: JSON.stringify(config, null, 2), count: outbounds.length };
}

// Minimal hand-rolled YAML writer — sufficient for the flat proxy maps and
// small proxy-groups list this config needs, without pulling in a library.
function toYamlValue(v) {
  if (typeof v === "string") {
    return /^[A-Za-z0-9_.\-]+$/.test(v) && v !== "" ? v : JSON.stringify(v);
  }
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return JSON.stringify(v);
}

function proxyToYamlBlock(proxy) {
  const parts = Object.entries(proxy).map(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = Object.entries(v)
        .map(([ik, iv]) => `${ik}: ${toYamlValue(iv)}`)
        .join(", ");
      return `${k}: {${inner}}`;
    }
    return `${k}: ${toYamlValue(v)}`;
  });
  return `  { ${parts.join(", ")} }`;
}

function buildClashConfig(nodes, title) {
  const used = new Set();
  const proxies = [];
  for (const uri of nodes) {
    const parsed = parseNodeUri(uri);
    if (!parsed) continue;
    const name = uniqueName(
      parsed.remark || `${parsed.protocol}-${parsed.address}`,
      used,
    );
    const proxy = nodeToClashProxy(parsed, name);
    if (proxy) proxies.push(pruneUndefined(proxy));
  }
  const names = proxies.map((p) => p.name);
  const lines = [];
  lines.push("port: 7890");
  lines.push("socks-port: 7891");
  lines.push("allow-lan: true");
  lines.push("mode: rule");
  lines.push("log-level: info");
  lines.push("proxies:");
  for (const p of proxies) lines.push(`-${proxyToYamlBlock(p).slice(1)}`);
  lines.push("proxy-groups:");
  lines.push(`  - name: "${title || "PROXY"}"`);
  lines.push("    type: select");
  lines.push(
    `    proxies: [${["AUTO", ...names].map((n) => JSON.stringify(n)).join(", ")}]`,
  );
  lines.push('  - name: "AUTO"');
  lines.push("    type: url-test");
  lines.push(
    `    proxies: [${names.map((n) => JSON.stringify(n)).join(", ")}]`,
  );
  lines.push('    url: "http://www.gstatic.com/generate_204"');
  lines.push("    interval: 300");
  lines.push("rules:");
  lines.push(`  - MATCH,${title || "PROXY"}`);
  return { yaml: lines.join("\n"), count: proxies.length };
}

// Dispatches to base64 (default, unchanged behavior), sing-box, or Clash
// output depending on the ?format= query param. Unknown/missing format
// always falls back to plain base64 so existing links never change.
function buildFormattedSubResponse(nodes, subtitle, url) {
  const format = url ? url.searchParams.get("format") : null;

  if (format === "singbox") {
    const { json } = buildSingboxConfig(nodes, subtitle);
    return new Response(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(subtitle)}.json"`,
        "Profile-Update-Interval": "24",
      },
    });
  }

  if (format === "clash") {
    const { yaml } = buildClashConfig(nodes, subtitle);
    return new Response(yaml, {
      status: 200,
      headers: {
        "Content-Type": "text/yaml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(subtitle)}.yaml"`,
        "Profile-Update-Interval": "24",
      },
    });
  }

  return buildSubResponse(nodes, subtitle, url);
}

// Shared by both the per-profile and per-user public sub routes: applies the
// optional canonical re-serialization, then wraps the node list into the
// same base64 response format subscription clients already expect.
function buildSubResponse(nodes, subtitle, url) {
  const wantsCanonical = url && url.searchParams.get("canonical") === "1";
  const outputNodes = wantsCanonical
    ? nodes.map((n) => {
        const parsed = parseNodeUri(n);
        if (!parsed) return n;
        try {
          return generateNodeUri(parsed);
        } catch {
          return n;
        }
      })
    : nodes;

  const payload = outputNodes.join("\n");
  const base64Payload = btoa(unescape(encodeURIComponent(payload)));
  const encodedTitle = btoa(unescape(encodeURIComponent(subtitle)));

  return new Response(base64Payload, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(subtitle)}"`,
      "Profile-Title": `base64:${encodedTitle}`,
      "Profile-Update-Interval": "24",
      "Subscription-Userinfo": "upload=0; download=0; total=0; expire=0",
    },
  });
}

async function handlePublicSub(id, env, url) {
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const raw = await env.STORAGE.get(`profile:${id}`);
  if (!raw) return new Response("Not found", { status: 404 });

  const profile = JSON.parse(raw);
  const { nodes } = await mergeProfileNodes(profile, env);

  // Optional canonical export: re-serializes each node through parse ->
  // generate for the four core protocols, stripping unrecognized query
  // params and normalizing formatting. Nodes we can't structurally parse
  // (SSR, Hysteria2, etc.) pass through unchanged. Off by default to
  // preserve exact existing behavior for current subscribers.
  return buildFormattedSubResponse(nodes, `Vexa - ${profile.name}`, url);
}

// ---------------------------------------------------------------------
// PUBLIC /sub/user/:id ROUTE — combines every profile owned by a user into
// a single subscription link. This is the link shown next to a user's name
// in the panel; it stays valid as profiles are added, edited, or removed
// under that user, and stops serving nodes the moment the user is disabled.
// ---------------------------------------------------------------------
async function handlePublicUserSub(id, env, url) {
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const userRaw = await env.STORAGE.get(`user:${id}`);
  if (!userRaw) return new Response("Not found", { status: 404 });
  const user = JSON.parse(userRaw);

  // A disabled user's link stops serving nodes immediately, without needing
  // to touch or remember each of their individual profiles.
  if (user.enabled === false) {
    return new Response("Not found", { status: 404 });
  }

  const profileIds = await kvGetJson(env, `idx:userProfiles:${id}`, []);
  const allNodes = [];
  for (const pid of profileIds) {
    const raw = await env.STORAGE.get(`profile:${pid}`);
    if (!raw) continue;
    const profile = JSON.parse(raw);
    const { nodes } = await mergeProfileNodes(profile, env);
    allNodes.push(...nodes);
  }

  // Re-dedupe across profiles, since the same node could appear in more than
  // one of this user's profiles (mergeProfileNodes only dedupes within a
  // single profile).
  const seen = new Set();
  const deduped = [];
  for (const node of allNodes) {
    const fp = fingerprintNode(node);
    if (seen.has(fp)) continue;
    seen.add(fp);
    deduped.push(node);
  }

  return buildFormattedSubResponse(deduped, `Vexa - ${user.name}`, url);
}

// =====================================================================
// FRONTEND (HTML + CSS + client JS, all inline)
// =====================================================================
// ---------------------------------------------------------------------
// /KV SETUP GUIDE — standalone page shown for every route when the KV
// namespace isn't bound yet. Nothing in this Worker (sessions, users,
// profiles, secrets) can function without it, so this takes priority over
// every other page, including the secret setup flow.
// ---------------------------------------------------------------------
function renderKvSetupGuide() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VEXA — KV Namespace Setup Required</title>
<style>${STYLES}</style>
</head>
<body data-theme="dark">
<div class="login-wrap">
  <div class="glass-card login-card" style="max-width:560px;text-align:left;">
    <div style="text-align:center;">
      <div class="logo-glow">🗄️</div>
      <div class="brand">KV Namespace Required</div>
      <div class="brand-sub">This Worker needs a KV namespace bound before it can run</div>
    </div>
    <div class="helper-text" style="margin:16px 0 10px;">Follow these steps in the Cloudflare dashboard:</div>
    <ol style="margin:0 0 18px 18px;padding:0;font-size:13px;color:var(--text-primary);line-height:1.9;">
      <li>Open your Worker in the Cloudflare dashboard.</li>
      <li>Go to <strong>Settings → Bindings</strong>.</li>
      <li>Click <strong>Add binding</strong> and choose <strong>KV Namespace</strong>.</li>
      <li>Set the <strong>Variable name</strong> to exactly <code>STORAGE</code> (all uppercase).</li>
      <li>Select an existing KV namespace, or create a new one right there.</li>
      <li>Click <strong>Save and deploy</strong>.</li>
      <li>Reload this page.</li>
    </ol>
    <button class="btn-primary" style="width:100%;" onclick="location.reload()">I've added it — Reload</button>
  </div>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------
// /secret PAGE — standalone, deliberately independent of the SPA/session
// state below (it has to work with zero configured secrets).
// ---------------------------------------------------------------------
function renderSecretPage(configured) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VEXA — Secret Setup</title>
<style>${STYLES}</style>
</head>
<body data-theme="dark">
<div class="login-wrap">
  <div class="glass-card login-card" style="max-width:520px;text-align:left;">
    <div style="text-align:center;">
      <div class="logo-glow">🔑</div>
      <div class="brand">${configured ? "Admin Secrets" : "VEXA Initial Setup"}</div>
      <div class="brand-sub">${
        configured
          ? "Change your password, or destroy and rotate every secret"
          : "Required Cloudflare Variables and Secrets are missing"
      }</div>
    </div>
    <div id="secretBody"></div>
  </div>
</div>
<script>
const configured = ${configured ? "true" : "false"};
let sessionToken = null;

function fieldsHtml(values) {
  return Object.entries(values).map(([k, v]) => \`
    <div class="field-group">
      <label class="field-label">\${k}</label>
      <input readonly value="\${v}" onclick="this.select()" style="font-family:monospace;font-size:12px;" />
    </div>
  \`).join("");
}

function copyAllText(values) {
  return Object.entries(values).map(([k, v]) => k + "=" + v).join("\\n");
}

// Skeleton placeholders sized like the real field-group/button they stand in
// for, so the layout doesn't jump once the response comes back.
function skeletonFields(n) {
  return Array.from({ length: n }).map(() => \`
    <div class="field-group">
      <div class="skel" style="width:150px;height:10px;margin-bottom:6px;"></div>
      <div class="skel" style="width:100%;height:36px;"></div>
    </div>
  \`).join("");
}

function showSecretSkeleton(fieldCount) {
  document.getElementById("secretBody").innerHTML = \`
    <div class="skel" style="width:180px;height:11px;margin:16px 0 14px;"></div>
    \${skeletonFields(fieldCount)}
    <div class="skel" style="width:100%;height:36px;margin-top:6px;"></div>
  \`;
}

async function generate(password) {
  showSecretSkeleton(3);
  const res = await fetch("/api/secret/generate", {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      sessionToken ? { Authorization: "Bearer " + sessionToken } : {}
    ),
    body: JSON.stringify({ password })
  });
  if (!res.ok) {
    let message = "Could not generate secrets (" + res.status + "). Try again.";
    try {
      const err = await res.json();
      if (err.error === "password_too_short") message = "Password must be at least 8 characters.";
    } catch {}
    document.getElementById("secretBody").innerHTML =
      '<div class="error-text">' + message + '</div>' +
      '<button class="btn-secondary" style="width:100%;margin-top:10px;" id="retryBtn">Back</button>';
    document.getElementById("retryBtn").onclick = configured ? renderChoice : renderPasswordPrompt;
    return;
  }
  const data = await res.json();
  document.getElementById("secretBody").innerHTML = \`
    <div class="helper-text" style="margin:16px 0;">
      Copy these three values now — the plaintext password is not stored anywhere and cannot be
      recovered after you leave this page.
    </div>
    \${fieldsHtml(data.values)}
    <button class="btn-primary" style="width:100%;margin-top:6px;" id="copyAllBtn">Copy All Secrets</button>
    <div class="helper-text" style="margin-top:14px;">
      Paste these into <strong>Cloudflare Dashboard → Workers → Settings → Variables and Secrets</strong>,
      then redeploy / save. Cloudflare defaults each new variable to type <strong>Text</strong> — for
      all three of these, switch the type dropdown to <strong>Secret</strong> before saving, so the
      values are encrypted at rest instead of stored as plain text.
    </div>
    \${configured ? '<div class="error-text" style="margin-top:10px;">Existing sessions, tokens, and subscription links tied to the OLD secrets stop working the moment you save these — only after you update them in Cloudflare.</div>' : ''}
  \`;
  document.getElementById("copyAllBtn").onclick = () => {
    navigator.clipboard.writeText(copyAllText(data.values));
    showToast("Copied — paste into Cloudflare now.");
  };
}

async function changePassword(password) {
  showSecretSkeleton(1);
  const res = await fetch("/api/secret/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + sessionToken },
    body: JSON.stringify({ password })
  });
  if (!res.ok) {
    let message = "Could not change password (" + res.status + "). Try again.";
    try {
      const err = await res.json();
      if (err.error === "password_too_short") message = "Password must be at least 8 characters.";
    } catch {}
    document.getElementById("secretBody").innerHTML =
      '<div class="error-text">' + message + '</div>' +
      '<button class="btn-secondary" style="width:100%;margin-top:10px;" id="retryBtn">Back</button>';
    document.getElementById("retryBtn").onclick = renderChoice;
    return;
  }
  const data = await res.json();
  document.getElementById("secretBody").innerHTML = \`
    <div class="helper-text" style="margin:16px 0;">
      Copy this value now — the plaintext password is not stored anywhere and cannot be
      recovered after you leave this page. ADMIN_SALT and JWT_SECRET are unchanged, so
      existing sessions stay valid — only ADMIN_PASSWORD_HASH needs updating in Cloudflare.
    </div>
    \${fieldsHtml(data.values)}
    <button class="btn-primary" style="width:100%;margin-top:6px;" id="copyAllBtn">Copy Value</button>
    <div class="helper-text" style="margin-top:14px;">
      Paste this into <strong>Cloudflare Dashboard → Workers → Settings → Variables and Secrets</strong>,
      then redeploy / save. Make sure <strong>ADMIN_PASSWORD_HASH</strong>'s type is set to
      <strong>Secret</strong> (not the default Text), so it's encrypted at rest.
    </div>
  \`;
  document.getElementById("copyAllBtn").onclick = () => {
    navigator.clipboard.writeText(copyAllText(data.values));
    showToast("Copied — paste into Cloudflare now.");
  };
}

function showToast(msg) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function renderPasswordPrompt() {
  document.getElementById("secretBody").innerHTML = \`
    <div class="field-group">
      <label class="field-label">Choose Admin Password</label>
      <input type="password" id="newPasswordInput" placeholder="At least 8 characters" />
    </div>
    <div class="helper-text" style="margin-bottom:6px;">
      This is the password you'll log in with — it's never stored in plaintext, only hashed
      into ADMIN_PASSWORD_HASH below.
    </div>
    <button class="btn-primary" style="width:100%;" id="genFromPasswordBtn">Generate Secrets</button>
    <div class="error-text" id="newPasswordError"></div>
  \`;
  const input = document.getElementById("newPasswordInput");
  const submit = () => {
    const password = input.value;
    if (password.length < 8) {
      document.getElementById("newPasswordError").textContent = "Password must be at least 8 characters.";
      return;
    }
    generate(password);
  };
  document.getElementById("genFromPasswordBtn").onclick = submit;
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
  input.focus();
}

function renderSetupMode() {
  renderPasswordPrompt();
}

function renderRegenGate() {
  document.getElementById("secretBody").innerHTML = \`
    <div class="field-group">
      <label class="field-label">Admin Password</label>
      <input type="password" id="gatePassword" placeholder="Enter admin password" />
    </div>
    <button class="btn-secondary" style="width:100%;" id="gateBtn">Continue</button>
    <div class="error-text" id="gateError"></div>
  \`;
  document.getElementById("gateBtn").onclick = async () => {
    const password = document.getElementById("gatePassword").value;
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      document.getElementById("gateError").textContent = "Incorrect password.";
      return;
    }
    const data = await res.json();
    sessionToken = data.token; // kept in memory only, never persisted for this page
    const action = new URLSearchParams(location.search).get("action");
    if (action === "destroy") {
      renderDestroyConfirm();
    } else {
      renderChoice();
    }
  };
  document.getElementById("gatePassword")?.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("gateBtn").click();
  });
}

function renderChoice() {
  document.getElementById("secretBody").innerHTML = \`
    <button class="btn-primary" style="width:100%;" id="choiceChangePassword">Change Password</button>
    <div class="helper-text" style="margin-bottom:16px;">Rotates only ADMIN_PASSWORD_HASH. Sessions and links keep working.</div>
    <button class="btn-danger btn-secondary" style="width:100%;" id="choiceDestroy">Destroy Secrets</button>
    <div class="helper-text">Regenerates ADMIN_SALT, ADMIN_PASSWORD_HASH, and JWT_SECRET. Every session, token, and subscription link tied to the old values stops working.</div>
  \`;
  document.getElementById("choiceChangePassword").onclick = renderChangePasswordPrompt;
  document.getElementById("choiceDestroy").onclick = renderDestroyConfirm;
}

function renderChangePasswordPrompt() {
  document.getElementById("secretBody").innerHTML = \`
    <div class="field-group">
      <label class="field-label">New Admin Password</label>
      <input type="password" id="changePasswordInput" placeholder="At least 8 characters" />
    </div>
    <div class="helper-text" style="margin-bottom:6px;">
      ADMIN_SALT and JWT_SECRET stay the same — only ADMIN_PASSWORD_HASH is recomputed.
    </div>
    <button class="btn-primary" style="width:100%;" id="changePasswordBtn">Change Password</button>
    <div class="error-text" id="changePasswordError"></div>
    <button class="btn-secondary" style="width:100%;margin-top:10px;" id="changePasswordBack">Back</button>
  \`;
  const input = document.getElementById("changePasswordInput");
  const submit = () => {
    const password = input.value;
    if (password.length < 8) {
      document.getElementById("changePasswordError").textContent = "Password must be at least 8 characters.";
      return;
    }
    changePassword(password);
  };
  document.getElementById("changePasswordBtn").onclick = submit;
  document.getElementById("changePasswordBack").onclick = renderChoice;
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
  input.focus();
}

function renderDestroyConfirm() {
  document.getElementById("secretBody").innerHTML = \`
    <div class="error-text" style="margin:14px 0 18px;">
      Destroying will immediately invalidate every existing admin session, every issued
      login token, and every existing subscription link once you save the new values in
      Cloudflare. Users and profiles themselves are NOT deleted, but their old links stop
      resolving until you share the new ones.
    </div>
    <button class="btn-danger btn-secondary" style="width:100%;" id="destroyBtn">Destroy Secrets</button>
    <button class="btn-secondary" style="width:100%;margin-top:10px;" id="destroyBack">Back</button>
  \`;
  document.getElementById("destroyBtn").onclick = renderPasswordPrompt;
  document.getElementById("destroyBack").onclick = renderChoice;
}

if (configured) {
  renderRegenGate();
} else {
  renderSetupMode();
}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------
// /change-panel-password PAGE — standalone deep link reached from the
// panel's Settings menu. Skips straight to the change-password form if a
// still-valid session token is already in localStorage; otherwise asks for
// the current password first, same as the /secret regen gate.
// ---------------------------------------------------------------------
function renderChangePanelPasswordPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VEXA — Change Panel Password</title>
<style>${STYLES}</style>
</head>
<body data-theme="dark">
<div class="login-wrap">
  <div class="glass-card login-card" style="max-width:520px;text-align:left;">
    <div style="text-align:center;">
      <div class="logo-glow">🔑</div>
      <div class="brand">Change Panel Password</div>
      <div class="brand-sub">Rotates only ADMIN_PASSWORD_HASH — sessions and links keep working</div>
    </div>
    <div id="changePwBody"></div>
    <button class="btn-secondary" style="width:100%;margin-top:14px;" onclick="location.href='/panel'">Back to Panel</button>
  </div>
</div>
<script>
let sessionToken = localStorage.getItem("vexa_token");

function fieldsHtml(values) {
  return Object.entries(values).map(([k, v]) => \`
    <div class="field-group">
      <label class="field-label">\${k}</label>
      <input readonly value="\${v}" onclick="this.select()" style="font-family:monospace;font-size:12px;" />
    </div>
  \`).join("");
}

function copyAllText(values) {
  return Object.entries(values).map(([k, v]) => k + "=" + v).join("\\n");
}

function showToast(msg) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function renderGate() {
  sessionToken = null;
  document.getElementById("changePwBody").innerHTML = \`
    <div class="field-group">
      <label class="field-label">Current Admin Password</label>
      <input type="password" id="gatePassword" placeholder="Enter current password" />
    </div>
    <button class="btn-secondary" style="width:100%;" id="gateBtn">Continue</button>
    <div class="error-text" id="gateError"></div>
  \`;
  document.getElementById("gateBtn").onclick = async () => {
    const password = document.getElementById("gatePassword").value;
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      document.getElementById("gateError").textContent = "Incorrect password.";
      return;
    }
    const data = await res.json();
    sessionToken = data.token;
    renderForm();
  };
  document.getElementById("gatePassword")?.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("gateBtn").click();
  });
}

function renderForm() {
  document.getElementById("changePwBody").innerHTML = \`
    <div class="field-group">
      <label class="field-label">New Admin Password</label>
      <input type="password" id="newPw" placeholder="At least 8 characters" />
    </div>
    <button class="btn-primary" style="width:100%;" id="submitBtn">Change Password</button>
    <div class="error-text" id="formError"></div>
  \`;
  const submit = async () => {
    const password = document.getElementById("newPw").value;
    if (password.length < 8) {
      document.getElementById("formError").textContent = "Password must be at least 8 characters.";
      return;
    }
    document.getElementById("changePwBody").innerHTML = '<div class="skel" style="width:100%;height:36px;margin-top:6px;"></div>';
    const res = await fetch("/api/secret/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + sessionToken },
      body: JSON.stringify({ password })
    });
    if (res.status === 401) {
      renderGate();
      return;
    }
    if (!res.ok) {
      renderForm();
      document.getElementById("formError").textContent = "Could not change password. Try again.";
      return;
    }
    const data = await res.json();
    document.getElementById("changePwBody").innerHTML = \`
      <div class="helper-text" style="margin:16px 0;">
        Copy this value now — the plaintext password is not stored anywhere and cannot be
        recovered after you leave this page. ADMIN_SALT and JWT_SECRET are unchanged, so
        existing sessions stay valid.
      </div>
      \${fieldsHtml(data.values)}
      <button class="btn-primary" style="width:100%;margin-top:6px;" id="copyAllBtn">Copy Value</button>
      <div class="helper-text" style="margin-top:14px;">
        In <strong>Cloudflare Dashboard → Workers → Settings → Variables and Secrets</strong>,
        update <strong>ADMIN_PASSWORD_HASH</strong> with this value. Set its type to
        <strong>Secret</strong> (not the default Text), then save and redeploy.
      </div>
    \`;
    document.getElementById("copyAllBtn").onclick = () => {
      navigator.clipboard.writeText(copyAllText(data.values));
      showToast("Copied — paste into Cloudflare now.");
    };
  };
  document.getElementById("submitBtn").onclick = submit;
}

if (sessionToken) {
  renderForm();
} else {
  renderGate();
}
</script>
</body>
</html>`;
}

function renderApp() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VEXA — VPN Panel</title>
<style>${STYLES}</style>
<script>
// Applied before first paint (inline, not deferred with the rest of the
// client script) so there's no flash of the wrong theme.
(function() {
  var stored = localStorage.getItem("vexa_theme");
  var effective = (stored === "light" || stored === "dark")
    ? stored
    : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", effective);
})();
</script>
</head>
<body>
  <div id="app"></div>
  <a class="version-badge" href="https://github.com/Yassinify/Vexa-Panel" target="_blank" rel="noopener noreferrer" title="Open project on GitHub">VEXA v${VEXA_VERSION}</a>
  <script>${QR_LIB}</script>
  <script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}

const STYLES = `
:root {
  /* 4px/8px spacing scale (Carbon-style 2x grid) — layout paddings, gaps,
     and margins below are chosen from this scale rather than ad hoc values,
     so spacing stays consistent across the whole panel. */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
}
:root, [data-theme="dark"] {
  --bg-page: #141414;
  --bg-surface: #1d1e1f;
  --bg-surface-raised: #262727;
  --border: rgba(255,255,255,0.12);
  --accent: #409eff;
  --accent-light: #66b1ff;
  --accent-strong: #3375b9;
  --accent-soft: rgba(64,158,255,0.16);
  --good: #67c23a;
  --good-soft: rgba(103,194,58,0.14);
  --bad: #f56c6c;
  --bad-light: #f78989;
  --bad-soft: rgba(245,108,108,0.14);
  --text-primary: #e5eaf3;
  --text-muted: #a3a6ad;
  --sidebar-bg: #1f2d3d;
  --sidebar-text: #97a8be;
  --sidebar-active-bg: #304156;
  --sidebar-active-text: #ffffff;
  --font-stack: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --mono-stack: 'SF Mono', Consolas, monospace;
}
[data-theme="light"] {
  --bg-page: #f0f2f5;
  --bg-surface: #ffffff;
  --bg-surface-raised: #ffffff;
  --border: #d3d7dd;
  --accent: #409eff;
  --accent-light: #66b1ff;
  --accent-strong: #337ecc;
  --accent-soft: rgba(64,158,255,0.10);
  --good: #67c23a;
  --good-soft: rgba(103,194,58,0.10);
  --bad: #f56c6c;
  --bad-light: #f78989;
  --bad-soft: rgba(245,108,108,0.10);
  --text-primary: #303133;
  --text-muted: #63666d;
  --sidebar-bg: #304156;
  --sidebar-text: #bfcbd9;
  --sidebar-active-bg: #263445;
  --sidebar-active-text: #ffffff;
}
* { box-sizing: border-box; }
html, body { height: 100%; }
html { color-scheme: light dark; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
/* Theme-switch animation — every element that reads a themed CSS variable
   (background, border, text, shadow) cross-fades between light/dark instead
   of snapping. Applied broadly first so it covers cards, tables, modals,
   badges, inputs, etc.; components below that need a different/faster
   transition for their own state (hover fades, switch-knob slides, spinner
   spin) simply redeclare transition and take priority as usual. Disabled
   wholesale by the prefers-reduced-motion rule further down. */
*, *::before, *::after {
  transition: background-color .45s cubic-bezier(.4,0,.2,1), border-color .45s cubic-bezier(.4,0,.2,1), color .45s cubic-bezier(.4,0,.2,1), box-shadow .45s cubic-bezier(.4,0,.2,1), fill .45s cubic-bezier(.4,0,.2,1);
}
body {
  margin: 0; min-height: 100vh; background: var(--bg-page);
  font-family: var(--font-stack); color: var(--text-primary); font-size: clamp(13px, 1.1vw + 11px, 14px);
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  -webkit-tap-highlight-color: transparent; overscroll-behavior-y: none;
}
/* Thin scrollbars on the browsers that support each API — Firefox via the
   standard property, Chrome/Safari/Edge via the older webkit pseudo-element. */
* { scrollbar-width: thin; }
.table-wrap::-webkit-scrollbar, .modal-card::-webkit-scrollbar { height: 6px; width: 6px; }
.table-wrap::-webkit-scrollbar-thumb, .modal-card::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
a { color: inherit; }
.card {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 12px;
}
.btn-primary {
  background: var(--accent); border: 1px solid var(--accent); color: #fff; padding: 8px 15px; border-radius: 4px;
  font-weight: 500; cursor: pointer; font-size: 13px; line-height: 1.4; transition: background .1s, border-color .1s;
}
.btn-primary:hover { background: var(--accent-light); border-color: var(--accent-light); }
.btn-primary:active { background: var(--accent-strong); border-color: var(--accent-strong); }
.btn-secondary {
  background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary);
  padding: 8px 15px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; line-height: 1.4;
  transition: background .1s, border-color .1s, color .1s;
}
.btn-secondary:hover { color: var(--accent); border-color: var(--accent-light); background: var(--accent-soft); }
.btn-secondary:active { color: var(--accent-strong); border-color: var(--accent-strong); }
.btn-danger { background: var(--bad); border-color: var(--bad); color: #fff; }
.btn-danger:hover { background: var(--bad-light); border-color: var(--bad-light); color: #fff; }
.btn-danger:active { background: var(--bad); border-color: var(--bad); }
.btn-icon {
  background: transparent; border: none; color: var(--text-muted); cursor: pointer;
  /* Fluid across the full 320px–3840px+ range: bigger near mobile widths
     (better tap target), settles to a compact desktop size by ~1024px,
     then holds flat on larger screens instead of shrinking further. */
  font-size: clamp(13px, calc(16px - 0.35vw), 16px);
  width: clamp(26px, calc(40px - 1.2vw), 40px); height: clamp(26px, calc(40px - 1.2vw), 40px);
  border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  transition: background .15s ease, color .15s ease, transform .15s cubic-bezier(.34,1.56,.64,1);
}
.btn-icon:hover { background: var(--accent-soft); color: var(--accent); transform: translateY(-2px) scale(1.08); }
.btn-icon:active { transform: translateY(0) scale(.94); transition-duration: .08s; }
/* Inline SVG icons (Heroicons outline) replace the old emoji glyphs. They
   inherit color via currentColor/stroke, so every .icon-* hue rule and
   hover state below applies to them the same way it did to text glyphs —
   no separate color logic needed. Sized to roughly match cap-height of the
   emoji they replaced, fluidly via clamp() so they scale with the button. */
.ui-icon {
  width: clamp(15px, calc(18px - 0.35vw), 18px); height: clamp(15px, calc(18px - 0.35vw), 18px);
  stroke: currentColor; fill: none; flex-shrink: 0; display: block;
}
.nav-icon .ui-icon { width: 17px; height: 17px; }
.menu-icon .ui-icon { width: clamp(18px, 4.4vw, 22px); height: clamp(18px, 4.4vw, 22px); }
.theme-icon .ui-icon { width: clamp(12px, 3vw, 14px); height: clamp(12px, 3vw, 14px); }
.empty-state-icon .ui-icon { width: clamp(26px, 7vw, 32px); height: clamp(26px, 7vw, 32px); margin: 0 auto; }
/* Purpose-colored icon accents — each action gets its own hue so the row
   actions read at a glance instead of sitting in flat neutral gray. Resting
   state is the full hue (vibrant, not washed out); hover/focus deepens it
   with a tinted background for feedback. */
/* Plain-color fallback first (older Safari/Firefox without color-mix()
   support just get the flat hue at rest), then color-mix() overrides it
   with a near-full-strength tint on browsers that support it — mixed
   mostly with itself and only a touch of --text-muted so it stays vivid
   instead of fading toward gray. Cascade order, not @supports, keeps this
   terse across six repeated icon variants. */
.btn-icon.icon-link { color: var(--accent); color: color-mix(in srgb, var(--accent) 95%, var(--text-muted)); }
.btn-icon.icon-link:hover { background: var(--accent-soft); color: var(--accent); }
.btn-icon.icon-open { color: var(--good); color: color-mix(in srgb, var(--good) 95%, var(--text-muted)); }
.btn-icon.icon-open:hover { background: var(--good-soft); color: var(--good); }
.btn-icon.icon-merge { color: #a78bfa; color: color-mix(in srgb, #a78bfa 95%, var(--text-muted)); }
.btn-icon.icon-merge:hover { background: rgba(167,139,250,0.16); color: #a78bfa; }
.btn-icon.icon-edit { color: #f0a020; color: color-mix(in srgb, #f0a020 95%, var(--text-muted)); }
.btn-icon.icon-edit:hover { background: rgba(240,160,32,0.16); color: #f0a020; }
.btn-icon.icon-duplicate { color: #38bdf8; color: color-mix(in srgb, #38bdf8 95%, var(--text-muted)); }
.btn-icon.icon-duplicate:hover { background: rgba(56,189,248,0.16); color: #38bdf8; }
.btn-icon.icon-delete { color: var(--bad); color: color-mix(in srgb, var(--bad) 95%, var(--text-muted)); }
.btn-icon.icon-delete:hover { background: var(--bad-soft); color: var(--bad); transform: translateY(-2px) scale(1.08) rotate(-6deg); }
input, textarea, select {
  width: 100%; background: var(--bg-surface); border: 1px solid var(--border);
  color: var(--text-primary); padding: 8px 11px; border-radius: 4px; font-size: 13px; font-family: inherit;
  transition: border-color .1s;
}
input:focus, textarea:focus, select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
/* Consistent keyboard-focus ring across every interactive element, so
   tabbing through the panel never relies on the browser's inconsistent
   default outline. Mouse/touch clicks don't trigger :focus-visible, so
   this never shows up as an unwanted ring on click. */
button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}
.login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
.login-card { width: 100%; max-width: 380px; padding: 36px 32px; text-align: center; }
.logo-glow { margin-bottom: 8px; font-size: clamp(24px, 7vw, 32px); }
.brand { font-weight: 700; font-size: clamp(17px, 1.6vw + 13px, 20px); letter-spacing: -.01em; margin-bottom: 4px; }
.brand-sub { color: var(--text-muted); font-size: 13px; margin-bottom: 24px; }

/* --- App shell: sidebar + topbar, 3x-ui style --- */
.app-shell { display: flex; min-height: 100vh; }
.sidebar {
  width: 220px; flex-shrink: 0; background: var(--sidebar-bg); border-right: 1px solid rgba(0,0,0,.2);
  display: flex; flex-direction: column; padding: 16px 12px;
}
.sidebar-brand { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-2) var(--space-5); }
.sidebar-brand .avatar {
  width: 30px; height: 30px; border-radius: 8px; background: var(--accent);
  display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; color: #fff;
}
.sidebar-brand .brand { color: var(--accent-light); }
.sidebar-link {
  display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: 8px; margin-bottom: 2px;
  color: var(--sidebar-text); cursor: pointer; font-size: 13px; font-weight: 500; text-decoration: none;
  transition: background .15s ease, color .15s ease, transform .15s ease;
}
.sidebar-link:hover { background: var(--sidebar-active-bg); color: var(--sidebar-active-text); transform: translateX(2px); }
.sidebar-link.active { background: var(--sidebar-active-bg); color: var(--accent); }
.sidebar-link .nav-icon { display: inline-flex; transition: transform .2s cubic-bezier(.34,1.56,.64,1), color .15s ease; }
.sidebar-link.active .nav-icon { color: var(--accent); transform: scale(1.15); }
.sidebar-link:hover .nav-icon { transform: scale(1.15) rotate(-4deg); }
.sidebar-footer { margin-top: auto; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.08); display: flex; flex-direction: column; gap: 6px; }
.theme-switch { position: relative; width: clamp(50px, 12vw, 60px); height: clamp(26px, 6vw, 30px); border-radius: 999px; background: var(--sidebar-active-bg); border: 1px solid var(--border); cursor: pointer; padding: 0; flex-shrink: 0; }
.theme-switch .theme-icon { position: absolute; top: 50%; transform: translateY(-50%); font-size: clamp(12px, 3vw, 14px); line-height: 1; z-index: 1; transition: transform .3s cubic-bezier(.34,1.56,.64,1), opacity .2s ease; }
.theme-switch .theme-icon.sun { left: clamp(5px, 1.6vw, 7px); }
.theme-switch .theme-icon.moon { right: clamp(5px, 1.6vw, 7px); }
.theme-switch:hover .theme-icon.sun { transform: translateY(-50%) rotate(25deg) scale(1.15); }
.theme-switch:hover .theme-icon.moon { transform: translateY(-50%) rotate(-20deg) scale(1.15); }
.theme-switch .theme-knob { position: absolute; top: 3px; left: 3px; width: calc(clamp(26px, 6vw, 30px) - 8px); height: calc(clamp(26px, 6vw, 30px) - 8px); border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.35); transition: transform .35s cubic-bezier(.34,1.56,.64,1), background-color .35s cubic-bezier(.4,0,.2,1); z-index: 2; }
.theme-switch.dark .theme-knob { transform: translateX(calc(clamp(50px, 12vw, 60px) - clamp(26px, 6vw, 30px))); }
.main { flex: 1; min-width: 0; }
/* Off-canvas sidebar controls — hidden on desktop, switched on for narrow
   viewports in the @media block below. Sized to a 40px touch target
   (below WCAG's 44px minimum only by a hair, kept for visual balance with
   the 28px btn-icon set) rather than the visual icon's own dimensions. */
.menu-toggle-btn {
  display: none; align-items: center; justify-content: center;
  background: var(--bg-page); border: 1px solid var(--border); color: var(--text-primary);
  width: clamp(38px, 9vw, 44px); height: clamp(38px, 9vw, 44px); border-radius: 8px;
  font-size: clamp(16px, 4vw, 20px); line-height: 1; cursor: pointer; flex-shrink: 0;
  transition: background .15s ease, color .15s ease, border-color .15s ease, transform .2s ease;
}
.menu-toggle-btn:hover { background: var(--accent-soft); color: var(--accent); }
.menu-toggle-btn:active { transform: scale(.92); }
.menu-toggle-btn .menu-icon { display: inline-block; transition: transform .25s ease; }
.menu-toggle-btn.is-open .menu-icon { transform: rotate(90deg); }
.sidebar-backdrop {
  display: none; position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 39;
  opacity: 0; pointer-events: none; transition: opacity .2s ease;
}
.sidebar-backdrop.visible { opacity: 1; pointer-events: auto; }
.topbar {
  display: flex; align-items: center; justify-content: space-between; padding: 16px 28px;
  border-bottom: 1px solid var(--border); background: var(--bg-surface); gap: var(--space-3);
}
.topbar h1 {
  font-size: clamp(14px, 1vw + 11px, 16px); margin: 0; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46vw;
}
.topbar-sub {
  color: var(--text-muted); font-size: clamp(11px, .5vw + 10px, 12px); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46vw;
}
.container { max-width: 1180px; margin: 0 auto; padding: 24px 28px 60px; }

/* --- Stat cards --- */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-5); }
.stat-card { padding: 18px 20px; }
.stat-card-label { font-size: clamp(11px, .5vw + 10px, 12px); color: var(--text-muted); margin-bottom: 8px; }
.stat-card-num { font-size: clamp(20px, 2.2vw + 13px, 26px); font-weight: 700; }
.section-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); margin: 0 0 12px; }
.activity-list { padding: 4px 0; }
.activity-row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 20px; border-bottom: 1px solid var(--border); font-size: 13px; }
.activity-row:last-child { border-bottom: none; }
.activity-time { color: var(--text-muted); font-size: 12px; white-space: nowrap; }
.status-row { display: flex; align-items: center; gap: 8px; padding: 10px 20px; font-size: 13px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--good); box-shadow: 0 0 0 3px var(--good-soft); animation: status-pulse 2.4s ease-in-out infinite; }
@keyframes status-pulse {
  0%, 100% { box-shadow: 0 0 0 3px var(--good-soft); }
  50% { box-shadow: 0 0 0 6px transparent; }
}

/* --- Toolbar / search / table --- */
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.toolbar-left { display: flex; align-items: center; gap: var(--space-3); flex: 1; min-width: 200px; }
/* Mobile floating action button — the primary "+ New X" action becomes a
   thumb-reachable FAB pinned to the bottom-right on phones (Digikala/most
   native apps put primary creation actions here rather than in a toolbar
   that scrolls out of reach). Hidden on desktop, where the toolbar button
   next to search is already convenient with a mouse. */
.mobile-fab {
  display: none; position: fixed; z-index: 30; align-items: center; justify-content: center;
  background: var(--accent); color: #fff; border: none; border-radius: 50%; cursor: pointer;
  width: 56px; height: 56px; box-shadow: 0 4px 14px rgba(0,0,0,.3);
  transition: transform .15s cubic-bezier(.34,1.56,.64,1), background .15s ease;
}
.mobile-fab:hover { background: var(--accent-light); transform: scale(1.06); }
.mobile-fab:active { transform: scale(.92); }
.mobile-fab .ui-icon { width: 24px; height: 24px; }
.search-input { max-width: 280px; }
.breadcrumb {
  display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 13px; margin-bottom: 4px;
  white-space: nowrap; overflow: hidden;
}
.breadcrumb span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.breadcrumb a { cursor: pointer; }
.breadcrumb a:hover { color: var(--accent); }
.table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th {
  text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted);
  padding: 10px 16px; border-bottom: 1px solid var(--border); cursor: pointer; user-select: none; white-space: nowrap;
}
.data-table th:hover { color: var(--text-primary); }
.data-table td { padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: clamp(12px, .5vw + 11px, 13px); vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.data-table tr.row-hover:hover { background: var(--accent-soft); }
.data-table tbody tr { animation: row-in .3s ease both; }
.data-table tbody tr:nth-child(1) { animation-delay: 0s; }
.data-table tbody tr:nth-child(2) { animation-delay: .03s; }
.data-table tbody tr:nth-child(3) { animation-delay: .06s; }
.data-table tbody tr:nth-child(4) { animation-delay: .09s; }
.data-table tbody tr:nth-child(5) { animation-delay: .12s; }
.data-table tbody tr:nth-child(n+6) { animation-delay: .15s; }
@keyframes row-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
.row-name {
  font-weight: 600; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 100%; display: inline-block; vertical-align: middle;
}
.row-name:hover { color: var(--accent); }
.row-actions { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: nowrap; }
.badge-row { display: flex; gap: 6px; flex-wrap: wrap; }
.badge {
  font-size: 11px; padding: 3px 9px; border-radius: 999px; background: var(--accent-soft); color: var(--accent);
  font-weight: 600; letter-spacing: .02em; border: 1px solid transparent; display: inline-flex; align-items: center;
  white-space: nowrap;
}
.switch { position: relative; width: clamp(34px, 8vw, 40px); height: clamp(19px, 4.4vw, 22px); border-radius: 999px; border: none; background: var(--border); cursor: pointer; padding: 0; flex-shrink: 0; transition: background .15s ease; }
.switch.on { background: var(--accent); }
.switch.pending { cursor: default; pointer-events: none; }
.switch-knob { position: absolute; top: 2px; left: 2px; width: calc(clamp(19px, 4.4vw, 22px) - 4px); height: calc(clamp(19px, 4.4vw, 22px) - 4px); border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .15s ease; }
.switch.on .switch-knob { transform: translateX(calc(clamp(34px, 8vw, 40px) - clamp(19px, 4.4vw, 22px))); }
/* Cloudflare-style spinner: a partial ring that rotates. Used on buttons
   (and inline next to a row's name for actions with no persistent button,
   like create/duplicate) while a save is in flight, replacing the old
   "saving…" text badge. */
.spinner { display: inline-block; width: clamp(13px, 3vw, 15px); height: clamp(13px, 3vw, 15px); border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; vertical-align: middle; flex-shrink: 0; }
.switch-spinner { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: calc(clamp(19px, 4.4vw, 22px) - 8px); height: calc(clamp(19px, 4.4vw, 22px) - 8px); border-width: 2px; }
@keyframes spin { to { transform: rotate(360deg); } }
.format-menu { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--space-2); }
.format-menu-item { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 12px 14px; font-size: 13px; font-weight: 600; color: var(--text-primary); background: var(--bg-surface-raised); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: background .15s ease, border-color .15s ease; }
.format-menu-item:hover { background: var(--sidebar-active-bg); border-color: var(--accent); }
.format-menu-arrow { color: var(--text-muted); font-size: clamp(14px, 3.4vw, 16px); }
.badge.green { background: var(--good-soft); color: var(--good); }
.timestamp { color: var(--text-muted); font-size: 12px; }
.empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.empty-state-icon {
  font-size: clamp(22px, 6vw, 28px); margin-bottom: 10px; opacity: .85; color: var(--accent);
  display: inline-block; animation: empty-float 3s ease-in-out infinite;
}
@keyframes empty-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
/* --- Skeleton screens: shimmer bars sized/positioned to match the real
   content they stand in for, so nothing jumps once data arrives --- */
.skel {
  display: block; background: var(--bg-page); border-radius: 4px;
  position: relative; overflow: hidden;
}
.skel::after {
  content: ""; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, var(--accent-soft), transparent);
  animation: skel-shimmer 1.4s ease-in-out infinite;
}
@keyframes skel-shimmer { 100% { transform: translateX(100%); } }
.skel-row-actions { display: flex; gap: 6px; justify-content: flex-end; }

/* --- Modals / confirm dialog / toasts --- */
@keyframes modal-overlay-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes modal-card-in { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center;
  padding: 20px; z-index: 50; animation: modal-overlay-in .18s ease both;
}
.modal-card { width: 100%; max-width: 520px; padding: 24px; max-height: 85vh; overflow-y: auto; animation: modal-card-in .22s cubic-bezier(.2,.8,.3,1) both; }
.modal-card.small { max-width: 400px; }
.modal-title { font-size: clamp(14px, 1vw + 11px, 16px); font-weight: 700; margin-bottom: var(--space-4); }
.field-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); margin-bottom: 6px; display: block; }
.field-group { margin-bottom: 16px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.stat-row { display: flex; gap: var(--space-3); margin-bottom: var(--space-4); flex-wrap: wrap; }
.stat-box { flex: 1; min-width: 100px; text-align: center; padding: var(--space-4); background: var(--bg-page); border-radius: 10px; border: 1px solid var(--border); }
.stat-num { font-size: clamp(18px, 1.6vw + 12px, 22px); font-weight: 700; }
.stat-label { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.qr-box { background: #fff; border-radius: 12px; padding: var(--space-4); display: flex; align-items: center; justify-content: center; margin: var(--space-4) 0; }
.qr-box svg { width: clamp(140px, 45vw, 180px); height: clamp(140px, 45vw, 180px); }
.link-row { display: flex; gap: 8px; align-items: center; }
.link-row input { font-family: var(--mono-stack); font-size: 12px; }
@keyframes toast-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.toast {
  position: fixed; bottom: 24px; right: 24px; max-width: min(340px, calc(100vw - 48px));
  background: var(--bg-surface-raised); border: 1px solid var(--good-soft); color: var(--good);
  padding: 10px 20px; border-radius: 10px; font-size: clamp(12px, 2.2vw, 13px); z-index: 100; box-shadow: 0 4px 16px rgba(0,0,0,.2);
  animation: toast-in .2s cubic-bezier(.2,.8,.3,1) both;
}
.toast.error { border-color: var(--bad-soft); color: var(--bad); }
.version-badge {
  position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%);
  background: var(--bg-surface-raised); border: 1px solid var(--border);
  color: var(--text-muted); font-family: var(--mono-stack); font-size: 11px;
  letter-spacing: .02em; padding: 4px 12px; border-radius: 20px;
  z-index: 20; cursor: pointer; text-decoration: none; display: inline-block;
}
.version-badge:hover { color: var(--text-primary); border-color: var(--accent, var(--border)); }
.error-text { color: var(--bad); font-size: 13px; margin-top: 10px; min-height: 16px; }
.helper-text { color: var(--text-muted); font-size: 12px; margin-top: 6px; }
/* --- Responsive tiers ---
   Icons (.btn-icon, .switch, .theme-switch, .spinner, .menu-toggle-btn,
   .logo-glow, .empty-state-icon, .format-menu-arrow, .qr-box svg) size
   themselves fluidly via clamp()/calc() tied to viewport width, so they
   scale smoothly at any width from 320px up through 4K+ rather than
   jumping at fixed breakpoints — bigger near mobile widths (better tap
   target), settling to a compact size by ~1024px and holding flat beyond
   that. Layout still uses discrete tiers below for things that need to
   actually restructure (columns, sidebar, modal shape):
   1024px: tablet — sidebar narrows, content margins tighten.
   780px:  mobile — sidebar goes off-canvas behind the hamburger + backdrop,
           tables/modals adapt, inputs bump to 16px (stops iOS Safari's
           auto-zoom-on-focus), tap targets grow toward the 44px minimum.
   480px:  small phones — stat grid and toolbar collapse to one column. */
@media (max-width: 1024px) {
  .sidebar { width: 188px; }
  .container { padding: var(--space-5) var(--space-4) 60px; }
}
@media (max-width: 780px) {
  .menu-toggle-btn { display: flex; }
  .sidebar-backdrop { display: block; }
  .sidebar {
    position: fixed; z-index: 40; top: 0; left: 0; height: 100vh; width: 250px;
    transform: translateX(-100%); transition: transform .2s ease;
  }
  .sidebar.open { transform: translateX(0); }
  .topbar { padding: var(--space-3) var(--space-4); }
  .container { padding: var(--space-4) var(--space-4) 60px; }
  .modal-card { max-width: 100%; }
  /* iOS Safari zooms the page in on focus of any input under 16px; this is
     the single fix for that without changing how text looks anywhere else. */
  input, textarea, select { font-size: 16px; }
  .stat-grid { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
  .desktop-only-action { display: none; }
  .mobile-fab {
    display: flex; right: max(18px, env(safe-area-inset-right));
    bottom: max(18px, env(safe-area-inset-bottom, 0px) + 18px);
  }

  /* --- Table → card transform ---
     Below 780px a <table> can never look native (it either overflows and
     forces horizontal scroll, or squashes columns into unreadable slivers).
     Instead of fighting that, the table is restructured purely with CSS:
     header row is hidden, each <tr> becomes a self-contained rounded card,
     and each <td> becomes a label/value line using its data-label attribute.
     No horizontal scroll is possible because nothing is ever wider than the
     viewport — every cell stacks vertically instead. */
  .table-wrap { overflow-x: hidden; }
  .data-table, .data-table tbody, .data-table tr, .data-table td { display: block; width: 100%; }
  .data-table thead { display: none; }
  .data-table tr {
    border: 1px solid var(--border); border-radius: 12px; margin-bottom: var(--space-3);
    padding: var(--space-3) var(--space-4); background: var(--bg-surface-raised);
  }
  .data-table tr:last-child { margin-bottom: 0; }
  .data-table td {
    border-bottom: none; padding: 7px 0; display: flex; align-items: center;
    justify-content: space-between; gap: var(--space-3); white-space: normal;
  }
  .data-table td:not([data-label=""])::before {
    content: attr(data-label); font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .04em; color: var(--text-muted); flex-shrink: 0;
  }
  .data-table td[data-label=""] { justify-content: flex-end; padding-top: var(--space-2); margin-top: 4px; border-top: 1px solid var(--border); }
  .data-table td[data-label="Name"] { padding-top: 0; }
  .data-table td[data-label="Name"] .row-name { max-width: 62vw; }
  .row-actions { gap: 2px; }
  .card { border-radius: 14px; }
  /* Belt-and-suspenders: nothing on the page should ever be able to force
     the viewport to scroll sideways on a phone, no matter what content or
     third-party string ends up inside a cell, badge, or modal. */
  html, body { overflow-x: hidden; max-width: 100vw; }
}
@media (max-width: 480px) {
  .stat-grid { grid-template-columns: 1fr 1fr; }
  .toolbar { flex-direction: column; align-items: stretch; }
  .toolbar-left, .search-input { max-width: none; width: 100%; }
  .login-card { padding: var(--space-5) var(--space-4); }
  .stat-row { flex-direction: column; }
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal-card { max-height: 92vh; border-radius: 16px 16px 0 0; padding: 14px 18px 20px; position: relative; }
  .modal-card::before {
    content: ""; position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
    width: 36px; height: 4px; border-radius: 999px; background: var(--border);
  }
  .modal-title { margin-top: 10px; }
  /* Bottom-sheet buttons go full-width and stack, largest/primary action on
     top — mirrors how Digikala's mobile sheets present a single dominant
     thumb-reach action instead of two small buttons squeezed to one corner. */
  .modal-footer { flex-direction: column-reverse; gap: var(--space-2); }
  .modal-footer button { width: 100%; padding: 12px 15px; }
  .card { border-radius: 12px; }
  .data-table tr { border-radius: 10px; padding: var(--space-3); }
  .stat-box { border-radius: 8px; }
  .badge, .switch, .theme-switch { border-radius: 999px; }
  /* Names and badges keep their single-line ellipsis truncation down to the
     smallest phones instead of ever breaking to a second line. */
  .topbar h1, .breadcrumb, .stat-card-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
/* Devices that support hover (mouse/trackpad) get the hover states above;
   touch-only devices skip them by re-asserting each button's own base
   (non-hover) look, so a tap doesn't leave it visually "stuck" in its
   hover color until an unrelated tap elsewhere clears it. */
@media (hover: none) {
  .btn-primary:hover { background: var(--accent); border-color: var(--accent); }
  .btn-secondary:hover { background: var(--bg-surface); border-color: var(--border); color: var(--text-primary); }
  .btn-danger:hover, .btn-danger.btn-secondary:hover { background: var(--bad); border-color: var(--bad); color: #fff; }
  .btn-icon:hover { background: transparent; color: var(--text-muted); }
  .data-table tr.row-hover:hover { background: transparent; }
}
/* iPhone/Android notch and home-indicator safe areas, for elements pinned
   to a screen edge. Falls back to the existing fixed value on browsers
   without env() support (older Android/desktop). */
.toast { padding-bottom: max(10px, env(safe-area-inset-bottom)); right: max(16px, env(safe-area-inset-right)); }
.version-badge { bottom: max(10px, env(safe-area-inset-bottom)); }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

// Vendored QR encoder (byte-mode, versions 1-40, real Reed-Solomon ECC + mask scoring)
const QR_LIB = `
// Minimal but CORRECT QR Code generator, byte-mode only, versions 1-40, all ECC levels.
// Based on the public-domain algorithm by Project Nayuki (structure re-implemented compactly).
var qrcodegen = {};
(function (qr) {
  "use strict";

  // ---- Tables -----------------------------------------------------------
  var ECC_CODEWORDS_PER_BLOCK = [
    // Index: [ecl][version] , ecl order = L, M, Q, H  (ordinal 0..3)
    [-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
    [-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]
  ];
  var NUM_ERROR_CORRECTION_BLOCKS = [
    [-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
    [-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
    [-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
    [-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]
  ];

  function eccOrdinal(ecl) { return ecl.ordinal; }

  function getNumRawDataModules(ver) {
    if (ver < 1 || ver > 40) throw new RangeError("version out of range");
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function getNumDataCodewords(ver, ecl) {
    return Math.floor(getNumRawDataModules(ver) / 8)
      - ECC_CODEWORDS_PER_BLOCK[eccOrdinal(ecl)][ver]
      * NUM_ERROR_CORRECTION_BLOCKS[eccOrdinal(ecl)][ver];
  }

  // ---- Bit buffer helpers -------------------------------------------------
  function appendBits(val, len, bb) {
    for (var i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
  }

  // ---- Segment (byte mode only) -------------------------------------------
  var QrSegment = {};
  QrSegment.makeBytes = function (bytes) {
    var bb = [];
    bytes.forEach(function (b) { appendBits(b, 8, bb); });
    return { mode: { modeBits: 0x4, numCharCountBits: function (ver) {
        return ver < 10 ? 8 : (ver < 27 ? 16 : 16);
      } }, numChars: bytes.length, bitData: bb };
  };
  qr.QrSegment = QrSegment;

  function getTotalBits(segs, version) {
    var result = 0;
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var ccbits = seg.mode.numCharCountBits(version);
      if (seg.numChars >= (1 << ccbits)) return Infinity;
      result += 4 + ccbits + seg.bitData.length;
    }
    return result;
  }

  // ---- Reed-Solomon ECC ----------------------------------------------------
  function reedSolomonMultiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }

  function reedSolomonComputeDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (var i = 0; i < degree; i++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = reedSolomonMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = reedSolomonMultiply(root, 0x02);
    }
    return result;
  }

  function reedSolomonComputeRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) {
        result[i] ^= reedSolomonMultiply(coef, factor);
      });
    });
    return result;
  }

  // ---- QR Code core ----------------------------------------------------------
  function QrCode(version, ecl, dataCodewords, mask) {
    this.version = version;
    this.errorCorrectionLevel = ecl;
    this.size = version * 4 + 17;
    var size = this.size;
    this.modules = [];
    this.isFunction = [];
    for (var i = 0; i < size; i++) {
      this.modules.push(new Array(size).fill(false));
      this.isFunction.push(new Array(size).fill(false));
    }

    drawFunctionPatterns(this);
    var allCodewords = addEccAndInterleave(this, dataCodewords);
    drawCodewords(this, allCodewords);

    if (mask === -1) {
      var minPenalty = Infinity;
      for (var m = 0; m < 8; m++) {
        applyMask(this, m);
        drawFormatBits(this, m);
        var penalty = getPenaltyScore(this);
        if (penalty < minPenalty) { minPenalty = penalty; mask = m; }
        applyMask(this, m); // undo
      }
    }
    applyMask(this, mask);
    drawFormatBits(this, mask);
    this.mask = mask;

    this.toSvgString = function (border) { return toSvg(this, border); };
  }
  qr.QrCode = QrCode;

  QrCode.Ecc = {
    LOW: { ordinal: 0, formatBits: 1 },
    MEDIUM: { ordinal: 1, formatBits: 0 },
    QUARTILE: { ordinal: 2, formatBits: 3 },
    HIGH: { ordinal: 3, formatBits: 2 }
  };

  QrCode.encodeText = function (text, ecl) {
    var utf8 = unescape(encodeURIComponent(text));
    var bytes = [];
    for (var i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
    var seg = QrSegment.makeBytes(bytes);
    return QrCode.encodeSegments([seg], ecl);
  };

  QrCode.encodeSegments = function (segs, ecl) {
    var version;
    var dataUsedBits;
    for (version = 1; version <= 40; version++) {
      var dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
      var usedBits = getTotalBits(segs, version);
      if (usedBits <= dataCapacityBits) { dataUsedBits = usedBits; break; }
      if (version === 40) throw new Error("Data too long for QR Code");
    }

    var dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
    var bb = [];
    segs.forEach(function (seg) {
      appendBits(seg.mode.modeBits, 4, bb);
      appendBits(seg.numChars, seg.mode.numCharCountBits(version), bb);
      seg.bitData.forEach(function (b) { bb.push(b); });
    });

    appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
    appendBits(0, (8 - bb.length % 8) % 8, bb);

    for (var padByte = 0xEC; bb.length < dataCapacityBits; padByte ^= 0xEC ^ 0x11) {
      appendBits(padByte, 8, bb);
    }

    var dataCodewords = [];
    for (var i = 0; i < bb.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | bb[i + j];
      dataCodewords.push(b);
    }

    return new QrCode(version, ecl, dataCodewords, -1);
  };

  function addEccAndInterleave(qrcode, data) {
    var ver = qrcode.version, ecl = qrcode.errorCorrectionLevel;
    var numBlocks = NUM_ERROR_CORRECTION_BLOCKS[eccOrdinal(ecl)][ver];
    var blockEccLen = ECC_CODEWORDS_PER_BLOCK[eccOrdinal(ecl)][ver];
    var rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    var numShortBlocks = numBlocks - rawCodewords % numBlocks;
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);

    var blocks = [];
    var rsDiv = reedSolomonComputeDivisor(blockEccLen);
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      var dat = data.slice(k, k + datLen);
      k += datLen;
      var ecc = reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    var result = [];
    for (var i2 = 0; i2 < blocks[0].length; i2++) {
      blocks.forEach(function (block, j) {
        if (i2 !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
          result.push(block[i2]);
        }
      });
    }
    return result;
  }

  // ---- Drawing ---------------------------------------------------------------
  function setFunctionModule(q, x, y, isDark) {
    q.modules[y][x] = isDark;
    q.isFunction[y][x] = true;
  }

  function drawFunctionPatterns(q) {
    var size = q.size;
    for (var i = 0; i < size; i++) {
      setFunctionModule(q, 6, i, i % 2 === 0);
      setFunctionModule(q, i, 6, i % 2 === 0);
    }
    drawFinderPattern(q, 3, 3);
    drawFinderPattern(q, size - 4, 3);
    drawFinderPattern(q, 3, size - 4);

    var alignPatPos = getAlignmentPatternPositions(q.version);
    var numAlign = alignPatPos.length;
    for (var i2 = 0; i2 < numAlign; i2++) {
      for (var j2 = 0; j2 < numAlign; j2++) {
        if (!((i2 === 0 && j2 === 0) || (i2 === 0 && j2 === numAlign - 1) || (i2 === numAlign - 1 && j2 === 0))) {
          drawAlignmentPattern(q, alignPatPos[i2], alignPatPos[j2]);
        }
      }
    }
    drawFormatBits(q, 0); // placeholder, fixed later
    drawVersion(q);
  }

  function drawFormatBits(q, mask) {
    var data = (q.errorCorrectionLevel.formatBits << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;

    for (var i2 = 0; i2 <= 5; i2++) setFunctionModule(q, 8, i2, getBit(bits, i2));
    setFunctionModule(q, 8, 7, getBit(bits, 6));
    setFunctionModule(q, 8, 8, getBit(bits, 7));
    setFunctionModule(q, 7, 8, getBit(bits, 8));
    for (var i3 = 9; i3 < 15; i3++) setFunctionModule(q, 14 - i3, 8, getBit(bits, i3));

    var size = q.size;
    for (var i4 = 0; i4 < 8; i4++) setFunctionModule(q, size - 1 - i4, 8, getBit(bits, i4));
    for (var i5 = 8; i5 < 15; i5++) setFunctionModule(q, 8, size - 15 + i5, getBit(bits, i5));
    setFunctionModule(q, 8, size - 8, true);
  }

  function drawVersion(q) {
    if (q.version < 7) return;
    var rem = q.version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    var bits = (q.version << 12) | rem;
    var size = q.size;
    for (var i2 = 0; i2 < 18; i2++) {
      var color = getBit(bits, i2);
      var a = size - 11 + i2 % 3;
      var b = Math.floor(i2 / 3);
      setFunctionModule(q, a, b, color);
      setFunctionModule(q, b, a, color);
    }
  }

  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

  function drawFinderPattern(q, x, y) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        var xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < q.size && yy >= 0 && yy < q.size) {
          setFunctionModule(q, xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  function drawAlignmentPattern(q, x, y) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        setFunctionModule(q, x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  function getAlignmentPatternPositions(ver) {
    if (ver === 1) return [];
    var numAlign = Math.floor(ver / 7) + 2;
    var step;
    if (ver === 32) step = 26;
    else step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    var size = ver * 4 + 17;
    for (var pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  function drawCodewords(q, data) {
    var size = q.size;
    var i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!q.isFunction[y][x] && i < data.length * 8) {
            var bit = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            q.modules[y][x] = bit;
            i++;
          }
        }
      }
    }
  }

  function applyMask(q, mask) {
    var size = q.size;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (q.isFunction[y][x]) continue;
        var invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          case 7: invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
          default: throw new Error("bad mask");
        }
        if (invert) q.modules[y][x] = !q.modules[y][x];
      }
    }
  }

  function getPenaltyScore(q) {
    var size = q.size;
    var result = 0;
    // Adjacent modules in row/col with same color
    for (var y = 0; y < size; y++) {
      var runColor = false, runX = 0;
      var runHistory = [0,0,0,0,0,0,0];
      for (var x = 0; x < size; x++) {
        if (q.modules[y][x] === runColor) {
          runX++;
          if (runX === 5) result += 3;
          else if (runX > 5) result++;
        } else {
          runColor = q.modules[y][x]; runX = 1;
        }
      }
    }
    for (var x2 = 0; x2 < size; x2++) {
      var runColor2 = false, runY = 0;
      for (var y2 = 0; y2 < size; y2++) {
        if (q.modules[y2][x2] === runColor2) {
          runY++;
          if (runY === 5) result += 3;
          else if (runY > 5) result++;
        } else {
          runColor2 = q.modules[y2][x2]; runY = 1;
        }
      }
    }
    // 2x2 blocks
    for (var y3 = 0; y3 < size - 1; y3++) {
      for (var x3 = 0; x3 < size - 1; x3++) {
        var c = q.modules[y3][x3];
        if (c === q.modules[y3][x3+1] && c === q.modules[y3+1][x3] && c === q.modules[y3+1][x3+1]) {
          result += 3;
        }
      }
    }
    // Finder-like patterns
    for (var y4 = 0; y4 < size; y4++) {
      for (var x4 = 0; x4 < size - 6; x4++) {
        if (hasFinderLike(q, x4, y4, true)) result += 40;
      }
    }
    for (var x5 = 0; x5 < size; x5++) {
      for (var y5 = 0; y5 < size - 6; y5++) {
        if (hasFinderLike(q, x5, y5, false)) result += 40;
      }
    }
    // Balance of dark modules
    var dark = 0;
    for (var y6 = 0; y6 < size; y6++) for (var x6 = 0; x6 < size; x6++) if (q.modules[y6][x6]) dark++;
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += Math.max(k, 0) * 10;
    return result;
  }

  function hasFinderLike(q, x, y, horizontal) {
    var pattern = [true,false,true,true,true,false,true];
    for (var i = 0; i < 7; i++) {
      var mx = horizontal ? x + i : x;
      var my = horizontal ? y : y + i;
      if (q.modules[my][mx] !== pattern[i]) return false;
    }
    return true;
  }

  function toSvg(q, border) {
    var parts = [];
    for (var y = 0; y < q.size; y++) {
      for (var x = 0; x < q.size; x++) {
        if (q.modules[y][x]) parts.push("M" + (x + border) + "," + (y + border) + "h1v1h-1z");
      }
    }
    var dim = q.size + border * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim +
      '" stroke="none"><rect width="100%" height="100%" fill="#FFFFFF"/><path d="' +
      parts.join(" ") + '" fill="#000000"/></svg>';
  }

})(qrcodegen);
`;

const CLIENT_SCRIPT = `
const state = {
  token: localStorage.getItem("vexa_token") || null,
  view: "login",
  loading: false,
  errorMsg: "",

  users: [],
  userSearch: "",
  userSort: { key: "updatedAt", dir: "desc" },

  currentUser: null,
  profiles: [],

  stats: null,
  activity: [],

  modal: null,
  editingUser: null,
  editingProfile: null,
  mergeResult: null,
  confirmDialog: null,
  subFormatTarget: null,
  subFormatSelected: null
};

// ---------------------------------------------------------------------
// THEME — a single light/dark switch. Until the user flips it, the
// effective theme always follows the browser's own color-scheme
// preference (recomputed live); once flipped, the explicit choice sticks.
// ---------------------------------------------------------------------
function getThemePref() {
  const stored = localStorage.getItem("vexa_theme");
  if (stored === "light" || stored === "dark") return stored;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function setTheme(pref) {
  localStorage.setItem("vexa_theme", pref);
  document.documentElement.setAttribute("data-theme", pref);
  render();
}
function toggleTheme() {
  setTheme(getThemePref() === "dark" ? "light" : "dark");
}

// ---------------------------------------------------------------------
// SOURCE PARSING HELPER (unchanged from previous version)
// ---------------------------------------------------------------------
function splitSourceEntries(text) {
  const lines = text.split("\\n");
  const entries = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (line.startsWith("{") || line.startsWith("[")) {
      let depth = 0;
      let buf = [];
      let j = i;
      for (; j < lines.length; j++) {
        buf.push(lines[j]);
        for (const ch of lines[j]) {
          if (ch === "{" || ch === "[") depth++;
          else if (ch === "}" || ch === "]") depth--;
        }
        if (depth <= 0) break;
      }
      entries.push(buf.join("\\n").trim());
      i = j + 1;
    } else if (/^proxies:\\s*(\\[\\s*\\])?\\s*$/.test(line)) {
      let buf = [lines[i]];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (lines[j].trim() === "") { buf.push(lines[j]); continue; }
        const indent = lines[j].length - lines[j].trimStart().length;
        if (indent === 0) break;
        buf.push(lines[j]);
      }
      entries.push(buf.join("\\n").trim());
      i = j;
    } else {
      entries.push(line);
      i++;
    }
  }
  return entries.filter(Boolean);
}

// ---------------------------------------------------------------------
// API
// ---------------------------------------------------------------------
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: "Bearer " + state.token } : {}),
      ...(opts.headers || {})
    }
  });
  if (res.status === 401) {
    state.token = null;
    localStorage.removeItem("vexa_token");
    state.view = "login";
    if (location.pathname !== "/login") history.replaceState(null, "", "/login");
    render();
    throw new Error("unauthorized");
  }
  return res.json();
}

async function loadDashboard() {
  const data = await apiFetch("/api/stats");
  state.stats = data.stats;
  state.activity = data.activity || [];
}

async function loadUsers() {
  const data = await apiFetch("/api/users");
  state.users = data.users || [];
}

async function loadUserProfiles(userId) {
  const data = await apiFetch("/api/users/" + userId + "/profiles");
  state.profiles = data.profiles || [];
}

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------
function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

function formatCacheAge(ms) {
  const diff = Math.floor(ms / 1000);
  if (diff < 60) return "moments old";
  if (diff < 3600) return Math.floor(diff / 60) + "m old";
  if (diff < 86400) return Math.floor(diff / 3600) + "h old";
  return Math.floor(diff / 86400) + "d old";
}

function renderSourceIssues(sourceErrors) {
  if (!sourceErrors || !sourceErrors.length) return "";
  const degraded = sourceErrors.filter(e => e.usedCache);
  const failed = sourceErrors.filter(e => !e.usedCache);
  const parts = [];
  if (failed.length) {
    parts.push('<div class="error-text">' + failed.length + ' source(s) failed to fetch — nodes missing.</div>');
  }
  if (degraded.length) {
    const detail = degraded.map(e => escapeHtml(e.url) + ' (cache ' + formatCacheAge(e.cacheAgeMs) + ')').join(', ');
    parts.push('<div class="helper-text">' + degraded.length + ' source(s) used a cached copy — ' + detail + '.</div>');
  }
  return parts.join("");
}

// Heroicons (outline, 1.5 stroke) inline SVGs for every UI icon. Using
// currentColor for stroke means each icon inherits whatever color its
// wrapping .icon-* class sets — same mechanism as the emoji glyphs they
// replace, so no other CSS needs to change. icon() wraps the raw path
// markup in a consistently-sized <svg class="ui-icon"> shell.
const ICONS = {
  dashboard: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />',
  users: '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />',
  link: '<path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />',
  open: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />',
  duplicate: '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />',
  delete: '<path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />',
  merge: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />',
  edit: '<path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />',
  menu: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />',
  sun: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />',
  moon: '<path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />',
  plus: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />',
  settings: '<path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />',
  logout: '<path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" />',
};
function icon(name, extraClass) {
  const paths = ICONS[name] || "";
  return '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="ui-icon' + (extraClass ? " " + extraClass : "") + '" aria-hidden="true">' + paths + '</svg>';
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}

function showToast(msg, isError) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast" + (isError ? " error" : "");
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function sortRows(rows, sort) {
  const copy = [...rows];
  copy.sort((a, b) => {
    let av = a[sort.key], bv = b[sort.key];
    if (typeof av === "string") { av = av.toLowerCase(); bv = (bv || "").toLowerCase(); }
    if (av < bv) return sort.dir === "asc" ? -1 : 1;
    if (av > bv) return sort.dir === "asc" ? 1 : -1;
    return 0;
  });
  return copy;
}

function sortIndicator(sort, key) {
  if (sort.key !== key) return "";
  return sort.dir === "asc" ? " ↑" : " ↓";
}

// ---------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------
function renderLoginView() {
  return \`
    <div class="login-wrap">
      <div class="card login-card">
        <div class="logo-glow">🔒</div>
        <div class="brand">VEXA</div>
        <div class="brand-sub">Secure subscription manager</div>
        <div class="field-group" style="text-align:left;">
          <label class="field-label">Password</label>
          <input type="password" id="loginPassword" placeholder="Enter admin password" />
        </div>
        <button class="btn-primary" style="width:100%;" onclick="doLogin()">Sign In</button>
        <div class="error-text" id="loginError">\${state.errorMsg || ""}</div>
      </div>
    </div>
  \`;
}

async function doLogin() {
  const password = document.getElementById("loginPassword").value;
  state.errorMsg = "";
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) {
      state.errorMsg = data.error === "too_many_attempts"
        ? "Too many attempts. Wait a few minutes."
        : "Incorrect password.";
      render();
      return;
    }
    state.token = data.token;
    localStorage.setItem("vexa_token", data.token);
    state.view = "dashboard";
    history.pushState(null, "", "/panel");
    await bootAuthenticated();
  } catch (e) {
    state.errorMsg = "Connection error.";
    render();
  }
}

// Manual logout clears the session outright — the next visit gets no
// "less than 48h since last login" grace period and lands back on /login.
function logout() {
  state.token = null;
  localStorage.removeItem("vexa_token");
  state.view = "login";
  history.pushState(null, "", "/login");
  render();
}

async function bootAuthenticated() {
  state.loading = true;
  render();
  try {
    await loadDashboard();
  } finally {
    state.loading = false;
    render();
  }
}

// ---------------------------------------------------------------------
// SHELL: sidebar + topbar
// ---------------------------------------------------------------------
// Mobile off-canvas sidebar. Desktop ignores .open (sidebar is always
// visible there via the media query), so these are no-ops above the
// 780px breakpoint.
function toggleSidebar() {
  const isOpen = document.getElementById("sidebar")?.classList.toggle("open");
  document.getElementById("sidebarBackdrop")?.classList.toggle("visible");
  const btn = document.getElementById("menuToggleBtn");
  if (btn) {
    btn.classList.toggle("is-open", !!isOpen);
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
}
function closeSidebar() {
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("sidebarBackdrop")?.classList.remove("visible");
  const btn = document.getElementById("menuToggleBtn");
  if (btn) {
    btn.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  }
}

function navigate(view) {
  closeSidebar();
  state.view = view;
  state.errorMsg = "";
  if (view === "dashboard") {
    state.loading = true;
    render();
    loadDashboard().finally(() => { state.loading = false; render(); });
  } else if (view === "users") {
    state.loading = true;
    render();
    loadUsers().finally(() => { state.loading = false; render(); });
  }
}

function openUser(userId) {
  const user = state.users.find(u => u.id === userId);
  state.currentUser = user || { id: userId, name: "…" };
  state.view = "userProfiles";
  state.loading = true;
  render();
  loadUserProfiles(userId).finally(() => { state.loading = false; render(); });
}

function renderSidebar() {
  const items = [
    { key: "dashboard", label: "Dashboard", icon: icon("dashboard") },
    { key: "users", label: "Users", icon: icon("users") }
  ];
  const isUsersActive = state.view === "users" || state.view === "userProfiles";
  return \`
    <div class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <div class="avatar">V</div>
        <div>
          <div style="font-weight:700;font-size:clamp(13px, .6vw + 12px, 14px);color:var(--accent-light);">VEXA</div>
          <div style="font-size:clamp(9px, .3vw + 8px, 10px);color:var(--text-muted);">Admin Panel</div>
        </div>
      </div>
      \${items.map(it => \`
        <div class="sidebar-link \${(it.key === "dashboard" ? state.view === "dashboard" : isUsersActive) ? "active" : ""}"
             onclick="navigate('\${it.key}')">
          <span class="nav-icon">\${it.icon}</span><span>\${it.label}</span>
        </div>
      \`).join("")}
      <div class="sidebar-footer">
        <button class="btn-secondary" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;" onclick="openSettings()"><span class="nav-icon">\${icon("settings")}</span>Settings</button>
        <button class="btn-secondary" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;" onclick="logout()"><span class="nav-icon">\${icon("logout")}</span>Log out</button>
      </div>
    </div>
  \`;
}

function openSettings() {
  closeSidebar();
  state.modal = "settings";
  render();
}

function shellTitle() {
  if (state.view === "dashboard") return ["Dashboard", "Overview of users, profiles and sources"];
  if (state.view === "users") return ["Users", "Managed accounts and their profiles"];
  if (state.view === "userProfiles") return [state.currentUser ? state.currentUser.name : "Profiles", "Profiles and generated subscriptions"];
  return ["", ""];
}

function renderShell(innerHtml) {
  const [title, sub] = shellTitle();
  return \`
    <div class="app-shell">
      \${renderSidebar()}
      <div class="sidebar-backdrop" id="sidebarBackdrop" onclick="closeSidebar()"></div>
      <div class="main">
        <div class="topbar">
          <div style="display:flex;align-items:center;gap:var(--space-3);">
            <button class="menu-toggle-btn" id="menuToggleBtn" aria-label="Toggle menu" aria-expanded="false" onclick="toggleSidebar()"><span class="menu-icon">\${icon("menu")}</span></button>
            <div>
              <h1>\${title}</h1>
              <div class="topbar-sub">\${sub}</div>
            </div>
          </div>
          <button class="theme-switch \${getThemePref() === "dark" ? "dark" : ""}" onclick="toggleTheme()" title="Toggle light/dark theme">
            <span class="theme-icon sun">\${icon("sun")}</span>
            <span class="theme-icon moon">\${icon("moon")}</span>
            <span class="theme-knob"></span>
          </button>
        </div>
        <div class="container">\${innerHtml}</div>
      </div>
      \${renderModal()}
    </div>
  \`;
}

// ---------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------
function renderDashboardView() {
  if (state.loading || !state.stats) {
    return renderShell(\`
      <div class="stat-grid">
        \${[1,2,3,4].map(() => \`
          <div class="card stat-card">
            <div class="skel" style="width:65%;height:11px;margin-bottom:10px;"></div>
            <div class="skel" style="width:38%;height:26px;"></div>
          </div>
        \`).join("")}
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="status-row">
          <span class="skel" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;"></span>
          <div class="skel" style="width:130px;height:13px;"></div>
          <div class="skel" style="width:150px;height:12px;margin-left:auto;"></div>
        </div>
      </div>
      <div class="card">
        <div style="padding:16px 20px 0;"><div class="skel" style="width:110px;height:11px;"></div></div>
        <div class="activity-list">
          \${[1,2,3].map(() => \`
            <div class="activity-row">
              <div class="skel" style="width:55%;height:13px;"></div>
              <div class="skel" style="width:48px;height:12px;flex-shrink:0;"></div>
            </div>
          \`).join("")}
        </div>
      </div>
    \`);
  }
  const s = state.stats;
  const cards = [
    { label: "Total Users", num: s.totalUsers },
    { label: "Total Profiles", num: s.totalProfiles },
    { label: "Subscription Sources", num: s.totalSubSources },
    { label: "Raw / Static Sources", num: s.totalRawSources }
  ];
  const activityHtml = state.activity.length
    ? state.activity.map(a => \`
        <div class="activity-row">
          <span>\${escapeHtml(a.message)}</span>
          <span class="activity-time">\${timeAgo(a.ts)}</span>
        </div>
      \`).join("")
    : '<div class="empty-state">No activity yet.</div>';

  return renderShell(\`
    <div class="stat-grid">
      \${cards.map(c => \`
        <div class="card stat-card">
          <div class="stat-card-label">\${c.label}</div>
          <div class="stat-card-num">\${c.num}</div>
        </div>
      \`).join("")}
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div class="status-row">
        <span class="status-dot"></span>
        <span>System operational</span>
        <span class="timestamp" style="margin-left:auto;">VEXA — checked \${timeAgo(Date.now())}</span>
      </div>
    </div>
    <div class="card">
      <div style="padding:16px 20px 0;"><div class="section-title">Recent Activity</div></div>
      <div class="activity-list">\${activityHtml}</div>
    </div>
  \`);
}

// ---------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------
function setUserSort(key) {
  if (state.userSort.key === key) {
    state.userSort.dir = state.userSort.dir === "asc" ? "desc" : "asc";
  } else {
    state.userSort = { key, dir: "asc" };
  }
  render();
}

function renderUsersView() {
  if (state.loading) {
    return renderShell(\`
      <div class="toolbar">
        <div class="toolbar-left"><div class="skel search-input" style="height:34px;"></div></div>
        <div class="skel" style="width:112px;height:34px;border-radius:4px;"></div>
      </div>
      <div class="card">
        <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Profiles</th><th>Active</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            \${[1,2,3,4,5].map(() => \`
              <tr>
                <td><div class="skel" style="width:130px;height:13px;"></div></td>
                <td><div class="skel" style="width:76px;height:19px;border-radius:4px;"></div></td>
                <td><div class="skel" style="width:36px;height:20px;border-radius:10px;"></div></td>
                <td><div class="skel" style="width:64px;height:12px;"></div></td>
                <td><div class="skel-row-actions">\${[1,2,3,4].map(() => '<div class="skel" style="width:22px;height:22px;border-radius:50%;"></div>').join("")}</div></td>
              </tr>
            \`).join("")}
          </tbody>
        </table>
        </div>
      </div>
    \`);
  }

  const filtered = state.users.filter(u =>
    !state.userSearch || u.name.toLowerCase().includes(state.userSearch.toLowerCase())
  );
  const sorted = sortRows(filtered, state.userSort);

  const rows = sorted.map(u => \`
    <tr class="row-hover">
      <td data-label="Name"><span class="row-name" onclick="openUser('\${u.id}')">\${escapeHtml(u.name)}</span>\${u._pending && u._pendingKind !== "toggle" ? ' <span class="spinner" title="Saving…"></span>' : ''}</td>
      <td data-label="Profiles"><span class="badge">\${u.profileCount} profile\${u.profileCount === 1 ? "" : "s"}</span></td>
      <td data-label="Active">
        <button class="switch \${u.enabled ? "on" : ""} \${u._pending && u._pendingKind === "toggle" ? "pending" : ""}" role="switch" aria-checked="\${u.enabled ? "true" : "false"}"
                title="\${u.enabled ? "Active — click to disable" : "Disabled — click to enable"}"
                onclick="toggleUserEnabled('\${u.id}')"><span class="switch-knob"></span>\${u._pending && u._pendingKind === "toggle" ? '<span class="spinner switch-spinner"></span>' : ''}</button>
      </td>
      <td class="timestamp" data-label="Updated">\${timeAgo(u.updatedAt)}</td>
      <td data-label="">
        <div class="row-actions">
          <button class="btn-icon icon-link" title="Get subscription link" onclick="openSubFormatPicker('user', '\${u.id}', '\${escapeHtml(u.name).replace(/'/g, "&#39;")}')">\${icon("link")}</button>
          <button class="btn-icon icon-open" title="Open" onclick="openUser('\${u.id}')">\${icon("open")}</button>
          <button class="btn-icon icon-duplicate" title="Duplicate" onclick="duplicateUser('\${u.id}')">\${icon("duplicate")}</button>
          <button class="btn-icon icon-delete" title="Delete" onclick="askDeleteUser('\${u.id}', '\${escapeHtml(u.name).replace(/'/g, "&#39;")}')">\${icon("delete")}</button>
        </div>
      </td>
    </tr>
  \`).join("");

  return renderShell(\`
    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-input" placeholder="Search users…" value="\${escapeHtml(state.userSearch)}"
               oninput="state.userSearch=this.value; render();" />
      </div>
      <button class="btn-primary desktop-only-action" onclick="openUserEditor()">+ New User</button>
    </div>
    <button class="mobile-fab" onclick="openUserEditor()" aria-label="New User" title="New User">\${icon("plus")}</button>
    <div class="card">
      \${sorted.length === 0
        ? '<div class="empty-state"><div class="empty-state-icon">' + icon("users") + '</div>No users yet. Create one to get started.</div>'
        : \`
          <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th onclick="setUserSort('name')">Name\${sortIndicator(state.userSort, "name")}</th>
                <th onclick="setUserSort('profileCount')">Profiles\${sortIndicator(state.userSort, "profileCount")}</th>
                <th>Active</th>
                <th onclick="setUserSort('updatedAt')">Updated\${sortIndicator(state.userSort, "updatedAt")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>\${rows}</tbody>
          </table>
          </div>
        \`}
    </div>
  \`);
}

function openUserEditor() {
  state.editingUser = null;
  state.modal = "userEditor";
  render();
}

async function saveUser() {
  const name = document.getElementById("userNameInput").value.trim();
  if (!name) { showToast("Name is required.", true); return; }

  closeModal();
  const tempId = "temp-" + Date.now();
  state.users.push({ id: tempId, name, enabled: true, profileCount: 0, primaryProfileId: null, updatedAt: Date.now(), _pending: true, _pendingKind: "create" });
  render();
  try {
    const result = await apiFetch("/api/users", { method: "POST", body: JSON.stringify({ name }) });
    const idx = state.users.findIndex(u => u.id === tempId);
    state.users[idx] = { ...result.user, enabled: result.user.enabled !== false, profileCount: 0, primaryProfileId: null, _pending: false };
    render();
    showToast("User created.");
  } catch (e) {
    state.users = state.users.filter(u => u.id !== tempId);
    showToast("Could not create user.", true);
    render();
  }
}

function askDeleteUser(id, name) {
  state.confirmDialog = {
    title: "Delete user?",
    message: \`This permanently deletes "\${name}" and every profile it owns. This cannot be undone.\`,
    danger: true,
    confirmLabel: "Delete",
    onConfirm: () => performDeleteUser(id)
  };
  state.modal = "confirm";
  render();
}

async function performDeleteUser(id) {
  closeModal();
  const prev = state.users;
  state.users = state.users.filter(u => u.id !== id);
  render();
  try {
    await apiFetch("/api/users/" + id, { method: "DELETE" });
    showToast("User deleted.");
  } catch (e) {
    state.users = prev;
    showToast("Could not delete user.", true);
    render();
  }
}

async function duplicateUser(id) {
  const idx = state.users.findIndex(u => u.id === id);
  if (idx === -1) return;
  const original = state.users[idx];
  const tempId = "temp-" + Date.now();
  state.users.splice(idx + 1, 0, { ...original, id: tempId, name: original.name + " (copy)", _pending: true, _pendingKind: "create" });
  render();
  try {
    const result = await apiFetch("/api/users/" + id + "/duplicate", { method: "POST" });
    const pos = state.users.findIndex(u => u.id === tempId);
    state.users[pos] = { ...result.user, profileCount: result.profileCount, primaryProfileId: null, _pending: false };
    showToast("User duplicated.");
    render();
  } catch (e) {
    state.users = state.users.filter(u => u.id !== tempId);
    showToast("Could not duplicate user.", true);
    render();
  }
}

const SUB_FORMATS = [
  { key: "base64", label: "Normal Link" },
  { key: "singbox", label: "sing-box" },
  { key: "clash", label: "Clash" },
];

// kind is "user" (combined per-user link, /sub/user/:id) or "profile"
// (single-profile link, /sub/:id) — same three formats, same picker/QR UI.
function buildSubUrl(kind, id, format) {
  const base = location.origin + (kind === "profile" ? "/sub/" + id : "/sub/user/" + id);
  return format === "base64" ? base : base + "?format=" + format;
}

function openSubFormatPicker(kind, id, name) {
  state.modal = "subFormat";
  state.subFormatTarget = { kind, id, name };
  state.subFormatSelected = null;
  render();
}

// Picking a format shows its link and QR code together on one screen,
// rather than separate Copy-Link / QR-Code actions per row.
function selectSubFormat(format) {
  state.subFormatSelected = format;
  render();
  setTimeout(() => {
    const el = document.getElementById("subFormatQrBox");
    const t = state.subFormatTarget;
    if (el && window.qrcodegen && t) {
      const qr = qrcodegen.QrCode.encodeText(buildSubUrl(t.kind, t.id, format), qrcodegen.QrCode.Ecc.MEDIUM);
      el.innerHTML = qr.toSvgString(4);
    }
  }, 0);
}

function backToSubFormatMenu() {
  state.subFormatSelected = null;
  render();
}

function copySubFormatLink() {
  const t = state.subFormatTarget;
  const format = state.subFormatSelected;
  if (!t || !format) return;
  navigator.clipboard.writeText(buildSubUrl(t.kind, t.id, format));
  const f = SUB_FORMATS.find(x => x.key === format);
  showToast((f ? f.label : "Link") + " copied to clipboard!");
}

async function toggleUserEnabled(id) {
  const idx = state.users.findIndex(u => u.id === id);
  if (idx === -1 || state.users[idx]._pending) return;
  const prevEnabled = state.users[idx].enabled;
  state.users[idx] = { ...state.users[idx], enabled: !prevEnabled, _pending: true, _pendingKind: "toggle" };
  render();
  try {
    const result = await apiFetch("/api/users/" + id, { method: "PUT", body: JSON.stringify({ enabled: !prevEnabled }) });
    state.users[idx] = { ...state.users[idx], enabled: result.user.enabled, _pending: false };
    render();
    showToast(result.user.enabled ? "User enabled." : "User disabled.");
  } catch (e) {
    state.users[idx] = { ...state.users[idx], enabled: prevEnabled, _pending: false };
    showToast("Could not update user status.", true);
    render();
  }
}

// ---------------------------------------------------------------------
// PROFILES (scoped to the open user)
// ---------------------------------------------------------------------
function renderUserProfilesView() {
  if (state.loading) {
    return renderShell(\`
      <div class="breadcrumb"><a onclick="navigate('users')">Users</a> / <span class="skel" style="display:inline-block;width:80px;height:12px;vertical-align:middle;"></span></div>
      <div class="toolbar">
        <div class="toolbar-left"></div>
        <div class="skel" style="width:126px;height:34px;border-radius:4px;"></div>
      </div>
      <div class="card">
        <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Sources</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            \${[1,2,3].map(() => \`
              <tr>
                <td><div class="skel" style="width:150px;height:13px;"></div></td>
                <td><div class="badge-row"><div class="skel" style="width:56px;height:19px;border-radius:4px;"></div><div class="skel" style="width:52px;height:19px;border-radius:4px;"></div></div></td>
                <td><div class="skel" style="width:64px;height:12px;"></div></td>
                <td><div class="skel-row-actions">\${[1,2,3,4,5].map(() => '<div class="skel" style="width:22px;height:22px;border-radius:50%;"></div>').join("")}</div></td>
              </tr>
            \`).join("")}
          </tbody>
        </table>
        </div>
      </div>
    \`);
  }

  const cards = state.profiles.map(p => \`
    <tr class="row-hover">
      <td data-label="Name"><span class="row-name" onclick="openProfileEditor('\${p.id}')">\${escapeHtml(p.name)}</span>\${p._pending ? ' <span class="spinner" title="Saving…"></span>' : ''}</td>
      <td data-label="Sources">
        <div class="badge-row">
          <span class="badge">\${p.subCount} subs</span>
          <span class="badge green">\${p.rawCount} raw</span>
        </div>
      </td>
      <td class="timestamp" data-label="Updated">\${timeAgo(p.updatedAt)}</td>
      <td data-label="">
        <div class="row-actions">
          <button class="btn-icon icon-link" title="Get subscription link" onclick="openSubFormatPicker('profile', '\${p.id}', '\${escapeHtml(p.name).replace(/'/g, "&#39;")}')">\${icon("link")}</button>
          <button class="btn-icon icon-merge" title="Merge / QR" onclick="openMerge('\${p.id}')">\${icon("merge")}</button>
          <button class="btn-icon icon-edit" title="Edit sources" onclick="openProfileEditor('\${p.id}')">\${icon("edit")}</button>
          <button class="btn-icon icon-duplicate" title="Duplicate" onclick="duplicateProfile('\${p.id}')">\${icon("duplicate")}</button>
          <button class="btn-icon icon-delete" title="Delete" onclick="askDeleteProfile('\${p.id}', '\${escapeHtml(p.name).replace(/'/g, "&#39;")}')">\${icon("delete")}</button>
        </div>
      </td>
    </tr>
  \`).join("");

  return renderShell(\`
    <div class="breadcrumb"><a onclick="navigate('users')">Users</a> / \${escapeHtml(state.currentUser ? state.currentUser.name : "")}</div>
    <div class="toolbar">
      <div class="toolbar-left"></div>
      <button class="btn-primary desktop-only-action" onclick="openProfileEditor(null)">+ New Profile</button>
    </div>
    <button class="mobile-fab" onclick="openProfileEditor(null)" aria-label="New Profile" title="New Profile">\${icon("plus")}</button>
    <div class="card">
      \${state.profiles.length === 0
        ? '<div class="empty-state"><div class="empty-state-icon">' + icon("merge") + '</div>No profiles yet for this user.</div>'
        : \`
          <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Sources</th><th>Updated</th><th></th></tr></thead>
            <tbody>\${cards}</tbody>
          </table>
          </div>
        \`}
    </div>
  \`);
}

function openProfileEditor(id) {
  state.editingProfile = id ? state.profiles.find(p => p.id === id) : null;
  state.modal = "profileEditor";
  if (id) {
    apiFetch("/api/profiles/" + id).then(data => {
      state.editingProfile = data.profile;
      render();
    });
  } else {
    render();
  }
}

async function saveProfile() {
  const isEdit = state.editingProfile && state.editingProfile.id;
  const name = isEdit ? state.editingProfile.name : document.getElementById("profileNameInput").value.trim();
  const sourcesText = document.getElementById("profileSourcesInput").value;
  const sources = splitSourceEntries(sourcesText);
  if (!name) { showToast("Name is required.", true); return; }

  closeModal();

  if (isEdit) {
    const idx = state.profiles.findIndex(p => p.id === state.editingProfile.id);
    const prev = state.profiles[idx];
    state.profiles[idx] = { ...prev, _pending: true };
    render();
    try {
      const result = await apiFetch("/api/profiles/" + state.editingProfile.id, {
        method: "PUT",
        body: JSON.stringify({ sources })
      });
      const p = result.profile;
      state.profiles[idx] = {
        id: p.id, userId: p.userId, name: p.name,
        subCount: p.sources.filter(s => s.type === "subscription").length,
        rawCount: p.sources.filter(s => s.type !== "subscription").length,
        updatedAt: p.updatedAt, _pending: false
      };
      render();
      if (result.invalidSources && result.invalidSources.length) {
        showToast(result.invalidSources.length + " line(s) skipped — invalid format.", true);
      } else {
        showToast("Profile updated.");
      }
    } catch (e) {
      state.profiles[idx] = prev;
      showToast("Could not save profile.", true);
      render();
    }
  } else {
    const tempId = "temp-" + Date.now();
    state.profiles.push({
      id: tempId, userId: state.currentUser.id, name,
      subCount: 0, rawCount: 0, updatedAt: Date.now(), _pending: true
    });
    render();
    try {
      const result = await apiFetch("/api/users/" + state.currentUser.id + "/profiles", {
        method: "POST",
        body: JSON.stringify({ name, sources })
      });
      const p = result.profile;
      const idx = state.profiles.findIndex(x => x.id === tempId);
      state.profiles[idx] = {
        id: p.id, userId: p.userId, name: p.name,
        subCount: p.sources.filter(s => s.type === "subscription").length,
        rawCount: p.sources.filter(s => s.type !== "subscription").length,
        updatedAt: p.updatedAt, _pending: false
      };
      render();
      if (result.invalidSources && result.invalidSources.length) {
        showToast(result.invalidSources.length + " line(s) skipped — invalid format.", true);
      } else {
        showToast("Profile created.");
      }
    } catch (e) {
      state.profiles = state.profiles.filter(p => p.id !== tempId);
      showToast("Could not create profile.", true);
      render();
    }
  }
}

function askDeleteProfile(id, name) {
  state.confirmDialog = {
    title: "Delete profile?",
    message: \`This permanently deletes "\${name}" and its subscription link. This cannot be undone.\`,
    danger: true,
    confirmLabel: "Delete",
    onConfirm: () => performDeleteProfile(id)
  };
  state.modal = "confirm";
  render();
}

async function performDeleteProfile(id) {
  closeModal();
  const prev = state.profiles;
  state.profiles = state.profiles.filter(p => p.id !== id);
  render();
  try {
    await apiFetch("/api/profiles/" + id, { method: "DELETE" });
    showToast("Profile deleted.");
  } catch (e) {
    state.profiles = prev;
    showToast("Could not delete profile.", true);
    render();
  }
}

async function duplicateProfile(id) {
  const idx = state.profiles.findIndex(p => p.id === id);
  if (idx === -1) return;
  const original = state.profiles[idx];
  const tempId = "temp-" + Date.now();
  state.profiles.splice(idx + 1, 0, { ...original, id: tempId, name: original.name + " (copy)", _pending: true });
  render();
  try {
    const result = await apiFetch("/api/profiles/" + id + "/duplicate", { method: "POST" });
    const p = result.profile;
    const pos = state.profiles.findIndex(x => x.id === tempId);
    state.profiles[pos] = {
      id: p.id, userId: p.userId, name: p.name,
      subCount: p.sources.filter(s => s.type === "subscription").length,
      rawCount: p.sources.filter(s => s.type !== "subscription").length,
      updatedAt: p.updatedAt, _pending: false
    };
    showToast("Profile duplicated.");
    render();
  } catch (e) {
    state.profiles = state.profiles.filter(p => p.id !== tempId);
    showToast("Could not duplicate profile.", true);
    render();
  }
}

async function openMerge(id) {
  state.modal = "merge";
  state.mergeResult = { loading: true, profileId: id };
  render();
  const data = await apiFetch("/api/merge-preview", {
    method: "POST",
    body: JSON.stringify({ profileId: id })
  });
  state.mergeResult = { ...data, loading: false, profileId: id };
  render();
  setTimeout(() => {
    const qrEl = document.getElementById("qrContainer");
    if (qrEl && window.qrcodegen) {
      const fullUrl = location.origin + data.subUrl;
      const qr = qrcodegen.QrCode.encodeText(fullUrl, qrcodegen.QrCode.Ecc.MEDIUM);
      qrEl.innerHTML = qr.toSvgString(4);
    }
  }, 0);
}

function copyLink() {
  const input = document.getElementById("subLinkInput");
  input.select();
  navigator.clipboard.writeText(input.value);
  showToast("Copied to clipboard!");
}

// ---------------------------------------------------------------------
// MODALS
// ---------------------------------------------------------------------
function closeModal() {
  state.modal = null;
  state.mergeResult = null;
  state.editingProfile = null;
  state.editingUser = null;
  state.confirmDialog = null;
  state.subFormatTarget = null;
  state.subFormatSelected = null;
  render();
}

function renderModal() {
  if (state.modal === "subFormat") {
    const t = state.subFormatTarget;

    if (!state.subFormatSelected) {
      const menuItems = SUB_FORMATS.map(f => \`
        <button class="format-menu-item" onclick="selectSubFormat('\${f.key}')">
          <span>\${escapeHtml(f.label)}</span>
          <span class="format-menu-arrow">›</span>
        </button>
      \`).join("");
      return \`
        <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
          <div class="card modal-card small">
            <div class="modal-title">Subscription — \${escapeHtml(t.name)}</div>
            <div class="helper-text" style="margin-bottom:10px;">Choose a format to get its link and QR code.</div>
            <div class="format-menu">\${menuItems}</div>
            <div class="modal-footer">
              <button class="btn-secondary" onclick="closeModal()">Close</button>
            </div>
          </div>
        </div>
      \`;
    }

    const f = SUB_FORMATS.find(x => x.key === state.subFormatSelected);
    const fullUrl = buildSubUrl(t.kind, t.id, state.subFormatSelected);
    return \`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="card modal-card small">
          <div class="modal-title">\${escapeHtml(t.name)} — \${escapeHtml(f ? f.label : "")}</div>
          <div class="qr-box" id="subFormatQrBox"></div>
          <label class="field-label">Subscription Link</label>
          <div class="link-row">
            <input id="subFormatLinkInput" readonly value="\${fullUrl}" />
            <button class="btn-primary" onclick="copySubFormatLink()">Copy</button>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="backToSubFormatMenu()">← Back</button>
            <button class="btn-secondary" onclick="closeModal()">Close</button>
          </div>
        </div>
      </div>
    \`;
  }

  if (state.modal === "userEditor") {
    return \`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="card modal-card small">
          <div class="modal-title">New User</div>
          <div class="field-group">
            <label class="field-label">Name</label>
            <input id="userNameInput" value="" placeholder="e.g. Alice" />
            <div class="helper-text">Names can't be changed after creation.</div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-primary" onclick="saveUser()">Save</button>
          </div>
        </div>
      </div>
    \`;
  }

  if (state.modal === "profileEditor") {
    const p = state.editingProfile;
    const sourcesText = p ? p.sources.map(s => {
      if (s.type === "raw" || s.type === "json" || s.type === "yaml") return s.value;
      return s.url;
    }).join("\\n") : "";
    return \`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="card modal-card">
          <div class="modal-title">\${p ? "Edit Profile" : "New Profile"}</div>
          <div class="field-group">
            <label class="field-label">Profile Name</label>
            \${p
              ? \`<input value="\${escapeHtml(p.name)}" disabled />
                 <div class="helper-text">Names can't be changed after creation.</div>\`
              : \`<input id="profileNameInput" value="" placeholder="e.g. My Main VPN" />\`}
          </div>
          <div class="field-group">
            <label class="field-label">Sources (one per line)</label>
            <textarea id="profileSourcesInput" rows="8" placeholder="https://example.com/sub-link&#10;vless://...&#10;trojan://...">\${escapeHtml(sourcesText)}</textarea>
            <div class="helper-text">Paste subscription URLs, individual vless/vmess/ss/trojan links, or an Xray/V2Ray JSON outbound — one per line (JSON entries can span multiple lines if pasted as a single block).</div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-primary" onclick="saveProfile()">Save</button>
          </div>
        </div>
      </div>
    \`;
  }

  if (state.modal === "merge") {
    const r = state.mergeResult;
    if (r.loading) {
      return \`
        <div class="modal-overlay">
          <div class="card modal-card">
            <div class="modal-title">Merge Result</div>
            <div class="stat-row">
              <div class="stat-box"><div class="skel" style="width:36px;height:22px;margin:0 auto 4px;"></div><div class="skel" style="width:64px;height:11px;margin:0 auto;"></div></div>
              <div class="stat-box"><div class="skel" style="width:36px;height:22px;margin:0 auto 4px;"></div><div class="skel" style="width:90px;height:11px;margin:0 auto;"></div></div>
            </div>
            <div class="skel" style="width:clamp(140px, 45vw, 180px);height:clamp(140px, 45vw, 180px);margin:16px auto;border-radius:12px;"></div>
            <div class="skel" style="width:90px;height:11px;margin-bottom:6px;"></div>
            <div class="skel" style="width:100%;height:36px;"></div>
          </div>
        </div>
      \`;
    }
    const fullUrl = location.origin + r.subUrl;
    return \`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="card modal-card">
          <div class="modal-title">Merge Result</div>
          <div class="stat-row">
            <div class="stat-box"><div class="stat-num">\${r.totalNodes}</div><div class="stat-label">Total Nodes</div></div>
            <div class="stat-box"><div class="stat-num">\${r.duplicatesRemoved}</div><div class="stat-label">Duplicates Removed</div></div>
          </div>
          <div class="qr-box" id="qrContainer"></div>
          <label class="field-label">Subscription Link</label>
          <div class="link-row">
            <input id="subLinkInput" readonly value="\${fullUrl}" />
            <button class="btn-primary" onclick="copyLink()">Copy</button>
          </div>
          \${renderSourceIssues(r.sourceErrors)}
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Close</button>
          </div>
        </div>
      </div>
    \`;
  }

  if (state.modal === "settings") {
    return \`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="card modal-card small">
          <div class="modal-title">Settings</div>
          <button class="btn-primary" style="width:100%;" onclick="location.href='/change-panel-password'">Change Panel Password</button>
          <div class="helper-text" style="margin-bottom:16px;">
            Rotates only ADMIN_PASSWORD_HASH — update just that one value in
            <strong>Variables and Secrets</strong> (type <strong>Secret</strong>). Sessions and links keep working.
          </div>
          <button class="btn-danger btn-secondary" style="width:100%;" onclick="location.href='/secret?action=destroy'">Regenerate All Secrets</button>
          <div class="helper-text">
            Step-by-step walkthrough to replace ADMIN_SALT, ADMIN_PASSWORD_HASH, and JWT_SECRET
            all at once. Every existing session, login token, and subscription link stops
            working until the new values are saved in Cloudflare.
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Close</button>
          </div>
        </div>
      </div>
    \`;
  }

  if (state.modal === "confirm") {
    const c = state.confirmDialog;
    return \`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="card modal-card small">
          <div class="modal-title">\${escapeHtml(c.title)}</div>
          <div class="helper-text" style="font-size:13px;color:var(--text-primary);">\${escapeHtml(c.message)}</div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-secondary \${c.danger ? "btn-danger" : ""}" id="confirmActionBtn">\${escapeHtml(c.confirmLabel || "Confirm")}</button>
          </div>
        </div>
      </div>
    \`;
  }

  return "";
}

// ---------------------------------------------------------------------
// ROOT RENDER
// ---------------------------------------------------------------------
function render() {
  const app = document.getElementById("app");
  if (state.view === "login") {
    app.innerHTML = renderLoginView();
    document.getElementById("loginPassword")?.addEventListener("keydown", e => {
      if (e.key === "Enter") doLogin();
    });
    return;
  }
  if (state.view === "dashboard") { app.innerHTML = renderDashboardView(); }
  else if (state.view === "users") { app.innerHTML = renderUsersView(); }
  else if (state.view === "userProfiles") { app.innerHTML = renderUserProfilesView(); }

  // Confirm dialogs attach their handler post-render since the callback is
  // a closure, not something that survives being stamped into an HTML string.
  const confirmBtn = document.getElementById("confirmActionBtn");
  if (confirmBtn && state.confirmDialog) {
    confirmBtn.onclick = state.confirmDialog.onConfirm;
  }
}

(async function init() {
  document.documentElement.setAttribute("data-theme", getThemePref());
  // Live-follow the OS theme only while the user hasn't made an explicit
  // choice of their own (no stored override yet).
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!localStorage.getItem("vexa_theme")) {
      document.documentElement.setAttribute("data-theme", getThemePref());
      render();
    }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSidebar(); });

  if (state.token) {
    try {
      state.view = "dashboard";
      if (location.pathname !== "/panel") history.replaceState(null, "", "/panel");
      await bootAuthenticated();
      return;
    } catch {
      state.view = "login";
      if (location.pathname !== "/login") history.replaceState(null, "", "/login");
    }
  } else {
    state.view = "login";
    if (location.pathname !== "/login") history.replaceState(null, "", "/login");
  }
  render();
})();

`;
