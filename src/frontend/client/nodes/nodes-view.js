export const NODES_VIEW_SCRIPT = `
// ---------------------------------------------------------------------
// NODES - reusable Name+Source pairs assignable to any User. Node CRUD
// mirrors the Users list/edit pattern above; the Node picker used inside
// the userEditor modal lives further down alongside that modal.
// ---------------------------------------------------------------------
// The source kind shown in the Type column (R106, R123). The names match the User editor's source
// preview (sourcePreview() in user-editor.js); an unknown type falls back to its capitalized name.
const NODE_TYPE_LABELS = { raw: "Link", subscription: "Subscription", json: "JSON", yaml: "YAML" };
function nodeTypeLabel(type) {
  const text = String(type || "");
  return NODE_TYPE_LABELS[text] || text.charAt(0).toUpperCase() + text.slice(1);
}

// Sorts the Nodes table: Name and Type compare as text (case-insensitive, numbers in order; Type by the label shown in the
// column, not the stored type name), the date columns compare as numbers (a missing date counts as 0). Equal values keep
// their current order (setNodesSort() stores the displayed order first), so a click that has nothing to rearrange
// (for example every Type is the same) changes no row. sortRows() is in users-view.js.
function sortedNodes() {
  const { key, dir } = state.nodesSort;
  const textOf = { name: (n) => n.name, type: (n) => nodeTypeLabel(n.source.type) }[key];
  const compare = textOf
    ? (a, b) => textOf(a).localeCompare(textOf(b), undefined, { sensitivity: "base", numeric: true })
    : (a, b) => (a[key] || 0) - (b[key] || 0);
  return sortRows(state.nodes, compare, dir);
}

// Sortable header cell: the label plus an up-arrow and a down-arrow. On the sorted column
// the arrow of the current direction is highlighted (class "on").
function nodeSortHeader(key, label) {
  const active = state.nodesSort.key === key;
  const dir = state.nodesSort.dir;
  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";
  return \`<th aria-sort="\${ariaSort}"><button type="button" class="sort-btn" onclick="setNodesSort('\${key}')">\${label}<span class="sort-arrows">\${icon("arrowUp", active && dir === "asc" ? "on" : "")}\${icon("arrowDown", active && dir === "desc" ? "on" : "")}</span></button></th>\`;
}

// A new column starts ascending; the same column flips its direction. The displayed order is stored first, so rows
// with equal values stay where they are. renderSorted() (users-view.js) fades the old
// rows out, then redraws the table and plays the row entrance animation once.
function setNodesSort(key) {
  const current = state.nodesSort;
  state.nodes = sortedNodes();
  state.nodesSort = { key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" };
  renderSorted();
}

// One Nodes table row. The row carries data-row-id, so toggleRow() (helpers.js) can find it and redraw
// just this row after Enable / Disable. Row actions are all in the three-dot menu (rowMenu() in
// helpers.js), each with an icon before its label (R124; the icons are Heroicons from icons.js): Edit
// opens the editor at once from the listed Node. Enable/Disable replaces the old switch (R123). Delete
// asks first, then removes the node. Only the id goes into the inline handlers.
function renderNodeRow(n) {
  return \`
    <tr class="row-hover" data-row-id="\${escapeHtml(n.id)}">
      <td><span class="row"><span class="status-dot\${n.enabled ? " ok" : ""}" role="img" aria-label="\${n.enabled ? "Active" : "Inactive"}" title="\${n.enabled ? "Active" : "Inactive"}"></span>\${escapeHtml(n.name)}</span></td>
      <td>\${escapeHtml(nodeTypeLabel(n.source.type))}</td>
      \${dateCell(n.createdAt)}
      \${dateCell(n.updatedAt)}
      \${dateCell(n.editedAt)}
      <td>
        <div class="row-actions">
          \${rowMenu([
            { label: "Edit", icon: "pencil", onclick: "openNode('" + n.id + "')" },
            { label: n.enabled ? "Disable" : "Enable", icon: n.enabled ? "pauseCircle" : "playCircle", onclick: "toggleNodeEnabled('" + n.id + "')" },
            { label: "Delete", icon: "trash", onclick: "askDeleteNode('" + n.id + "')", danger: true }
          ])}
        </div>
      </td>
    </tr>
  \`;
}

function renderNodesView() {
  // Ordered by the header the admin picked (state.nodesSort); the default is
  // newest created first, as in the reference (R115).
  const ordered = sortedNodes();

  const rows = ordered.map(renderNodeRow).join("");

  // A failed load is shown as a toast by navigate().
  // Page title (R90) with its lead line; it sits in the toolbar row next to the
  // "+ Add node" button, as in the reference.
  const pageTitle = \`
    <div>
      <h2>Nodes</h2>
      <p class="lead">Servers that deliver your subscriptions.</p>
    </div>
  \`;

  // With no nodes (and no load running) only the title and a centered, larger Add button show:
  // no table, no empty-state text and no icon. The button returns to the toolbar with the first node.
  if (!state.loading && state.nodes.length === 0) {
    return \`
      <div class="toolbar">
        \${pageTitle}
      </div>
      <div class="empty-add">
        <button class="btn-primary" onclick="openNodeEditor()">+ Add node</button>
      </div>
    \`;
  }

  return \`
    <div class="toolbar">
      \${pageTitle}
      <button class="btn-primary btn-sm" onclick="openNodeEditor()">+ Add node</button>
    </div>
    <div class="card">
      <div class="table-wrap">
      <table class="data-table\${state.animateRows ? " rows-animate" : ""}\${animateSortRows ? " rows-sorted" : ""}">
        <thead><tr>\${nodeSortHeader("name", "Name")}\${nodeSortHeader("type", "Type")}\${nodeSortHeader("createdAt", "Created at")}\${nodeSortHeader("updatedAt", "Updated at")}\${nodeSortHeader("editedAt", "Edited at")}<th></th></tr></thead>
        <tbody>\${rows}</tbody>
      </table>
      </div>
      <div class="date-tip" id="dateTip" role="tooltip"></div>
    </div>
  \`;
}

// Add node: loads the Users for the editor's User Selection first (loadNodeUserSelection() in node-actions.js), then
// opens the editor once. If they cannot be loaded the editor still opens, without the User Selection.
async function openNodeEditor() {
  const ok = await loadNodeUserSelection(null, true);
  if (!state.token) return; // signed out by a 401 during the load
  state.editingNode = null;
  state.editingNodeSource = "";
  state.modal = "nodeEditor";
  render();
  if (!ok) showToast("Users could not be loaded", "error");
}
`;
