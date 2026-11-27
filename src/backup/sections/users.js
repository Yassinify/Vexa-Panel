import {
  getUserCount,
  listUserRows,
  getUserNodeIds,
  getNodeRowById,
} from "../../backend/database/d1.js";
import { entityKey, nodeToEntity, userToEntity, readNodeEntity, readUserEntity } from "../entities.js";
import {
  createContext,
  registerNode,
  registerUser,
  noteInvalid,
  resolveNode,
  prepareUser,
  createUser,
} from "../resolve.js";

// ---------------------------------------------------------------------
// BACKUP SECTION: USERS (follows the section contract documented in sections/settings.js)
//
// Payload: { items: [...], entities: { nodes: { "<id>": <node entity> } } }
//   items               one user entity per User, plus nodeIds: the ids of the Nodes assigned to it, in the User's
//                       order (the order of its subscription)
//   entities.nodes      every assigned Node in full (see entities.js), once, however many Users use it
// So the section is self-contained: restoring only Users still has everything needed to create their Nodes.
//
// Restore rules for this section (the checks themselves are in resolve.js):
//   - a User whose name exists is a conflict: rename or skip. If the name passes and the UUID is taken, that is a
//     conflict too: a new UUID or skip (in name mode only another name fixes it). Renaming a User in name mode
//     changes its id, since the id is the name;
//   - the Nodes of a User are written with the same Node rules as the Nodes section (a name that exists is a
//     conflict: rename or skip), and the User gets links to the ones that were written, in its original order;
//   - a User that is skipped or still has a conflict writes none of its Nodes; a skipped Node is simply not linked.
// A User row and its links are written together (all or nothing), with the dates and flags of the backup.
// ---------------------------------------------------------------------

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function itemsOf(payload) {
  return isPlainObject(payload) && Array.isArray(payload.items) ? payload.items : null;
}

// The dictionary of embedded Node entities of a payload (empty when it has none).
function nodesOf(payload) {
  return isPlainObject(payload.entities) && isPlainObject(payload.entities.nodes) ? payload.entities.nodes : {};
}

// A list of ids from the file: only usable strings, each once, in the given order (the order is the User's).
function idListOf(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const id of value) {
    if (typeof id !== "string" || id.length === 0 || id.length > 200 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

// Reads the Node with this id from the dictionary, once per call (cache), as { ok, entity } or { ok: false, reason }.
// "missing_node": the id is listed on a User but not in entities.nodes. The entity's own id must be the key it is
// stored under.
function readEmbeddedNode(cache, nodesDict, id) {
  if (cache.has(id)) return cache.get(id);
  let result;
  if (!Object.prototype.hasOwnProperty.call(nodesDict, id)) {
    result = { ok: false, reason: "missing_node" };
  } else {
    const read = readNodeEntity(nodesDict[id]);
    result = read.ok && read.entity.id !== id ? { ok: false, reason: "invalid_id" } : read;
  }
  cache.set(id, result);
  return result;
}

export const usersSection = {
  id: "users",
  label: "Users",
  noun: "user",
  nounPlural: "users",

  async count(env) {
    return getUserCount(env);
  },

  // One page of Users, oldest first, each with the ids of its Nodes in order and those Nodes in full. The links
  // to disabled Nodes are kept, like everything else.
  async exportPart(env, offset, limit) {
    const rows = (await listUserRows(env)).slice(offset, offset + limit);
    const items = [];
    const nodes = {};
    for (const row of rows) {
      const nodeIds = [];
      for (const nodeId of await getUserNodeIds(env, row.id)) {
        if (!nodes[nodeId]) {
          const nodeRow = await getNodeRowById(env, nodeId);
          if (!nodeRow) continue;
          nodes[nodeId] = nodeToEntity(nodeRow);
        }
        nodeIds.push(nodeId);
      }
      items.push({ ...userToEntity(row), nodeIds });
    }
    return { ok: true, items, entities: { nodes } };
  },

  // Registers every User and every Node they carry in the analysis context. Nothing is written. Entities that
  // cannot be read are noted as invalid and left out.
  async analyze(env, payload, ctx) {
    const items = itemsOf(payload);
    if (!items) return { ok: false, error: "invalid_section" };
    const nodesDict = nodesOf(payload);
    const cache = new Map();
    for (let i = 0; i < items.length; i++) {
      const read = readUserEntity(items[i]);
      if (!read.ok) {
        noteInvalid(ctx, `users[${i}]`, read.reason);
        continue;
      }
      registerUser(ctx, read.entity, "primary", null);
      const userKey = entityKey("user", read.entity.id);
      for (const nodeId of idListOf(items[i].nodeIds)) {
        const embedded = readEmbeddedNode(cache, nodesDict, nodeId);
        if (!embedded.ok) {
          noteInvalid(ctx, `users[${i}].nodes`, embedded.reason);
          continue;
        }
        registerNode(ctx, embedded.entity, userKey);
      }
    }
    return { ok: true, total: items.length };
  },

  // Writes the Users of the payload (a whole payload or one page of it) with the decisions of the admin, writing
  // their Nodes first. context is { decisions, nodeMap, userMap } (see resolve.js). Returns
  // { ok, counts, conflicts, invalid, nodeMap, userMap, added }:
  //   counts     usersAdded, usersRenamed, usersUuidRegenerated, usersSkipped, nodesAdded, nodesRenamed, nodesSkipped
  //              (for the report; a Node counts once, when it is first written or skipped)
  //   conflicts  items that need a decision first (results of resolve.js with status "conflict"); the browser asks,
  //              then sends the same items again. Nodes already written are found through nodeMap, so nothing is
  //              written twice, and the User is written on the retry once none of its Nodes has a conflict.
  //   nodeMap / userMap  every key decided so far and the id it became (null for skipped), to send back next time
  //   added      what this call wrote, for the stats (users, nodes, subSources, rawSources)
  async applyBatch(env, payload, context = {}) {
    const items = itemsOf(payload);
    if (!items) return { ok: false, error: "invalid_section" };
    const { decisions = {}, nodeMap, userMap } = context;
    const ctx = await createContext(env, { nodeMap, userMap });
    const nodesDict = nodesOf(payload);
    const cache = new Map();
    const counts = {
      usersAdded: 0,
      usersRenamed: 0,
      usersUuidRegenerated: 0,
      usersSkipped: 0,
      nodesAdded: 0,
      nodesRenamed: 0,
      nodesSkipped: 0,
    };
    const conflicts = [];
    const invalid = [];

    for (let i = 0; i < items.length; i++) {
      const read = readUserEntity(items[i]);
      if (!read.ok) {
        invalid.push({ where: `users[${i}]`, reason: read.reason });
        continue;
      }
      const user = read.entity;

      // The User is decided first and nothing is written for it yet, so its Nodes stay untouched when it is
      // skipped or has a conflict.
      const prepared = prepareUser(ctx, user, decisions, "primary");
      if (prepared.status === "conflict") {
        conflicts.push(prepared);
        continue;
      }
      if (prepared.status === "skipped") {
        counts.usersSkipped += 1;
        continue;
      }
      // Already written (or skipped) earlier in this restore: nothing to do and nothing to count again.
      if (prepared.status !== "create") continue;

      // Then its Nodes, in the User's order. Every Node conflict is collected before giving up on the User, so the
      // admin is asked about all of them in one round.
      const nodeIds = [];
      let nodeConflict = false;
      for (const nodeId of idListOf(items[i].nodeIds)) {
        const embedded = readEmbeddedNode(cache, nodesDict, nodeId);
        if (!embedded.ok) {
          invalid.push({ where: `users[${i}].nodes`, reason: embedded.reason });
          continue;
        }
        const result = await resolveNode(env, ctx, embedded.entity, decisions);
        if (result.status === "conflict") {
          conflicts.push(result);
          nodeConflict = true;
          continue;
        }
        if (result.status === "added") {
          counts.nodesAdded += 1;
          if (result.renamed) counts.nodesRenamed += 1;
        } else if (result.status === "skipped") {
          counts.nodesSkipped += 1;
        }
        if (result.id) nodeIds.push(result.id);
      }
      if (nodeConflict) continue;

      const created = await createUser(env, ctx, prepared, user, nodeIds);
      if (created.status === "conflict") {
        conflicts.push(created);
        continue;
      }
      counts.usersAdded += 1;
      if (created.renamed) counts.usersRenamed += 1;
      if (created.uuidRegenerated) counts.usersUuidRegenerated += 1;
    }

    return {
      ok: true,
      counts,
      conflicts: [...new Map(conflicts.map((c) => [c.key, c])).values()],
      invalid,
      nodeMap: Object.fromEntries(ctx.nodeMap),
      userMap: Object.fromEntries(ctx.userMap),
      added: ctx.added,
    };
  },
};
