// ---------------------------------------------------------------------
// RESTORE FLOW (client script, joined into CLIENT_SCRIPT by src/frontend/client-script.js)
// The Restore popup of Settings > Account. Like backup-flow.js it keeps its own flow state (restoreFlow below), not
// state.js, and it only talks to /api/restore/*. The server keeps no restore session: this file holds the parsed
// file, the decisions and the id maps and sends them with every request (see src/backup/handlers.js).
//
// Stages (restoreFlow.stage): file, sections, compare, summary, conflicts, applying, report.
// The conflict questions (stage "conflicts") live in restore-conflicts.js (BR-1 step 14).
//
// Wiring done by later steps of the feature (BR-1):
//   - client-script.js adds RESTORE_FLOW_SCRIPT after BACKUP_FLOW_SCRIPT (it reuses backupCountText() and
//     BACKUP_SECTION_ICONS from there) and before the conflicts script of step 14;
//   - renderModal() returns renderRestoreModal() while state.modal === "restore";
//   - Escape does not close the popup; a click outside calls closeRestore() only when restoreCanCloseByClick() is true;
//   - the Restore row in Settings > Account calls openRestore();
//   - styles/backup.js styles restore-modal, restore-drop (also .restore-drop-over while a file is dragged over it),
//     restore-drop-icon, restore-drop-title and restore-drop-hint. Progress, rows and cards reuse the backup-* and
//     node-card classes (backup-progress, backup-progress-bar, backup-progress-meta, backup-report,
//     backup-report-row, backup-report-label, backup-report-value, backup-card).
//
// What restore-conflicts.js (step 14) must provide, and what it may use from here:
//   - beginRestoreConflicts(conflicts, origin): called with the conflicts to ask about and origin "analysis" (the
//     list of the comparison, before any write: each has key, kind, reason, name, parents, top, and for Users
//     uuidRandom and uuidAlsoTaken) or "apply" (results of a write that need a decision first: no parents or top,
//     treat them as top). It sets restoreFlow.stage = "conflicts", keeps its question state in restoreFlow.ask
//     ({ origin, ... }, a fresh null for every flow), and writes the answers into restoreFlow.decisions as
//     { action: "skip" } | { action: "rename", name } | { action: "newUuid" }, keyed by the conflict key. A key that
//     comes back from an "apply" call replaces its old decision.
//   - renderRestoreConflict(): the body markup of stage "conflicts".
//   - When no question is left it calls restoreConflictsAnswered(). Back during origin "analysis" is restoreBack().
//   - It may read restoreFlow.file.backup (the parsed file), redraw with redrawRestoreModal(), drop answers that
//     arrive after restoreRunActive(runId) turns false, and call abandonRestore() on an "unauthorized" error.
// ---------------------------------------------------------------------
export const RESTORE_FLOW_SCRIPT = `
// ---------------------------------------------------------------------
// RESTORE FLOW - file, sections, compare, summary, (conflicts), restore run, report, all in one popup.
// ---------------------------------------------------------------------
// Items per apply request. Each User or Node costs several database writes, so batches stay small (the platform
// limits per request cannot be verified from the repository).
const RESTORE_BATCH_SIZE = 20;
// The largest backup file accepted, in bytes.
const RESTORE_MAX_FILE_BYTES = 50 * 1024 * 1024;
// A batch that still reports conflicts after this many rounds is given up, so a fault can never loop forever.
const RESTORE_MAX_CONFLICT_ROUNDS = 200;

const RESTORE_ERRORS = {
  file_too_large: "This file is too large to be a Vexa Panel backup.",
  not_json: "This file is not valid JSON.",
  invalid_backup: "This file is not a Vexa Panel backup.",
  invalid_format_version: "This backup file has an invalid format version.",
  unsupported_format_version: "This backup was made by a newer version of Vexa Panel. Update this panel and try again.",
  no_known_sections: "This backup has nothing this panel can restore."
};

function restoreErrorText(code) {
  return restoreHas(RESTORE_ERRORS, code) ? RESTORE_ERRORS[code] : "Could not read the backup file.";
}

function restoreIsObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function restoreHas(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

// The flow state. runId changes whenever the popup is opened, closed or a new step starts, so an answer that arrives
// for an older step is dropped (see restoreRunActive()).
function newRestoreFlow(runId) {
  return {
    runId,
    stage: "file",
    // True while a file is being read and checked.
    busy: false,
    // True from the moment the file passes the check until Back returns to the file step; it blocks the outside click.
    accepted: false,
    error: "",
    fileName: "",
    // { backup, info }: the parsed file and the answer of /api/restore/inspect.
    file: null,
    selected: [],
    percent: 0,
    stageText: "",
    // The answer of /api/restore/analyze, and its conflicts (see restore-conflicts.js).
    analysis: null,
    conflicts: [],
    decisions: {},
    nodeMap: {},
    userMap: {},
    ask: null,
    // The run: sections to write, the position in them, and the item counts behind the percentage.
    plan: [],
    cursor: { s: 0, offset: 0 },
    done: 0,
    total: 0,
    conflictRounds: 0,
    // True once the first write request was sent: from then on Back is gone and the data may have changed.
    applyStarted: false,
    // Counts the batches returned, summed per section id, and the unreadable entries (a set, so a retried batch does not count twice).
    sectionCounts: {},
    invalid: new Set(),
    failed: false,
    logFailed: false
  };
}
let restoreFlow = newRestoreFlow(0);

function resetRestoreFlow() {
  restoreFlow = newRestoreFlow(restoreFlow.runId + 1);
}

// True while the step that started with this runId is the current one and the popup is still open.
function restoreRunActive(runId) {
  return restoreFlow.runId === runId && state.modal === "restore";
}

// Rewrites the popup markup in the modal layer without redrawing the page behind it, as redrawBackupModal() does.
function redrawRestoreModal() {
  const layer = document.getElementById("md");
  if (!layer || state.modal !== "restore") return;
  const html = renderRestoreModal();
  if (layer._html === html) return;
  layer.innerHTML = html;
  layer._html = html;
}

function openRestore() {
  resetRestoreFlow();
  state.modal = "restore";
  render();
}

// Closes the popup and drops the flow, which also stops a step that is still going.
function closeRestore() {
  resetRestoreFlow();
  closeModal();
}

// A click outside the popup closes it only before a file is accepted and after the final report.
function restoreCanCloseByClick() {
  return !restoreFlow.accepted || restoreFlow.stage === "report";
}

// The Done button of the report. The panel data and the display settings may have changed, so what is loaded is
// marked out of date and the settings are read again.
function finishRestore() {
  const changed = restoreFlow.applyStarted;
  closeRestore();
  if (changed) {
    markDataStale("stats", "users", "nodes");
    loadSettings().then(() => render()).catch(() => {});
  }
}

// The session ended while the popup was open: apiFetch() has already shown the login view.
function abandonRestore() {
  resetRestoreFlow();
  state.modal = null;
}

// Back before any write: sections to file, summary to sections, the first round of questions to the summary.
function restoreBack() {
  const f = restoreFlow;
  if (f.applyStarted) return;
  if (f.stage === "sections") {
    resetRestoreFlow();
  } else if (f.stage === "summary") {
    f.stage = "sections";
    f.analysis = null;
    f.conflicts = [];
    f.error = "";
  } else if (f.stage === "conflicts" && f.ask && f.ask.origin === "analysis") {
    f.stage = "summary";
    f.ask = null;
    f.decisions = {};
  } else {
    return;
  }
  redrawRestoreModal();
}

// A file dropped outside the drop zone must not make the browser open it and leave the panel.
document.addEventListener("dragover", e => { if (state.modal === "restore") e.preventDefault(); });
document.addEventListener("drop", e => { if (state.modal === "restore") e.preventDefault(); });

// Items of one section of the file (0 when the payload has no item list; the comparison then reports it).
function restoreSectionCount(id) {
  const file = restoreFlow.file;
  const sections = file && file.backup && file.backup.sections;
  if (!restoreIsObject(sections) || !restoreHas(sections, id)) return 0;
  const payload = sections[id];
  return restoreIsObject(payload) && Array.isArray(payload.items) ? payload.items.length : 0;
}

// The envelope for /api/restore/inspect: the header fields and each section reduced to true, so the request stays small.
function restoreEnvelopeOnly(backup) {
  if (!restoreIsObject(backup)) return null;
  const sections = restoreIsObject(backup.sections)
    ? Object.fromEntries(Object.keys(backup.sections).map(id => [id, backup.sections[id] === null ? null : true]))
    : null;
  return { app: backup.app, formatVersion: backup.formatVersion, panelVersion: backup.panelVersion, createdAt: backup.createdAt, sections };
}

// ---------------------------------------------------------------------
// FILE STAGE
// ---------------------------------------------------------------------
function restoreDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add("restore-drop-over");
}

function restoreDragLeave(e) {
  e.currentTarget.classList.remove("restore-drop-over");
}

function restoreDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("restore-drop-over");
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) readRestoreFile(file);
}

function restoreBrowse() {
  const input = document.getElementById("restoreFileInput");
  if (input) input.click();
}

function restoreFilePicked(input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (file) readRestoreFile(file);
}

// Reads and parses the file, then lets the server check the envelope. Nothing is written. A rejected file stays on
// the file stage with an error text.
async function readRestoreFile(file) {
  const f = restoreFlow;
  if (f.stage !== "file" || f.busy) return;
  const runId = ++f.runId;
  f.busy = true;
  f.error = "";
  f.fileName = file.name || "backup";
  redrawRestoreModal();
  try {
    if (file.size > RESTORE_MAX_FILE_BYTES) throw new Error("file_too_large");
    const text = await file.text();
    if (!restoreRunActive(runId)) return;
    let backup;
    try { backup = JSON.parse(text); } catch (e) { throw new Error("not_json"); }
    const info = await apiFetch("/api/restore/inspect", { method: "POST", body: JSON.stringify({ backup: restoreEnvelopeOnly(backup) }) });
    if (!restoreRunActive(runId)) return;
    if (!info || info.error || !Array.isArray(info.sections) || info.sections.length === 0) throw new Error((info && info.error) || "inspect_failed");
    f.file = { backup, info };
    f.accepted = true;
    f.selected = info.sections.map(s => s.id);
    f.stage = "sections";
  } catch (e) {
    if (e.message === "unauthorized") { abandonRestore(); return; }
    if (!restoreRunActive(runId)) return;
    f.error = restoreErrorText(e.message);
    f.file = null;
  }
  f.busy = false;
  redrawRestoreModal();
}

function renderRestoreFile() {
  const f = restoreFlow;
  return '<div class="modal-title">Restore</div>'
    + '<div class="helper-text">Choose a backup file made by Vexa Panel. '
    + infoTip("Restoring adds the users and nodes you do not have yet and never removes or changes the ones you already have. Settings in the file replace your current settings.", "below") + '</div>'
    + '<input type="file" id="restoreFileInput" accept=".json,application/json" hidden onchange="restoreFilePicked(this)" />'
    + '<button type="button" class="restore-drop" id="restoreDropZone" ondragover="restoreDragOver(event)" ondragleave="restoreDragLeave(event)" ondrop="restoreDrop(event)" onclick="restoreBrowse()"' + (f.busy ? " disabled" : "") + '>'
    + '<span class="restore-drop-icon">' + icon("arrowUp") + '</span>'
    + '<span class="restore-drop-title">' + (f.busy ? "Reading the file..." : "Drop a backup file here") + '</span>'
    + '<span class="restore-drop-hint">' + (f.busy ? escapeHtml(f.fileName) : "or click to choose a .json file") + '</span></button>'
    + '<div class="error-text" id="restoreError" role="alert">' + escapeHtml(f.error) + '</div>';
}

// ---------------------------------------------------------------------
// SECTIONS STAGE
// ---------------------------------------------------------------------
function restoreAllSelected() {
  const f = restoreFlow;
  return Boolean(f.file) && f.selected.length === f.file.info.sections.length;
}

function renderRestoreCard(section) {
  const selected = restoreFlow.selected.includes(section.id);
  const iconName = BACKUP_SECTION_ICONS[section.id] || "log";
  return '<button type="button" class="node-card backup-card restore-card" data-id="' + escapeHtml(section.id) + '" aria-pressed="' + selected + '" onclick="toggleRestoreSection(this)">'
    + '<span class="node-card-badge">' + icon(iconName) + '</span>'
    + '<span class="node-card-text"><span class="node-card-name">' + escapeHtml(section.label) + '</span>'
    + '<span class="node-card-type">' + escapeHtml(backupCountText(restoreSectionCount(section.id), section)) + '</span></span>'
    + '<span class="node-card-check">' + NODE_CARD_TICK + '</span></button>';
}

// Section ids in the file that this panel does not know (for example from a newer panel). They are never read.
function restoreIgnoredNote() {
  const ignored = restoreFlow.file ? restoreFlow.file.info.ignoredSectionIds : [];
  if (!Array.isArray(ignored) || ignored.length === 0) return "";
  return '<div class="helper-text">' + ignored.length + (ignored.length === 1 ? " section in this file is" : " sections in this file are") + ' not supported by this panel and will be ignored.</div>';
}

function renderRestoreSections() {
  const f = restoreFlow;
  const info = f.file.info;
  const made = [];
  if (Number.isFinite(info.createdAt)) made.push("created " + formatDate(info.createdAt));
  if (typeof info.panelVersion === "string" && info.panelVersion) made.push("Vexa Panel " + info.panelVersion);
  return '<div class="modal-title">Restore</div>'
    + '<div class="helper-text">File: <strong>' + escapeHtml(f.fileName) + '</strong>' + (made.length > 0 ? " (" + escapeHtml(made.join(", ")) + ")" : "") + '</div>'
    + '<div class="field-group" id="restorePicker">'
    + '<div class="field-head"><span class="field-label">Restore contents</span>'
    + infoTip("Users and nodes from the file are only added. The ones you already have are never removed or changed. Settings from the file replace your current settings.", "below")
    + '<button type="button" class="btn-secondary btn-sm" id="restoreSelectAll" onclick="toggleRestoreAll()">' + (restoreAllSelected() ? "Clear all" : "Select all") + '</button></div>'
    + '<div class="node-cards">' + info.sections.map(renderRestoreCard).join("") + '</div>'
    + '</div>'
    + restoreIgnoredNote()
    + '<div class="error-text" id="restoreError" role="alert">' + escapeHtml(f.error) + '</div>'
    + '<div class="modal-footer">'
    + '<button type="button" class="btn-secondary" onclick="restoreBack()">Back</button>'
    + '<button type="button" class="btn-primary" id="restoreCompareBtn" onclick="startRestoreAnalyze()"' + (f.selected.length > 0 ? "" : " disabled") + '>Compare</button>'
    + '</div>';
}

function toggleRestoreSection(button) {
  const id = button && button.dataset.id;
  if (!id || restoreFlow.stage !== "sections") return;
  const i = restoreFlow.selected.indexOf(id);
  if (i === -1) restoreFlow.selected.push(id);
  else restoreFlow.selected.splice(i, 1);
  syncRestoreSelection();
}

// Select all: switches every section on, or every section off when all are on already.
function toggleRestoreAll() {
  const f = restoreFlow;
  if (f.stage !== "sections" || !f.file) return;
  f.selected = restoreAllSelected() ? [] : f.file.info.sections.map(s => s.id);
  syncRestoreSelection();
}

// Brings the cards, the Select all label and the Compare button in line with restoreFlow.selected, in place.
function syncRestoreSelection() {
  document.querySelectorAll("#md .restore-card").forEach(card => {
    card.setAttribute("aria-pressed", String(restoreFlow.selected.includes(card.dataset.id)));
  });
  const all = document.getElementById("restoreSelectAll");
  if (all) all.textContent = restoreAllSelected() ? "Clear all" : "Select all";
  const compare = document.getElementById("restoreCompareBtn");
  if (compare) compare.disabled = restoreFlow.selected.length === 0;
  const layer = document.getElementById("md");
  if (layer) layer._html = renderRestoreModal();
}

// ---------------------------------------------------------------------
// PROGRESS (compare and restore run)
// ---------------------------------------------------------------------
function setRestoreProgress(runId, percent, text) {
  if (!restoreRunActive(runId)) return;
  restoreFlow.percent = cutProgressPercent(percent, 100);
  restoreFlow.stageText = text;
  updateRestoreProgress();
}

// Writes the percentage and the stage text into the open popup in place, so the bar is not restarted by a redraw.
function updateRestoreProgress() {
  const f = restoreFlow;
  const bar = document.getElementById("restoreProgressBar");
  if (bar) bar.style.width = f.percent + "%";
  const track = document.getElementById("restoreProgress");
  if (track) track.setAttribute("aria-valuenow", String(f.percent));
  const percent = document.getElementById("restorePercent");
  if (percent) percent.textContent = formatProgressPercent(f.percent);
  const stage = document.getElementById("restoreStage");
  if (stage) stage.textContent = f.stageText;
}

function renderRestoreProgress(title) {
  const f = restoreFlow;
  return '<div class="modal-title">' + title + '</div>'
    + '<div class="backup-progress" id="restoreProgress" role="progressbar" aria-label="Restore progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + f.percent + '">'
    + '<div class="backup-progress-bar" id="restoreProgressBar" style="width:' + f.percent + '%"></div></div>'
    + '<div class="backup-progress-meta" aria-live="polite"><span id="restoreStage">' + escapeHtml(f.stageText) + '</span><span id="restorePercent">' + formatProgressPercent(f.percent) + '</span></div>';
}

// ---------------------------------------------------------------------
// COMPARE STAGE
// The comparison is one request (items of one file can conflict with each other), so the percentage moves by stage:
// preparing, comparing, done.
// ---------------------------------------------------------------------
function restoreAnalyzeError(result) {
  if (result && result.error === "invalid_section") {
    const section = restoreFlow.file.info.sections.find(s => s.id === result.section);
    if (section) return "The " + section.label + " section of this file is not valid.";
  }
  return "Could not compare the backup with your database. Try again.";
}

async function startRestoreAnalyze() {
  const f = restoreFlow;
  if (f.stage !== "sections" || f.selected.length === 0) return;
  const runId = ++f.runId;
  f.error = "";
  f.stage = "compare";
  f.percent = 0;
  f.stageText = "Preparing the comparison";
  redrawRestoreModal();
  try {
    const picked = {};
    f.file.info.sections.forEach(s => {
      if (f.selected.includes(s.id)) picked[s.id] = f.file.backup.sections[s.id];
    });
    setRestoreProgress(runId, 30, "Comparing with your database");
    const result = await apiFetch("/api/restore/analyze", { method: "POST", body: JSON.stringify({ sections: picked }) });
    if (!restoreRunActive(runId)) return;
    if (!result || result.error || !restoreIsObject(result.sections) || !Array.isArray(result.conflicts) || !restoreIsObject(result.summary)) {
      f.stage = "sections";
      f.error = restoreAnalyzeError(result);
      redrawRestoreModal();
      return;
    }
    f.analysis = result;
    f.conflicts = result.conflicts;
    f.decisions = {};
    f.nodeMap = {};
    f.userMap = {};
    f.ask = null;
    f.percent = 100;
    f.stage = "summary";
    redrawRestoreModal();
  } catch (e) {
    if (e.message === "unauthorized") { abandonRestore(); return; }
    if (!restoreRunActive(runId)) return;
    f.stage = "sections";
    f.error = "Could not compare the backup with your database. Try again.";
    redrawRestoreModal();
  }
}

// ---------------------------------------------------------------------
// SUMMARY STAGE
// ---------------------------------------------------------------------
// "5 new, 2 conflicts, 1 linked to existing" for the Users or Nodes entry of the comparison summary.
function restoreKindText(kind) {
  const total = Number(kind.total) || 0;
  const conflicts = Number(kind.conflicts) || 0;
  const linked = Number(kind.linkedExisting) || 0;
  const parts = [Math.max(0, total - conflicts - linked) + " new"];
  if (conflicts > 0) parts.push(conflicts + (conflicts === 1 ? " conflict" : " conflicts"));
  if (linked > 0) parts.push(linked + " linked to existing");
  return parts.join(", ");
}

function restoreSummaryRows() {
  const f = restoreFlow;
  const summary = f.analysis.summary;
  const rows = [];
  if (restoreIsObject(summary.users) && Number(summary.users.total) > 0) rows.push({ label: "Users", text: restoreKindText(summary.users) });
  if (restoreIsObject(summary.nodes) && Number(summary.nodes.total) > 0) rows.push({ label: "Nodes", text: restoreKindText(summary.nodes) });
  // A section that reports applicable values (Settings) has no conflicts: it only says how many will be applied.
  f.file.info.sections.forEach(section => {
    const result = f.analysis.sections[section.id];
    if (!restoreIsObject(result) || typeof result.applicable !== "number") return;
    const skipped = Array.isArray(result.skipped) ? result.skipped.length : 0;
    rows.push({ label: section.label, text: result.applicable + " to apply" + (skipped > 0 ? ", " + skipped + " skipped" : "") });
  });
  if (Array.isArray(summary.invalid) && summary.invalid.length > 0) {
    rows.push({ label: "Unreadable", text: summary.invalid.length + (summary.invalid.length === 1 ? " entry" : " entries") + " will be skipped" });
  }
  return rows;
}

function restoreRowMarkup(row) {
  return '<div class="backup-report-row"><span class="backup-report-label">' + escapeHtml(row.label) + '</span><span class="backup-report-value">' + escapeHtml(row.text) + '</span></div>';
}

function renderRestoreSummary() {
  const f = restoreFlow;
  const conflicts = f.conflicts.length;
  const note = conflicts > 0
    ? "Some items already exist in your database. You will be asked about each one, and items you skip are not restored."
    : "No conflicts found. Existing users and nodes will not be changed.";
  const action = conflicts > 0
    ? '<button type="button" class="btn-primary" onclick="startRestoreConflicts()">Resolve conflicts</button>'
    : '<button type="button" class="btn-primary" onclick="startRestoreApply()">Restore</button>';
  return '<div class="modal-title">Restore summary</div>'
    + '<div class="backup-report">' + restoreSummaryRows().map(restoreRowMarkup).join("") + '</div>'
    + restoreIgnoredNote()
    + '<div class="helper-text">' + note + '</div>'
    + '<div class="modal-footer">'
    + '<button type="button" class="btn-secondary" onclick="restoreBack()">Back</button>'
    + action
    + '</div>';
}

// The Resolve conflicts button: the questions are asked by restore-conflicts.js, which ends with restoreConflictsAnswered().
function startRestoreConflicts() {
  if (restoreFlow.stage !== "summary") return;
  beginRestoreConflicts(restoreFlow.conflicts, "analysis");
}

// restore-conflicts.js calls this when no question is left: the run starts (origin "analysis") or goes on with the
// batch that reported the conflicts (origin "apply").
function restoreConflictsAnswered() {
  const f = restoreFlow;
  const origin = f.ask ? f.ask.origin : "analysis";
  f.ask = null;
  if (origin === "apply") {
    const runId = ++f.runId;
    f.stage = "applying";
    redrawRestoreModal();
    runRestoreApply(runId);
  } else {
    startRestoreApply();
  }
}

// ---------------------------------------------------------------------
// RESTORE RUN
// The selected sections are sent in the order of the file (the registry order, Users before Nodes), page by page
// (RESTORE_BATCH_SIZE items). A batch that reports conflicts is not advanced: the questions are asked and the same batch
// is sent again. What an earlier call wrote is found again through nodeMap and userMap, so nothing is written twice
// and the counts of the retry only hold what is new.
// ---------------------------------------------------------------------
function startRestoreApply() {
  const f = restoreFlow;
  if (f.stage !== "summary" && f.stage !== "conflicts") return;
  const runId = ++f.runId;
  f.ask = null;
  f.plan = f.file.info.sections
    .filter(s => f.selected.includes(s.id))
    .map(s => ({ id: s.id, label: s.label, count: restoreSectionCount(s.id) }));
  f.cursor = { s: 0, offset: 0 };
  f.done = 0;
  f.total = f.plan.reduce((sum, entry) => sum + entry.count, 0);
  f.conflictRounds = 0;
  f.stage = "applying";
  f.percent = 0;
  f.stageText = "Preparing the restore";
  redrawRestoreModal();
  runRestoreApply(runId);
}

// The plan entry the cursor points at, moving past sections that are finished or empty; null when everything was sent.
function currentRestoreBatch() {
  const f = restoreFlow;
  while (f.cursor.s < f.plan.length) {
    const entry = f.plan[f.cursor.s];
    if (f.cursor.offset < entry.count) return entry;
    f.cursor.s += 1;
    f.cursor.offset = 0;
  }
  return null;
}

// The ids that the items of a batch list in arrays of strings (nodeIds, userIds). Only the entities with these ids go
// with the batch, so a large file is not sent in full with every request.
function restoreReferencedIds(items) {
  const ids = new Set();
  items.forEach(item => {
    if (!restoreIsObject(item)) return;
    Object.keys(item).forEach(key => {
      if (Array.isArray(item[key])) item[key].forEach(value => { if (typeof value === "string") ids.add(value); });
    });
  });
  return ids;
}

// One page of a section as the payload { items, entities? } of /api/restore/apply. The dictionaries have no prototype,
// so an id such as __proto__ stays an ordinary key.
function buildRestoreBatch(sectionId, offset) {
  const payload = restoreFlow.file.backup.sections[sectionId];
  const items = payload.items.slice(offset, offset + RESTORE_BATCH_SIZE);
  const batch = { items };
  if (restoreIsObject(payload.entities)) {
    const needed = restoreReferencedIds(items);
    batch.entities = Object.create(null);
    Object.keys(payload.entities).forEach(kind => {
      const dictionary = payload.entities[kind];
      if (!restoreIsObject(dictionary)) return;
      const picked = Object.create(null);
      needed.forEach(id => { if (restoreHas(dictionary, id)) picked[id] = dictionary[id]; });
      batch.entities[kind] = picked;
    });
  }
  return batch;
}

// Keeps what a batch returned: the id maps for the next request, the counts, and the unreadable entries.
function absorbRestoreResult(sectionId, offset, result) {
  const f = restoreFlow;
  if (restoreIsObject(result.nodeMap)) f.nodeMap = result.nodeMap;
  if (restoreIsObject(result.userMap)) f.userMap = result.userMap;
  const own = f.sectionCounts[sectionId] || (f.sectionCounts[sectionId] = {});
  if (restoreIsObject(result.counts)) {
    Object.keys(result.counts).forEach(key => { own[key] = (Number(own[key]) || 0) + (Number(result.counts[key]) || 0); });
  }
  if (Array.isArray(result.applied)) own.appliedItems = (Number(own.appliedItems) || 0) + result.applied.length;
  if (Array.isArray(result.skipped)) own.skippedItems = (Number(own.skippedItems) || 0) + result.skipped.length;
  if (Array.isArray(result.invalid)) {
    result.invalid.forEach(entry => f.invalid.add(sectionId + ":" + offset + ":" + (entry && entry.where) + ":" + (entry && entry.reason)));
  }
}

async function runRestoreApply(runId) {
  const f = restoreFlow;
  try {
    for (;;) {
      const entry = currentRestoreBatch();
      if (!entry) break;
      f.applyStarted = true;
      setRestoreProgress(runId, f.total > 0 ? Math.min(99.99, (f.done * 100) / f.total) : 0, "Restoring " + entry.label);
      const offset = f.cursor.offset;
      const result = await apiFetch("/api/restore/apply", {
        method: "POST",
        body: JSON.stringify({
          section: entry.id,
          payload: buildRestoreBatch(entry.id, offset),
          decisions: f.decisions,
          nodeMap: f.nodeMap,
          userMap: f.userMap
        })
      });
      if (!restoreRunActive(runId)) return;
      if (!result || result.error) throw new Error("apply_failed");
      absorbRestoreResult(entry.id, offset, result);
      if (Array.isArray(result.conflicts) && result.conflicts.length > 0) {
        f.conflictRounds += 1;
        if (f.conflictRounds > RESTORE_MAX_CONFLICT_ROUNDS) throw new Error("conflict_loop");
        beginRestoreConflicts(result.conflicts, "apply");
        return;
      }
      const sent = Math.min(RESTORE_BATCH_SIZE, entry.count - offset);
      f.cursor.offset = offset + sent;
      f.done += sent;
      f.conflictRounds = 0;
    }
    await finishRestoreRun(runId);
  } catch (e) {
    if (e.message === "unauthorized") { abandonRestore(); return; }
    if (!restoreRunActive(runId)) return;
    await failRestoreRun(runId);
  }
}

// How many items were written per section id, for the Log entry. Every count key that ends in Added counts for the
// section named by its start (usersAdded for users), so Nodes written through the Users section count as nodes.
function restoreWrittenMap() {
  const written = {};
  const counts = restoreFlow.sectionCounts;
  Object.keys(counts).forEach(sectionId => {
    const own = counts[sectionId];
    if (Number(own.appliedItems) > 0) written[sectionId] = (written[sectionId] || 0) + own.appliedItems;
    Object.keys(own).forEach(key => {
      if (!key.endsWith("Added") || key.length === 5) return;
      const id = key.slice(0, -5);
      written[id] = (written[id] || 0) + (Number(own[key]) || 0);
    });
  });
  Object.keys(written).forEach(id => { if (!(written[id] > 0)) delete written[id]; });
  return written;
}

// Records the restore (growth snapshot and one Log entry), then shows the report. A failure here does not undo the
// restore: the report says the Log entry is missing.
async function finishRestoreRun(runId) {
  const f = restoreFlow;
  setRestoreProgress(runId, 99.99, "Finishing");
  const written = restoreWrittenMap();
  if (Object.keys(written).length > 0) {
    try {
      const result = await apiFetch("/api/restore/finish", { method: "POST", body: JSON.stringify({ written }) });
      if (!restoreRunActive(runId)) return;
      if (!result || result.error) f.logFailed = true;
    } catch (e) {
      if (e.message === "unauthorized") { abandonRestore(); return; }
      if (!restoreRunActive(runId)) return;
      f.logFailed = true;
    }
  }
  f.percent = 100;
  f.stage = "report";
  redrawRestoreModal();
}

// A request failed in the middle of the run. What was written stays; the report says so. The Log entry is tried for
// what was counted.
async function failRestoreRun(runId) {
  const f = restoreFlow;
  const written = restoreWrittenMap();
  if (Object.keys(written).length > 0) {
    try {
      await apiFetch("/api/restore/finish", { method: "POST", body: JSON.stringify({ written }) });
    } catch (e) {
      if (e.message === "unauthorized") { abandonRestore(); return; }
    }
    if (!restoreRunActive(runId)) return;
  }
  f.failed = true;
  f.error = "The restore stopped because of an error. What was restored so far stays in your database. If you run the restore again, those items are reported as conflicts, so skip them.";
  f.stage = "report";
  redrawRestoreModal();
}

// ---------------------------------------------------------------------
// REPORT STAGE
// ---------------------------------------------------------------------
// The sum of one count key over all sections (Users restored through the Nodes section count as users, and so on).
function restoreTotal(key) {
  const counts = restoreFlow.sectionCounts;
  return Object.keys(counts).reduce((sum, id) => sum + (Number(counts[id][key]) || 0), 0);
}

// The report text of one section of the file: "3 applied", "Not restored" or "5 added (2 with users), 1 skipped".
function restoreSectionText(section) {
  const f = restoreFlow;
  const id = section.id;
  const own = f.sectionCounts[id] || {};
  if (typeof own.appliedItems === "number") {
    const parts = [own.appliedItems + " applied"];
    if (own.skippedItems > 0) parts.push(own.skippedItems + " skipped");
    return parts.join(", ");
  }
  const added = restoreTotal(id + "Added");
  const skipped = restoreTotal(id + "Skipped");
  if (!f.selected.includes(id) && added === 0 && skipped === 0) return "Not restored";
  // What other sections wrote for this kind (Nodes written through Users are labeled "with users").
  const via = [];
  f.file.info.sections.forEach(other => {
    if (other.id === id) return;
    const n = Number((f.sectionCounts[other.id] || {})[id + "Added"]) || 0;
    if (n > 0) via.push(n + " with " + String(other.label).toLowerCase());
  });
  const parts = [added + " added" + (via.length > 0 ? " (" + via.join(", ") + ")" : "")];
  const renamed = restoreTotal(id + "Renamed");
  if (renamed > 0) parts.push(renamed + " renamed");
  const regenerated = restoreTotal(id + "UuidRegenerated");
  if (regenerated > 0) parts.push(regenerated + " with a new UUID");
  if (skipped > 0) parts.push(skipped + " skipped");
  const linked = restoreTotal(id + "LinkedExisting");
  if (linked > 0) parts.push(linked + " linked to existing");
  return parts.join(", ");
}

function renderRestoreReport() {
  const f = restoreFlow;
  const rows = f.file.info.sections.map(section => ({ label: section.label, text: restoreSectionText(section) }));
  if (f.invalid.size > 0) rows.push({ label: "Unreadable", text: f.invalid.size + (f.invalid.size === 1 ? " entry" : " entries") + " skipped" });
  const lead = f.failed
    ? '<div class="error-text" role="alert">' + escapeHtml(f.error) + '</div>'
    : '<div class="helper-text">The backup was restored.</div>';
  return '<div class="modal-title">' + (f.failed ? "Restore stopped" : "Restore complete") + '</div>'
    + lead
    + '<div class="backup-report">' + rows.map(restoreRowMarkup).join("") + '</div>'
    + restoreIgnoredNote()
    + (f.logFailed ? '<div class="helper-text">The restore could not be added to the Log.</div>' : "")
    + '<div class="modal-footer"><button type="button" class="btn-primary" onclick="finishRestore()">Done</button></div>';
}

// ---------------------------------------------------------------------
// THE POPUP
// ---------------------------------------------------------------------
// The progress of the whole restore, in percent with two decimals: the items sent so far out of all items of the chosen
// sections (the number of the Restoring screen). It is 0 until the first write, so the questions of the comparison show an
// empty bar. The bar of a conflict question (styles/backup.js, .restore-asking) uses it.
function restoreOverallPercent() {
  const f = restoreFlow;
  return cutProgressPercent(f.total > 0 ? (f.done * 100) / f.total : 0, 99.99);
}

// The popup card; renderModal() (client/modals/modals.js) returns it while state.modal === "restore". The body of the
// conflicts stage comes from restore-conflicts.js. While a conflict question is on screen the card also gets the class
// restore-asking and the custom property --restore-progress, which draw a bar along its bottom border.
function renderRestoreModal() {
  const stage = restoreFlow.stage;
  let body;
  if (stage === "sections") body = renderRestoreSections();
  else if (stage === "compare") body = renderRestoreProgress("Comparing");
  else if (stage === "summary") body = renderRestoreSummary();
  else if (stage === "conflicts") body = renderRestoreConflict();
  else if (stage === "applying") body = renderRestoreProgress("Restoring");
  else if (stage === "report") body = renderRestoreReport();
  else body = renderRestoreFile();
  const asking = stage === "conflicts" && Boolean(restoreFlow.ask && restoreFlow.ask.current);
  const askClass = asking ? " restore-asking" : "";
  const askStyle = asking ? ' style="--restore-progress:' + restoreOverallPercent() + '%"' : "";
  return '<div class="card modal-card backup-modal restore-modal' + askClass + '" role="dialog" aria-modal="true" aria-label="Restore"' + askStyle + '>' + body + '</div>';
}
`;
