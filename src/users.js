// =====================================================================
// VEXA — Users CRUD + dashboard stats (D1-backed, see docs/problem.md DK-16)
// =====================================================================
//
// Primary storage for Users moved from KV to D1 as part of DK-16 (see
// docs/problem.md and src/d1.js's DATA MODEL comment for the schema and
// migration). This removes the coordination this file used to need from
// IndexCoordinator (src/index-coordinator.js):
//   - idx:users id-list mutation (addUserId/removeUserId, DK-2) is gone —
//     `users` is a real D1 table; `listUsers()`/`getStats()` etc. query it
//     directly instead of walking a separately-maintained id-list array.
//   - The per-user record lock (withUserLock, DK-3) existed only to
//     serialize this file's read-modify-write of a user:{uuid} record
//     against deleteNode()'s old cascade cleanup loop over every User.
//     That cascade is now `ON DELETE CASCADE` on user_nodes.node_id
//     (src/d1.js) — a single atomic DELETE FROM nodes statement, not an
//     application-level loop — so there is no longer a concurrent writer
//     of a User's Node relationships for this file's own read-modify-write
//     to race against.
//   - stripDeletedNodeIds() (DK-12's opportunistic cleanup of stale
//     nodeIds[] entries left by an interrupted cascade) is removed
//     entirely, not just left unchanged: user_nodes rows are guaranteed by
//     the ON DELETE CASCADE foreign key (src/d1.js) to never reference a
//     Node that no longer exists, so there is nothing left to clean up.
// ---------------------------------------------------------------------

import { json, safeJson } from "./http.js";
import { VEXA_VERSION } from "./constants.js";
import {
  getStatsRow,
  getRecentActivity,
  adjustStats,
  recordActivity,
  getUserRowById,
  listUserRows,
  insertUserRow,
  insertUserWithNodes,
  updateUserRow,
  updateUserWithNodes,
  deleteUserRow,
  getNodeRowById,
  getUserNodeIds,
  setUserNodeIds,
  rowToUser,
} from "./d1.js";
import { validateNodeUri } from "./uri-validate.js";
import { parseXrayJsonSource } from "./xray-json.js";
import { parseClashYamlSource } from "./clash-yaml.js";

export async function getStats(env) {
  const stats = await getStatsRow(env);
  const activity = await getRecentActivity(env);
  return json({
    stats: {
      totalUsers: stats.totalUsers,
      totalSubSources: stats.totalSubSources,
      totalRawSources: stats.totalRawSources,
    },
    activity,
    version: VEXA_VERSION,
  });
}

export async function listUsers(env) {
  const rows = await listUserRows(env);
  const users = rows.map((row) => {
    const sources = JSON.parse(row.sources || "[]");
    return {
      id: row.id,
      name: row.name,
      enabled: row.enabled !== 0,
      subCount: sources.filter((s) => s.type === "subscription").length,
      rawCount: sources.filter((s) => s.type !== "subscription").length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
  return json({ users });
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
  // DK-20: the User row and its initial user_nodes relationships must
  // commit or fail together — insertUserWithNodes() (src/d1.js) runs
  // both in one env.DB.batch() transaction, closing the gap where
  // insertUserRow() could persist while a separate, conditional
  // setUserNodeIds() call afterward failed or never ran. Called
  // unconditionally (nodeIds may be empty; resolveValidNodeIds() above
  // has already validated/deduplicated it exactly as before), since an
  // empty nodeIds array simply produces a batch containing only the User
  // INSERT — no special-casing needed here, unlike updateUser()'s
  // with/without-nodeIds branches.
  await insertUserWithNodes(env, user, nodeIds);
  await adjustStats(env, {
    totalUsers: 1,
    totalSubSources: sources.filter((s) => s.type === "subscription").length,
    totalRawSources: sources.filter((s) => s.type !== "subscription").length,
  });
  await recordActivity(env, `Created user "${user.name}"`);
  return json({ user, invalidSources: invalid }, 201);
}

export async function getUser(id, env) {
  const row = await getUserRowById(env, id);
  if (!row) return json({ error: "not_found" }, 404);
  const nodeIds = await getUserNodeIds(env, id);
  const user = rowToUser(row, nodeIds);
  return json({ user });
}

export async function updateUser(id, request, env) {
  const body = await safeJson(request);
  const row = await getUserRowById(env, id);
  if (!row) return json({ error: "not_found" }, 404);

  const current = rowToUser(row, null);
  let toggled = false;
  let renamed = false;
  let invalid = [];
  let sourcesChanged = false;
  const oldName = current.name;
  const beforeSources = current.sources || [];
  const beforeSub = beforeSources.filter(
    (s) => s.type === "subscription",
  ).length;
  const beforeRaw = beforeSources.filter(
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
  current.updatedAt = Date.now();

  // DK-19: when this request supplies a new nodeIds[], the User row
  // update and the user_nodes relationship replacement must commit or
  // fail together — updateUserWithNodes() (src/d1.js) runs both in one
  // env.DB.batch() transaction, closing the gap where updateUserRow()
  // could persist while a separate setUserNodeIds() call afterward
  // failed. Validation/deduplication (resolveValidNodeIds()) still runs
  // first, exactly as before, so only the already-validated id list ever
  // reaches the atomic write. When this request does NOT supply
  // nodeIds[], there is nothing to batch it with, so the User row is
  // still written with the plain updateUserRow() call and the existing
  // assignment is left untouched (no query, no write) — unlike the old
  // KV implementation, there's no stale-reference cleanup to
  // opportunistically run here: the ON DELETE CASCADE foreign key
  // (src/d1.js) already guarantees user_nodes never holds a reference to
  // a deleted Node.
  if (body && Array.isArray(body.nodeIds)) {
    current.nodeIds = await resolveValidNodeIds(env, body.nodeIds);
    await updateUserWithNodes(env, current, current.nodeIds);
  } else {
    await updateUserRow(env, current);
    current.nodeIds = await getUserNodeIds(env, id);
  }

  if (sourcesChanged) {
    const afterSub = current.sources.filter(
      (s) => s.type === "subscription",
    ).length;
    const afterRaw = current.sources.filter(
      (s) => s.type !== "subscription",
    ).length;
    await adjustStats(env, {
      totalSubSources: afterSub - beforeSub,
      totalRawSources: afterRaw - beforeRaw,
    });
    await recordActivity(env, `Updated sources for user "${current.name}"`);
  }
  if (toggled)
    await recordActivity(
      env,
      `${current.enabled ? "Enabled" : "Disabled"} user "${current.name}"`,
    );
  if (renamed)
    await recordActivity(
      env,
      `Renamed user "${oldName}" to "${current.name}"`,
    );
  current.enabled = current.enabled !== false;
  return json({ user: current, invalidSources: invalid });
}

export async function deleteUser(id, env) {
  const row = await getUserRowById(env, id);
  if (!row) return json({ error: "not_found" }, 404);
  const sources = JSON.parse(row.sources || "[]");
  const subCount = sources.filter((s) => s.type === "subscription").length;
  const rawCount = sources.filter((s) => s.type !== "subscription").length;

  // ON DELETE CASCADE on user_nodes.user_id (src/d1.js) removes this
  // User's relationship rows as part of the same statement — no separate
  // index/cascade cleanup call needed (replaces the old removeUserId() +
  // DK-11 ordering concern entirely).
  await deleteUserRow(env, id);
  await adjustStats(env, {
    totalUsers: -1,
    totalSubSources: -subCount,
    totalRawSources: -rawCount,
  });
  await recordActivity(env, `Deleted user "${row.name}"`);
  return json({ success: true });
}

// ---------------------------------------------------------------------
// NODE ASSIGNMENT
// ---------------------------------------------------------------------
async function resolveValidNodeIds(env, nodeIds) {
  if (!Array.isArray(nodeIds)) return [];
  const seen = new Set();
  const result = [];
  for (const id of nodeIds) {
    if (seen.has(id)) continue;
    const node = await getNodeRowById(env, id);
    if (node && node.enabled !== 0) {
      seen.add(id);
      result.push(id);
    }
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
