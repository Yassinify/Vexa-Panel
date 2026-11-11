import { json, safeJson } from "./http.js";
import { VEXA_VERSION } from "./constants.js";
import {
  getStatsRow,
  getNodeCount,
  getNodeCountOlderThan,
  getUserCount,
  getActiveUserCount,
  getUserGrowth,
  recordUserGrowthSnapshot,
  getRecentActivity,
  adjustStats,
  recordActivity,
  getUserRowById,
  listUserRows,
  insertUserWithNodes,
  updateUserRow,
  updateUserWithNodes,
  deleteUserRow,
  getNodeRowById,
  getUserNodeIds,
  rowToUser,
} from "./backend/database/d1.js";
import { normalizeSources } from "./backend/protocols/sources.js";

// Records today's total for the Dashboard growth chart. Non-fatal: a
// snapshot failure must not fail an already-successful create/delete.
// Uses the live user count, because the stored stats counter can drift.
async function snapshotUserGrowth(env) {
  try {
    const totalUsers = await getUserCount(env);
    await recordUserGrowthSnapshot(env, totalUsers);
  } catch (err) {
    console.error("snapshotUserGrowth failed (non-fatal):", err);
  }
}

export async function getStats(env) {
  const stats = await getStatsRow(env);
  const activity = await getRecentActivity(env);
  // Live COUNT(*) values (src/d1.js) for the Dashboard cards.
  const totalNodes = await getNodeCount(env);
  // Nodes created 30+ days ago: baseline for the Total nodes change line.
  const previousTotalNodes = await getNodeCountOlderThan(env, 30);
  const totalUsers = await getUserCount(env);
  const activeUsers = await getActiveUserCount(env);
  // Record today's point first so the series below includes it.
  await recordUserGrowthSnapshot(env, totalUsers);
  let userGrowth = [];
  try {
    // One year of daily points; the Dashboard shows the last 7, 30 or 365 of them.
    userGrowth = await getUserGrowth(env, 365);
  } catch (err) {
    console.error("getUserGrowth (D1) failed (non-fatal):", err);
  }
  return json({
    stats: {
      totalUsers,
      totalSubSources: stats.totalSubSources,
      totalRawSources: stats.totalRawSources,
      totalNodes,
      previousTotalNodes,
      activeUsers,
    },
    activity,
    userGrowth,
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
      // NULL (never edited) reads as the creation time.
      editedAt: row.edited_at ?? row.created_at,
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
    editedAt: now,
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
  await snapshotUserGrowth(env);
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
    // Reject the whole save so a rejected edit cannot wipe the previous valid source.
    if (result.invalid.length > 0) {
      return json(
        { error: result.invalid[0].reason, invalidSources: result.invalid },
        400,
      );
    }
    invalid = result.invalid;
    // An identical list is not a change: no write, no log entry, no stats.
    if (JSON.stringify(result.sources) !== JSON.stringify(beforeSources)) {
      current.sources = result.sources;
      sourcesChanged = true;
    }
  }

  // Resolve the requested Node links and compare them with the stored ones.
  // Validation/deduplication (resolveValidNodeIds()) runs first; a request
  // without nodeIds[] keeps the existing assignment.
  const existingNodeIds = await getUserNodeIds(env, id);
  let nodeIds = existingNodeIds;
  let nodeIdsChanged = false;
  if (body && Array.isArray(body.nodeIds)) {
    nodeIds = await resolveValidNodeIds(env, body.nodeIds);
    // Stored links to Nodes that are now disabled are left out of the comparison: the editor
    // drops them, so a Save without edits must not count as a Node link change.
    const existingEnabledIds = await resolveValidNodeIds(env, existingNodeIds);
    nodeIdsChanged =
      JSON.stringify(nodeIds) !== JSON.stringify(existingEnabledIds);
  }

  // Nothing changed (a Save without edits): no write, no edit time, no log entry.
  if (!renamed && !toggled && !sourcesChanged && !nodeIdsChanged) {
    current.nodeIds = existingNodeIds;
    return json({ user: current, invalidSources: invalid });
  }
  const now = Date.now();
  // updatedAt is the last subscription fetch (public-sub.js), so a panel change leaves it alone.
  // A rename, a sources change, a Node link change or an Enable / Disable is an edit.
  if (renamed || sourcesChanged || nodeIdsChanged || toggled) current.editedAt = now;

  // DK-19: when the Node links change, the User row update and the
  // user_nodes replacement must commit or fail together —
  // updateUserWithNodes() (src/d1.js) runs both in one env.DB.batch()
  // transaction. Otherwise only the User row is written with the plain
  // updateUserRow() call and the existing assignment is left untouched.
  if (nodeIdsChanged) {
    current.nodeIds = nodeIds;
    await updateUserWithNodes(env, current, nodeIds);
  } else {
    await updateUserRow(env, current);
    current.nodeIds = existingNodeIds;
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
  if (nodeIdsChanged)
    await recordActivity(env, `Updated nodes for user "${current.name}"`);
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
  await snapshotUserGrowth(env);
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
