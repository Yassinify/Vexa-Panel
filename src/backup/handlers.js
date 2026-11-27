import { json, safeJson } from "../http.js";
import {
  getUserCount,
  recordUserGrowthSnapshot,
  adjustStats,
  recordActivity,
} from "../backend/database/d1.js";
import { buildEnvelopeHeader, checkEnvelope } from "./format.js";
import { BACKUP_SECTIONS, listSectionIds, getSection } from "./registry.js";
import { createContext, collectReport, checkNewName, proposeName } from "./resolve.js";

// ---------------------------------------------------------------------
// BACKUP AND RESTORE HANDLERS
// The request handlers behind /api/backup/* and /api/restore/* (routed in src/api-router.js, behind the admin
// session). They only loop over the section registry (registry.js), so they know nothing about Users, Nodes or
// Settings. The server keeps no restore session: the browser holds the file, the decisions and the id maps and
// sends them with every request.
//
// Every body is JSON. A failure is { error } with status 400; the codes are the ones of format.js (invalid_backup,
// invalid_format_version, unsupported_format_version, no_known_sections), the ones below (invalid_request,
// unknown_section, no_sections, invalid_page) and the ones a section returns (for example invalid_section, with
// the id of that section in "section").
//
// BACKUP
//   backupManifest(env)                 GET:  { header, pageSize, sections: [{ id, label, noun, nounPlural, count }] }
//                                       header is the envelope without "sections" (the file starts here); the browser
//                                       asks every section for its pages of pageSize items.
//   backupExportPart(request, env)      POST { section, offset, limit }: one page, { items, entities? }
// RESTORE
//   restoreInspect(request)             POST { backup }: checks the envelope. The browser sends it without the section
//                                       contents (each section reduced to any non-null value such as true), so the
//                                       request stays small. { formatVersion, panelVersion, createdAt,
//                                       sections: [{ id, label, noun, nounPlural }], ignoredSectionIds }
//   restoreAnalyze(request, env)        POST { sections: { "<id>": payload } }: compares the selected sections with the
//                                       database in one request, so items of one file can conflict with each other.
//                                       { sections: { "<id>": result }, conflicts, summary } (see collectReport())
//   restoreValidateName(request, env)   POST { kind, name, baseName?, uuidRandom?, reserved? }: { ok, name } or
//                                       { ok: false, error }. An empty name with a baseName gives the suggestion.
//   restoreApplyBatch(request, env)     POST { section, payload, decisions, nodeMap, userMap }: writes one section
//                                       payload (a whole one or a page), adjusts the stats counters for what it wrote,
//                                       and returns the result of the section without "ok" and "added".
//   restoreFinish(request, env)         POST { written: { "<id>": count } }: growth snapshot and one Log entry.
// ---------------------------------------------------------------------

// Items per page of a backup. Each User or Node costs several database reads, so pages stay small.
const EXPORT_PAGE_SIZE = 25;
// The largest page a request may ask for.
const MAX_EXPORT_LIMIT = 100;
// The most reserved names accepted by restoreValidateName().
const MAX_RESERVED_NAMES = 5000;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(error, status = 400) {
  return json({ error }, status);
}

// A failed section call: the code the section gave, and which section it was.
function sectionFailure(id, error) {
  return json({ error: error || "invalid_section", section: id }, 400);
}

// What the browser needs to show a section (the contract members that are not methods).
function sectionInfo(section) {
  return { id: section.id, label: section.label, noun: section.noun, nounPlural: section.nounPlural };
}

// Records today's total for the Dashboard growth chart, from the live user count. Non-fatal, like the same
// helper in users.js: a failed snapshot must not fail the request.
async function snapshotUserGrowth(env) {
  try {
    await recordUserGrowthSnapshot(env, await getUserCount(env));
  } catch (err) {
    console.error("snapshotUserGrowth failed (non-fatal):", err);
  }
}

// The sections of a request body ({ "<id>": payload }) in registry order, as { picked: [{ section, payload }] },
// or { error }. Every key must be a known section; a null value counts as not selected.
function readSelection(sections) {
  if (!isPlainObject(sections)) return { error: "invalid_request" };
  const known = listSectionIds();
  if (Object.keys(sections).some((id) => !known.includes(id))) return { error: "unknown_section" };
  const picked = BACKUP_SECTIONS.filter((s) => sections[s.id] !== undefined && sections[s.id] !== null).map(
    (section) => ({ section, payload: sections[section.id] }),
  );
  return picked.length > 0 ? { picked } : { error: "no_sections" };
}

// ---------------------------------------------------------------------
// BACKUP
// ---------------------------------------------------------------------

export async function backupManifest(env) {
  const sections = [];
  for (const section of BACKUP_SECTIONS) {
    sections.push({ ...sectionInfo(section), count: await section.count(env) });
  }
  return json({ header: buildEnvelopeHeader(), pageSize: EXPORT_PAGE_SIZE, sections });
}

export async function backupExportPart(request, env) {
  const body = await safeJson(request);
  if (!isPlainObject(body)) return fail("invalid_request");
  const section = typeof body.section === "string" ? getSection(body.section) : null;
  if (!section) return fail("unknown_section");
  const { offset, limit } = body;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > MAX_EXPORT_LIMIT) {
    return fail("invalid_page");
  }
  const { ok, error, ...part } = await section.exportPart(env, offset, limit);
  if (!ok) return sectionFailure(section.id, error);
  return json(part);
}

// ---------------------------------------------------------------------
// RESTORE
// ---------------------------------------------------------------------

export async function restoreInspect(request) {
  const body = await safeJson(request);
  const check = checkEnvelope(isPlainObject(body) ? body.backup : null, listSectionIds());
  if (!check.ok) return fail(check.error);
  return json({
    formatVersion: check.formatVersion,
    panelVersion: check.panelVersion,
    createdAt: check.createdAt,
    sections: check.sectionIds.map((id) => sectionInfo(getSection(id))),
    ignoredSectionIds: check.ignoredSectionIds,
  });
}

// Analyzes the selected sections in registry order (Users before Nodes, see registry.js) against one shared context,
// then reports the conflicts and counts. Nothing is written.
export async function restoreAnalyze(request, env) {
  const body = await safeJson(request);
  const selection = readSelection(isPlainObject(body) ? body.sections : null);
  if (selection.error) return fail(selection.error);
  const ctx = await createContext(env);
  const results = {};
  for (const { section, payload } of selection.picked) {
    const { ok, error, ...result } = await section.analyze(env, payload, ctx);
    if (!ok) return sectionFailure(section.id, error);
    results[section.id] = result;
  }
  return json({ sections: results, ...collectReport(ctx) });
}

// Names that are not in the database yet but will be, as a list of strings; null when the value is unusable.
function readReserved(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_RESERVED_NAMES) return null;
  return value.filter((name) => typeof name === "string");
}

// Live check of a name the admin typed in the rename box. An empty name with a baseName is the "leave it empty"
// case: the suggestion ("<baseName>-new", made unique) is returned as the name.
export async function restoreValidateName(request, env) {
  const body = await safeJson(request);
  if (!isPlainObject(body) || (body.kind !== "node" && body.kind !== "user")) return fail("invalid_request");
  const reserved = readReserved(body.reserved);
  if (reserved === null) return fail("invalid_request");
  const options = { uuidRandom: body.uuidRandom !== false, reserved };
  const ctx = await createContext(env);
  const typed = typeof body.name === "string" ? body.name.trim() : "";
  const base = typeof body.baseName === "string" ? body.baseName.trim() : "";
  if (!typed && base) {
    return json({ ok: true, name: proposeName(ctx, body.kind, base, options), proposed: true });
  }
  return json(checkNewName(ctx, body.kind, typed, options));
}

// Writes one payload of one section. The stats counters follow what this call wrote (the section reports it in
// "added"), so they stay server-authoritative and a retried batch is never counted twice. If a batch fails
// midway, what it had already written is not counted; the counters are known to be able to drift.
export async function restoreApplyBatch(request, env) {
  const body = await safeJson(request);
  if (!isPlainObject(body)) return fail("invalid_request");
  const section = typeof body.section === "string" ? getSection(body.section) : null;
  if (!section) return fail("unknown_section");
  const context = {
    decisions: isPlainObject(body.decisions) ? body.decisions : {},
    nodeMap: isPlainObject(body.nodeMap) ? body.nodeMap : undefined,
    userMap: isPlainObject(body.userMap) ? body.userMap : undefined,
  };
  const { ok, error, added, ...result } = await section.applyBatch(env, body.payload, context);
  if (!ok) return sectionFailure(section.id, error);
  if (added && (added.users || added.subSources || added.rawSources)) {
    await adjustStats(env, {
      totalUsers: added.users,
      totalSubSources: added.subSources,
      totalRawSources: added.rawSources,
    });
  }
  return json(result);
}

// Ends a restore: records the growth snapshot and the one Log entry, for example
// "Restored backup: 4 users, 2 nodes, 3 settings". written holds, per section id, how many items the restore wrote
// (the browser adds up the counts of its batches); the text only counts, so a wrong number cannot change any data.
export async function restoreFinish(request, env) {
  const body = await safeJson(request);
  if (!isPlainObject(body)) return fail("invalid_request");
  const written = isPlainObject(body.written) ? body.written : {};
  const parts = [];
  for (const section of BACKUP_SECTIONS) {
    const count = written[section.id];
    if (!Number.isInteger(count) || count < 1) continue;
    parts.push(`${count} ${count === 1 ? section.noun : section.nounPlural}`);
  }
  await snapshotUserGrowth(env);
  await recordActivity(env, `Restored backup: ${parts.length > 0 ? parts.join(", ") : "nothing added"}`);
  return json({ success: true });
}
