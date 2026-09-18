// =====================================================================
// VEXA — Nodes CRUD (D1-backed, see docs/problem.md DK-16)
// =====================================================================
//
// Primary storage for Nodes moved from KV to D1 as part of DK-16 (see
// docs/problem.md and src/d1.js's DATA MODEL comment for the schema and
// migration). This removes the coordination this file used to need from
// IndexCoordinator (src/index-coordinator.js):
//   - idx:nodes id-list mutation (addNodeId/removeNodeId, DK-2) is gone —
//     `nodes` is a real D1 table; listNodes() queries it directly instead
//     of walking a separately-maintained id-list array.
//   - The per-name lock (withNodeNameLock, DK-15) existed only to
//     serialize the duplicate-name check against the Node record write.
//     That race is now closed at the database level by the `nodes.name
//     UNIQUE` constraint (src/d1.js): createNode()/updateNode()'s rename
//     path just attempt the write and translate a UNIQUE-constraint
//     failure into the existing 409 duplicate_name response.
//   - The per-user record lock (withUserLock) around deleteNode()'s old
//     per-user nodeIds[] cascade loop is gone — that cascade is now
//     `ON DELETE CASCADE` on user_nodes.node_id (src/d1.js), a single
//     atomic DELETE FROM nodes statement, not an application-level loop.
//
// `source` is a single classified source object, identical in shape to one
// entry of a User's sources[] (see normalizeSources() in users.js) — this
// lets merge.js feed it through the exact same per-type handling.

import { json, safeJson } from "./http.js";
import {
  recordActivity,
  getNodeRowById,
  listNodeRows,
  insertNodeRow,
  updateNodeRow,
  deleteNodeRow,
  rowToNode,
} from "./d1.js";
import { normalizeSources } from "./users.js";

// D1's SQLite driver reports a UNIQUE-constraint violation with this
// substring in the thrown error's message — used below to translate the
// nodes.name UNIQUE constraint (src/d1.js) into the existing
// 409 duplicate_name response instead of a generic 500.
function isUniqueConstraintError(err) {
  return Boolean(err && /UNIQUE constraint failed/i.test(err.message || ""));
}

// Classifies/validates a single source string via the existing
// normalizeSources() pipeline (array of 1 in, array of 0-1 out).
function normalizeSingleSource(sourceStr) {
  if (typeof sourceStr !== "string" || !sourceStr.trim()) {
    return { source: null, error: "source_required" };
  }
  const { sources, invalid } = normalizeSources([sourceStr]);
  if (sources.length === 0) {
    return {
      source: null,
      error: invalid[0] ? invalid[0].reason : "unrecognized_format",
    };
  }
  return { source: sources[0], error: null };
}

export async function listNodes(env) {
  const rows = await listNodeRows(env);
  return json({ nodes: rows.map((row) => rowToNode(row)) });
}

export async function createNode(request, env) {
  const body = await safeJson(request);
  if (!body || !body.name || typeof body.name !== "string") {
    return json({ error: "name_required" }, 400);
  }
  const name = body.name.trim();
  if (!name) return json({ error: "name_required" }, 400);

  const { source, error } = normalizeSingleSource(body.source);
  if (!source) return json({ error: error || "invalid_source" }, 400);

  const now = Date.now();
  const node = {
    id: crypto.randomUUID(),
    name,
    source,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  // docs/problem.md DK-15: uniqueness is now enforced by the nodes.name
  // UNIQUE constraint (src/d1.js) instead of a separate check-then-write
  // critical section — a constraint violation here means another Node
  // already holds this name (created concurrently or otherwise), so it is
  // translated into the same 409 duplicate_name response the old
  // pre-check + withNodeNameLock() path returned.
  try {
    await insertNodeRow(env, node);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return json({ error: "duplicate_name" }, 409);
    }
    throw err;
  }
  await recordActivity(env, `Created node "${node.name}"`);
  return json({ node }, 201);
}

export async function getNode(id, env) {
  const row = await getNodeRowById(env, id);
  if (!row) return json({ error: "not_found" }, 404);
  return json({ node: rowToNode(row) });
}

export async function updateNode(id, request, env) {
  const row = await getNodeRowById(env, id);
  if (!row) return json({ error: "not_found" }, 404);
  const node = rowToNode(row);
  const body = await safeJson(request);
  const oldName = node.name;

  // Requested new name, if this request is actually renaming (differs from
  // the current name). Only this case can hit the nodes.name UNIQUE
  // constraint (src/d1.js) below.
  const requestedName =
    body && typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : null;
  const isRename = requestedName !== null && requestedName !== node.name;
  let toggled = false;

  if (isRename) node.name = requestedName;

  if (body && typeof body.source === "string") {
    const { source, error } = normalizeSingleSource(body.source);
    if (!source) return json({ error: error || "invalid_source" }, 400);
    node.source = source;
  }

  if (
    body &&
    typeof body.enabled === "boolean" &&
    body.enabled !== (node.enabled !== false)
  ) {
    node.enabled = body.enabled;
    toggled = true;
  }

  node.updatedAt = Date.now();

  // docs/problem.md DK-15: uniqueness for a rename is now enforced by the
  // nodes.name UNIQUE constraint (src/d1.js) instead of a separate
  // check-then-write critical section keyed on the new name — a
  // constraint violation here means another Node already holds
  // requestedName, translated into the same 409 duplicate_name response
  // the old pre-check + withNodeNameLock() path returned. A non-rename
  // update never touches node.name, so it cannot hit this constraint.
  try {
    await updateNodeRow(env, node);
  } catch (err) {
    if (isRename && isUniqueConstraintError(err)) {
      return json({ error: "duplicate_name" }, 409);
    }
    throw err;
  }

  if (isRename)
    await recordActivity(env, `Renamed node "${oldName}" to "${node.name}"`);
  if (toggled)
    await recordActivity(
      env,
      `${node.enabled ? "Enabled" : "Disabled"} node "${node.name}"`,
    );
  return json({ node });
}

export async function deleteNode(id, env) {
  const row = await getNodeRowById(env, id);
  if (!row) return json({ error: "not_found" }, 404);

  // ON DELETE CASCADE on user_nodes.node_id (src/d1.js) removes every
  // User's reference to this Node as part of this same statement — this
  // replaces the old per-user nodeIds[] cascade loop (and the
  // withUserLock() it needed) entirely. It is enforced at the database
  // level, so it cannot be left partially applied the way the old
  // sequential KV loop could be interrupted mid-way (docs/problem.md's
  // DK-12 finding, and the dangling-nodeIds[] bug DK-12 mitigated, both no
  // longer apply to this path).
  await deleteNodeRow(env, id);

  await recordActivity(env, `Deleted node "${row.name}"`);
  return json({ success: true });
}
