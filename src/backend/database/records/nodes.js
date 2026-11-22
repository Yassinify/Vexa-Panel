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
// NODES - thin SQL wrappers. The nodes.name UNIQUE constraint (schema
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

// extraStmts (optional): more prepared statements, for example the User links of the Node editor's User
// Selection (nodeUserStatements() in user-nodes.js). With any, the INSERT and the extras run in one
// env.DB.batch(), which D1 runs as a single all-or-nothing transaction, so a failed INSERT (a duplicate name)
// leaves no link behind and a failed link leaves no Node behind. Without any it is the plain single statement.
export async function insertNodeRow(env, node, extraStmts = []) {
  const stmt = env.DB
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
    );
  if (extraStmts.length === 0) await stmt.run();
  else await env.DB.batch([stmt, ...extraStmts]);
}

// updated_at is left alone: it is the last subscription fetch that used this Node, see
// touchNodesUpdatedAt(), so a panel edit cannot overwrite a newer fetch time read earlier.
// extraStmts: as for insertNodeRow() (one all-or-nothing batch when there are any).
export async function updateNodeRow(env, node, extraStmts = []) {
  const stmt = env.DB
    .prepare(
      `UPDATE nodes SET name = ?, source = ?, enabled = ?, edited_at = ? WHERE id = ?`,
    )
    .bind(
      node.name,
      JSON.stringify(node.source),
      node.enabled !== false ? 1 : 0,
      node.editedAt ?? null,
      node.id,
    );
  if (extraStmts.length === 0) await stmt.run();
  else await env.DB.batch([stmt, ...extraStmts]);
}

// Runs prepared statements alone (no Node row change) as one all-or-nothing batch: a Save of the Node editor
// that changed only the User Selection. An empty list does nothing.
export async function runNodeStatements(env, stmts) {
  if (!Array.isArray(stmts) || stmts.length === 0) return;
  await env.DB.batch(stmts);
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
// to this Node automatically - this is what replaces deleteNode()'s old
// per-user cascade loop (and the withUserLock() it needed) entirely.
export async function deleteNodeRow(env, id) {
  await env.DB.prepare(`DELETE FROM nodes WHERE id = ?`).bind(id).run();
}
