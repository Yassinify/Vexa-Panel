export const NODE_PICKER_SCRIPT = `
// ---------------------------------------------------------------------
// NODE PICKER — used inside the userEditor modal. A label row (title and
// the count of selected Nodes), the selected Nodes as a bordered list (status
// dot, name, Remove icon button) and the Available Nodes as pill buttons.
// Available excludes anything already
// selected and any disabled/deleted Node. state.editingUserNodeIds only
// ever holds ids of Nodes that are currently enabled and still exist
// (filtered on load in openUserEditor/openUser), so no extra filtering
// is needed here beyond excluding what's already selected.
// ---------------------------------------------------------------------
function renderNodePicker() {
  const selected = state.editingUserNodeIds
    .map(id => state.nodes.find(n => n.id === id))
    .filter(Boolean);
  const available = state.nodes.filter(n => n.enabled !== false && !state.editingUserNodeIds.includes(n.id));
  const countPill = state.nodes.length ? \`<span class="field-count">\${selected.length} selected</span>\` : "";
  return \`
    <div class="field-group" id="nodePicker">
      <div class="field-head"><span class="field-label">Nodes</span>\${countPill}</div>
      \${selected.length ? \`
        <div class="node-list">
          \${selected.map(n => \`
            <div class="node-list-item"><span class="status-dot ok"></span><span class="node-list-name">\${escapeHtml(n.name)}</span><button type="button" class="icon-btn" data-tip="Remove node" aria-label="Remove node \${escapeHtml(n.name)}" onclick="removeNodeFromUser('\${n.id}')">\${icon("xMark")}</button></div>
          \`).join("")}
        </div>
      \` : ""}
      \${available.length ? \`
        <div class="node-pills">
          \${available.map(n => \`<button type="button" class="btn-secondary btn-sm node-pill" aria-label="Add node \${escapeHtml(n.name)}" onclick="addNodeToUser('\${n.id}')">\${icon("plus")}<span class="node-pill-name">\${escapeHtml(n.name)}</span></button>\`).join("")}
        </div>
      \` : (selected.length ? '<div class="field-hint">All available nodes are selected.</div>' : "")}
      \${state.nodes.length === 0 ? (state.nodesLoaded ? '<div class="helper-text">No nodes yet — create one from the Nodes section.</div>' : '<div class="helper-text">Loading nodes…</div>') : ""}
    </div>
  \`;
}

function addNodeToUser(nodeId) {
  state.editingUserNodeIds.push(nodeId);
  render();
}

function removeNodeFromUser(nodeId) {
  state.editingUserNodeIds = state.editingUserNodeIds.filter(id => id !== nodeId);
  render();
}
`;
