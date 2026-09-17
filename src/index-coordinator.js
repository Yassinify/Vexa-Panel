// =====================================================================
// VEXA — IndexCoordinator Durable Object (docs/problem.md DK-2)
// =====================================================================
//
// Cloudflare KV has no compare-and-swap/locking primitive, so a bare
// idx:users/idx:nodes read -> mutate array in memory -> write can lose an
// entry if two requests' get/put calls interleave. A Durable Object
// instance is single-threaded and is addressed here by a fixed name, so
// routing every idx:users/idx:nodes mutation through the same
// IndexCoordinator instance serializes them across Worker isolates (not
// just within one) -- closing the gap the previous same-isolate-only
// Promise-chain locks (idxUsersLock/idxNodesLock, removed as part of this
// change) could not close.
//
// The indexes themselves are NOT moved into Durable Object storage --
// idx:users/idx:nodes stay exactly where they were: plain JSON arrays
// under their existing keys in the STORAGE KV namespace (see kv.js's DATA
// MODEL comment). The Durable Object only serializes the
// get -> parse -> mutate -> put cycle against those KV keys; it holds no
// state of its own (no `ctx.storage` usage).
//
// Requires the INDEX_COORDINATOR Durable Object binding declared in
// wrangler.jsonc, and must be re-exported from src/index.js (the Worker
// entry module) so Cloudflare can find the class in the bundled worker.js.

import { DurableObject } from "cloudflare:workers";

// Every caller targets this same name, so env.INDEX_COORDINATOR.get(...)
// always resolves to one global instance -- the single actor that
// serializes idx:users/idx:nodes mutations for the whole Worker.
const COORDINATOR_NAME = "index-coordinator";

export class IndexCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Per-user mutex state (docs/problem.md DK-3) -- see acquireUserLock/
    // releaseUserLock below. In-memory only, scoped to this single DO
    // instance's lifetime, same as the id-list serialization above.
    this.userLockState = new Map();
    // Migration mutex state (docs/problem.md DK-6/DK-7) -- see
    // acquireMigrationLock/releaseMigrationLock below. Same
    // {locked, queue} shape as userLockState, but a single fixed slot
    // (not keyed by id) since there is only ever one migration run.
    this.migrationLockState = { locked: false, queue: [] };
    // Stats mutex state (docs/problem.md DK-10) -- see
    // acquireStatsLock/releaseStatsLock below. Same {locked, queue} shape
    // as migrationLockState: a single fixed slot (not keyed, unlike
    // userLockState) since there is only ever one global meta:stats
    // record to serialize access to.
    this.statsLockState = { locked: false, queue: [] };
    // Per-Node-name mutex state (docs/problem.md DK-15) -- see
    // acquireNodeNameLock/releaseNodeNameLock below. Same {locked, queue}
    // per-key Map shape as userLockState, but keyed by normalized Node
    // name instead of userId -- a distinct key space, not an overload of
    // userLockState.
    this.nodeNameLockState = new Map();
  }

  async addUserId(id) {
    return this.#addId("idx:users", id);
  }

  async removeUserId(id) {
    return this.#removeId("idx:users", id);
  }

  async addNodeId(id) {
    return this.#addId("idx:nodes", id);
  }

  async removeNodeId(id) {
    return this.#removeId("idx:nodes", id);
  }

  // ---------------------------------------------------------------------
  // PER-USER RECORD MUTEX (docs/problem.md DK-3)
  // Unlike addUserId/removeUserId/addNodeId/removeNodeId above (which
  // serialize mutation of the idx:users/idx:nodes id-list keys), these two
  // methods serialize the read-modify-write of an individual user:{uuid}
  // record itself. deleteNode()'s cascade cleanup and updateUser() both
  // read a user:{uuid} record, mutate it in memory, and write it back;
  // without ordering, a stale updateUser() write can overwrite (and so
  // undo) deleteNode()'s cascade cleanup of that same record's
  // nodeIds[]. Callers acquire the lock, perform their own KV read/write
  // of that user:{uuid} record, then release -- this DO only orders the
  // queue per userId, it does not touch the record itself.
  // ---------------------------------------------------------------------
  async acquireUserLock(userId) {
    let state = this.userLockState.get(userId);
    if (!state) {
      state = { locked: false, queue: [] };
      this.userLockState.set(userId, state);
    }
    if (!state.locked) {
      state.locked = true;
      return true;
    }
    await new Promise((resolve) => state.queue.push(resolve));
    state.locked = true;
    return true;
  }

  async releaseUserLock(userId) {
    const state = this.userLockState.get(userId);
    if (!state) return true;
    if (state.queue.length > 0) {
      const next = state.queue.shift();
      next();
    } else {
      state.locked = false;
      this.userLockState.delete(userId);
    }
    return true;
  }

  // ---------------------------------------------------------------------
  // PER-NODE-NAME MUTEX (docs/problem.md DK-15)
  // Same shape and purpose as PER-USER RECORD MUTEX above, keyed by
  // normalized Node name instead of userId. Serializes the duplicate-name
  // check (isDuplicateName()) together with the subsequent Node record
  // write in createNode()/updateNode() (rename), so two concurrent
  // requests targeting the same name can no longer both observe "not a
  // duplicate" and both write it (docs/problem.md DK-15's TOCTOU race).
  // Callers acquire the lock, perform their own KV read/check/write, then
  // release -- this DO only orders the queue per name, it does not touch
  // any node:{uuid} record itself.
  // ---------------------------------------------------------------------
  async acquireNodeNameLock(name) {
    let state = this.nodeNameLockState.get(name);
    if (!state) {
      state = { locked: false, queue: [] };
      this.nodeNameLockState.set(name, state);
    }
    if (!state.locked) {
      state.locked = true;
      return true;
    }
    await new Promise((resolve) => state.queue.push(resolve));
    state.locked = true;
    return true;
  }

  async releaseNodeNameLock(name) {
    const state = this.nodeNameLockState.get(name);
    if (!state) return true;
    if (state.queue.length > 0) {
      const next = state.queue.shift();
      next();
    } else {
      state.locked = false;
      this.nodeNameLockState.delete(name);
    }
    return true;
  }

  // ---------------------------------------------------------------------
  // MIGRATION MUTEX (docs/problem.md DK-6/DK-7)
  // Serializes entry into ensureMigrated()'s side-effect body across every
  // Worker isolate, the same way acquireUserLock/releaseUserLock above
  // serialize a per-user read-modify-write: only one caller at a time
  // holds the lock, everyone else queues. This closes DK-7 (two concurrent
  // requests both reading meta:migrated_v3 as unset and both proceeding to
  // migrate). It does not by itself make migration resumable after an
  // interruption -- that is DK-6, addressed separately in kv.js by making
  // each migration step delete its source profile:* record immediately
  // after it is successfully merged, so a later invocation (queued here or
  // not) only ever finds genuinely-unprocessed records.
  // ---------------------------------------------------------------------
  async acquireMigrationLock() {
    const state = this.migrationLockState;
    if (!state.locked) {
      state.locked = true;
      return true;
    }
    await new Promise((resolve) => state.queue.push(resolve));
    state.locked = true;
    return true;
  }

  async releaseMigrationLock() {
    const state = this.migrationLockState;
    if (state.queue.length > 0) {
      const next = state.queue.shift();
      next();
    } else {
      state.locked = false;
    }
    return true;
  }

  // ---------------------------------------------------------------------
  // STATS MUTEX (docs/problem.md DK-10)
  // Serializes adjustStats()'s meta:stats read-modify-write across every
  // Worker isolate, the same way acquireMigrationLock/releaseMigrationLock
  // above serialize the migration critical section: a single fixed slot,
  // not keyed by id, since there is only ever one global meta:stats
  // record. Closes the DK-10 lost-update race where two concurrent
  // adjustStats() calls could each read the same pre-update meta:stats
  // value and one write clobber the other's increment. Does not cover
  // idx:users/idx:nodes (DK-2, #addId/#removeId above) or per-user record
  // writes (DK-3, acquireUserLock/releaseUserLock above) -- those already
  // have their own dedicated coordination and are untouched by this lock.
  // ---------------------------------------------------------------------
  async acquireStatsLock() {
    const state = this.statsLockState;
    if (!state.locked) {
      state.locked = true;
      return true;
    }
    await new Promise((resolve) => state.queue.push(resolve));
    state.locked = true;
    return true;
  }

  async releaseStatsLock() {
    const state = this.statsLockState;
    if (state.queue.length > 0) {
      const next = state.queue.shift();
      next();
    } else {
      state.locked = false;
    }
    return true;
  }

  // Idempotent: an id already present in the index is left as-is (no
  // duplicate pushed, no KV write performed).
  async #addId(key, id) {
    const ids = await this.#readIds(key);
    if (ids.includes(id)) return ids;
    ids.push(id);
    await this.env.STORAGE.put(key, JSON.stringify(ids));
    return ids;
  }

  // Idempotent: an id already absent from the index is left as-is (no
  // KV write performed).
  async #removeId(key, id) {
    const ids = await this.#readIds(key);
    if (!ids.includes(id)) return ids;
    const filtered = ids.filter((existing) => existing !== id);
    await this.env.STORAGE.put(key, JSON.stringify(filtered));
    return filtered;
  }

  async #readIds(key) {
    const raw = await this.env.STORAGE.get(key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Malformed idx:* record -- treat like an empty index rather than
      // throwing, same tolerance as kvGetJson() elsewhere (docs/problem.md
      // DK-1's pattern).
      return [];
    }
  }
}

// ---------------------------------------------------------------------
// Worker-side call helpers -- always resolve to the same fixed-name DO
// instance above, so every call (from any isolate, any request) is
// serialized through one actor. Callers in users.js/nodes.js/kv.js use
// these instead of touching idx:users/idx:nodes directly.
// ---------------------------------------------------------------------
function stub(env) {
  const id = env.INDEX_COORDINATOR.idFromName(COORDINATOR_NAME);
  return env.INDEX_COORDINATOR.get(id);
}

export async function addUserId(env, id) {
  return stub(env).addUserId(id);
}

export async function removeUserId(env, id) {
  return stub(env).removeUserId(id);
}

export async function addNodeId(env, id) {
  return stub(env).addNodeId(id);
}

export async function removeNodeId(env, id) {
  return stub(env).removeNodeId(id);
}

// Serializes a caller-supplied User read-modify-write critical section
// against any other acquireUserLock(userId) holder (docs/problem.md
// DK-3) -- e.g. deleteNode()'s cascade cleanup vs. updateUser() on the
// same user:{uuid} record. The critical section itself (KV get/put) runs
// in the caller, not inside the Durable Object; this DO only orders
// access per userId.
export async function withUserLock(env, userId, fn) {
  const coordinator = stub(env);
  await coordinator.acquireUserLock(userId);
  try {
    return await fn();
  } finally {
    await coordinator.releaseUserLock(userId);
  }
}

// Serializes a caller-supplied duplicate-name-check-then-Node-write
// critical section against any other acquireNodeNameLock(name) holder for
// the same normalized name (docs/problem.md DK-15) -- e.g. two concurrent
// createNode() calls, or a createNode() racing an updateNode() rename,
// targeting the same name. The critical section itself (isDuplicateName()
// plus the node:{uuid} write) runs in the caller (nodes.js), not inside
// the Durable Object; this DO only orders access per name.
export async function withNodeNameLock(env, name, fn) {
  const coordinator = stub(env);
  await coordinator.acquireNodeNameLock(name);
  try {
    return await fn();
  } finally {
    await coordinator.releaseNodeNameLock(name);
  }
}

// Serializes ensureMigrated()'s side-effect body against any other
// concurrent ensureMigrated() call, across every Worker isolate (docs/
// problem.md DK-7), the same way withUserLock() above serializes a
// per-user critical section. The critical section (the migration body)
// runs in the caller (kv.js), not inside the Durable Object; this DO only
// orders access to one fixed migration slot.
export async function withMigrationLock(env, fn) {
  const coordinator = stub(env);
  await coordinator.acquireMigrationLock();
  try {
    return await fn();
  } finally {
    await coordinator.releaseMigrationLock();
  }
}

// Serializes adjustStats()'s meta:stats read-modify-write against any
// other concurrent adjustStats() call, across every Worker isolate (docs/
// problem.md DK-10), the same way withMigrationLock() above serializes
// the migration critical section against one fixed slot. The critical
// section (the meta:stats get/mutate/put) runs in the caller (kv.js), not
// inside the Durable Object; this DO only orders access to one fixed
// stats slot.
export async function withStatsLock(env, fn) {
  const coordinator = stub(env);
  await coordinator.acquireStatsLock();
  try {
    return await fn();
  } finally {
    await coordinator.releaseStatsLock();
  }
}
