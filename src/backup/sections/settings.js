import {
  CALENDARS,
  SHORT_DATE_FORMATS,
  LONG_DATE_FORMATS,
  getCalendarSetting,
  setCalendarSetting,
  getDateFormatSettings,
  setShortDateFormatSetting,
  setLongDateFormatSetting,
} from "../../backend/database/d1.js";

// ---------------------------------------------------------------------
// BACKUP SECTION: SETTINGS
//
// SECTION CONTRACT (every module in src/backup/sections/ exports one object with these members, and
// src/backup/registry.js lists them; the API and the popup only ever loop over that list):
//   id, label, noun, nounPlural   what the popup shows ("Settings", "3 settings")
//   count(env)                    how many items a backup of this section holds (the progress denominator)
//   exportPart(env, offset, limit)  one page of the backup: { items: [...], entities?: {...} }. The browser
//                                 appends the items of every page (and merges entities) into the section payload.
//   analyze(env, payload)         compares a payload from a backup file with the database before anything is written
//   applyBatch(env, payload)      writes a payload (or one page of it)
// The payload of every section is { items: [...] } with an optional entities dictionary, so the browser can
// assemble and send any section without knowing what is inside it.
// Every method returns { ok: true, ... } or { ok: false, error } and re-validates its input, because a backup
// file is untrusted (it may be edited by hand or come from another panel).
//
// This section: the payload is { items: [{ key, value }] }, one item per setting. Settings are never a
// conflict: the values in the file replace the current ones, a key this panel does not know or a value it does
// not allow is skipped, and every other setting is still applied. To back up a new setting, add its getter and
// setter in backend/database/records/settings.js and one entry to SETTING_DESCRIPTORS below.
// ---------------------------------------------------------------------

// One entry per backed up setting: its key in the file, the values this panel accepts, and how to read and
// write it. The keys are the same names the settings API uses.
const SETTING_DESCRIPTORS = [
  {
    key: "calendar",
    allowed: CALENDARS,
    get: (env) => getCalendarSetting(env),
    set: (env, value) => setCalendarSetting(env, value),
  },
  {
    key: "shortDateFormat",
    allowed: SHORT_DATE_FORMATS,
    get: async (env) => (await getDateFormatSettings(env)).shortDateFormat,
    set: (env, value) => setShortDateFormatSetting(env, value),
  },
  {
    key: "longDateFormat",
    allowed: LONG_DATE_FORMATS,
    get: async (env) => (await getDateFormatSettings(env)).longDateFormat,
    set: (env, value) => setLongDateFormatSetting(env, value),
  },
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// The items of a payload, or null when the payload is not { items: [...] }.
function itemsOf(payload) {
  return isPlainObject(payload) && Array.isArray(payload.items) ? payload.items : null;
}

// Splits the items of a file into the ones that can be applied and the ones that are skipped, with the reason:
//   invalid_item     not an object with a string key
//   unknown_setting  this panel has no setting with that key
//   duplicate_key    the key already appeared earlier in the file (the first usable one wins)
//   invalid_value    the value is not one this panel allows for that key
function classifyItems(items) {
  const usable = [];
  const skipped = [];
  const seen = new Set();
  for (const item of items) {
    const key = isPlainObject(item) && typeof item.key === "string" ? item.key : null;
    if (key === null) {
      skipped.push({ key: null, reason: "invalid_item" });
      continue;
    }
    const descriptor = SETTING_DESCRIPTORS.find((d) => d.key === key);
    if (!descriptor) {
      skipped.push({ key, reason: "unknown_setting" });
      continue;
    }
    if (seen.has(key)) {
      skipped.push({ key, reason: "duplicate_key" });
      continue;
    }
    if (typeof item.value !== "string" || !descriptor.allowed.includes(item.value)) {
      skipped.push({ key, reason: "invalid_value" });
      continue;
    }
    seen.add(key);
    usable.push({ descriptor, value: item.value });
  }
  return { usable, skipped };
}

export const settingsSection = {
  id: "settings",
  label: "Settings",
  noun: "setting",
  nounPlural: "settings",

  async count() {
    return SETTING_DESCRIPTORS.length;
  },

  // A backup of settings is a few values, so one page holds them all; offset and limit still follow the contract.
  async exportPart(env, offset, limit) {
    const page = SETTING_DESCRIPTORS.slice(offset, offset + limit);
    const items = [];
    for (const descriptor of page) {
      items.push({ key: descriptor.key, value: await descriptor.get(env) });
    }
    return { ok: true, items };
  },

  // No comparison is needed (settings never conflict); this tells the admin how many values will be applied
  // and which ones will be skipped, so the summary before the restore is accurate.
  async analyze(env, payload) {
    const items = itemsOf(payload);
    if (!items) return { ok: false, error: "invalid_section" };
    const { usable, skipped } = classifyItems(items);
    return { ok: true, total: items.length, applicable: usable.length, skipped };
  },

  // Applies every usable setting and reports what was applied and what was skipped. Settings are the one overwrite
  // of a restore, by design. Each value is checked again here, so a request that skipped analyze() cannot write an
  // unknown key or a value the settings API would refuse.
  async applyBatch(env, payload) {
    const items = itemsOf(payload);
    if (!items) return { ok: false, error: "invalid_section" };
    const { usable, skipped } = classifyItems(items);
    const applied = [];
    for (const { descriptor, value } of usable) {
      await descriptor.set(env, value);
      applied.push(descriptor.key);
    }
    return { ok: true, applied, skipped };
  },
};
