// =====================================================================
// VEXA — Nodes CRUD (reusable Name+Source pairs assignable to many Users)
// =====================================================================
//
// DATA MODEL:
//   node:{uuid} -> {id, name, source, enabled, createdAt, updatedAt}
//   idx:nodes   -> [nodeId, ...]   (avoids KV.list(), same pattern as idx:users)
//
// `source` is a single classified source object, identical in shape to one
// entry of a User's sources[] (see normalizeSources() in users.js) — this
// lets merge.js feed it through the exact same per-type handling.

import { json, safeJson } from "./http.js";
import { kvGetJson, kvPutJson, recordActivity } from "./kv.js";
import { normalizeSources } from "./users.js";
import {
  addNodeId,
  removeNodeId,
  withUserLock,
  withNodeNameLock,
} from "./index-coordinator.js";

// ---------------------------------------------------------------------
// idx:nodes SERIALIZATION (docs/problem.md DK-2)
// Cloudflare KV has no compare-and-swap/locking primitive, so a bare
// read -> mutate array in memory -> write of idx:nodes can lose an entry
// if two requests' get/put calls interleave. createNode/deleteNode below
// now delegate the entire idx:nodes get -> parse -> mutate -> put cycle to
// the IndexCoordinator Durable Object (src/index-coordinator.js) via
// addNodeId()/removeNodeId(), which serializes it across Worker isolates,
// not just within one. The previous same-isolate-only idxNodesLock/
// withIdxNodesLock Promise-chain lock is removed: each call site below no
// longer performs its own local read-modify-write of idx:nodes at all, so
// there is nothing left for a local lock to guard. Mirrors the equivalent
// idx:users mitigation in src/users.js.
// ---------------------------------------------------------------------

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

async function isDuplicateName(env, name, excludeId) {
  const nodeIds = await kvGetJson(env, "idx:nodes", []);
  for (const id of nodeIds) {
    if (id === excludeId) continue;
    const node = await kvGetJson(env, `node:${id}`, null);
    if (node && node.name === name) return true;
  }
  return false;
}

export async function listNodes(env) {
  const nodeIds = await kvGetJson(env, "idx:nodes", []);
  const nodes = await Promise.all(
    nodeIds.map((id) => kvGetJson(env, `node:${id}`, null)),
  );
  return json({
    nodes: nodes
      .filter(Boolean)
      .map((n) => ({ ...n, enabled: n.enabled !== false })),
  });
}

export async function createNode(request, env) {
  const body = await safeJson(request);
  if (!body || !body.name || typeof body.name !== "string") {
    return json({ error: "name_required" }, 400);
  }
  const name = body.name.trim();
  if (!name) return json({ error: "name_required" }, 400);

  // docs/problem.md DK-15: the duplicate-name check and the Node record
  // write below must be inside the same critical section, or two
  // concurrent createNode() calls for the same name can both observe
  // "not a duplicate" and both write it. withNodeNameLock() serializes
  // that whole check-then-write sequence per normalized name, across every
  // Worker isolate, the same way withUserLock() serializes a per-user
  // critical section elsewhere in this file.
  return withNodeNameLock(env, name, async () => {
    if (await isDuplicateName(env, name, null)) {
      return json({ error: "duplicate_name" }, 409);
    }
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
    await kvPutJson(env, `node:${node.id}`, node);
    await addNodeId(env, node.id);
    await recordActivity(env, `Created node "${node.name}"`);
    return json({ node }, 201);
  });
}

export async function getNode(id, env) {
  const node = await kvGetJson(env, `node:${id}`, null);
  if (!node) return json({ error: "not_found" }, 404);
  node.enabled = node.enabled !== false;
  return json({ node });
}

export async function updateNode(id, request, env) {
  const node = await kvGetJson(env, `node:${id}`, null);
  if (!node) return json({ error: "not_found" }, 404);
  const body = await safeJson(request);
  const oldName = node.name;

  // Requested new name, if this request is actually renaming (differs from
  // the current name). Only this case needs the DK-15 name lock below --
  // determining it here (without touching node.name yet) keeps the
  // non-rename path lock-free.
  const requestedName =
    body && typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : null;
  const isRename = requestedName !== null && requestedName !== node.name;

  // Applies source/enabled changes, writes the record, and returns the
  // response -- shared by both the renamed and non-renamed paths below.
  // `renamed` tells it whether to also record the rename activity entry.
  async function applyRestAndWrite(renamed) {
    let toggled = false;

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
    await kvPutJson(env, `node:${id}`, node);

    if (renamed)
      await recordActivity(
        env,
        `Renamed node "${oldName}" to "${node.name}"`,
      );
    if (toggled)
      await recordActivity(
        env,
        `${node.enabled ? "Enabled" : "Disabled"} node "${node.name}"`,
      );
    node.enabled = node.enabled !== false;
    return json({ node });
  }

  if (isRename) {
    // docs/problem.md DK-15: the duplicate-name check for the NEW name and
    // the Node record write must be inside the same critical section, or
    // two concurrent renames (or a rename racing a createNode()) to the
    // same name can both observe "not a duplicate" and both claim it.
    // withNodeNameLock() locks the name being claimed (requestedName), not
    // the Node's current name -- the current name isn't being contended
    // for.
    return withNodeNameLock(env, requestedName, async () => {
      if (await isDuplicateName(env, requestedName, id)) {
        return json({ error: "duplicate_name" }, 409);
      }
      node.name = requestedName;
      return applyRestAndWrite(true);
    });
  }

  // Not a rename (name unchanged, absent, or blank) -- no uniqueness
  // contention, so no name lock is acquired.
  return applyRestAndWrite(false);
}

export async function deleteNode(id, env) {
  const node = await kvGetJson(env, `node:${id}`, null);
  if (!node) return json({ error: "not_found" }, 404);

  // DK-11: index cleanup runs before the primary-record delete, so an
  // interruption between the two leaves an orphaned-but-harmless
  // node:{uuid} record with no idx:nodes reference (invisible to
  // listNodes(), which only discovers records via the index) instead of
  // a ghost id persisting forever in idx:nodes.
  await removeNodeId(env, id);
  await env.STORAGE.delete(`node:${id}`);

  // Cascade cleanup: strip the deleted id from every User's nodeIds[] so
  // no User record is left referencing a Node that no longer exists.
  // Without this, mergeUserNodes()/the frontend would keep silently
  // masking the dangling reference instead of it actually being gone —
  // see docs/problem.md's "Node deletion leaves dangling nodeIds[]" entry.
  // Only Users whose nodeIds[] actually contains this id are rewritten;
  // everything else about those User records (sources[], name, enabled,
  // createdAt, and the relative order of any remaining nodeIds) is left
  // untouched.
  // Each user:{uuid} read -> filter nodeIds[] -> write is done inside
  // withUserLock so it cannot interleave with a concurrent updateUser()
  // read-modify-write of the same record (docs/problem.md DK-3) -- without
  // this, a stale updateUser() write could restore the id removed here.
  const userIds = await kvGetJson(env, "idx:users", []);
  for (const userId of userIds) {
    await withUserLock(env, userId, async () => {
      const user = await kvGetJson(env, `user:${userId}`, null);
      if (!user || !Array.isArray(user.nodeIds) || !user.nodeIds.includes(id))
        return;
      user.nodeIds = user.nodeIds.filter((nid) => nid !== id);
      user.updatedAt = Date.now();
      await kvPutJson(env, `user:${userId}`, user);
    });
  }

  await recordActivity(env, `Deleted node "${node.name}"`);
  return json({ success: true });
}
