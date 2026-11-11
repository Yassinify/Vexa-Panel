export const USER_EDITOR_SCRIPT = `
async function openUserEditor() {
  state.editingUser = null;
  state.editingUserName = "";
  state.editingUserSources = [""];
  state.editingUserSourcesAdded = [false];
  state.editingUserNodeIds = [];
  state.modal = "userEditor";
  // Opens at once from the cached Node list (the picker says Loading nodes if it was never loaded).
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
// SOURCE REPEATER — one row per state.editingUserSources[i], used by the
// userEditor modal. updateSourceRow() only writes into the array (no
// render) so the textarea keeps focus/caret while typing; add/remove
// change row count and need a re-render.
// ---------------------------------------------------------------------
function addSourceRow() {
  state.editingUserSources.push("");
  state.editingUserSourcesAdded.push(false);
  render();
}

function removeSourceRow(i) {
  state.editingUserSources.splice(i, 1);
  state.editingUserSourcesAdded.splice(i, 1);
  render();
}

// Adds the source in row i: the text is trimmed and the row becomes a preview.
// An empty box is not added. The server still classifies the source at Save.
function confirmSourceRow(i) {
  const value = String(state.editingUserSources[i] || "").trim();
  if (!value) {
    showUserEditorError("Paste a source first.");
    return;
  }
  state.editingUserSources[i] = value;
  state.editingUserSourcesAdded[i] = true;
  showUserEditorError("");
  render();
}

// Turns the preview of row i back into its input, with the text as it was.
function editSourceRow(i) {
  state.editingUserSourcesAdded[i] = false;
  render();
  const input = document.getElementById("sourceInput" + i);
  if (input) input.focus();
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

// Keeps the typed name, so a redraw of the editor (a source or Node action) does not reset the field.
function updateUserName(value) {
  state.editingUserName = value;
}

// Writes into the modal's error line (R113); typed data stays in the open modal.
function showUserEditorError(msg) {
  const el = document.getElementById("userEditorError");
  if (el) el.textContent = msg;
}

// Waits for the server with the modal open; the modal closes only on success.
async function saveUser() {
  const isEdit = state.editingUser && state.editingUser.id;
  const id = isEdit ? state.editingUser.id : null;
  const name = document.getElementById("userNameInput").value.trim();
  if (!name) { showUserEditorError("Enter a user name."); return; }
  const sources = state.editingUserSources.map(s => s.trim()).filter(Boolean);
  const body = JSON.stringify({ name, sources, nodeIds: state.editingUserNodeIds });
  showUserEditorError("");
  try {
    const result = await apiFetch(isEdit ? "/api/users/" + id : "/api/users", { method: isEdit ? "PUT" : "POST", body });
    if (result.error) throw new Error(result.error);
    const u = result.user;
    const row = {
      name: u.name, enabled: u.enabled !== false,
      subCount: u.sources.filter(s => s.type === "subscription").length,
      rawCount: u.sources.filter(s => s.type !== "subscription").length,
      updatedAt: u.updatedAt, editedAt: u.editedAt
    };
    const idx = isEdit ? state.users.findIndex(x => x.id === id) : -1;
    if (idx !== -1) state.users[idx] = { ...state.users[idx], ...row };
    else if (!isEdit) state.users.push({ id: u.id, createdAt: u.createdAt, ...row });
    closeModal();
    if (result.invalidSources && result.invalidSources.length) {
      showToast(result.invalidSources.length + " line(s) skipped — invalid format");
    } else {
      showToast(isEdit ? "User saved" : "User added");
    }
  } catch (e) {
    showUserEditorError(e.message === "name_required" ? "Enter a user name." : e.message);
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
    state.editingUserNodeIds = (data.user.nodeIds || []).filter(nid =>
      state.nodes.some(n => n.id === nid && n.enabled !== false)
    );
    state.modal = "userEditor";
    render();
    recheckEditorNodes();
  } catch (e) {
    showToast(e.message);
  }
}
`;
