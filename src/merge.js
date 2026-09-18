import { splitOnce, robustAtob } from "./uri-helpers.js";
import { parseXrayJsonSource } from "./xray-json.js";
import { parseClashYamlSource } from "./clash-yaml.js";
import { generateNodeUri } from "./uri-codec.js";
import { json, safeJson } from "./http.js";
import {
  subCacheKeyFor,
  putSubscriptionCache,
  getSubscriptionCache,
  getNodeRowById,
  rowToNode,
  getUserRowById,
  getUserNodeIds,
  rowToUser,
} from "./d1.js";

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

// Bounds how long a single source is allowed to hang before it's treated
// as a failure. Without this, a source that never responds (as opposed to
// one that responds with an error status) would leave its fetch() promise
// pending forever, stalling the sequential merge loop in mergeUserNodes()
// and preventing every other source from being returned too.
const SUBSCRIPTION_FETCH_TIMEOUT_MS = 10000;

export async function fetchSubscriptionNodes(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    SUBSCRIPTION_FETCH_TIMEOUT_MS,
  );
  let resp;
  try {
    resp = await fetch(url, {
      headers: { "User-Agent": "v2rayNG/1.8.0" },
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw new Error("fetch_timeout");
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
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

// ---------------------------------------------------------------------
// FINGERPRINTING — used to dedup nodes across merged sources
// ---------------------------------------------------------------------

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

export function fingerprintNode(uri) {
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
// MERGE: combine every source on a user (raw links, subscription URLs,
// JSON, YAML) into one deduped node list, with a D1-backed fallback cache
// so a temporarily-unreachable subscription doesn't blank out a client's
// config.
// ---------------------------------------------------------------------
// Resolves a User's Node references (ordered) to their current, enabled
// Node Source objects. Missing or disabled Nodes are skipped silently —
// same tolerant behavior as an unavailable Exclusive Source, just resolved
// one step earlier (before the per-type fetch loop below even sees it).
async function resolveNodeSources(user, env) {
  const nodeIds = Array.isArray(user.nodeIds) ? user.nodeIds : [];
  if (nodeIds.length === 0) return [];
  const resolved = [];
  for (const id of nodeIds) {
    const row = await getNodeRowById(env, id);
    const node = rowToNode(row);
    if (node && node.enabled !== false && node.source) {
      resolved.push(node.source);
    }
  }
  return resolved;
}

export async function mergeUserNodes(user, env) {
  const allNodes = [];
  const errors = [];
  const nodeSources = await resolveNodeSources(user, env);
  const sourcesToProcess = [...nodeSources, ...(user.sources || [])];

  for (const source of sourcesToProcess) {
    if (source.type === "raw") {
      allNodes.push(source.value);
    } else if (source.type === "subscription") {
      const cacheKey = env ? await subCacheKeyFor(source.url) : null;
      try {
        const nodes = await fetchSubscriptionNodes(source.url);
        allNodes.push(...nodes);
        // Remember this successful fetch so a later outage of this same
        // source can fall back to it instead of silently dropping nodes.
        // putSubscriptionCache() already swallows its own write failures
        // (src/d1.js), so a cache-write failure still can't fail the merge.
        if (cacheKey) {
          await putSubscriptionCache(env, cacheKey, nodes);
        }
      } catch (e) {
        let usedCache = false;
        let cacheAgeMs = null;
        if (cacheKey) {
          // getSubscriptionCache() returns null on a miss, an expired entry,
          // or a read failure (src/d1.js) -- same "no fallback available"
          // outcome as the old KV get()+JSON.parse() try/catch had.
          const cached = await getSubscriptionCache(env, cacheKey);
          if (cached) {
            allNodes.push(...cached.nodes);
            usedCache = true;
            cacheAgeMs = Date.now() - cached.fetchedAt;
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

export async function mergePreviewHandler(request, env) {
  const body = await safeJson(request);
  if (!body || !body.userId)
    return json({ error: "user_id_required" }, 400);

  const row = await getUserRowById(env, body.userId);
  if (!row) return json({ error: "not_found" }, 404);
  const nodeIds = await getUserNodeIds(env, body.userId);
  const user = rowToUser(row, nodeIds);

  const result = await mergeUserNodes(user, env);

  return json({
    totalNodes: result.nodes.length,
    totalFetched: result.totalFetched,
    duplicatesRemoved: result.duplicatesRemoved,
    sourceErrors: result.sourceErrors,
    subUrl: `/sub/user/${user.id}`,
  });
}
