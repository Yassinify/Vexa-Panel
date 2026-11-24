export const USER_EDITOR_SCRIPT = `
// crypto.randomUUID() exists only in secure contexts (HTTPS or localhost), so it is undefined on a plain http://<IP>
// address (the local preview opened from another device). getRandomValues() works in every context.
function newUuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}

async function openUserEditor() {
  state.editingUser = null;
  state.editingUserName = "";
  state.editingUserSources = [""];
  state.editingUserSourcesAdded = [false];
  state.editingUserSourcesBackup = [null];
  state.editingUserNodeIds = [];
  // A new User starts with a random UUID, shown at once; the switch and Regenerate only change the display until Create.
  state.editingUserUuidRandom = true;
  state.editingUserUuid = newUuid();
  state.editingUserSubscriptionTitle = "";
  state.modal = "userEditor";
  // Opens at once from the cached Node list.
  render();
  recheckEditorNodes();
}

// What the Node picker shows; used to tell whether a refreshed Node list changed it.
function nodePickerKey(nodes) {
  return JSON.stringify(nodes.map(n => [n.id, n.name, n.enabled !== false]));
}

// Fetches the Node list again while the User editor is open. If nothing the picker shows
// changed, nothing happens; otherwise only the picker is redrawn in place, so the typed name
// and sources stay, and selected ids that no longer exist or are disabled are dropped.
// Never rejects: a failed fetch keeps the cached list and the open editor as they are.
async function recheckEditorNodes() {
  const prevNodes = state.nodes;
  const prevLoaded = state.nodesLoaded;
  try {
    await loadNodes();
  } catch (e) {
    return;
  }
  if (!state.nodesLoaded) {
    // An error body, not a Node list: keep the cached one.
    state.nodes = prevNodes;
    state.nodesLoaded = prevLoaded;
    return;
  }
  if (state.modal !== "userEditor") return;
  if (prevLoaded && nodePickerKey(prevNodes) === nodePickerKey(state.nodes)) return;
  state.editingUserNodeIds = state.editingUserNodeIds.filter(nid =>
    state.nodes.some(n => n.id === nid && n.enabled !== false)
  );
  const picker = document.getElementById("nodePicker");
  if (!picker) return;
  picker.outerHTML = renderNodePicker();
  // Keep the render() comparison in step with the redrawn picker.
  document.getElementById("md")._html = renderModal();
}

// ---------------------------------------------------------------------
// SOURCE REPEATER - one row per state.editingUserSources[i], used by the
// userEditor modal. updateSourceRow() only writes into the array (no
// render) so the textarea keeps focus/caret while typing; confirm/remove
// change row count and need a re-render.
// ---------------------------------------------------------------------
function removeSourceRow(i) {
  state.editingUserSources.splice(i, 1);
  state.editingUserSourcesAdded.splice(i, 1);
  state.editingUserSourcesBackup.splice(i, 1);
  render();
}

// Adds the source in row i: the text is trimmed and the row becomes a preview.
// An empty box is not added. When no empty input is left at the end, a new one is appended.
// The server still classifies the source at Save.
function confirmSourceRow(i) {
  const value = String(state.editingUserSources[i] || "").trim();
  if (!value) {
    showUserEditorError("Paste a source first.");
    return;
  }
  // Save in the editor box of an added source: keep the text and close the box.
  if (state.editingUserSourcesBackup[i] !== null) {
    endSourceEdit(() => {
      state.editingUserSources[i] = value;
      state.editingUserSourcesBackup[i] = null;
    });
    return;
  }
  state.editingUserSources[i] = value;
  state.editingUserSourcesAdded[i] = true;
  state.editingUserSourcesBackup[i] = null;
  if (state.editingUserSourcesAdded[state.editingUserSourcesAdded.length - 1]) {
    state.editingUserSources.push("");
    state.editingUserSourcesAdded.push(false);
    state.editingUserSourcesBackup.push(null);
  }
  showUserEditorError("");
  render();
}

// A source is open for editing while its backup entry is not null (the text it had before Edit). Its row stays in the
// table and the editor box opens under it (modals.js); the other rows and the new-source input are dimmed and inert.
function openSourceEditIndex() {
  return state.editingUserSourcesBackup ? state.editingUserSourcesBackup.findIndex(b => b !== null) : -1;
}

// render() rewrites the popup markup, which resets the scroll of the card; this keeps it, so the source stays in view.
function renderKeepingScroll() {
  const card = document.querySelector("#md .modal-card");
  const top = card ? card.scrollTop : 0;
  render();
  const next = document.querySelector("#md .modal-card");
  if (next) next.scrollTop = top;
}

// Opens the editor box under row i; the text before Edit is kept for Cancel. No field is focused: the admin clicks or
// taps the textarea to type (focusing it would open the keyboard on a phone).
function editSourceRow(i) {
  if (openSourceEditIndex() !== -1) return;
  state.editingUserSourcesBackup[i] = state.editingUserSources[i];
  renderKeepingScroll();
}

// Closes the editor box: the box and the dimming play their exit first (the classes are styled in styles/modals.js),
// then apply() changes the state and the popup is redrawn. The exit is shorter than the enter. Nothing waits under
// reduced motion. A second call while the exit plays is ignored.
const SOURCE_EDIT_EXIT_MS = 120;
let sourceEditExiting = false;
function endSourceEdit(apply) {
  if (sourceEditExiting) return;
  sourceEditExiting = true;
  const done = () => {
    sourceEditExiting = false;
    // The popup may have been closed while the exit played.
    if (!state.editingUserSources) return;
    apply();
    showUserEditorError("");
    renderKeepingScroll();
  };
  if (uuidMotionOff()) { done(); return; }
  document.querySelectorAll("#md .source-edit").forEach(el => el.classList.add("closing"));
  document.querySelectorAll("#md .source-dim").forEach(el => el.classList.add("undim"));
  setTimeout(done, SOURCE_EDIT_EXIT_MS);
}

// Cancel in the editor box: the text goes back to what it was before Edit.
function cancelSourceRow(i) {
  if (state.editingUserSourcesBackup[i] === null) return;
  endSourceEdit(() => {
    state.editingUserSources[i] = state.editingUserSourcesBackup[i];
    state.editingUserSourcesBackup[i] = null;
  });
}

// Escape while a box is open cancels only the box (init.js); returns false when no box is open.
function cancelOpenSourceEdit() {
  const i = openSourceEditIndex();
  if (i === -1) return false;
  cancelSourceRow(i);
  return true;
}

// Prefixes the server treats as a proxy link (classifySourceString() in protocols/sources.js).
const SOURCE_LINK_PREFIXES = [
  "vless://", "vmess://", "ss://", "trojan://", "ssr://", "hysteria2://", "hy2://", "tuic://",
  "hysteria://", "wireguard://", "socks://", "naive+https://", "naive+quic://"
];

// Type label and text for an added source's preview, checked in the server's order. The label is only
// a hint for the admin; a source the server rejects is still reported when the User is saved.
function sourcePreview(value) {
  const text = String(value || "").trim();
  let type = "Source";
  if (SOURCE_LINK_PREFIXES.some(p => text.startsWith(p))) type = "Link";
  else if (text.startsWith("http://") || text.startsWith("https://")) type = "Subscription";
  else if (text.startsWith("{") || text.startsWith("[")) type = "JSON";
  else if (text.includes("proxies:")) type = "YAML";
  return { type, text };
}

function updateSourceRow(i, value) {
  state.editingUserSources[i] = value;
}

// Username mode id, built like usernameToId() in users.js: spaces become _, and only English letters,
// digits, - and _ are allowed. Returns "" when the name cannot be an id.
function usernameIdFromName(name) {
  const id = String(name).trim().replace(/\\s/g, "_");
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : "";
}

// What the UUID field shows: the random UUID, or in username mode the id built from the name.
function uuidFieldValue() {
  return state.editingUserUuidRandom ? state.editingUserUuid : usernameIdFromName(state.editingUserName);
}

// Keeps the typed name, so a redraw of the editor (a source or Node action) does not reset the field.
// In username mode the UUID field follows every keystroke. It is updated in place, because a redraw
// here would rebuild the Name field and lose the caret.
function updateUserName(value) {
  state.editingUserName = value;
  if (state.editingUserUuidRandom) return;
  const field = document.getElementById("userUuidInput");
  if (field) field.value = uuidFieldValue();
}

// Keeps the typed Subscription Title, so a redraw of the editor does not reset the field. Writes the state only,
// without a redraw, so the field keeps its caret while typing.
function updateSubscriptionTitle(value) {
  state.editingUserSubscriptionTitle = value;
}

// Writes into the modal's error line (R113); typed data stays in the open modal.
function showUserEditorError(msg) {
  const el = document.getElementById("userEditorError");
  if (el) el.textContent = msg;
}

// ---------------------------------------------------------------------
// UUID SECTION of the User editor. The switch and Regenerate only change what the editor shows
// (state.editingUserUuidRandom and state.editingUserUuid); nothing is sent until Save.
// ---------------------------------------------------------------------
// Readable text for the UUID error codes of the server (users.js); null for any other code.
function uuidErrorText(code) {
  if (code === "invalid_username_id") return "The name can use only English letters, digits, - and _ (spaces become _).";
  if (code === "uuid_taken") return "Another user already has this UUID.";
  if (code === "invalid_uuid") return "The UUID is not valid. Regenerate it.";
  return null;
}

// Motion of the UUID switch (display only). render() rewrites the modal, so the switch is a new element after every
// toggle and a CSS transition would not run on it; toggleUuidMode() below starts the motion on the new element.
// The Regenerate button and the UUID field have no motion of their own.
function uuidMotionOff() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Squash and stretch of the theme toggle knob (syncThemeToggle() in client/shell.js), 800ms. The keyframes are added on
// top of the element's own transform (composite "add"): the switch knob slides by a CSS transform that a plain
// keyframe would replace. Used by the switch knob only.
const UUID_SQUASH_KEYFRAMES = [
  { transform: "scale(1, 1)" },
  { transform: "scale(1.14, .88)", offset: .25 },
  { transform: "scale(.94, 1.06)", offset: .55 },
  { transform: "scale(1.02, .98)", offset: .75 },
  { transform: "scale(1, 1)" }
];
function playUuidSquash(el) {
  if (el && el.animate) el.animate(UUID_SQUASH_KEYFRAMES, { duration: 800, easing: "ease-out", composite: "add" });
}

// The "Use the username as UUID" switch: display only. render() has already computed the new switch in its new state
// (it ends with scrollTo, which flushes styles), so a plain old-then-new change would start a transition and reverse it
// at once, and only the squash would be seen. The transitions of the switch and its knob are therefore switched off
// while the old state is set and flushed, and switched on again for the change to the new state: the knob slides and
// the colors blend for real. The knob squashes once. Nothing extra plays under reduced motion. The Regenerate button
// and the UUID field change at once, without motion.
function toggleUuidMode() {
  const wasRandom = state.editingUserUuidRandom;
  state.editingUserUuidRandom = !wasRandom;
  renderKeepingScroll();
  if (uuidMotionOff()) return;
  const sw = document.querySelector("#md .field-head .switch");
  if (!sw) return;
  const knob = sw.querySelector(".switch-knob");
  sw.style.transition = "none";
  if (knob) knob.style.transition = "none";
  // aria-checked is "true" in username mode, so a switch from random mode ends there.
  sw.setAttribute("aria-checked", wasRandom ? "false" : "true");
  void sw.offsetWidth;
  sw.style.transition = "";
  if (knob) knob.style.transition = "";
  sw.setAttribute("aria-checked", wasRandom ? "true" : "false");
  playUuidSquash(knob);
}

// The Regenerate button (disabled in the markup in username mode): shows a new random UUID, display only, without motion.
function regenerateUuid() {
  if (!state.editingUserUuidRandom) return;
  state.editingUserUuid = newUuid();
  renderKeepingScroll();
}

// Waits for the server with the modal open; the modal closes only on success.
async function saveUser() {
  const isEdit = state.editingUser && state.editingUser.id;
  const id = isEdit ? state.editingUser.id : null;
  const name = document.getElementById("userNameInput").value.trim();
  if (!name) { showUserEditorError("Enter a user name."); return; }
  // A box that is still open sends the saved text, not the unsaved draft.
  const sources = state.editingUserSources.map((s, i) => (state.editingUserSourcesBackup[i] !== null ? state.editingUserSourcesBackup[i] : s).trim()).filter(Boolean);
  // Save is the only place the UUID mode and the UUID change: the mode is always sent, the UUID only in random mode.
  const body = JSON.stringify({
    name, sources, nodeIds: state.editingUserNodeIds,
    subscriptionTitle: state.editingUserSubscriptionTitle,
    uuidRandom: state.editingUserUuidRandom,
    ...(state.editingUserUuidRandom ? { uuid: state.editingUserUuid } : {})
  });
  showUserEditorError("");
  try {
    const result = await apiFetch(isEdit ? "/api/users/" + id : "/api/users", { method: isEdit ? "PUT" : "POST", body });
    if (result.error) throw new Error(result.error);
    const u = result.user;
    // The id is part of the row: a rename in username mode changes it.
    const row = {
      id: u.id, name: u.name, enabled: u.enabled !== false,
      subCount: u.sources.filter(s => s.type === "subscription").length,
      rawCount: u.sources.filter(s => s.type !== "subscription").length,
      updatedAt: u.updatedAt, editedAt: u.editedAt
    };
    const idx = isEdit ? state.users.findIndex(x => x.id === id) : -1;
    if (idx !== -1) state.users[idx] = { ...state.users[idx], ...row };
    else if (!isEdit) state.users.push({ createdAt: u.createdAt, ...row });
    markDataStale("users", "stats");
    closeModal();
    if (result.invalidSources && result.invalidSources.length) {
      showToast(result.invalidSources.length + " line(s) skipped - invalid format", "error");
    } else {
      showToast(isEdit ? "User saved" : "User added");
    }
  } catch (e) {
    showUserEditorError(e.message === "name_required" ? "Enter a user name." : uuidErrorText(e.message) || e.message);
  }
}

// ---------------------------------------------------------------------
// USER EDITOR
// ---------------------------------------------------------------------
// Loads the User, then opens the editor once with complete data, so the modal never opens
// blank and fills in later. The Node list is awaited only if it was never loaded; otherwise
// the cached list is used and rechecked once the editor is open. If the load fails nothing
// was opened, so only the toast is shown.
async function openUser(id) {
  try {
    const [data] = await Promise.all([
      apiFetch("/api/users/" + id),
      state.nodesLoaded ? Promise.resolve() : loadNodes()
    ]);
    if (data.error) throw new Error(data.error);
    // Without a real Node list, filtering the User's Node ids would silently drop its assignments.
    if (!state.nodesLoaded) throw new Error("nodes_unavailable");
    state.editingUser = data.user;
    state.editingUserName = data.user.name;
    state.editingUserSources = data.user.sources.map(s =>
      (s.type === "raw" || s.type === "json" || s.type === "yaml") ? s.value : s.url
    );
    // Sources the User already has load as added (previews), followed by one empty input for a new source.
    state.editingUserSourcesAdded = state.editingUserSources.map(() => true);
    state.editingUserSources.push("");
    state.editingUserSourcesAdded.push(false);
    state.editingUserSourcesBackup = state.editingUserSources.map(() => null);
    state.editingUserNodeIds = (data.user.nodeIds || []).filter(nid =>
      state.nodes.some(n => n.id === nid && n.enabled !== false)
    );
    state.editingUserUuidRandom = data.user.uuidRandom !== false;
    // A random-mode User shows its stored id; a username-mode one gets a candidate for a switch to random.
    state.editingUserUuid = state.editingUserUuidRandom ? data.user.id : newUuid();
    state.editingUserSubscriptionTitle = data.user.subscriptionTitle || "";
    state.modal = "userEditor";
    render();
    recheckEditorNodes();
  } catch (e) {
    showToast(e.message, "error");
  }
}
`;
