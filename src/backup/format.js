import { VEXA_VERSION } from "../constants.js";

// ---------------------------------------------------------------------
// BACKUP FILE FORMAT
// A backup is one JSON file. The envelope (this file) is the same for every
// section; what each section stores inside it is defined by that section
// (src/backup/sections/*) and listed in src/backup/registry.js. Nothing here
// knows about Users, Nodes or Settings, so a new section never changes this file.
//
//   {
//     "app": "vexa-panel-backup",
//     "formatVersion": 1,          layout of the file, see below
//     "panelVersion": "4.2.1",     informational: the panel that wrote the file
//     "createdAt": 1764000000000,  epoch ms
//     "createdAtIso": "2025-11-24T16:00:00.000Z",
//     "sections": { "users": ..., "nodes": ..., "settings": ... }
//   }
//
// Only the sections the admin selected are written, so a file can hold any subset.
// Never stored in any section: the admin password hash, salt and JWT secret.
// ---------------------------------------------------------------------

// Identifies the file as a Vexa Panel backup.
export const FORMAT_NAME = "vexa-panel-backup";

// Layout version of the file. Raise it only when the envelope or a section changes in a way an older
// panel could not read. A file with a higher version than this is refused (see checkEnvelope());
// a file with a lower version stays readable, so every section reader must keep accepting older layouts.
export const FORMAT_VERSION = 1;

// The envelope fields without "sections", for the file being created now. The browser adds the sections it
// collected and downloads the result. createdAt is when the backup started.
export function buildEnvelopeHeader() {
  const now = Date.now();
  return {
    app: FORMAT_NAME,
    formatVersion: FORMAT_VERSION,
    panelVersion: VEXA_VERSION,
    createdAt: now,
    createdAtIso: new Date(now).toISOString(),
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Checks the envelope of a parsed backup file before anything is read from it. knownSectionIds is the list of
// section ids this panel can restore (the registry passes it in, so this file does not depend on the registry).
//
// Success: { ok: true, formatVersion, panelVersion, createdAt, sectionIds, ignoredSectionIds }
//   sectionIds         the known sections that are present in the file, in the order of knownSectionIds
//   ignoredSectionIds  ids in the file that this panel does not know (for example from a newer panel); they are
//                      never read, and the client can tell the admin they were skipped
// Failure: { ok: false, error } with one of these codes (the client turns each into a message):
//   invalid_backup              not a JSON object, wrong "app", or no "sections" object
//   invalid_format_version      formatVersion is not a whole number of at least 1
//   unsupported_format_version  the file comes from a newer panel than this one can read
//   no_known_sections           the file holds no section this panel can restore
// panelVersion and createdAt are informational: a missing or odd value reads as null and never fails the check.
export function checkEnvelope(value, knownSectionIds) {
  if (!isPlainObject(value) || value.app !== FORMAT_NAME || !isPlainObject(value.sections)) {
    return { ok: false, error: "invalid_backup" };
  }
  const version = value.formatVersion;
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, error: "invalid_format_version" };
  }
  if (version > FORMAT_VERSION) {
    return { ok: false, error: "unsupported_format_version" };
  }
  const present = (id) => value.sections[id] !== undefined && value.sections[id] !== null;
  const sectionIds = knownSectionIds.filter(present);
  if (sectionIds.length === 0) {
    return { ok: false, error: "no_known_sections" };
  }
  const ignoredSectionIds = Object.keys(value.sections).filter((id) => !knownSectionIds.includes(id));
  return {
    ok: true,
    formatVersion: version,
    panelVersion: typeof value.panelVersion === "string" ? value.panelVersion : null,
    createdAt: Number.isFinite(value.createdAt) ? value.createdAt : null,
    sectionIds,
    ignoredSectionIds,
  };
}
