import { json, safeJson } from "./http.js";
import {
  CALENDARS,
  getCalendarSetting,
  setCalendarSetting,
} from "./backend/database/d1.js";

// GET /api/settings -> { calendar }
export async function getSettings(env) {
  return json({ calendar: await getCalendarSetting(env) });
}

// PUT /api/settings { calendar } -> { calendar }; any other value is rejected.
export async function updateSettings(request, env) {
  const body = await safeJson(request);
  if (!body || !CALENDARS.includes(body.calendar)) {
    return json({ error: "invalid_calendar" }, 400);
  }
  await setCalendarSetting(env, body.calendar);
  return json({ calendar: body.calendar });
}
