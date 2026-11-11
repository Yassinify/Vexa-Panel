// ---------------------------------------------------------------------
// STATS — replaces src/kv.js's recomputeStats()/adjustStats(). A plain
// UPDATE ... SET x = x + ? is one atomic SQLite statement, so the DK-10
// lost-update race the old withStatsLock() existed to close cannot occur
// here — no application-level lock is used or needed.
// ---------------------------------------------------------------------
const STATS_COLUMNS = {
  totalUsers: "total_users",
  totalSubSources: "total_sub_sources",
  totalRawSources: "total_raw_sources",
};

export async function getStatsRow(env) {
  const row = await env.DB.prepare(`SELECT * FROM stats WHERE id = 1`).first();
  if (!row)
    return { totalUsers: 0, totalSubSources: 0, totalRawSources: 0, updatedAt: 0 };
  return {
    totalUsers: row.total_users,
    totalSubSources: row.total_sub_sources,
    totalRawSources: row.total_raw_sources,
    updatedAt: row.updated_at,
  };
}

// delta is the same {totalUsers, totalSubSources, totalRawSources}-keyed
// partial object src/kv.js's old adjustStats() accepted. Non-fatal on
// failure, same DK-9 rationale as before: a stats-write failure must not
// turn an already-successful primary User/Node mutation into a 500.
export async function adjustStats(env, delta) {
  try {
    const keys = Object.keys(delta).filter((k) => STATS_COLUMNS[k]);
    if (keys.length === 0) return;
    const sets = keys
      .map((k) => `${STATS_COLUMNS[k]} = MAX(0, ${STATS_COLUMNS[k]} + ?)`)
      .join(", ");
    await env.DB
      .prepare(`UPDATE stats SET ${sets}, updated_at = ? WHERE id = 1`)
      .bind(...keys.map((k) => delta[k]), Date.now())
      .run();
  } catch (err) {
    console.error("adjustStats (D1) failed (non-fatal):", err);
  }
}

// ---------------------------------------------------------------------
// LIVE COUNTS (Dashboard) — plain SELECT COUNT(*) queries rather than
// more stats-table columns kept in sync via adjustStats(). The Dashboard
// is a low-traffic, admin-only read, so a live count per request is cheap
// and always exactly correct — no extra write-path bookkeeping (node
// create/delete, user enable/disable) needed to keep a cached counter
// from drifting.
// ---------------------------------------------------------------------
export async function getNodeCount(env) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM nodes`).first();
  return row ? row.c : 0;
}

// Total Nodes change: how many Nodes were created at least `days` days ago.
// Used as the "last month" baseline; the database keeps no node history.
export async function getNodeCountOlderThan(env, days) {
  const cutoff = Date.now() - days * 86400000;
  const row = await env.DB
    .prepare(`SELECT COUNT(*) AS c FROM nodes WHERE created_at <= ?`)
    .bind(cutoff)
    .first();
  return row ? row.c : 0;
}

// Total Users card: counts every User row (enabled and disabled). Read live
// because stats.total_users is an incremental counter that can drift
// (adjustStats() failures are non-fatal and never repaired).
export async function getUserCount(env) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users`).first();
  return row ? row.c : 0;
}

export async function getActiveUserCount(env) {
  const row = await env.DB
    .prepare(`SELECT COUNT(*) AS c FROM users WHERE enabled = 1`)
    .first();
  return row ? row.c : 0;
}
