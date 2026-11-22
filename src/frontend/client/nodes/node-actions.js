export const NODE_ACTIONS_SCRIPT = `
// Loads what the editor's User Selection needs: the enabled Users to show and, for an existing Node, the ids of the
// Users it is linked to. It never rejects. When the Users or the links cannot be loaded, or the Node is disabled (it
// cannot be turned on for a User, as in the User editor), the section is not available: state.editingNodeUsers and
// state.editingNodeUserIds are null, the section is not drawn and Save sends no userIds, so no link changes. Only a
// full load fills them, so a failed load can never make Save remove links. Returns false when a load failed.
async function loadNodeUserSelection(nodeId, nodeEnabled) {
  state.editingNodeUsers = null;
  state.editingNodeUserIds = null;
  if (nodeEnabled === false) return true;
  try {
    const [usersData, linkData] = await Promise.all([
      apiFetch("/api/users"),
      nodeId ? apiFetch("/api/nodes/" + nodeId + "/users") : Promise.resolve({ userIds: [] })
    ]);
    if (!Array.isArray(usersData.users) || !Array.isArray(linkData.userIds)) return false;
    const enabledUsers = usersData.users.filter(u => u.enabled !== false);
    state.editingNodeUserIds = linkData.userIds.filter(uid => enabledUsers.some(u => u.id === uid));
    // othersCount: the User's enabled Nodes without this one (nodeCount comes from the database, see listUsers()). This
    // Node is enabled here (a disabled Node has no section) and counts in nodeCount only when it is already linked.
    state.editingNodeUsers = enabledUsers.map(u => ({
      ...u,
      othersCount: Math.max(0, (u.nodeCount || 0) - (state.editingNodeUserIds.includes(u.id) ? 1 : 0))
    }));
    return true;
  } catch (e) {
    return false;
  }
}

// Opens the editor from the Node already in the list (the list holds the full source), after the User Selection data
// is loaded, so the modal opens once with complete data and never fills in later. If that data cannot be loaded the
// editor still opens, without the User Selection, and a toast says so.
async function openNode(id) {
  const node = state.nodes.find(n => n.id === id);
  if (!node) return;
  const ok = await loadNodeUserSelection(node.id, node.enabled);
  // A 401 during the load signed the admin out (apiFetch()): the login page shows, so no editor opens over it.
  if (!state.token) return;
  state.editingNode = node;
  state.editingNodeSource = (node.source && (node.source.value || node.source.url)) || "";
  state.modal = "nodeEditor";
  render();
  if (!ok) showToast("Users could not be loaded");
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
  // userIds is sent only when the User Selection was loaded (a null list means it was not available), so a Save can
  // never remove links it did not show.
  const payload = { name, source, ...(state.editingNodeUserIds ? { userIds: state.editingNodeUserIds } : {}) };
  try {
    const result = isEdit
      ? await apiFetch("/api/nodes/" + state.editingNode.id, { method: "PUT", body: JSON.stringify(payload) })
      : await apiFetch("/api/nodes", { method: "POST", body: JSON.stringify(payload) });

    if (result.error === "duplicate_name") {
      showNodeEditorError("A node with this name already exists.");
      return;
    }
    if (result.error) {
      showNodeEditorError("Could not save node - check the source format.");
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

// Enable / Disable from the row menu, as for users (R123). toggleRow() (helpers.js) animates the status dot
// while the server answers (nothing is optimistic) and then redraws only that row from renderNodeRow(),
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
