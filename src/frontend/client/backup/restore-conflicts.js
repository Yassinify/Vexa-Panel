// ---------------------------------------------------------------------
// RESTORE CONFLICTS (client script, joined into CLIENT_SCRIPT by src/frontend/client-script.js)
// The conflict questions of the Restore popup (stage "conflicts" of restore-flow.js), one item at a time, with no
// apply-to-all. It is called by restore-flow.js through beginRestoreConflicts() and renderRestoreConflict() and
// hands control back through restoreConflictsAnswered(); the contract is documented in the header of
// restore-flow.js. Its question state lives in restoreFlow.ask, so it resets with the flow.
//
// Wiring done by a later step of the feature (BR-1): client-script.js adds RESTORE_CONFLICTS_SCRIPT after
// RESTORE_FLOW_SCRIPT (step 15). It adds no CSS class of its own: it reuses backup-report, backup-report-row,
// backup-report-label, backup-report-value, field-group, helper-text and error-text.
// ---------------------------------------------------------------------
export const RESTORE_CONFLICTS_SCRIPT = `
// ---------------------------------------------------------------------
// RESTORE CONFLICTS
// restoreFlow.ask = { origin, pending, current, mode, input, error, checking, asked }
//   origin    "analysis" (the conflicts of the comparison, before any write) or "apply" (results of a write)
//   pending   conflicts not asked yet; current is the one on screen
//   mode      "choice" (Rename / Skip / Generate new UUID) or "rename" (the name box)
//   checking  true while the typed name is being checked by the server
// An answer goes into restoreFlow.decisions[conflict.key]:
//   { action: "skip" } | { action: "rename", name } | { action: "newUuid" }
// ---------------------------------------------------------------------

// A conflict of the comparison is only asked when it matters: it belongs to an item of its own section (top), or at
// least one item that embeds it is not skipped. A conflict from a write is always asked.
function restoreConflictNeeded(conflict, origin) {
  const parents = Array.isArray(conflict.parents) ? conflict.parents : [];
  if (origin === "apply" || conflict.top || parents.length === 0) return true;
  return parents.some(key => !(restoreFlow.decisions[key] && restoreFlow.decisions[key].action === "skip"));
}

// The next conflict to ask, or null. A conflict whose embedding items are still waiting for an answer comes after
// them, so a skipped parent can remove the question. In a cycle an item of its own section (top) goes first, because
// it is always asked. Questions that no longer matter are dropped on every call.
function restoreNextConflict() {
  const ask = restoreFlow.ask;
  ask.pending = ask.pending.filter(c => !restoreHas(restoreFlow.decisions, c.key) && restoreConflictNeeded(c, ask.origin));
  if (ask.pending.length === 0) return null;
  const waiting = new Set(ask.pending.map(c => c.key));
  const next = ask.pending.find(c => !(Array.isArray(c.parents) ? c.parents : []).some(key => waiting.has(key)))
    || ask.pending.find(c => c.top)
    || ask.pending[0];
  ask.pending = ask.pending.filter(c => c !== next);
  return next;
}

// Starts the questions. For origin "apply" an older decision of the same key is replaced, because the server says it
// did not hold (for example a typed name that was taken in between).
function beginRestoreConflicts(conflicts, origin) {
  const f = restoreFlow;
  const list = (Array.isArray(conflicts) ? conflicts : []).filter(c => restoreIsObject(c) && typeof c.key === "string");
  if (origin === "apply") list.forEach(c => { delete f.decisions[c.key]; });
  f.stage = "conflicts";
  f.ask = { origin, pending: list.slice(), current: null, mode: "choice", input: "", error: "", checking: false, asked: 0 };
  advanceRestoreConflicts();
}

// Shows the next question, or hands back when none is left.
function advanceRestoreConflicts() {
  const ask = restoreFlow.ask;
  const next = restoreNextConflict();
  if (!next) { restoreConflictsAnswered(); return; }
  ask.current = next;
  ask.mode = "choice";
  ask.input = "";
  ask.error = "";
  redrawRestoreModal();
}

function answerRestoreConflict(decision) {
  const ask = restoreFlow.ask;
  if (!ask || !ask.current || ask.checking) return;
  restoreFlow.decisions[ask.current.key] = decision;
  ask.asked += 1;
  ask.current = null;
  advanceRestoreConflicts();
}

function restoreAskSkip() {
  answerRestoreConflict({ action: "skip" });
}

function restoreAskNewUuid() {
  answerRestoreConflict({ action: "newUuid" });
}

// Rename: opens the name box inside the same popup.
function restoreAskRename() {
  const ask = restoreFlow.ask;
  if (!ask || !ask.current || ask.checking) return;
  ask.mode = "rename";
  ask.input = "";
  ask.error = "";
  redrawRestoreModal();
  setTimeout(() => {
    const input = document.getElementById("restoreRenameInput");
    if (input) input.focus();
  }, 0);
}

function cancelRestoreRename() {
  const ask = restoreFlow.ask;
  if (!ask || ask.checking) return;
  ask.mode = "choice";
  ask.error = "";
  redrawRestoreModal();
}

// Keeps the typed text in the state (the box is not redrawn while typing) and clears an old error.
function updateRestoreRename(value) {
  const ask = restoreFlow.ask;
  if (!ask) return;
  ask.input = value;
  if (ask.error) {
    ask.error = "";
    showRestoreAskError("");
  }
}

function restoreRenameKey(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    confirmRestoreRename();
  }
}

function showRestoreAskError(text) {
  const el = document.getElementById("restoreAskError");
  if (el) el.textContent = text;
}

function setRestoreAskBusy(busy) {
  const button = document.getElementById("restoreRenameBtn");
  if (button) button.disabled = busy;
}

function restoreNameError(code) {
  if (code === "taken") return "This name already exists. Enter another name.";
  if (code === "invalid") return "This name cannot be used as a link id. Use English letters, digits, - and _ only.";
  if (code === "empty") return "Enter a name, or leave the box empty to use the suggested one.";
  return "Could not check the name. Try again.";
}

// The names that are not in the database yet but will be: the renames already chosen, and the other incoming items
// of the same kind in the selected sections. The server adds them to its own checks (reserved). The renames go in
// first, so the cut to the server limit never drops them before an incoming name.
function restoreReservedNames(conflict) {
  const f = restoreFlow;
  const kind = conflict.kind;
  const ownId = conflict.key.slice(kind.length + 1);
  const names = new Set();
  Object.keys(f.decisions).forEach(key => {
    const d = f.decisions[key];
    if (key !== conflict.key && key.startsWith(kind + ":") && d && d.action === "rename" && typeof d.name === "string") names.add(d.name);
  });
  const add = entity => {
    if (!restoreIsObject(entity) || typeof entity.name !== "string" || entity.id === ownId) return;
    const name = entity.name.trim();
    if (name) names.add(name);
  };
  f.file.info.sections.forEach(section => {
    if (!f.selected.includes(section.id)) return;
    const payload = f.file.backup.sections[section.id];
    if (!restoreIsObject(payload)) return;
    // The items of the section named after the kind (users, nodes), and the entities other sections embed.
    if (section.id === kind + "s" && Array.isArray(payload.items)) payload.items.forEach(add);
    const embedded = restoreIsObject(payload.entities) ? payload.entities[kind + "s"] : null;
    if (restoreIsObject(embedded)) Object.keys(embedded).forEach(id => add(embedded[id]));
  });
  return Array.from(names).slice(0, 5000);
}

// The Rename button of the name box. An empty box asks the server for the suggestion ("<name>-new", made unique); a
// typed name is checked live against the database and the reserved names. Only a name that passes is kept.
async function confirmRestoreRename() {
  const f = restoreFlow;
  const ask = f.ask;
  if (!ask || !ask.current || ask.mode !== "rename" || ask.checking) return;
  const conflict = ask.current;
  const runId = f.runId;
  ask.checking = true;
  ask.error = "";
  showRestoreAskError("");
  setRestoreAskBusy(true);
  try {
    const result = await apiFetch("/api/restore/validate-name", {
      method: "POST",
      body: JSON.stringify({
        kind: conflict.kind,
        name: ask.input.trim(),
        baseName: conflict.name,
        uuidRandom: conflict.uuidRandom !== false,
        reserved: restoreReservedNames(conflict)
      })
    });
    if (!restoreRunActive(runId) || f.ask !== ask) return;
    ask.checking = false;
    if (!result || !result.ok || typeof result.name !== "string") {
      ask.error = restoreNameError(result && result.error);
      showRestoreAskError(ask.error);
      setRestoreAskBusy(false);
      return;
    }
    answerRestoreConflict({ action: "rename", name: result.name });
  } catch (e) {
    if (e.message === "unauthorized") { abandonRestore(); return; }
    if (!restoreRunActive(runId) || f.ask !== ask) return;
    ask.checking = false;
    ask.error = restoreNameError("");
    showRestoreAskError(ask.error);
    setRestoreAskBusy(false);
  }
}

// ---------------------------------------------------------------------
// THE QUESTION
// ---------------------------------------------------------------------
// A random-UUID User whose UUID is taken can get a new UUID; every other conflict is fixed by a new name.
function restoreWantsNewUuid(conflict) {
  return conflict.kind === "user" && conflict.reason === "uuid_taken" && conflict.uuidRandom !== false;
}

function restoreConflictText(conflict) {
  if (restoreWantsNewUuid(conflict)) return "This User's UUID is already assigned to another User. Would you like me to generate a new UUID or skip it?";
  if (conflict.kind === "node") return "This Node's name already exists in your database. Would you like me to rename it or skip it?";
  if (conflict.reason === "uuid_taken") return "The link of this User is already used by another User. Would you like me to rename it or skip it?";
  if (conflict.reason === "invalid_name") return "This User's name cannot be used as a link id. Would you like me to rename it or skip it?";
  return "This User's name already exists in your database. Would you like me to rename it or skip it?";
}

function renderRestoreChoice(conflict) {
  const ask = restoreFlow.ask;
  const back = ask.origin === "analysis" ? '<button type="button" class="btn-secondary" onclick="restoreBack()">Back</button>' : "";
  const action = restoreWantsNewUuid(conflict)
    ? '<button type="button" class="btn-primary" onclick="restoreAskNewUuid()">Generate new UUID</button>'
    : '<button type="button" class="btn-primary" onclick="restoreAskRename()">Rename</button>';
  return '<div class="modal-title">Conflict ' + (ask.asked + 1) + '</div>'
    + '<div class="backup-report"><div class="backup-report-row"><span class="backup-report-label">' + (conflict.kind === "node" ? "Node" : "User") + '</span><span class="backup-report-value">' + escapeHtml(conflict.name) + '</span></div></div>'
    + '<div class="helper-text">' + escapeHtml(restoreConflictText(conflict)) + '</div>'
    + '<div class="modal-footer">' + back + '<button type="button" class="btn-secondary" onclick="restoreAskSkip()">Skip</button>' + action + '</div>';
}

// What the admin should know before typing: a random UUID that is taken too is replaced together with the rename, and
// a username-mode User has its name as the id, so a rename changes its link.
function restoreRenameNote(conflict) {
  if (conflict.kind !== "user") return "";
  if (conflict.uuidRandom === false) return "This User uses its name as the UUID, so renaming also changes its link. Use English letters, digits, - and _ only.";
  if (conflict.reason === "name_taken" && conflict.uuidAlsoTaken) return "The UUID of this User is also taken, so a new UUID will be generated together with the new name.";
  return "";
}

function renderRestoreRename(conflict) {
  const ask = restoreFlow.ask;
  const what = conflict.kind === "node" ? "node" : "user";
  const note = restoreRenameNote(conflict);
  return '<div class="modal-title">Rename ' + what + '</div>'
    + '<div class="helper-text">Enter a new name. Leave the box empty to use <strong>' + escapeHtml(conflict.name) + '-new</strong>.</div>'
    + '<div class="field-group">'
    + '<div class="field-head"><label class="field-label" for="restoreRenameInput">New name</label>' + (note ? infoTip(note, "below") : "") + '</div>'
    + '<input id="restoreRenameInput" placeholder="' + escapeHtml(conflict.name) + '-new" value="' + escapeHtml(ask.input) + '" aria-label="New name" oninput="updateRestoreRename(this.value)" onkeydown="restoreRenameKey(event)" /></div>'
    + '<div class="error-text" id="restoreAskError" role="alert">' + escapeHtml(ask.error) + '</div>'
    + '<div class="modal-footer">'
    + '<button type="button" class="btn-secondary" onclick="cancelRestoreRename()">Cancel</button>'
    + '<button type="button" class="btn-primary" id="restoreRenameBtn" onclick="confirmRestoreRename()"' + (ask.checking ? " disabled" : "") + '>Rename</button>'
    + '</div>';
}

// The body of the conflicts stage; renderRestoreModal() (restore-flow.js) calls it.
function renderRestoreConflict() {
  const ask = restoreFlow.ask;
  if (!ask || !ask.current) return '<div class="modal-title">Conflicts</div>';
  return ask.mode === "rename" ? renderRestoreRename(ask.current) : renderRestoreChoice(ask.current);
}
`;
