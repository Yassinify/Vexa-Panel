// ---------------------------------------------------------------------
// USER<->NODE RELATIONSHIP (replaces user.nodeIds[] as a JSON array)
// ---------------------------------------------------------------------
export async function getUserNodeIds(env, userId) {
  const { results } = await env.DB
    .prepare(`SELECT node_id FROM user_nodes WHERE user_id = ? ORDER BY position ASC`)
    .bind(userId)
    .all();
  return results.map((r) => r.node_id);
}

// The ids of the Users linked to a Node (any order of the User ids is fine: the order that matters is the
// per-User position of the Node, see nodeUserStatements()).
export async function getNodeUserIds(env, nodeId) {
  const { results } = await env.DB
    .prepare(`SELECT user_id FROM user_nodes WHERE node_id = ? ORDER BY user_id ASC`)
    .bind(nodeId)
    .all();
  return results.map((r) => r.user_id);
}

// How many ENABLED Nodes each User has assigned, as { userId: count }; a User with none is absent. Each Node holds
// exactly one source, so this is the number of active sources assigned to the User through Nodes (a disabled Node is
// not active and is not counted). One read of user_nodes joined with nodes, so the number always comes from the
// stored links and the stored enabled flags. Shown on the cards of the Node editor's User Selection (listUsers()).
export async function getEnabledNodeCountsByUser(env) {
  const { results } = await env.DB
    .prepare(
      `SELECT un.user_id AS user_id, COUNT(*) AS node_count
       FROM user_nodes un JOIN nodes n ON n.id = un.node_id
       WHERE n.enabled = 1
       GROUP BY un.user_id`,
    )
    .all();
  const counts = {};
  for (const r of results) counts[r.user_id] = r.node_count;
  return counts;
}

// The statements that change which Users a Node is linked to, for the Node editor's User Selection. They are
// returned, not run, so the caller can put them in the same env.DB.batch() as the Node row itself (a D1 batch is
// one all-or-nothing transaction): a Node insert or update that fails (for example a duplicate name) then leaves
// every link as it was. addIds and removeIds must already be validated and must not overlap (see
// resolveValidUserIds() in nodes.js). A new link goes last in that User's order (MAX(position) + 1, or 0 for a
// User with no links); INSERT OR IGNORE makes a link that already exists a no-op instead of a primary key error.
// Every User whose links change gets a new edited_at, as a change of its Node links in the User editor does.
// Statements in a batch run in order, so for a new Node the Node INSERT must come first (user_nodes.node_id is a
// foreign key).
export function nodeUserStatements(env, nodeId, addIds, removeIds, editedAt) {
  const stmts = [];
  for (const userId of removeIds) {
    stmts.push(
      env.DB.prepare(`DELETE FROM user_nodes WHERE node_id = ? AND user_id = ?`).bind(nodeId, userId),
    );
  }
  for (const userId of addIds) {
    stmts.push(
      env.DB
        .prepare(
          `INSERT OR IGNORE INTO user_nodes (user_id, node_id, position)
           SELECT ?, ?, COALESCE(MAX(position) + 1, 0) FROM user_nodes WHERE user_id = ?`,
        )
        .bind(userId, nodeId, userId),
    );
  }
  for (const userId of [...removeIds, ...addIds]) {
    stmts.push(
      env.DB.prepare(`UPDATE users SET edited_at = ? WHERE id = ?`).bind(editedAt, userId),
    );
  }
  return stmts;
}

// DK-19: updates the User row (updated_at is left alone: it is the last
// subscription fetch, see touchUserUpdatedAt()) and replaces its ordered Node links in one
// env.DB.batch() (UPDATE, then delete-then-insert). D1 runs a batch as a
// single all-or-nothing transaction, so the row and its links commit
// together or neither does. Statements in a batch cannot depend on each
// other's results; every value here is known before the batch is built.
// nodeIds must already be the validated/deduplicated list (see
// resolveValidNodeIds() in users.js) - this function only persists, it
// does not validate.
export async function updateUserWithNodes(env, user, nodeIds) {
  const stmts = [
    env.DB
      .prepare(
        `UPDATE users SET name = ?, enabled = ?, sources = ?, edited_at = ? WHERE id = ?`,
      )
      .bind(
        user.name,
        user.enabled !== false ? 1 : 0,
        JSON.stringify(user.sources || []),
        user.editedAt ?? null,
        user.id,
      ),
    env.DB.prepare(`DELETE FROM user_nodes WHERE user_id = ?`).bind(user.id),
    ...nodeIds.map((nodeId, i) =>
      env.DB
        .prepare(`INSERT INTO user_nodes (user_id, node_id, position) VALUES (?, ?, ?)`)
        .bind(user.id, nodeId, i),
    ),
  ];
  await env.DB.batch(stmts);
}

// Changes a User's id (the public link id) in one env.DB.batch(). user.id is the new
// id and oldId the current one. user_nodes has no ON UPDATE CASCADE, so the primary key
// cannot be updated in place: the new row is inserted first, then the Node links under the
// new id, then the old links and the old row are removed. created_at and updated_at are
// copied from the old row inside the batch, so a subscription fetch that touched updated_at
// is not overwritten with an older value. The old links are deleted explicitly, so no
// orphan rows remain even if the cascade is not enforced. The caller must check that
// user.id is free and pass the validated nodeIds; this function only persists. A taken id
// makes the INSERT fail and the whole batch rolls back.
export async function replaceUserId(env, oldId, user, nodeIds) {
  const stmts = [
    env.DB
      .prepare(
        `INSERT INTO users (id, name, enabled, sources, created_at, updated_at, edited_at, uuid_random)
         SELECT ?, ?, ?, ?, created_at, updated_at, ?, ? FROM users WHERE id = ?`,
      )
      .bind(
        user.id,
        user.name,
        user.enabled !== false ? 1 : 0,
        JSON.stringify(user.sources || []),
        user.editedAt ?? null,
        user.uuidRandom !== false ? 1 : 0,
        oldId,
      ),
    ...nodeIds.map((nodeId, i) =>
      env.DB
        .prepare(`INSERT INTO user_nodes (user_id, node_id, position) VALUES (?, ?, ?)`)
        .bind(user.id, nodeId, i),
    ),
    env.DB.prepare(`DELETE FROM user_nodes WHERE user_id = ?`).bind(oldId),
    env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(oldId),
  ];
  await env.DB.batch(stmts);
}

// DK-20: inserts a new User row and its initial Node links in one
// env.DB.batch(), so the row and its links commit together or neither
// does. Unlike updateUserWithNodes(), no DELETE FROM user_nodes is needed:
// user.id is freshly generated by createUser(), so it has no links yet.
// Called unconditionally (nodeIds may be empty, in which case the batch
// holds only the User INSERT). nodeIds must already be the
// validated/deduplicated list (see resolveValidNodeIds() in users.js) -
// this function only persists, it does not validate.
export async function insertUserWithNodes(env, user, nodeIds) {
  const stmts = [
    env.DB
      .prepare(
        `INSERT INTO users (id, name, enabled, sources, created_at, updated_at, uuid_random)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        user.id,
        user.name,
        user.enabled !== false ? 1 : 0,
        JSON.stringify(user.sources || []),
        user.createdAt,
        user.updatedAt,
        user.uuidRandom !== false ? 1 : 0,
      ),
    ...nodeIds.map((nodeId, i) =>
      env.DB
        .prepare(`INSERT INTO user_nodes (user_id, node_id, position) VALUES (?, ?, ?)`)
        .bind(user.id, nodeId, i),
    ),
  ];
  await env.DB.batch(stmts);
}
