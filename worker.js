// =====================================================================
// VEXA — VPN Subscription Manager (single-file Cloudflare Worker)
// =====================================================================
//

const VEXA_VERSION = "1.4.0";
const VEXA_BUILD_DATE = "2026-07-29";

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

  if (pathname.startsWith("/sub/") && method === "GET") {
    return handlePublicSub(pathname.split("/sub/")[1], env, url);
  }

  if (pathname === "/" || pathname === "/index.html") {
    return htmlResponse(renderApp());
  }

  if (pathname === "/api/login" && method === "POST") {
    return withCors(request, await handleLogin(request, env), env);
  }

  // Public and unauthenticated on purpose — a version string isn't
  // sensitive, and this lets the deployed build be checked with curl
  // (or a monitoring probe) without needing to load the UI or log in.
  if (pathname === "/api/version" && method === "GET") {
    return withCors(
      request,
      json({ version: VEXA_VERSION, buildDate: VEXA_BUILD_DATE }),
      env,
    );
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

async function signJwt(payload, secret, expiresInSeconds = 3600 * 12) {
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
// PROFILE CRUD (KV: profile:{uuid})
// ---------------------------------------------------------------------
async function handleApi(pathname, method, request, env, authPayload) {
  if (pathname === "/api/profiles" && method === "GET") {
    return listProfiles(env);
  }
  if (pathname === "/api/profiles" && method === "POST") {
    return createProfile(request, env);
  }

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

async function listProfiles(env) {
  const list = await env.STORAGE.list({ prefix: "profile:" });
  const profiles = await Promise.all(
    list.keys.map(async (k) => {
      const raw = await env.STORAGE.get(k.name);
      return raw ? JSON.parse(raw) : null;
    }),
  );
  const summarized = profiles.filter(Boolean).map((p) => ({
    id: p.id,
    name: p.name,
    subCount: p.sources.filter((s) => s.type === "subscription").length,
    rawCount: p.sources.filter(
      (s) => s.type === "raw" || s.type === "json" || s.type === "yaml",
    ).length,
    updatedAt: p.updatedAt,
  }));
  return json({ profiles: summarized });
}

async function createProfile(request, env) {
  const body = await safeJson(request);
  if (!body || !body.name || typeof body.name !== "string") {
    return json({ error: "name_required" }, 400);
  }

  const { sources, invalid } = normalizeSources(body.sources);
  const now = Date.now();
  const profile = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    sources,
    createdAt: now,
    updatedAt: now,
  };

  await env.STORAGE.put(`profile:${profile.id}`, JSON.stringify(profile));
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

  const body = await safeJson(request);
  let invalid = [];
  if (body && body.name) existing.name = body.name.trim();
  if (body && body.sources) {
    const result = normalizeSources(body.sources);
    existing.sources = result.sources;
    invalid = result.invalid;
  }
  existing.updatedAt = Date.now();

  await env.STORAGE.put(`profile:${id}`, JSON.stringify(existing));
  return json({ profile: existing, invalidSources: invalid });
}

async function deleteProfile(id, env) {
  const existing = await env.STORAGE.get(`profile:${id}`);
  if (!existing) return json({ error: "not_found" }, 404);
  await env.STORAGE.delete(`profile:${id}`);
  return json({ success: true });
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
    /^(vless|vmess|ss|ssr|trojan|hysteria2|hy2|tuic):\/\//i;
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
  const subtitle = `Vexa - ${profile.name}`;
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

// =====================================================================
// FRONTEND (HTML + CSS + client JS, all inline)
// =====================================================================
function renderApp() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VEXA — VPN Panel</title>
<style>${STYLES}</style>
</head>
<body>
  <div id="app"></div>
  <div class="version-badge" title="Deployed ${VEXA_BUILD_DATE}">VEXA v${VEXA_VERSION}</div>
  <script>${QR_LIB}</script>
  <script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}

const STYLES = `
:root {
  --bg-deep: #0a0716;
  --neon-purple: #a855f7;
  --neon-blue: #38bdf8;
  --neon-green: #34d399;
  --glass-bg: rgba(255,255,255,0.05);
  --glass-border: rgba(255,255,255,0.12);
  --text-primary: #f5f3ff;
  --text-muted: #9ca3af;
  --font-stack: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh;
  background:
    radial-gradient(circle at 20% 20%, #1a0f3d 0%, #0a0716 45%),
    radial-gradient(circle at 80% 80%, #0f1f3d 0%, transparent 50%),
    var(--bg-deep);
  font-family: var(--font-stack);
  color: var(--text-primary);
}
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06);
  transition: transform .25s ease, box-shadow .25s ease;
}
.glass-card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(168,85,247,.25), inset 0 1px 0 rgba(255,255,255,.08); }
.btn-primary {
  background: linear-gradient(135deg, var(--neon-purple), #7c3aed);
  border: none; color: #fff; padding: 12px 24px; border-radius: 12px;
  font-weight: 600; cursor: pointer; box-shadow: 0 4px 20px rgba(168,85,247,.4);
  transition: box-shadow .2s ease, transform .15s ease; font-size: 14px;
}
.btn-primary:hover { box-shadow: 0 6px 28px rgba(168,85,247,.6); transform: translateY(-1px); }
.btn-secondary {
  background: rgba(255,255,255,.08); border: 1px solid var(--glass-border); color: var(--text-primary);
  padding: 10px 18px; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 500;
}
.btn-danger { background: rgba(239,68,68,.15); border: 1px solid rgba(239,68,68,.3); color: #fca5a5; }
input, textarea {
  width: 100%; background: rgba(255,255,255,.04); border: 1px solid var(--glass-border);
  color: var(--text-primary); padding: 12px 14px; border-radius: 10px; font-size: 14px; font-family: inherit;
}
.login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
.login-card { width: 100%; max-width: 380px; padding: 40px 32px; text-align: center; }
.logo-glow { filter: drop-shadow(0 0 12px var(--neon-purple)); margin-bottom: 8px; }
.brand { font-weight: 700; font-size: 22px; letter-spacing: .02em; margin-bottom: 4px; }
.brand-sub { color: var(--text-muted); font-size: 13px; margin-bottom: 28px; }
.header { display: flex; align-items: center; justify-content: space-between; padding: 18px 28px; }
.header-left { display: flex; align-items: center; gap: 10px; }
.avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: linear-gradient(135deg, var(--neon-purple), var(--neon-blue));
  display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px;
}
.container { max-width: 1100px; margin: 0 auto; padding: 0 24px 60px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
.profile-card { padding: 22px; }
.profile-name { font-size: 17px; font-weight: 600; margin: 0 0 10px; }
.badge-row { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.badge { font-size: 11px; padding: 4px 10px; border-radius: 20px; background: rgba(168,85,247,.15); color: #d8b4fe; border: 1px solid rgba(168,85,247,.25); }
.badge.green { background: rgba(52,211,153,.15); color: #6ee7b7; border-color: rgba(52,211,153,.25); }
.timestamp { color: var(--text-muted); font-size: 12px; margin-bottom: 16px; }
.card-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
.modal-card { width: 100%; max-width: 520px; padding: 28px; max-height: 85vh; overflow-y: auto; }
.modal-title { font-size: 18px; font-weight: 700; margin-bottom: 20px; }
.field-label { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #a78bfa; margin-bottom: 6px; display: block; }
.field-group { margin-bottom: 18px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }
.stat-row { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.stat-box { flex: 1; min-width: 100px; text-align: center; padding: 16px; background: rgba(255,255,255,.03); border-radius: 14px; border: 1px solid var(--glass-border); }
.stat-num { font-size: 24px; font-weight: 700; }
.stat-label { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.qr-box { background: #fff; border-radius: 16px; padding: 16px; display: flex; align-items: center; justify-content: center; margin: 16px 0; }
.qr-box svg { width: 200px; height: 200px; }
.link-row { display: flex; gap: 8px; align-items: center; }
.link-row input { font-family: monospace; font-size: 12px; }
.toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: rgba(52,211,153,.15); border: 1px solid rgba(52,211,153,.4); color: #6ee7b7;
  padding: 10px 20px; border-radius: 10px; font-size: 13px; z-index: 100;
}
.version-badge {
  position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%);
  background: rgba(15,10,25,.92); border: 1px solid rgba(168,85,247,.45);
  color: var(--text-primary); font-family: monospace; font-size: 11px;
  letter-spacing: .03em; padding: 5px 14px; border-radius: 20px;
  z-index: 20; pointer-events: none; user-select: none;
  box-shadow: 0 2px 10px rgba(0,0,0,.35);
}
.error-text { color: #fca5a5; font-size: 13px; margin-top: 10px; min-height: 16px; }
.helper-text { color: var(--text-muted); font-size: 12px; margin-top: 6px; }
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
  profiles: [],
  view: "login",
  modal: null,
  mergeResult: null,
  editingProfile: null,
  errorMsg: ""
};

// Splits pasted source text into entries. Plain lines (URLs, vless://, etc.)
// split on newline as before. A line starting with '{' or '[' begins a JSON
// block that continues (bracket-depth aware) until brackets balance, so a
// pretty-printed Xray outbound/config (or an array of them) pasted across
// multiple lines becomes one entry. A line starting with "proxies:" begins
// a Clash-style YAML block that continues until indentation returns to
// column 0 (or the text ends), so a pasted Clash subscription also becomes
// one entry instead of being split apart line by line.
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
    render();
    throw new Error("unauthorized");
  }
  return res.json();
}

async function loadProfiles() {
  const data = await apiFetch("/api/profiles");
  state.profiles = data.profiles || [];
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff/60) + "m ago";
  if (diff < 86400) return Math.floor(diff/3600) + "h ago";
  return Math.floor(diff/86400) + "d ago";
}

function formatCacheAge(ms) {
  const diff = Math.floor(ms / 1000);
  if (diff < 60) return "moments old";
  if (diff < 3600) return Math.floor(diff/60) + "m old";
  if (diff < 86400) return Math.floor(diff/3600) + "h old";
  return Math.floor(diff/86400) + "d old";
}

// Separates source-fetch issues into two severities: sources that failed
// but recovered via the last-known-good cache (degraded, still serving
// nodes) versus sources that failed with no cache to fall back to (nodes
// from that source are genuinely missing). Admins need to tell these apart
// — a stale-but-present source is a "keep an eye on it", a fully-failed one
// needs action.
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderLoginView() {
  return \`
    <div class="login-wrap">
      <div class="glass-card login-card">
        <div class="logo-glow" style="font-size:32px;">🔒</div>
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
    await loadProfiles();
    render();
  } catch (e) {
    state.errorMsg = "Connection error.";
    render();
  }
}

function logout() {
  state.token = null;
  localStorage.removeItem("vexa_token");
  state.view = "login";
  render();
}

function renderHeader() {
  return \`
    <div class="header">
      <div class="header-left">
        <div class="avatar">V</div>
        <div>
          <div style="font-weight:700;">VEXA</div>
          <div style="font-size:11px;color:var(--text-muted);">Admin Panel</div>
        </div>
      </div>
      <button class="btn-secondary" onclick="logout()">Logout</button>
    </div>
  \`;
}

function renderDashboardView() {
  const cards = state.profiles.map(p => \`
    <div class="glass-card profile-card">
      <div class="profile-name">\${escapeHtml(p.name)}</div>
      <div class="badge-row">
        <span class="badge">\${p.subCount} subs</span>
        <span class="badge green">\${p.rawCount} raw</span>
      </div>
      <div class="timestamp">Updated \${timeAgo(p.updatedAt)}</div>
      <div class="card-actions">
        <button class="btn-primary" onclick="openMerge('\${p.id}')">Merge / Link</button>
        <button class="btn-secondary" onclick="openEditor('\${p.id}')">Edit</button>
        <button class="btn-secondary btn-danger" onclick="confirmDelete('\${p.id}')">Delete</button>
      </div>
    </div>
  \`).join("");

  return \`
    \${renderHeader()}
    <div class="container">
      <div class="top-bar">
        <h2 style="margin:20px 0 0;">Profiles</h2>
        <button class="btn-primary" style="margin-top:20px;" onclick="openEditor(null)">+ New Profile</button>
      </div>
      \${state.profiles.length === 0
        ? '<div class="empty-state">No profiles yet. Create one to get started.</div>'
        : '<div class="grid">' + cards + '</div>'}
    </div>
    \${renderModal()}
  \`;
}

function openEditor(id) {
  state.editingProfile = id ? state.profiles.find(p => p.id === id) : null;
  state.modal = "editor";
  if (id) {
    apiFetch("/api/profiles/" + id).then(data => {
      state.editingProfile = data.profile;
      render();
    });
  } else {
    render();
  }
}

async function confirmDelete(id) {
  if (!confirm("Delete this profile? This cannot be undone.")) return;
  await apiFetch("/api/profiles/" + id, { method: "DELETE" });
  await loadProfiles();
  render();
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

function closeModal() {
  state.modal = null;
  state.mergeResult = null;
  state.editingProfile = null;
  render();
}

async function saveProfile() {
  const name = document.getElementById("profileNameInput").value.trim();
  const sourcesText = document.getElementById("profileSourcesInput").value;
  const sources = splitSourceEntries(sourcesText);

  if (!name) { alert("Name is required."); return; }

  let result;
  if (state.editingProfile && state.editingProfile.id) {
    result = await apiFetch("/api/profiles/" + state.editingProfile.id, {
      method: "PUT",
      body: JSON.stringify({ name, sources })
    });
  } else {
    result = await apiFetch("/api/profiles", {
      method: "POST",
      body: JSON.stringify({ name, sources })
    });
  }
  await loadProfiles();
  closeModal();
  if (result && result.invalidSources && result.invalidSources.length) {
    showToast(result.invalidSources.length + " line(s) skipped — invalid format.");
  }
}

function copyLink() {
  const input = document.getElementById("subLinkInput");
  input.select();
  navigator.clipboard.writeText(input.value);
  showToast("Copied to clipboard!");
}

function showToast(msg) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

function renderModal() {
  if (state.modal === "editor") {
    const p = state.editingProfile;
    const sourcesText = p ? p.sources.map(s => {
      if (s.type === "raw" || s.type === "json" || s.type === "yaml") return s.value;
      return s.url;
    }).join("\\n") : "";
    return \`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="glass-card modal-card">
          <div class="modal-title">\${p ? "Edit Profile" : "New Profile"}</div>
          <div class="field-group">
            <label class="field-label">Profile Name</label>
            <input id="profileNameInput" value="\${p ? escapeHtml(p.name) : ""}" placeholder="e.g. My Main VPN" />
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
      return '<div class="modal-overlay"><div class="glass-card modal-card" style="text-align:center;">Merging sources…</div></div>';
    }
    const fullUrl = location.origin + r.subUrl;
    return \`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="glass-card modal-card">
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

  return "";
}

function render() {
  const app = document.getElementById("app");
  if (state.view === "login") {
    app.innerHTML = renderLoginView();
    document.getElementById("loginPassword")?.addEventListener("keydown", e => {
      if (e.key === "Enter") doLogin();
    });
  } else {
    app.innerHTML = renderDashboardView();
  }
}

(async function init() {
  if (state.token) {
    try {
      await loadProfiles();
      state.view = "dashboard";
    } catch {
      state.view = "login";
    }
  }
  render();
})();
`;
