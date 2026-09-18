// =====================================================================
// VEXA — JWT (manual HMAC-SHA256, no dependencies)
// =====================================================================

import { json } from "./http.js";
import { resolveAuthConfig } from "./d1.js";

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

export async function signJwt(payload, secret, expiresInSeconds = 3600 * 48) {
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

export async function verifyJwt(token, secret) {
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

export async function requireAuth(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match) return json({ error: "missing_token" }, 401);

  // Effective JWT secret: all three Secrets when complete, otherwise the
  // persisted D1 auth_config, otherwise null. Delegates entirely to
  // resolveAuthConfig() (src/d1.js) so this precedence is defined in
  // exactly one place — jwt.js must not duplicate it, and must not import
  // secrets.js (which already imports signJwt from this file) to get it.
  const config = await resolveAuthConfig(env);
  if (!config) {
    // No complete Secret configuration and no D1 auth_config row yet:
    // there is no secret to verify a token against. Reject outright
    // rather than fabricating one or letting the request through —
    // missing configuration must never be treated as "authenticated".
    return json({ error: "not_configured" }, 401);
  }

  try {
    return await verifyJwt(match[1], config.jwtSecret);
  } catch (e) {
    return json({ error: "invalid_token" }, 401);
  }
}
