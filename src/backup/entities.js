import { normalizeSources } from "../backend/protocols/sources.js";
import { rowToUser, rowToNode } from "../backend/database/d1.js";
import { usernameToId, isUuid, cleanSubscriptionTitle } from "../users.js";

// ---------------------------------------------------------------------
// BACKUP ENTITIES
// A "user entity" and a "node entity" are the complete, self-contained records stored in a backup. Both the
// Users section and the Nodes section embed them (Users carry their Nodes, Nodes carry their Users), so the
// shape, the export from a database row and the validation of an untrusted file live here, once.
// This file is pure: it never touches the database. Whatever needs a database (conflict checks, writes)
// is in src/backup/resolve.js.
//
//   node entity:  { id, name, source, enabled, createdAt, updatedAt, editedAt }
//   user entity:  { id, name, enabled, uuidRandom, subscriptionTitle, sources, createdAt, updatedAt, editedAt }
//
// source is the stored source object ({ type, value } or { type: "subscription", url }); sources is a list of them.
// The ids are the ones from the exporting panel. They are also the keys the restore uses for its decisions
// (see entityKey()), so a Node that appears in several places of one file is decided once.
// ---------------------------------------------------------------------

// Key of an entity inside one restore: "node:<id>" or "user:<id>", with the id taken from the file.
export function entityKey(kind, id) {
  return kind + ":" + id;
}

// ---------------------------------------------------------------------
// EXPORT (database row to entity)
// ---------------------------------------------------------------------

// A nodes row as a node entity. editedAt reads as createdAt for a Node that was never edited, the same as
// everywhere else in the panel.
export function nodeToEntity(row) {
  return rowToNode(row);
}

// A users row as a user entity. The Node links are not part of it: the Users section stores them as the ordered
// node entities of the User, and the Nodes section stores them as the User entities of the Node.
export function userToEntity(row) {
  const { nodeIds, ...entity } = rowToUser(row, null);
  return entity;
}

// ---------------------------------------------------------------------
// IMPORT (untrusted entity to a safe entity)
// A backup file may be edited by hand or come from another panel, so nothing in it is trusted. Each reader
// returns { ok: true, entity } with a clean copy (only the known fields, sources classified again), or
// { ok: false, reason } with one of:
//   invalid_entity    not an object
//   invalid_id        no usable id (a non-empty string of at most 200 characters)
//   invalid_name      no name once trimmed
//   invalid_source    a Node source that is missing or that the panel does not recognize (same rules as saving a Node)
//   invalid_sources   a User source list that is not a list, or holds a source the panel does not recognize
//   invalid_user_id   the id does not fit the User's UUID mode (a random UUID, or the name as the id)
// Dates that are missing or not numbers do not fail the entity: createdAt falls back to now, updatedAt to
// createdAt, and editedAt to null (never edited).
// ---------------------------------------------------------------------

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUsableId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function toTimestamp(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : fallback;
}

// The text of a stored source: the url of a subscription, the value of every other type. A plain string is
// accepted too. The text is classified again (normalizeSources() on a string), never the stored object: that
// function lets an object through without checking its type, and a file must not be able to use that.
function sourceToString(value) {
  if (typeof value === "string") return value;
  if (!isPlainObject(value)) return null;
  const text = value.type === "subscription" ? value.url : value.value;
  return typeof text === "string" ? text : null;
}

export function readNodeEntity(raw) {
  if (!isPlainObject(raw)) return { ok: false, reason: "invalid_entity" };
  if (!isUsableId(raw.id)) return { ok: false, reason: "invalid_id" };
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return { ok: false, reason: "invalid_name" };
  const text = sourceToString(raw.source);
  const { sources } = text === null ? { sources: [] } : normalizeSources([text]);
  if (sources.length !== 1) return { ok: false, reason: "invalid_source" };
  const createdAt = toTimestamp(raw.createdAt, Date.now());
  return {
    ok: true,
    entity: {
      id: raw.id,
      name,
      source: sources[0],
      enabled: raw.enabled !== false,
      createdAt,
      updatedAt: toTimestamp(raw.updatedAt, createdAt),
      editedAt: toTimestamp(raw.editedAt, null),
    },
  };
}

export function readUserEntity(raw) {
  if (!isPlainObject(raw)) return { ok: false, reason: "invalid_entity" };
  if (!isUsableId(raw.id)) return { ok: false, reason: "invalid_id" };
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return { ok: false, reason: "invalid_name" };
  // The id has to fit the mode, as the panel itself keeps it: a random UUID, or the name as the id.
  const uuidRandom = raw.uuidRandom !== false;
  if (uuidRandom ? !isUuid(raw.id) : usernameToId(name) !== raw.id) {
    return { ok: false, reason: "invalid_user_id" };
  }
  let sources = [];
  if (raw.sources !== undefined) {
    if (!Array.isArray(raw.sources)) return { ok: false, reason: "invalid_sources" };
    const texts = raw.sources.map(sourceToString);
    if (texts.includes(null)) return { ok: false, reason: "invalid_sources" };
    const result = normalizeSources(texts);
    if (result.invalid.length > 0) return { ok: false, reason: "invalid_sources" };
    sources = result.sources;
  }
  const createdAt = toTimestamp(raw.createdAt, Date.now());
  return {
    ok: true,
    entity: {
      id: raw.id,
      name,
      enabled: raw.enabled !== false,
      uuidRandom,
      subscriptionTitle: cleanSubscriptionTitle(raw.subscriptionTitle),
      sources,
      createdAt,
      updatedAt: toTimestamp(raw.updatedAt, createdAt),
      editedAt: toTimestamp(raw.editedAt, null),
    },
  };
}

// ---------------------------------------------------------------------
// RENAMING
// ---------------------------------------------------------------------

// The name offered when an incoming item is renamed and the admin leaves the box empty: "<name>-new", and
// "<name>-new-2", "<name>-new-3" ... while that is taken. isTaken(candidate) answers for the caller, so it can
// include everything that must be free (the other names in the section, the ids a User name would produce,
// the names already chosen earlier in the same restore).
export function suggestName(baseName, isTaken) {
  const base = baseName + "-new";
  if (!isTaken(base)) return base;
  for (let n = 2; n < 10000; n++) {
    const candidate = base + "-" + n;
    if (!isTaken(candidate)) return candidate;
  }
  return base + "-" + Date.now();
}
