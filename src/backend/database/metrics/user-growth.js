// ---------------------------------------------------------------------
// USER GROWTH (Dashboard chart) — one row per UTC calendar day holding
// the total user count last recorded that day. Rows are written lazily
// (no cron), so a day nobody touched has no row and getUserGrowth()
// carries the previous value forward. Nothing before the first snapshot
// is invented.
// ---------------------------------------------------------------------
const MS_PER_DAY = 86400000;

function utcDayString(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Non-fatal, same DK-9 rationale as adjustStats(): a failed snapshot must
// not fail the request that triggered it.
export async function recordUserGrowthSnapshot(env, totalUsers) {
  try {
    await env.DB
      .prepare(
        `INSERT INTO user_growth (day, total_users) VALUES (?, ?)
         ON CONFLICT(day) DO UPDATE SET total_users = excluded.total_users`,
      )
      .bind(utcDayString(Date.now()), totalUsers)
      .run();
  } catch (err) {
    console.error("recordUserGrowthSnapshot (D1) failed (non-fatal):", err);
  }
}

// Returns [{ day, totalUsers }] for the last `days` UTC days, oldest
// first. Days before the first known value are omitted (no backfill).
export async function getUserGrowth(env, days = 7) {
  const now = Date.now();
  const dayList = [];
  for (let i = days - 1; i >= 0; i--) {
    dayList.push(utcDayString(now - i * MS_PER_DAY));
  }
  // The newest row before the window seeds the carry-forward value.
  const seedRow = await env.DB
    .prepare(
      `SELECT total_users FROM user_growth WHERE day < ? ORDER BY day DESC LIMIT 1`,
    )
    .bind(dayList[0])
    .first();
  const { results } = await env.DB
    .prepare(
      `SELECT day, total_users FROM user_growth WHERE day >= ? ORDER BY day ASC`,
    )
    .bind(dayList[0])
    .all();
  const byDay = new Map(results.map((r) => [r.day, r.total_users]));
  let last = seedRow ? seedRow.total_users : null;
  const series = [];
  for (const day of dayList) {
    if (byDay.has(day)) last = byDay.get(day);
    if (last !== null) series.push({ day, totalUsers: last });
  }
  return series;
}
