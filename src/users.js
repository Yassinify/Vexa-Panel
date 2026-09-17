// =====================================================================
// VEXA — Users CRUD + dashboard stats
// =====================================================================

import { json, safeJson } from "./http.js";
import { VEXA_VERSION } from "./constants.js";
import {
  kvGetJson,
  kvPutJson,
  adjustStats,
  recordActivity,
} from "./kv.js";
import { addUserId, removeUserId, withUserLock } from "./index-coordinator.js";
import { validateNodeUri } from "./uri-validate.js";
import { parseXrayJsonSource } from "./xray-json.js";
import { parseClashYamlSource } from "./clash-yaml.js";

// ---------------------------------------------------------------------
// idx:users SERIALIZATION (docs/problem.md DK-2)
// Cloudflare KV has no compare-and-swap/locking primitive, so a bare
// read -> mutate array in memory -> write of idx:users can lose an entry
// if two requests' get/put calls interleave. createUser/deleteUser below
// now delegate the entire idx:users
// get -> parse -> mutate -> put cycle to the IndexCoordinator Durable
// Object (src/index-coordinator.js) via addUserId()/removeUserId(), which
// serializes it across Worker isolates, not just within one. The previous
// same-isolate-only idxUsersLock/withIdxUsersLock Promise-chain lock is
// removed: each call site below no longer performs its own local
// read-modify-write of idx:users at all, so there is nothing left for a
// local lock to guard.
// ---------------------------------------------------------------------

export async function getStats(env) {
  const stats = await kvGetJson(env, "meta:stats", {
    totalUsers: 0,
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

export async function listUsers(env) {
  const userIds = await kvGetJson(env, "idx:users", []);
  const users = await Promise.all(
    userIds.map(async (id) => {
      // kvGetJson() returns null for both a missing record and a malformed
      // one (it swallows JSON.parse failures internally) — either way this
      // id is dropped below via .filter(Boolean), so one corrupted user
      // record can't reject the whole Promise.all (see docs/problem.md DK-1).
      const user = await kvGetJson(env, `user:${id}`, null);
      if (!user) return null;
      const sources = user.sources || [];
      return {
        id: user.id,
        name: user.name,
        enabled: user.enabled !== false,
        subCount: sources.filter((s) => s.type === "subscription").length,
        rawCount: sources.filter((s) => s.type !== "subscription").length,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    }),
  );
  return json({ users: users.filter(Boolean) });
}

export async function createUser(request, env) {
  const body = await safeJson(request);
  if (!body || !body.name || typeof body.name !== "string") {
    return json({ error: "name_required" }, 400);
  }
  const { sources, invalid } = normalizeSources(body.sources || []);
  const nodeIds = await resolveValidNodeIds(env, body.nodeIds);
  const now = Date.now();
  const user = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    enabled: true,
    sources,
    nodeIds,
    createdAt: now,
    updatedAt: now,
  };
  await kvPutJson(env, `user:${user.id}`, user);
  await addUserId(env, user.id);
  await adjustStats(env, {
    totalUsers: 1,
    totalSubSources: sources.filter((s) => s.type === "subscription").length,
    totalRawSources: sources.filter((s) => s.type !== "subscription").length,
  });
  await recordActivity(env, `Created user "${user.name}"`);
  return json({ user, invalidSources: invalid }, 201);
}

export async function getUser(id, env) {
  // kvGetJson() folds "missing" and "malformed JSON" into the same null
  // result, so a corrupted record reports not_found instead of throwing a
  // SyntaxError (see docs/problem.md DK-1).
  const user = await kvGetJson(env, `user:${id}`, null);
  if (!user) return json({ error: "not_found" }, 404);
  user.enabled = user.enabled !== false;
  return json({ user });
}

export async function updateUser(id, request, env) {
  const body = await safeJson(request);
  let toggled = false;
  let renamed = false;
  let invalid = [];
  let sourcesChanged = false;
  let oldName;
  let beforeSub = 0;
  let beforeRaw = 0;
  let user;

  // Read -> mutate -> write of this user:{uuid} record is serialized
  // against deleteNode()'s cascade cleanup via the same per-user lock, so
  // a stale write here cannot restore a nodeIds[] entry the cascade
  // already removed (docs/problem.md DK-3).
  await withUserLock(env, id, async () => {
    // See getUser() above — malformed JSON is treated the same as a missing
    // record instead of throwing (docs/problem.md DK-1).
    const current = await kvGetJson(env, `user:${id}`, null);
    if (!current) return;
    oldName = current.name;
    const beforeSources = current.sources || [];
    beforeSub = beforeSources.filter(
      (s) => s.type === "subscription",
    ).length;
    beforeRaw = beforeSources.filter(
      (s) => s.type !== "subscription",
    ).length;
    if (
      body &&
      typeof body.name === "string" &&
      body.name.trim() &&
      body.name.trim() !== current.name
    ) {
      current.name = body.name.trim();
      renamed = true;
    }
    if (
      body &&
      typeof body.enabled === "boolean" &&
      body.enabled !== (current.enabled !== false)
    ) {
      current.enabled = body.enabled;
      toggled = true;
    }
    if (body && body.sources) {
      const result = normalizeSources(body.sources);
      current.sources = result.sources;
      invalid = result.invalid;
      sourcesChanged = true;
    }
    if (body && Array.isArray(body.nodeIds)) {
      current.nodeIds = await resolveValidNodeIds(env, body.nodeIds);
    } else if (Array.isArray(current.nodeIds) && current.nodeIds.length > 0) {
      // DK-12 opportunistic cleanup -- see stripDeletedNodeIds() above.
      // Only runs when this request didn't already replace nodeIds[]
      // wholesale via resolveValidNodeIds() just above.
      current.nodeIds = await stripDeletedNodeIds(env, current.nodeIds);
    }
    current.updatedAt = Date.now();
    await kvPutJson(env, `user:${id}`, current);
    user = current;
  });

  if (!user) return json({ error: "not_found" }, 404);

  if (sourcesChanged) {
    const afterSub = user.sources.filter(
      (s) => s.type === "subscription",
    ).length;
    const afterRaw = user.sources.filter(
      (s) => s.type !== "subscription",
    ).length;
    await adjustStats(env, {
      totalSubSources: afterSub - beforeSub,
      totalRawSources: afterRaw - beforeRaw,
    });
    await recordActivity(env, `Updated sources for user "${user.name}"`);
  }
  if (toggled)
    await recordActivity(
      env,
      `${user.enabled ? "Enabled" : "Disabled"} user "${user.name}"`,
    );
  if (renamed)
    await recordActivity(env, `Renamed user "${oldName}" to "${user.name}"`);
  user.enabled = user.enabled !== false;
  return json({ user, invalidSources: invalid });
}

export async function deleteUser(id, env) {
  // See getUser() above — malformed JSON is treated the same as a missing
  // record instead of throwing (docs/problem.md DK-1).
  const user = await kvGetJson(env, `user:${id}`, null);
  if (!user) return json({ error: "not_found" }, 404);
  const sources = user.sources || [];
  const subCount = sources.filter((s) => s.type === "subscription").length;
  const rawCount = sources.filter((s) => s.type !== "subscription").length;

  // DK-11: index cleanup runs before the primary-record delete, so an
  // interruption between the two leaves an orphaned-but-harmless
  // user:{uuid} record with no idx:users reference (invisible to
  // listUsers(), which only discovers records via the index) instead of
  // a ghost id persisting forever in idx:users.
  await removeUserId(env, id);
  await env.STORAGE.delete(`user:${id}`);
  await adjustStats(env, {
    totalUsers: -1,
    totalSubSources: -subCount,
    totalRawSources: -rawCount,
  });
  await recordActivity(env, `Deleted user "${user.name}"`);
  return json({ success: true });
}

// ---------------------------------------------------------------------
// NODE ASSIGNMENT (validated against idx:nodes here to avoid a circular
// import with nodes.js, which already imports normalizeSources from this
// file)
// ---------------------------------------------------------------------
async function resolveValidNodeIds(env, nodeIds) {
  if (!Array.isArray(nodeIds)) return [];
  const knownIds = new Set(await kvGetJson(env, "idx:nodes", []));
  const seen = new Set();
  const result = [];
  for (const id of nodeIds) {
    if (!knownIds.has(id) || seen.has(id)) continue;
    const node = await kvGetJson(env, `node:${id}`, null);
    if (node && node.enabled !== false) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

// docs/problem.md DK-12: deleteNode()'s cascade cleanup of nodeIds[] loops
// sequentially over every User and can be left partially complete if the
// Worker is interrupted mid-loop, leaving some Users referencing an
// already-deleted node:{uuid}. updateUser() already performs one
// unconditional read (under withUserLock, serialized against that same
// cascade per docs/problem.md DK-3) -> mutate -> write of the full User
// record on every call, regardless of which fields actually changed, so
// piggybacking a stale-id check here adds no new KV write and no new lock
// acquisition -- only the extra node:{uuid} reads below.
// Deliberately NOT reused as resolveValidNodeIds() above: that helper also
// drops disabled-but-still-existing nodes, which is correct only when the
// admin explicitly resubmits nodeIds[] (the panel UI only sends back
// enabled ones). Here nodeIds[] was NOT part of this request, so a node
// the admin merely disabled must stay assigned -- only ids whose
// node:{uuid} record is entirely gone (genuinely deleted) are dropped.
async function stripDeletedNodeIds(env, nodeIds) {
  const result = [];
  for (const id of nodeIds) {
    const node = await kvGetJson(env, `node:${id}`, null);
    if (node) result.push(id);
  }
  return result;
}

// ---------------------------------------------------------------------
// SOURCE CLASSIFICATION
// ---------------------------------------------------------------------
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

export function normalizeSources(sources) {
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
