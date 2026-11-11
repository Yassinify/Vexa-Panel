// ---------------------------------------------------------------------
// ROW <-> APPLICATION OBJECT MAPPING
// Keeps users.js/nodes.js/merge.js/public-sub.js working with the exact
// same {id, name, enabled, sources/source, nodeIds, createdAt, updatedAt}
// shapes they used against KV — only the storage calls change.
// ---------------------------------------------------------------------
export function rowToUser(row, nodeIds) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled !== 0,
    sources: JSON.parse(row.sources || "[]"),
    nodeIds: nodeIds || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // NULL (never edited) reads as the creation time.
    editedAt: row.edited_at ?? row.created_at,
  };
}

// ---------------------------------------------------------------------
// USERS — thin SQL wrappers. nodeIds[] lives in user_nodes and is handled
// in user-nodes.js (see USER<->NODE RELATIONSHIP there).
// ---------------------------------------------------------------------
export async function getUserRowById(env, id) {
  return env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first();
}

export async function listUserRows(env) {
  const { results } = await env.DB
    .prepare(`SELECT * FROM users ORDER BY created_at ASC`)
    .all();
  return results;
}

// Full-record replace (name, enabled, sources, edited_at) — mirrors the
// old KV pattern of writing the whole user:{uuid} record back on every
// update, since D1's per-statement atomicity makes a partial-field UPDATE
// no safer than a full one here. updated_at is not written here: it is the
// last subscription fetch (touchUserUpdatedAt()), so a panel edit cannot
// overwrite it with an older value.
export async function updateUserRow(env, user) {
  await env.DB
    .prepare(
      `UPDATE users SET name = ?, enabled = ?, sources = ?, edited_at = ? WHERE id = ?`,
    )
    .bind(
      user.name,
      user.enabled !== false ? 1 : 0,
      JSON.stringify(user.sources || []),
      user.editedAt ?? null,
      user.id,
    )
    .run();
}

// Records a subscription fetch: sets only updated_at (see public-sub.js).
export async function touchUserUpdatedAt(env, id, ts) {
  await env.DB
    .prepare(`UPDATE users SET updated_at = ? WHERE id = ?`)
    .bind(ts, id)
    .run();
}

// ON DELETE CASCADE on user_nodes.user_id removes this User's relationship
// rows automatically — no separate cleanup call needed here.
export async function deleteUserRow(env, id) {
  await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();
}
