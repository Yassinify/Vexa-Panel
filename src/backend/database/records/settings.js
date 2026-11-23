// Panel settings: one singleton row (id = 1, created by the schema bootstrap).
export const CALENDARS = ["gregorian", "jalali"];

// Returns the stored calendar, or "gregorian" if the row is missing or holds an unknown value.
export async function getCalendarSetting(env) {
  const row = await env.DB.prepare(`SELECT calendar FROM settings WHERE id = 1`).first();
  return row && CALENDARS.includes(row.calendar) ? row.calendar : "gregorian";
}

// Persists the calendar; the caller must pass a value from CALENDARS.
export async function setCalendarSetting(env, calendar) {
  await env.DB.prepare(`UPDATE settings SET calendar = ? WHERE id = 1`).bind(calendar).run();
}
