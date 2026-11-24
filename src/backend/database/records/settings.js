// Panel settings: one singleton row (id = 1, created by the schema bootstrap).
export const CALENDARS = ["gregorian", "jalali"];

// Date format style keys, in the order the Settings dropdowns list them. The client turns a key into text
// (formatters in client/helpers.js): short is shown in table cells and day labels, long in the hover tooltip.
export const SHORT_DATE_FORMATS = ["iso", "month-day-year"];
export const LONG_DATE_FORMATS = ["weekday-month-day-year", "weekday-day-month-year", "weekday-iso"];
// Today's look, used for a missing row or an unknown stored value.
export const DEFAULT_SHORT_DATE_FORMAT = "iso";
export const DEFAULT_LONG_DATE_FORMAT = "weekday-iso";

// Returns the stored calendar, or "gregorian" if the row is missing or holds an unknown value.
export async function getCalendarSetting(env) {
  const row = await env.DB.prepare(`SELECT calendar FROM settings WHERE id = 1`).first();
  return row && CALENDARS.includes(row.calendar) ? row.calendar : "gregorian";
}

// Persists the calendar; the caller must pass a value from CALENDARS.
export async function setCalendarSetting(env, calendar) {
  await env.DB.prepare(`UPDATE settings SET calendar = ? WHERE id = 1`).bind(calendar).run();
}

// Returns the stored date formats as { shortDateFormat, longDateFormat }; each falls back to its default when the
// row is missing or holds an unknown value.
export async function getDateFormatSettings(env) {
  const row = await env.DB
    .prepare(`SELECT short_date_format, long_date_format FROM settings WHERE id = 1`)
    .first();
  return {
    shortDateFormat:
      row && SHORT_DATE_FORMATS.includes(row.short_date_format)
        ? row.short_date_format
        : DEFAULT_SHORT_DATE_FORMAT,
    longDateFormat:
      row && LONG_DATE_FORMATS.includes(row.long_date_format)
        ? row.long_date_format
        : DEFAULT_LONG_DATE_FORMAT,
  };
}

// Persist one format each; the caller must pass a value from SHORT_DATE_FORMATS or LONG_DATE_FORMATS.
export async function setShortDateFormatSetting(env, format) {
  await env.DB.prepare(`UPDATE settings SET short_date_format = ? WHERE id = 1`).bind(format).run();
}

export async function setLongDateFormatSetting(env, format) {
  await env.DB.prepare(`UPDATE settings SET long_date_format = ? WHERE id = 1`).bind(format).run();
}
