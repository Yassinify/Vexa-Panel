export const NODE_ACTIONS_SCRIPT = `
// Opens the editor at once from the Node already in the list; the list holds the full source,
// so nothing is requested and nothing fills in later.
function openNode(id) {
  const node = state.nodes.find(n => n.id === id);
  if (!node) return;
  state.editingNode = node;
  state.editingNodeSource = (node.source && (node.source.value || node.source.url)) || "";
  state.modal = "nodeEditor";
  render();
}

// Writes into the modal's error line (R129); typed data stays in the open modal.
function showNodeEditorError(msg) {
  const el = document.getElementById("nodeEditorError");
  if (el) el.textContent = msg;
}

// Waits for the server with the modal open; the modal closes only on success.
async function saveNode() {
  const isEdit = state.editingNode && state.editingNode.id;
  const name = document.getElementById("nodeNameInput").value.trim();
  if (!name) { showNodeEditorError("Enter a node name."); return; }
  const source = document.getElementById("nodeSourceInput").value.trim();
  if (!source) { showNodeEditorError("Enter a node source."); return; }
  showNodeEditorError("");
  try {
    const result = isEdit
      ? await apiFetch("/api/nodes/" + state.editingNode.id, { method: "PUT", body: JSON.stringify({ name, source }) })
      : await apiFetch("/api/nodes", { method: "POST", body: JSON.stringify({ name, source }) });

    if (result.error === "duplicate_name") {
      showNodeEditorError("A node with this name already exists.");
      return;
    }
    if (result.error) {
      showNodeEditorError("Could not save node — check the source format.");
      return;
    }

    if (isEdit) {
      const idx = state.nodes.findIndex(n => n.id === result.node.id);
      if (idx !== -1) state.nodes[idx] = result.node; else state.nodes.push(result.node);
    } else {
      state.nodes.push(result.node);
    }
    closeModal();
    showToast(isEdit ? "Node saved" : "Node added");
  } catch (e) {
    // Request failed: keep the modal open so the entered values are not lost.
    showNodeEditorError(e.message);
  }
}

// Opens the delete popup (modals.js); the delete itself runs from the popup's Delete button (R130).
function askDeleteNode(id) {
  state.modal = "confirmDelete";
  state.confirmDelete = { kind: "node", id };
  render();
}

// Waits for the server with the popup open. On success the popup closes and the Nodes list
// shows again (R130); a failure shows its message in the popup's error line.
async function performDeleteNode(id) {
  try {
    const result = await apiFetch("/api/nodes/" + id, { method: "DELETE" });
    if (result.error) throw new Error(result.error);
    state.nodes = state.nodes.filter(n => n.id !== id);
    closeModal();
    showToast("Node deleted");
  } catch (e) {
    showDeleteError(e.message);
  }
}

// Enable / Disable from the row menu, as for users (R123). toggleRow() (helpers.js) spins a border around the
// row while the server answers (nothing is optimistic) and then redraws only that row from renderNodeRow(),
// so the page keeps its scroll position. A failed request shows its message as a toast and leaves the row.
async function toggleNodeEnabled(id) {
  const node = state.nodes.find(n => n.id === id);
  if (!node) return;
  const nextEnabled = !node.enabled;
  await toggleRow(id, nextEnabled, async () => {
    const result = await apiFetch("/api/nodes/" + id, { method: "PUT", body: JSON.stringify({ enabled: nextEnabled }) });
    if (result.error) throw new Error(result.error);
    const idx = state.nodes.findIndex(n => n.id === id);
    if (idx !== -1) state.nodes[idx] = result.node;
  }, () => {
    const updated = state.nodes.find(n => n.id === id);
    return updated ? renderNodeRow(updated) : "";
  });
}
`;
