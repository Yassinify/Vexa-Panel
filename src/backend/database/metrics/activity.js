// ---------------------------------------------------------------------
// ACTIVITY — replaces src/kv.js's recordActivity(). Same DK-9 non-fatal
// handling; capped at ACTIVITY_CAP rows via an explicit DELETE instead of
// the old array-slice(0, 20).
// ---------------------------------------------------------------------
const ACTIVITY_CAP = 20;

export async function recordActivity(env, message) {
  try {
    await env.DB
      .prepare(`INSERT INTO activity (message, ts) VALUES (?, ?)`)
      .bind(message, Date.now())
      .run();
    await env.DB
      .prepare(
        `DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT ?)`,
      )
      .bind(ACTIVITY_CAP)
      .run();
  } catch (err) {
    console.error("recordActivity (D1) failed (non-fatal):", err);
  }
}

export async function getRecentActivity(env, limit = ACTIVITY_CAP) {
  const { results } = await env.DB
    .prepare(`SELECT message, ts FROM activity ORDER BY id DESC LIMIT ?`)
    .bind(limit)
    .all();
  return results;
}
