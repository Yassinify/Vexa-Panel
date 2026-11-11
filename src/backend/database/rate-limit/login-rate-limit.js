// ---------------------------------------------------------------------
// LOGIN RATE LIMITING — replaces src/kv.js's checkLoginRateLimit(). Same
// policy as before, preserved exactly:
//   - max 10 attempts per IP
//   - a SLIDING 5-minute window: KV's expirationTtl:300 was refreshed on
//     every successful (allowed) attempt's put(), so window_start here is
//     likewise refreshed to "now" on every allowed attempt, not just the
//     first — a fixed window would let the count reset mid-window and
//     allow more than 10 attempts in some 5-minute spans, which the old
//     KV behavior never did.
//   - a rejected attempt (already at/over the cap within the window) does
//     NOT increment the counter — matches the old `if (current >= 10)
//     return false` short-circuit, which read but never wrote on that
//     branch.
// D1 has no compare-and-swap primitive, so this uses a single atomic
// UPDATE (guarded by a WHERE clause that only matches when the attempt is
// still allowed) followed by checking whether that UPDATE actually
// matched a row — not a separate SELECT-then-UPDATE — so two concurrent
// requests from the same IP cannot both read a stale count and both
// increment past the cap (D1/SQLite serializes each statement).
// ---------------------------------------------------------------------
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10;
const LOGIN_RATE_LIMIT_WINDOW_MS = 1000 * 60 * 5; // 5 minutes, same as the old KV expirationTtl

export async function checkLoginRateLimit(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();

  // Ensure a row exists for this IP without disturbing an existing,
  // still-fresh row (OR IGNORE leaves an existing row untouched).
  await env.DB
    .prepare(`INSERT OR IGNORE INTO login_rate_limit (ip, attempts, window_start) VALUES (?, 0, ?)`)
    .bind(ip, now)
    .run();

  // Atomically increment ONLY when allowed: either the existing window has
  // expired (sliding window resets to attempts=1, window_start=now, same
  // as a fresh IP), or the window is still fresh and attempts < the cap
  // (plain increment, window_start refreshed to "now" — the sliding
  // behavior). If neither condition holds (still-fresh window, already at
  // the cap), the WHERE clause matches no row and this UPDATE is a no-op,
  // mirroring the old code's "read but don't write" rejection path.
  const result = await env.DB
    .prepare(
      `UPDATE login_rate_limit
       SET attempts = CASE WHEN ? - window_start >= ? THEN 1 ELSE attempts + 1 END,
           window_start = ?
       WHERE ip = ? AND (? - window_start >= ? OR attempts < ?)`,
    )
    .bind(now, LOGIN_RATE_LIMIT_WINDOW_MS, now, ip, now, LOGIN_RATE_LIMIT_WINDOW_MS, LOGIN_RATE_LIMIT_MAX_ATTEMPTS)
    .run();

  return result.meta.changes > 0;
}
