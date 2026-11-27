// ---------------------------------------------------------------------
// BACKUP FLOW (client script, joined into CLIENT_SCRIPT by src/frontend/client-script.js)
// The Backup popup of Settings > Account. It keeps its own flow state (backupFlow below), not state.js, and it
// only talks to /api/backup/*; it knows no section by name, so a section added to the server registry
// (src/backup/registry.js) shows up as one more card without a change here.
//
// Wiring done by later steps of the feature (BR-1):
//   - client-script.js adds BACKUP_FLOW_SCRIPT (after NODE_PICKER_SCRIPT, whose card tick it reuses);
//   - renderModal() returns renderBackupModal() while state.modal === "backup";
//   - Escape does not close the popup, a click outside calls closeBackup() (app/init.js);
//   - the Backup row in Settings > Account calls openBackup();
//   - styles/backup.js styles the classes this file uses: backup-card (the card icon inside .node-card-badge),
//     backup-privacy, backup-progress, backup-progress-bar, backup-progress-meta, backup-report,
//     backup-report-row, backup-report-label and backup-report-value. The cards reuse the Node picker classes.
// ---------------------------------------------------------------------
export const BACKUP_FLOW_SCRIPT = `
// ---------------------------------------------------------------------
// BACKUP FLOW - three stages in one popup: select (cards and Download), running (percentage and stage) and report.
// The run reads the manifest, then every chosen section page by page (POST /api/backup/export), builds the file in
// memory and downloads it as vexa-backup-YYYY-MM-DD_HHmmss.json. Nothing is written to the server.
// ---------------------------------------------------------------------
// Icon of a section card, by section id. A section this table does not know gets the log icon.
const BACKUP_SECTION_ICONS = { users: "users", nodes: "globe", settings: "settings" };

// The flow state. runId changes whenever the popup is opened, closed or a run starts, so an answer that arrives for an
// older run is dropped (see backupRunActive()). stage is "select", "running" or "report".
function newBackupFlow(runId) {
  return {
    runId,
    stage: "select",
    // The sections of the manifest ({ id, label, noun, nounPlural, count }) and the ids that are switched on.
    loaded: false,
    loadError: "",
    sections: [],
    selected: [],
    // Error text of the select stage (a failed run).
    error: "",
    // Running stage: percent (0 to 100, cut to two decimals) and the current stage text.
    percent: 0,
    stageText: "",
    // Report stage: { fileName, rows: [{ label, text }] }.
    report: null
  };
}
let backupFlow = newBackupFlow(0);

function resetBackupFlow() {
  backupFlow = newBackupFlow(backupFlow.runId + 1);
}

// True while the run that started with this runId is the current one and the popup is still open.
function backupRunActive(runId) {
  return backupFlow.runId === runId && state.modal === "backup";
}

// Rewrites the popup markup in the modal layer without redrawing the page behind it (render() would also rebuild the
// view and scroll it to the top). The layer keeps its comparison string in step, as render() does.
function redrawBackupModal() {
  const layer = document.getElementById("md");
  if (!layer || state.modal !== "backup") return;
  const html = renderBackupModal();
  if (layer._html === html) return;
  layer.innerHTML = html;
  layer._html = html;
}

function openBackup() {
  resetBackupFlow();
  state.modal = "backup";
  render();
  loadBackupManifest();
}

// Closes the popup and drops the flow, which also stops a run that is still going.
function closeBackup() {
  resetBackupFlow();
  closeModal();
}

// The Done button of the report.
function finishBackup() {
  closeBackup();
}

// The session ended while the popup was open: apiFetch() has already shown the login view.
function abandonBackup() {
  resetBackupFlow();
  state.modal = null;
}

// Reads the manifest the cards are drawn from. All sections start switched on.
async function loadBackupManifest() {
  const runId = backupFlow.runId;
  let data = null;
  try {
    data = await apiFetch("/api/backup/manifest");
  } catch (e) {
    if (e.message === "unauthorized") { abandonBackup(); return; }
  }
  if (!backupRunActive(runId)) return;
  if (data && Array.isArray(data.sections) && data.sections.length > 0) {
    backupFlow.sections = data.sections;
    backupFlow.selected = data.sections.map(s => s.id);
    backupFlow.loaded = true;
  } else {
    backupFlow.loadError = "Could not load the backup options. Try again.";
  }
  redrawBackupModal();
}

function retryBackupManifest() {
  backupFlow.loadError = "";
  redrawBackupModal();
  loadBackupManifest();
}

// ---------------------------------------------------------------------
// SELECT STAGE
// ---------------------------------------------------------------------
function backupCountText(count, section) {
  return count + " " + (count === 1 ? section.noun : section.nounPlural);
}

function backupAllSelected() {
  return backupFlow.sections.length > 0 && backupFlow.selected.length === backupFlow.sections.length;
}

// One card per section, the same cards as the Node picker (client/nodes/node-picker.js), with the section icon in
// the badge. The id goes into data-id, not into the onclick text.
function renderBackupCard(section) {
  const selected = backupFlow.selected.includes(section.id);
  const iconName = BACKUP_SECTION_ICONS[section.id] || "log";
  return '<button type="button" class="node-card backup-card" data-id="' + escapeHtml(section.id) + '" aria-pressed="' + selected + '" onclick="toggleBackupSection(this)">'
    + '<span class="node-card-badge">' + icon(iconName) + '</span>'
    + '<span class="node-card-text"><span class="node-card-name">' + escapeHtml(section.label) + '</span>'
    + '<span class="node-card-type">' + escapeHtml(backupCountText(Number(section.count) || 0, section)) + '</span></span>'
    + '<span class="node-card-check">' + NODE_CARD_TICK + '</span></button>';
}

function renderBackupSelect() {
  const f = backupFlow;
  let picker = "";
  if (f.loaded) {
    picker = '<div class="field-group" id="backupPicker">'
      + '<div class="field-head"><span class="field-label">Backup contents</span>'
      + infoTip("Choose what to include in the backup file. Every section starts switched on.", "below")
      + '<button type="button" class="btn-secondary btn-sm" id="backupSelectAll" onclick="toggleBackupAll()">' + (backupAllSelected() ? "Clear all" : "Select all") + '</button></div>'
      + '<div class="node-cards">' + f.sections.map(renderBackupCard).join("") + '</div>'
      + '</div>'
      + '<div class="helper-text backup-privacy">Keep the backup file private. It holds the subscription links of your users and the sources of your nodes, so store it somewhere safe.</div>';
  } else if (!f.loadError) {
    picker = '<div class="helper-text">Loading...</div>';
  }
  const message = f.error || f.loadError;
  const action = f.loadError && !f.loaded
    ? '<button type="button" class="btn-primary" onclick="retryBackupManifest()">Try again</button>'
    : '<button type="button" class="btn-primary" id="backupDownloadBtn" onclick="startBackup()"' + (f.loaded && f.selected.length > 0 ? "" : " disabled") + '>Download</button>';
  return '<div class="modal-title">Backup</div>'
    + picker
    + '<div class="error-text" id="backupError" role="alert">' + escapeHtml(message) + '</div>'
    + '<div class="modal-footer">' + action + '</div>';
}

// Turns a section on or off. The card is changed in place, so its check can fade, and the comparison string of the
// modal layer is kept in step (as toggleNodeForUser() does).
function toggleBackupSection(button) {
  const id = button && button.dataset.id;
  if (!id || backupFlow.stage !== "select") return;
  const i = backupFlow.selected.indexOf(id);
  if (i === -1) backupFlow.selected.push(id);
  else backupFlow.selected.splice(i, 1);
  syncBackupSelection();
}

// Select all: switches every section on, or every section off when all are on already.
function toggleBackupAll() {
  if (backupFlow.stage !== "select" || !backupFlow.loaded) return;
  backupFlow.selected = backupAllSelected() ? [] : backupFlow.sections.map(s => s.id);
  syncBackupSelection();
}

// Brings the cards, the Select all label and the Download button in line with backupFlow.selected.
function syncBackupSelection() {
  document.querySelectorAll("#md .backup-card").forEach(card => {
    card.setAttribute("aria-pressed", String(backupFlow.selected.includes(card.dataset.id)));
  });
  const all = document.getElementById("backupSelectAll");
  if (all) all.textContent = backupAllSelected() ? "Clear all" : "Select all";
  const download = document.getElementById("backupDownloadBtn");
  if (download) download.disabled = backupFlow.selected.length === 0;
  const layer = document.getElementById("md");
  if (layer) layer._html = renderBackupModal();
}

// ---------------------------------------------------------------------
// RUN
// ---------------------------------------------------------------------
// Cuts a percentage to two decimals (cut, not rounded, so a run never shows more than it has done) and keeps it from 0
// up to max. Work that is still going passes 99.99, so 100 shows only when the work is finished. Shared with the
// Restore flow (restore-flow.js), which is joined after this file.
function cutProgressPercent(value, max) {
  const cut = Math.floor((Number(value) || 0) * 100 + 1e-6) / 100;
  return Math.max(0, Math.min(max, cut));
}

// The text of a progress percentage: two decimals and a percent sign, for example "25.37%".
function formatProgressPercent(percent) {
  return (Number(percent) || 0).toFixed(2) + "%";
}

// Writes the percentage and the stage text into the running popup in place (a full redraw on every page would restart
// the bar). The percentage stays below 100 until the file is ready.
function setBackupProgress(runId, done, total, text) {
  if (!backupRunActive(runId)) return;
  backupFlow.percent = cutProgressPercent(total > 0 ? (done * 100) / total : 0, 99.99);
  backupFlow.stageText = text;
  updateBackupProgress();
}

function updateBackupProgress() {
  const bar = document.getElementById("backupProgressBar");
  if (bar) bar.style.width = backupFlow.percent + "%";
  const track = document.getElementById("backupProgress");
  if (track) track.setAttribute("aria-valuenow", String(backupFlow.percent));
  const percent = document.getElementById("backupPercent");
  if (percent) percent.textContent = formatProgressPercent(backupFlow.percent);
  const stage = document.getElementById("backupStage");
  if (stage) stage.textContent = backupFlow.stageText;
}

// Reads one section page by page into { items, entities? } as the server gives it. onItems(n) is called after each page
// with the number of items it held. Returns null when the run was stopped meanwhile. A page with fewer items than the
// page size is the last one; a run that never gets one is an error, so a file is never cut short without notice.
async function exportBackupSection(section, pageSize, runId, onItems) {
  const payload = { items: [] };
  let offset = 0;
  const maxPages = Math.ceil((Number(section.count) || 0) / pageSize) + 20;
  for (let page = 0; page < maxPages; page++) {
    const part = await apiFetch("/api/backup/export", {
      method: "POST",
      body: JSON.stringify({ section: section.id, offset, limit: pageSize })
    });
    if (!backupRunActive(runId)) return null;
    if (!part || part.error || !Array.isArray(part.items)) throw new Error("export_failed");
    part.items.forEach(item => payload.items.push(item));
    if (part.entities && typeof part.entities === "object") {
      // The dictionaries have no prototype, so an id such as __proto__ stays an ordinary key.
      payload.entities = payload.entities || {};
      Object.keys(part.entities).forEach(kind => {
        if (!payload.entities[kind]) payload.entities[kind] = Object.create(null);
        Object.keys(part.entities[kind] || {}).forEach(id => { payload.entities[kind][id] = part.entities[kind][id]; });
      });
    }
    onItems(part.items.length);
    if (part.items.length < pageSize) return payload;
    offset += part.items.length;
  }
  throw new Error("export_incomplete");
}

// vexa-backup-YYYY-MM-DD_HHmmss.json with the local date and time of the backup (24-hour clock; the date is always
// Gregorian, whatever the panel shows). No colons, so the name is valid on Windows.
function backupFileName(date) {
  const d = isNaN(date.getTime()) ? new Date() : date;
  const pad = n => String(n).padStart(2, "0");
  return "vexa-backup-" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "_" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + ".json";
}

// Downloads the backup object as a JSON file (the same link and Blob way as downloadLink() in users/user-links.js).
function saveBackupFile(file, fileName) {
  const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

// The Download button. The manifest is read again, so the counts, the page size and the creation time are those of
// this run, then every chosen section is read in the order of the registry. A failure goes back to the select stage
// with an error text; a popup closed meanwhile stops the run quietly.
async function startBackup() {
  if (backupFlow.stage !== "select" || !backupFlow.loaded) return;
  const wanted = backupFlow.sections.filter(s => backupFlow.selected.includes(s.id)).map(s => s.id);
  if (wanted.length === 0) return;
  const runId = ++backupFlow.runId;
  backupFlow.error = "";
  backupFlow.stage = "running";
  backupFlow.percent = 0;
  backupFlow.stageText = "Preparing the backup";
  redrawBackupModal();
  try {
    const manifest = await apiFetch("/api/backup/manifest");
    if (!backupRunActive(runId)) return;
    if (!manifest || !manifest.header || !Array.isArray(manifest.sections) || !(manifest.pageSize > 0)) throw new Error("manifest_failed");
    const plan = manifest.sections.filter(s => wanted.includes(s.id));
    if (plan.length === 0) throw new Error("manifest_failed");
    const total = plan.reduce((sum, s) => sum + (Number(s.count) || 0), 0);
    let done = 0;
    const sections = {};
    const rows = [];
    for (const section of plan) {
      const stageText = "Backing up " + section.label;
      setBackupProgress(runId, done, total, stageText);
      const payload = await exportBackupSection(section, manifest.pageSize, runId, n => {
        done += n;
        setBackupProgress(runId, done, total, stageText);
      });
      if (!payload) return;
      sections[section.id] = payload;
      rows.push({ label: section.label, text: backupCountText(payload.items.length, section) });
    }
    backupFlow.percent = 100;
    backupFlow.stageText = "Saving the file";
    updateBackupProgress();
    const fileName = backupFileName(new Date(manifest.header.createdAt));
    saveBackupFile({ ...manifest.header, sections }, fileName);
    backupFlow.report = { fileName, rows };
    backupFlow.stage = "report";
    redrawBackupModal();
  } catch (e) {
    if (e.message === "unauthorized") { abandonBackup(); return; }
    if (!backupRunActive(runId)) return;
    backupFlow.stage = "select";
    backupFlow.error = "Could not create the backup. Try again.";
    redrawBackupModal();
  }
}

// ---------------------------------------------------------------------
// RUNNING AND REPORT STAGES, AND THE POPUP
// ---------------------------------------------------------------------
function renderBackupRunning() {
  const f = backupFlow;
  return '<div class="modal-title">Creating backup</div>'
    + '<div class="backup-progress" id="backupProgress" role="progressbar" aria-label="Backup progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + f.percent + '">'
    + '<div class="backup-progress-bar" id="backupProgressBar" style="width:' + f.percent + '%"></div></div>'
    + '<div class="backup-progress-meta" aria-live="polite"><span id="backupStage">' + escapeHtml(f.stageText) + '</span><span id="backupPercent">' + formatProgressPercent(f.percent) + '</span></div>';
}

// The report: the file name and how many items of each section were backed up.
function renderBackupReport() {
  const r = backupFlow.report || { fileName: "", rows: [] };
  const rows = r.rows.map(row =>
    '<div class="backup-report-row"><span class="backup-report-label">' + escapeHtml(row.label) + '</span><span class="backup-report-value">' + escapeHtml(row.text) + '</span></div>'
  ).join("");
  return '<div class="modal-title">Backup complete</div>'
    + '<div class="helper-text">The file was downloaded as <strong>' + escapeHtml(r.fileName) + '</strong>.</div>'
    + '<div class="backup-report">' + rows + '</div>'
    + '<div class="modal-footer"><button type="button" class="btn-primary" onclick="finishBackup()">Done</button></div>';
}

// The popup card; renderModal() (client/modals/modals.js) returns it while state.modal === "backup".
function renderBackupModal() {
  const stage = backupFlow.stage;
  const body = stage === "running" ? renderBackupRunning() : stage === "report" ? renderBackupReport() : renderBackupSelect();
  return '<div class="card modal-card backup-modal" role="dialog" aria-modal="true" aria-label="Backup">' + body + '</div>';
}
`;
