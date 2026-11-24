import { json, safeJson } from "./http.js";
import {
  CALENDARS,
  SHORT_DATE_FORMATS,
  LONG_DATE_FORMATS,
  getCalendarSetting,
  setCalendarSetting,
  getDateFormatSettings,
  setShortDateFormatSetting,
  setLongDateFormatSetting,
} from "./backend/database/d1.js";

// All panel settings as { calendar, shortDateFormat, longDateFormat }.
async function readSettings(env) {
  return { calendar: await getCalendarSetting(env), ...(await getDateFormatSettings(env)) };
}

// GET /api/settings -> { calendar, shortDateFormat, longDateFormat }
export async function getSettings(env) {
  return json(await readSettings(env));
}

// PUT /api/settings { calendar?, shortDateFormat?, longDateFormat? } -> all three values. The client sends one field
// per request, but any present field is accepted. Every present field is checked first and nothing is saved when one
// is invalid. A body with none of the three fields (or no valid JSON object) gives invalid_calendar, as before.
export async function updateSettings(request, env) {
  const body = await safeJson(request);
  const has = (key) => Boolean(body) && typeof body === "object" && body[key] !== undefined;
  if (!has("calendar") && !has("shortDateFormat") && !has("longDateFormat")) {
    return json({ error: "invalid_calendar" }, 400);
  }
  if (has("calendar") && !CALENDARS.includes(body.calendar)) {
    return json({ error: "invalid_calendar" }, 400);
  }
  if (has("shortDateFormat") && !SHORT_DATE_FORMATS.includes(body.shortDateFormat)) {
    return json({ error: "invalid_date_format" }, 400);
  }
  if (has("longDateFormat") && !LONG_DATE_FORMATS.includes(body.longDateFormat)) {
    return json({ error: "invalid_date_format" }, 400);
  }
  if (has("calendar")) await setCalendarSetting(env, body.calendar);
  if (has("shortDateFormat")) await setShortDateFormatSetting(env, body.shortDateFormat);
  if (has("longDateFormat")) await setLongDateFormatSetting(env, body.longDateFormat);
  return json(await readSettings(env));
}
