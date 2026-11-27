// ---------------------------------------------------------------------
// RESTORE HELPERS (Backup and Restore)
// Thin SQL wrappers used only by the restore code in src/backup/. They exist
// because the regular insert helpers (insertNodeRow(), insertUserWithNodes())
// never write edited_at and are written for new records created now. A restore
// must keep the dates of the backup exactly (created_at, updated_at, edited_at),
// so these helpers write every column from the object they are given.
// Like the other record helpers they only persist: the caller (src/backup/)
// validates names, ids, sources and links first and re-checks them on every write.
// ---------------------------------------------------------------------

// Every Node as { id, name }, for comparing a backup against the database. The names are returned as stored
// (the comparison rules live in the caller).
export async function listNodeIdentities(env) {
  const { results } = await env.DB.prepare(`SELECT id, name FROM nodes`).all();
  return results;
}

// Every User as { id, name }, for the same comparison. A User id is also the public link id.
export async function listUserIdentities(env) {
  const { results } = await env.DB.prepare(`SELECT id, name FROM users`).all();
  return results;
}

// Inserts one Node with the dates it had in the backup. node is { id, name, source (object), enabled,
// createdAt, updatedAt, editedAt }; a missing updatedAt reads as createdAt and a missing editedAt is stored as NULL
// (never edited). A taken name makes the nodes.name UNIQUE constraint throw: the caller maps it to a conflict.
export async function insertRestoredNode(env, node) {
  await env.DB
    .prepare(
      `INSERT INTO nodes (id, name, source, enabled, created_at, updated_at, edited_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      node.id,
      node.name,
      JSON.stringify(node.source),
      node.enabled !== false ? 1 : 0,
      node.createdAt,
      node.updatedAt ?? node.createdAt,
      node.editedAt ?? null,
    )
    .run();
}

// Inserts one User with the dates it had in the backup, plus its Node links in the given order, in one
// env.DB.batch() (an all-or-nothing transaction), like insertUserWithNodes(). user is { id, name, enabled,
// uuidRandom, subscriptionTitle, sources (array), createdAt, updatedAt, editedAt }. nodeIds must already be the
// ids of Nodes that exist in this database (the caller maps backup Node ids to the ids it created or found).
// The new User has no links yet, so the order of nodeIds becomes the order of the links (position 0, 1, 2 ...).
// A taken id makes the INSERT fail and the whole batch roll back.
export async function insertRestoredUser(env, user, nodeIds = []) {
  const stmts = [
    env.DB
      .prepare(
        `INSERT INTO users (id, name, enabled, sources, created_at, updated_at, edited_at, uuid_random, subscription_title)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        user.id,
        user.name,
        user.enabled !== false ? 1 : 0,
        JSON.stringify(user.sources || []),
        user.createdAt,
        user.updatedAt ?? user.createdAt,
        user.editedAt ?? null,
        user.uuidRandom !== false ? 1 : 0,
        user.subscriptionTitle || null,
      ),
    ...nodeIds.map((nodeId, i) =>
      env.DB
        .prepare(`INSERT INTO user_nodes (user_id, node_id, position) VALUES (?, ?, ?)`)
        .bind(user.id, nodeId, i),
    ),
  ];
  if (stmts.length === 1) await stmts[0].run();
  else await env.DB.batch(stmts);
}

// Adds Node links to Users that already exist, one batch per chunk. links is a list of { userId, nodeId }; both
// ids must exist (the user_nodes foreign keys refuse an unknown id and the batch rolls back). A new link goes last in
// that User's order (MAX(position) + 1, or 0 for a User with no links). INSERT OR IGNORE makes a link that already
// exists a no-op, so a link is never duplicated and no existing link is changed or removed. Statements in a batch
// run in order, so several links of the same User get consecutive positions in the order given. users.edited_at
// is not touched here: whether adding a link counts as an edit is the caller's decision.
export async function addUserNodeLinks(env, links) {
  if (!Array.isArray(links) || links.length === 0) return;
  const CHUNK_SIZE = 50;
  for (let i = 0; i < links.length; i += CHUNK_SIZE) {
    const stmts = links.slice(i, i + CHUNK_SIZE).map(({ userId, nodeId }) =>
      env.DB
        .prepare(
          `INSERT OR IGNORE INTO user_nodes (user_id, node_id, position)
           SELECT ?, ?, COALESCE(MAX(position) + 1, 0) FROM user_nodes WHERE user_id = ?`,
        )
        .bind(userId, nodeId, userId),
    );
    await env.DB.batch(stmts);
  }
}
