export function rowToNode(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    source: JSON.parse(row.source),
    enabled: row.enabled !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // NULL (never edited) reads as the creation time.
    editedAt: row.edited_at ?? row.created_at,
  };
}

// ---------------------------------------------------------------------
// NODES — thin SQL wrappers. The nodes.name UNIQUE constraint (schema
// above) is what now enforces DK-15's duplicate-name guarantee; callers
// should catch a constraint-violation error from insertNodeRow()/
// renameNodeRow() and translate it to the existing 409 duplicate_name
// response instead of pre-checking with a separate query.
// ---------------------------------------------------------------------
export async function getNodeRowById(env, id) {
  return env.DB.prepare(`SELECT * FROM nodes WHERE id = ?`).bind(id).first();
}

export async function listNodeRows(env) {
  const { results } = await env.DB
    .prepare(`SELECT * FROM nodes ORDER BY created_at ASC`)
    .all();
  return results;
}

export async function insertNodeRow(env, node) {
  await env.DB
    .prepare(
      `INSERT INTO nodes (id, name, source, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      node.id,
      node.name,
      JSON.stringify(node.source),
      node.enabled !== false ? 1 : 0,
      node.createdAt,
      node.updatedAt,
    )
    .run();
}

// updated_at is left alone: it is the last subscription fetch that used this Node, see
// touchNodesUpdatedAt(), so a panel edit cannot overwrite a newer fetch time read earlier.
export async function updateNodeRow(env, node) {
  await env.DB
    .prepare(
      `UPDATE nodes SET name = ?, source = ?, enabled = ?, edited_at = ? WHERE id = ?`,
    )
    .bind(
      node.name,
      JSON.stringify(node.source),
      node.enabled !== false ? 1 : 0,
      node.editedAt ?? null,
      node.id,
    )
    .run();
}

// Sets updated_at for several Nodes in one batch (one round trip). An unknown id changes nothing.
export async function touchNodesUpdatedAt(env, ids, ts) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  await env.DB.batch(
    ids.map((id) =>
      env.DB.prepare(`UPDATE nodes SET updated_at = ? WHERE id = ?`).bind(ts, id),
    ),
  );
}

// ON DELETE CASCADE on user_nodes.node_id removes every User's reference
// to this Node automatically — this is what replaces deleteNode()'s old
// per-user cascade loop (and the withUserLock() it needed) entirely.
export async function deleteNodeRow(env, id) {
  await env.DB.prepare(`DELETE FROM nodes WHERE id = ?`).bind(id).run();
}
