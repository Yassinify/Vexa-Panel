import {
  getNodeCount,
  listNodeRows,
  getNodeUserIds,
  getUserRowById,
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
  linkEntities,
} from "../resolve.js";

// ---------------------------------------------------------------------
// BACKUP SECTION: NODES (follows the section contract documented in sections/settings.js)
//
// Payload: { items: [...], entities: { users: { "<id>": <user entity> } } }
//   items               one node entity per Node, plus userIds: the ids of the Users linked to it
//   entities.users      every linked User in full (see entities.js), once, however many Nodes use it
// So the section is self-contained: restoring only Nodes still has everything needed to create a linked User
// that does not exist yet. The Nodes section does not store link positions (links are appended in the order the
// Nodes are restored); the Users section keeps the exact order.
//
// Restore rules for this section (the checks themselves are in resolve.js):
//   - a Node whose name exists is a conflict: rename or skip, asked by the browser;
//   - a linked User whose name exists is linked to that existing User, with no question;
//   - a linked User that does not exist is created with all its data, under the full User rules (a UUID that
//     is taken is a conflict: new UUID or skip);
//   - a skipped Node gets no links. Links only ever add: nothing that exists is changed or removed.
// ---------------------------------------------------------------------

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function itemsOf(payload) {
  return isPlainObject(payload) && Array.isArray(payload.items) ? payload.items : null;
}

// The dictionary of linked User entities of a payload (empty when it has none).
function usersOf(payload) {
  return isPlainObject(payload.entities) && isPlainObject(payload.entities.users) ? payload.entities.users : {};
}

// A list of ids from the file: only usable strings, each once, in the given order.
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

// Reads the linked User with this id from the dictionary, once per call (cache), as { ok, entity } or
// { ok: false, reason }. "missing_user": the id is listed on a Node but not in entities.users. The entity's
// own id must be the key it is stored under.
function readLinkedUser(cache, usersDict, id) {
  if (cache.has(id)) return cache.get(id);
  let result;
  if (!Object.prototype.hasOwnProperty.call(usersDict, id)) {
    result = { ok: false, reason: "missing_user" };
  } else {
    const read = readUserEntity(usersDict[id]);
    result = read.ok && read.entity.id !== id ? { ok: false, reason: "invalid_id" } : read;
  }
  cache.set(id, result);
  return result;
}

export const nodesSection = {
  id: "nodes",
  label: "Nodes",
  noun: "node",
  nounPlural: "nodes",

  async count(env) {
    return getNodeCount(env);
  },

  // One page of Nodes, oldest first, each with the ids of its Users and those Users in full.
  async exportPart(env, offset, limit) {
    const rows = (await listNodeRows(env)).slice(offset, offset + limit);
    const items = [];
    const users = {};
    for (const row of rows) {
      const userIds = [];
      for (const userId of await getNodeUserIds(env, row.id)) {
        if (!users[userId]) {
          const userRow = await getUserRowById(env, userId);
          if (!userRow) continue;
          users[userId] = userToEntity(userRow);
        }
        userIds.push(userId);
      }
      items.push({ ...nodeToEntity(row), userIds });
    }
    return { ok: true, items, entities: { users } };
  },

  // Registers every Node and every linked User of the payload in the analysis context. Nothing is written.
  // Entities that cannot be read are noted as invalid and left out.
  async analyze(env, payload, ctx) {
    const items = itemsOf(payload);
    if (!items) return { ok: false, error: "invalid_section" };
    const usersDict = usersOf(payload);
    const cache = new Map();
    for (let i = 0; i < items.length; i++) {
      const read = readNodeEntity(items[i]);
      if (!read.ok) {
        noteInvalid(ctx, `nodes[${i}]`, read.reason);
        continue;
      }
      registerNode(ctx, read.entity, null);
      const nodeKey = entityKey("node", read.entity.id);
      for (const userId of idListOf(items[i].userIds)) {
        const linked = readLinkedUser(cache, usersDict, userId);
        if (!linked.ok) {
          noteInvalid(ctx, `nodes[${i}].users`, linked.reason);
          continue;
        }
        registerUser(ctx, linked.entity, "linked", nodeKey);
      }
    }
    return { ok: true, total: items.length };
  },

  // Writes the Nodes of the payload (a whole payload or one page of it) with the decisions of the admin, creates
  // the linked Users that do not exist, and links them. context is { decisions, nodeMap, userMap } (see resolve.js).
  // Returns { ok, counts, conflicts, invalid, nodeMap, userMap, added }:
  //   counts     nodesAdded, nodesRenamed, nodesSkipped, usersAdded, usersLinkedExisting (for the report)
  //   conflicts  items that need a decision first (the results of resolve.js with status "conflict"); the browser
  //              asks, then sends the same items again. A Node already written is found again through nodeMap,
  //              so nothing is written twice.
  //   nodeMap / userMap  every key decided so far and the id it became (null for skipped), to send back next time
  //   added      what this call wrote, for the stats (users, nodes, subSources, rawSources)
  async applyBatch(env, payload, context) {
    const items = itemsOf(payload);
    if (!items) return { ok: false, error: "invalid_section" };
    const { decisions = {}, nodeMap, userMap } = context || {};
    const ctx = await createContext(env, { nodeMap, userMap });
    const usersDict = usersOf(payload);
    const cache = new Map();
    const counts = { nodesAdded: 0, nodesRenamed: 0, nodesSkipped: 0, usersAdded: 0, usersLinkedExisting: 0 };
    const conflicts = [];
    const invalid = [];

    for (let i = 0; i < items.length; i++) {
      const read = readNodeEntity(items[i]);
      if (!read.ok) {
        invalid.push({ where: `nodes[${i}]`, reason: read.reason });
        continue;
      }
      const node = read.entity;
      const nodeKey = entityKey("node", node.id);
      const result = await resolveNode(env, ctx, node, decisions);
      if (result.status === "conflict") {
        conflicts.push(result);
        continue;
      }
      if (result.status === "skipped") {
        counts.nodesSkipped += 1;
        continue;
      }
      // Skipped earlier in this restore: nothing to do and nothing to count again.
      if (result.status === "mapped" && !result.id) continue;
      if (result.status === "added") {
        counts.nodesAdded += 1;
        if (result.renamed) counts.nodesRenamed += 1;
      }

      const pairs = [];
      for (const userId of idListOf(items[i].userIds)) {
        const linked = readLinkedUser(cache, usersDict, userId);
        if (!linked.ok) {
          invalid.push({ where: `nodes[${i}].users`, reason: linked.reason });
          continue;
        }
        const user = linked.entity;
        const prepared = prepareUser(ctx, user, decisions, "linked");
        if (prepared.status === "conflict") {
          conflicts.push(prepared);
          continue;
        }
        if (prepared.status === "skipped") continue;
        if (prepared.status === "create") {
          const created = await createUser(env, ctx, prepared, user, []);
          if (created.status === "conflict") {
            conflicts.push(created);
            continue;
          }
          counts.usersAdded += 1;
        } else if (prepared.status === "linked_existing") {
          counts.usersLinkedExisting += 1;
        }
        pairs.push({ userKey: entityKey("user", user.id), nodeKey });
      }
      await linkEntities(env, ctx, pairs);
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
