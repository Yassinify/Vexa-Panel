import { parseXrayJsonSource } from "./backend/protocols/xray-json.js";
import { parseClashYamlSource } from "./backend/protocols/clash-yaml.js";
import { fingerprintNode } from "./fingerprint.js";
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
} from "./backend/database/d1.js";

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

// Returns { nodes, jsonText }. A link-list, base64 or Clash YAML subscription
// gives its proxy links in `nodes` and null in `jsonText`. A JSON subscription
// is never converted: `nodes` is empty and `jsonText` is the response body
// exactly as received.
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

  const looksJsonBody =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
  if (looksJsonBody) {
    // The parser is used only to check that the body is a usable config
    // (at least one proxy outbound); its result is discarded, so the body
    // itself is returned untouched.
    const { nodes: jsonNodes } = parseXrayJsonSource(trimmed);
    if (jsonNodes.length > 0) {
      return { nodes: [], jsonText: text };
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
    if (yamlUris.length > 0) return { nodes: yamlUris, jsonText: null };
  }

  // Plain-text / base64 line-list subscription: keep only lines that are
  // themselves a proxy link (start with a known scheme), not just any line
  // that happens to contain "://" somewhere in its value — a body that
  // isn't actually a URI list (stray prose, a misformatted JSON fragment,
  // an HTML error page, etc.) could otherwise leak non-link text through.
  const KNOWN_NODE_SCHEMES =
    /^(vless|vmess|ss|ssr|trojan|hysteria2|hy2|tuic|hysteria|wireguard|socks):\/\/|^naive\+(https|quic):\/\//i;
  const lineNodes = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && KNOWN_NODE_SCHEMES.test(l));
  return { nodes: lineNodes, jsonText: null };
}

// Fallback-cache entry for one fetched subscription. A link list is stored as
// a plain array, exactly as before, so entries written by earlier versions
// stay readable. A JSON subscription is stored as { jsonText }.
function toCacheEntry(fetched) {
  return fetched.jsonText === null ? fetched.nodes : { jsonText: fetched.jsonText };
}

function fromCacheEntry(entry) {
  if (Array.isArray(entry)) return { nodes: entry, jsonText: null };
  if (entry && typeof entry.jsonText === "string") {
    return { nodes: [], jsonText: entry.jsonText };
  }
  return { nodes: [], jsonText: null };
}

// ---------------------------------------------------------------------
// MERGE: combine every source on a user (raw links, subscription URLs,
// JSON, YAML) into one deduped node list, with a D1-backed fallback cache
// so a temporarily-unreachable subscription doesn't blank out a client's
// config. JSON configs (pasted or from a subscription URL) are not part of
// that list: they are kept as text, unchanged, in `jsonConfigs`.
// ---------------------------------------------------------------------
// Resolves a User's Node references (ordered) to their current, enabled
// Node Source objects. Missing or disabled Nodes are skipped silently —
// same tolerant behavior as an unavailable Exclusive Source, just resolved
// one step earlier (before the per-type fetch loop below even sees it).
async function resolveNodeSources(user, env) {
  // Returns { sources, ids }: the usable Node sources and the ids of the Nodes they came from
  // (the caller reports the ids so a client fetch can mark those Nodes as refreshed).
  const nodeIds = Array.isArray(user.nodeIds) ? user.nodeIds : [];
  if (nodeIds.length === 0) return { sources: [], ids: [] };
  const resolved = [];
  const usedIds = [];
  for (const id of nodeIds) {
    const row = await getNodeRowById(env, id);
    const node = rowToNode(row);
    if (node && node.enabled !== false && node.source) {
      resolved.push(node.source);
      usedIds.push(node.id);
    }
  }
  return { sources: resolved, ids: usedIds };
}

export async function mergeUserNodes(user, env) {
  const allNodes = [];
  const jsonConfigs = [];
  const errors = [];
  const { sources: nodeSources, ids: usedNodeIds } = await resolveNodeSources(user, env);
  const sourcesToProcess = [...nodeSources, ...(user.sources || [])];

  for (const source of sourcesToProcess) {
    if (source.type === "raw") {
      allNodes.push(source.value);
    } else if (source.type === "subscription") {
      const cacheKey = await subCacheKeyFor(source.url);
      try {
        const fetched = await fetchSubscriptionNodes(source.url);
        allNodes.push(...fetched.nodes);
        if (fetched.jsonText !== null) jsonConfigs.push(fetched.jsonText);
        // Remember this successful fetch so a later outage of this same
        // source can fall back to it instead of silently dropping nodes.
        // putSubscriptionCache() already swallows its own write failures
        // (src/d1.js), so a cache-write failure still can't fail the merge.
        await putSubscriptionCache(env, cacheKey, toCacheEntry(fetched));
      } catch (e) {
        let usedCache = false;
        let cacheAgeMs = null;
        // getSubscriptionCache() returns null on a miss, an expired entry,
        // or a read failure (src/d1.js) -- same "no fallback available"
        // outcome as the old KV get()+JSON.parse() try/catch had.
        const cached = await getSubscriptionCache(env, cacheKey);
        if (cached) {
          const entry = fromCacheEntry(cached.nodes);
          allNodes.push(...entry.nodes);
          if (entry.jsonText !== null) jsonConfigs.push(entry.jsonText);
          usedCache = true;
          cacheAgeMs = Date.now() - cached.fetchedAt;
        }
        errors.push({
          url: source.url,
          error: e.message,
          usedCache,
          cacheAgeMs,
        });
      }
    } else if (source.type === "json") {
      // Kept as the stored text, never parsed into links.
      jsonConfigs.push(source.value);
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
    jsonConfigs,
    totalFetched: allNodes.length,
    duplicatesRemoved: duplicateCount,
    sourceErrors: errors,
    usedNodeIds,
  };
}

export async function mergePreviewHandler(request, env) {
  const body = await safeJson(request);
  if (!body || !body.userId) return json({ error: "user_id_required" }, 400);

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
