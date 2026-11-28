import {
  listNodeIdentities,
  listUserIdentities,
  insertRestoredNode,
  insertRestoredUser,
  addUserNodeLinks,
} from "../backend/database/d1.js";
import { usernameToId, isUuid } from "../users.js";
import { entityKey, suggestName } from "./entities.js";

// ---------------------------------------------------------------------
// RESTORE LOGIC FOR USER AND NODE ENTITIES
// The database side of a restore, shared by the Users and the Nodes sections (src/backup/sections/*), which
// only pull entities out of their payload and call this file. Restore only adds: nothing existing is changed.
//
// Everything works on a RESTORE CONTEXT (createContext()), built once per request:
//   - the names and ids that exist now, read from the database;
//   - the keys already decided in this restore (nodeMap / userMap, key to the id it became, or null for skipped);
//   - during analysis, what the incoming items claim and the conflicts found.
// The server keeps no session: the browser sends its decisions and maps with every request, so each request
// starts from the live database and a restore that was interrupted can simply be run again.
//
// Checks run in this order for every incoming item, and the first one that fails decides:
//   1. the NAME (Users and Nodes each against their own list; a User and a Node may share a name),
//   2. then, only for a User whose name passed, the UUID (the id, which is also the public link id).
// Duplicate sources are never a conflict. Names are compared exactly, after trimming.
//
// DECISIONS (sent by the browser, keyed by entityKey()): { action: "skip" } | { action: "rename", name? } |
// { action: "newUuid" }. A rename with an empty name picks "<name>-new" (see suggestName()). A User in random UUID
// mode keeps its UUID when renamed unless that UUID is taken too, and then gets a new one; in name mode the id
// follows the new name. Without a decision an item that conflicts is not written: the call returns
// { status: "conflict", ... } and the browser asks the admin (this also covers a name taken in between).
//
// A User embedded in a Nodes section has the role "linked": a name that already exists is not a conflict, the
// Node is linked to that existing User. A User from the Users section has the role "primary".
// ---------------------------------------------------------------------

// A decision from the browser, or null when it is missing or not one of the known actions.
function readDecision(decisions, key) {
  const d = decisions && typeof decisions === "object" ? decisions[key] : null;
  if (!d || typeof d !== "object") return null;
  return d.action === "skip" || d.action === "rename" || d.action === "newUuid" ? d : null;
}

function mapFrom(object) {
  const map = new Map();
  if (object && typeof object === "object") {
    for (const [key, value] of Object.entries(object)) {
      if (value === null || typeof value === "string") map.set(key, value);
    }
  }
  return map;
}

// Builds the context. nodeMap and userMap are the maps the browser holds from earlier requests of the same
// restore ({ "node:<id>": "<id it became>" | null }); leave them out for an analysis.
export async function createContext(env, maps) {
  const { nodeMap, userMap } = maps || {};
  const [nodeRows, userRows] = await Promise.all([listNodeIdentities(env), listUserIdentities(env)]);
  const userNames = new Map();
  for (const row of userRows) {
    // With several Users of one name the one whose id is listed first stands for the name.
    if (!userNames.has(row.name)) userNames.set(row.name, row.id);
  }
  return {
    nodeNames: new Set(nodeRows.map((r) => r.name)),
    nodeIds: new Set(nodeRows.map((r) => r.id)),
    userNames,
    userIds: new Set(userRows.map((r) => r.id)),
    nodeMap: mapFrom(nodeMap),
    userMap: mapFrom(userMap),
    // Analysis only: what the file holds and the conflicts found.
    nodes: new Map(),
    users: new Map(),
    invalid: [],
    // Apply only: what this request wrote, for the caller to count and for the stats.
    added: { users: 0, nodes: 0, subSources: 0, rawSources: 0 },
  };
}

// ---------------------------------------------------------------------
// ANALYSIS (nothing is written)
// A section registers every entity it finds. Call the Users section before the Nodes section, so a User that is
// in both is analyzed once as "primary" (the stricter role) before a Node refers to it as "linked".
// parentKey is the key of the item that embeds the entity, or null when it is an item of its own section.
// An entity seen again only gains the new parent.
// ---------------------------------------------------------------------

export function registerNode(ctx, entity, parentKey) {
  const key = entityKey("node", entity.id);
  const seen = ctx.nodes.get(key);
  if (seen) {
    if (parentKey) seen.parents.add(parentKey);
    else seen.top = true;
    return seen;
  }
  const rec = { kind: "node", key, entity, parents: new Set(), top: parentKey === null, conflict: null };
  if (parentKey) rec.parents.add(parentKey);
  if (ctx.nodeNames.has(entity.name)) rec.conflict = { reason: "name_taken" };
  // A name that is free is claimed, so a second incoming Node with it conflicts with this one.
  else ctx.nodeNames.add(entity.name);
  ctx.nodes.set(key, rec);
  return rec;
}

export function registerUser(ctx, entity, role, parentKey) {
  const key = entityKey("user", entity.id);
  const seen = ctx.users.get(key);
  if (seen) {
    if (parentKey) seen.parents.add(parentKey);
    else seen.top = true;
    return seen;
  }
  const rec = {
    kind: "user",
    key,
    entity,
    role,
    parents: new Set(),
    top: parentKey === null,
    conflict: null,
    linkedExisting: false,
  };
  if (parentKey) rec.parents.add(parentKey);
  if (ctx.userNames.has(entity.name)) {
    // The name is checked first. A linked User with a name that exists is simply the existing User.
    if (role === "linked") rec.linkedExisting = true;
    else rec.conflict = { reason: "name_taken", uuidAlsoTaken: ctx.userIds.has(entity.id) };
  } else if (ctx.userIds.has(entity.id)) {
    rec.conflict = { reason: "uuid_taken" };
  } else {
    ctx.userNames.set(entity.name, entity.id);
    ctx.userIds.add(entity.id);
  }
  ctx.users.set(key, rec);
  return rec;
}

// Records an entity that could not be read (the reason is a code from entities.js). where says which one,
// for example "users[3]". Only the first 100 are kept.
export function noteInvalid(ctx, where, reason) {
  if (ctx.invalid.length < 100) ctx.invalid.push({ where, reason });
}

// What the browser needs after the sections were analyzed: the conflicts to ask about, in the order found, and the
// counts for the summary. parents are the keys of the items that embed a conflicting entity and top says it is an
// item of its own section, so the browser can drop a question whose only parents were all skipped.
export function collectReport(ctx) {
  const conflicts = [];
  for (const rec of ctx.nodes.values()) {
    if (!rec.conflict) continue;
    conflicts.push({
      key: rec.key,
      kind: "node",
      reason: rec.conflict.reason,
      name: rec.entity.name,
      parents: [...rec.parents],
      top: rec.top,
    });
  }
  for (const rec of ctx.users.values()) {
    if (!rec.conflict) continue;
    conflicts.push({
      key: rec.key,
      kind: "user",
      reason: rec.conflict.reason,
      name: rec.entity.name,
      uuidRandom: rec.entity.uuidRandom,
      uuidAlsoTaken: Boolean(rec.conflict.uuidAlsoTaken),
      parents: [...rec.parents],
      top: rec.top,
    });
  }
  const users = [...ctx.users.values()];
  return {
    conflicts,
    summary: {
      nodes: { total: ctx.nodes.size, conflicts: [...ctx.nodes.values()].filter((r) => r.conflict).length },
      users: {
        total: users.length,
        conflicts: users.filter((r) => r.conflict).length,
        linkedExisting: users.filter((r) => r.linkedExisting).length,
      },
      invalid: ctx.invalid,
    },
  };
}

// ---------------------------------------------------------------------
// NAME CHECKS (used while the admin types a new name, and again on every write)
// ---------------------------------------------------------------------

// Is name free for a new item of this kind? kind is "node" or "user". For a User in name mode (uuidRandom false)
// the id the name gives (usernameToId()) must also be valid and free. reserved lists names that are not in the
// database yet but will be (other incoming items and the renames already chosen in this restore).
// Returns { ok: true, name } with the trimmed name, or { ok: false, error } with "empty", "invalid" (a name that
// cannot be a User id in name mode) or "taken".
export function checkNewName(ctx, kind, name, { uuidRandom = true, reserved = [] } = {}) {
  const clean = typeof name === "string" ? name.trim() : "";
  if (!clean) return { ok: false, error: "empty" };
  const reservedNames = new Set(Array.isArray(reserved) ? reserved : []);
  if (reservedNames.has(clean)) return { ok: false, error: "taken" };
  if (kind === "node") {
    return ctx.nodeNames.has(clean) ? { ok: false, error: "taken" } : { ok: true, name: clean };
  }
  if (ctx.userNames.has(clean)) return { ok: false, error: "taken" };
  if (!uuidRandom) {
    const id = usernameToId(clean);
    if (!id) return { ok: false, error: "invalid" };
    if (ctx.userIds.has(id)) return { ok: false, error: "taken" };
    for (const r of reservedNames) {
      if (usernameToId(r) === id) return { ok: false, error: "taken" };
    }
  }
  return { ok: true, name: clean };
}

// The name used when the admin leaves the rename box empty: "<name>-new" (then -2, -3 ...), free by checkNewName().
export function proposeName(ctx, kind, baseName, options) {
  return suggestName(baseName, (candidate) => !checkNewName(ctx, kind, candidate, options).ok);
}

// ---------------------------------------------------------------------
// APPLY (writes)
// ---------------------------------------------------------------------

function isConstraintError(err) {
  return /UNIQUE|constraint/i.test(String(err && err.message));
}

// Builds a result object: { status, ...fields }. fields is left untyped on purpose, so editors that type-check the
// bundled JS (the Cloudflare editor) see one open result type instead of a union that status cannot narrow.
function outcome(status, fields) {
  return Object.assign({ status }, fields);
}

function conflictResult(kind, key, reason, name, extra = {}) {
  return outcome("conflict", { kind, key, reason, name, ...extra });
}

// The name an item gets from a "rename" decision: the typed one, or a suggestion when it was left empty.
function renamedTo(ctx, kind, entity, decision, uuidRandom) {
  const typed = typeof decision.name === "string" ? decision.name.trim() : "";
  return typed || proposeName(ctx, kind, entity.name, { uuidRandom });
}

// A UUID that is not used by any User.
function freshUserId(ctx) {
  let id = crypto.randomUUID();
  while (ctx.userIds.has(id)) id = crypto.randomUUID();
  return id;
}

// Writes one Node, unless it was decided before in this restore (then its result is returned) or its decision
// is to skip it. Result status:
//   added     the Node was written (id, name; renamed is true when it got a different name; the id is the original
//             one unless that is not a UUID or is used by another Node, which is never public so it is replaced silently)
//   skipped   the admin skipped it (nothing written; Users that embed it simply get no link)
//   mapped    it was written or skipped earlier (id is the id it became, or null)
//   conflict  the name is taken and there is no decision that fixes it
export async function resolveNode(env, ctx, entity, decisions) {
  const key = entityKey("node", entity.id);
  if (ctx.nodeMap.has(key)) return outcome("mapped", { id: ctx.nodeMap.get(key) });
  const decision = readDecision(decisions, key);
  if (decision && decision.action === "skip") {
    ctx.nodeMap.set(key, null);
    return outcome("skipped");
  }
  const renamed = Boolean(decision && decision.action === "rename");
  const name = renamed ? renamedTo(ctx, "node", entity, decision, true) : entity.name;
  if (ctx.nodeNames.has(name)) return conflictResult("node", key, "name_taken", name);
  let id = entity.id;
  if (!isUuid(id) || ctx.nodeIds.has(id)) {
    id = crypto.randomUUID();
    while (ctx.nodeIds.has(id)) id = crypto.randomUUID();
  }
  try {
    await insertRestoredNode(env, { ...entity, id, name });
  } catch (err) {
    if (isConstraintError(err)) return conflictResult("node", key, "name_taken", name);
    throw err;
  }
  ctx.nodeNames.add(name);
  ctx.nodeIds.add(id);
  ctx.nodeMap.set(key, id);
  ctx.added.nodes += 1;
  return outcome("added", { id, name, renamed: name !== entity.name });
}

// Decides what happens to one User without writing anything, so the caller can leave the User's Nodes alone when
// the User is skipped or has a conflict. Result status:
//   create           the User can be written as { id, name } (renamed / uuidRegenerated say what changed);
//                    pass the result to createUser() together with the ids of the User's Nodes
//   skipped          the admin skipped it
//   mapped           decided earlier in this restore (id is the id it became, or null)
//   linked_existing  role "linked" only: a User with this name exists, so this is that User (id)
//   conflict         reason "name_taken", "uuid_taken" or "invalid_name" (name mode: the name cannot be an id);
//                    uuidRandom and uuidAlsoTaken let the browser word the question
export function prepareUser(ctx, entity, decisions, role) {
  const key = entityKey("user", entity.id);
  if (ctx.userMap.has(key)) return outcome("mapped", { id: ctx.userMap.get(key) });
  const decision = readDecision(decisions, key);
  if (decision && decision.action === "skip") {
    ctx.userMap.set(key, null);
    return outcome("skipped");
  }
  const uuidRandom = entity.uuidRandom;
  const renamed = Boolean(decision && decision.action === "rename");
  const name = renamed ? renamedTo(ctx, "user", entity, decision, uuidRandom) : entity.name;
  const extra = { uuidRandom, uuidAlsoTaken: ctx.userIds.has(entity.id) };

  // 1. The name.
  if (ctx.userNames.has(name)) {
    if (role === "linked" && !renamed) {
      const existingId = ctx.userNames.get(name);
      ctx.userMap.set(key, existingId);
      return outcome("linked_existing", { id: existingId });
    }
    return conflictResult("user", key, "name_taken", name, extra);
  }

  // 2. The UUID, only now that the name passed. In name mode the id is the name.
  let id = entity.id;
  if (!uuidRandom) {
    id = usernameToId(name);
    if (!id) return conflictResult("user", key, "invalid_name", name, extra);
  }
  let uuidRegenerated = false;
  if (ctx.userIds.has(id)) {
    // A random UUID can be replaced; after a rename that happens by itself (the admin was told). A name-mode id
    // cannot: only another name fixes it.
    if (uuidRandom && (renamed || (decision && decision.action === "newUuid"))) {
      id = freshUserId(ctx);
      uuidRegenerated = true;
    } else {
      return conflictResult("user", key, "uuid_taken", name, extra);
    }
  }
  return outcome("create", { id, name, renamed: name !== entity.name, uuidRegenerated });
}

// Writes a User that prepareUser() said can be created, with its Node links (nodeIds are ids that exist in this
// database, in the order wanted). Returns { status: "added", id, name, renamed, uuidRegenerated } or a conflict
// result when the database refuses the id because something took it in between.
export async function createUser(env, ctx, prepared, entity, nodeIds) {
  const key = entityKey("user", entity.id);
  try {
    await insertRestoredUser(env, { ...entity, id: prepared.id, name: prepared.name }, nodeIds);
  } catch (err) {
    if (isConstraintError(err)) {
      return conflictResult("user", key, "uuid_taken", prepared.name, {
        uuidRandom: entity.uuidRandom,
        uuidAlsoTaken: true,
      });
    }
    throw err;
  }
  ctx.userNames.set(prepared.name, prepared.id);
  ctx.userIds.add(prepared.id);
  ctx.userMap.set(key, prepared.id);
  ctx.added.users += 1;
  for (const source of entity.sources) {
    if (source.type === "subscription") ctx.added.subSources += 1;
    else ctx.added.rawSources += 1;
  }
  return outcome("added", {
    id: prepared.id,
    name: prepared.name,
    renamed: prepared.renamed,
    uuidRegenerated: prepared.uuidRegenerated,
  });
}

// Adds links between Users and Nodes that were written (or found) in this restore. pairs is a list of
// { userKey, nodeKey } (entityKey() keys); a pair is dropped when either side was skipped or is unknown. A link
// that exists is left as it is, so calling this again for the same pair is safe. New links go last in the User's
// order. Returns how many pairs were passed on to the database.
export async function linkEntities(env, ctx, pairs) {
  const links = [];
  const seen = new Set();
  for (const { userKey, nodeKey } of pairs) {
    const userId = ctx.userMap.get(userKey);
    const nodeId = ctx.nodeMap.get(nodeKey);
    if (!userId || !nodeId) continue;
    const id = userId + "|" + nodeId;
    if (seen.has(id)) continue;
    seen.add(id);
    links.push({ userId, nodeId });
  }
  await addUserNodeLinks(env, links);
  return links.length;
}
