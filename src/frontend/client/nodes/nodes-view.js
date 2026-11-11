export const NODES_VIEW_SCRIPT = `
// ---------------------------------------------------------------------
// NODES — reusable Name+Source pairs assignable to any User. Node CRUD
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
// column, not the stored type name), Created at compares as a number (a missing date counts as 0). It sorts ascending
// from the API order (oldest first), then reverses for descending, so the
// default (created, descending) is exactly the reversed API list.
function sortedNodes() {
  const { key, dir } = state.nodesSort;
  const textOf = { name: (n) => n.name, type: (n) => nodeTypeLabel(n.source.type) }[key];
  const compare = textOf
    ? (a, b) => textOf(a).localeCompare(textOf(b), undefined, { sensitivity: "base", numeric: true })
    : (a, b) => (a[key] || 0) - (b[key] || 0);
  const sorted = [...state.nodes].sort(compare);
  return dir === "desc" ? sorted.reverse() : sorted;
}

// Sortable header cell: the label plus an up-arrow and a down-arrow. On the sorted column
// the arrow of the current direction is highlighted (class "on").
function nodeSortHeader(key, label) {
  const active = state.nodesSort.key === key;
  const dir = state.nodesSort.dir;
  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";
  return \`<th aria-sort="\${ariaSort}"><button type="button" class="sort-btn" onclick="setNodesSort('\${key}')">\${label}<span class="sort-arrows">\${icon("arrowUp", active && dir === "asc" ? "on" : "")}\${icon("arrowDown", active && dir === "desc" ? "on" : "")}</span></button></th>\`;
}

// A new column starts ascending; the same column flips its direction. animateSortRows (users-view.js)
// plays the row entrance animation once for the render that follows the click.
function setNodesSort(key) {
  const current = state.nodesSort;
  state.nodesSort = { key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" };
  animateSortRows = true;
  render();
  animateSortRows = false;
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
            { label: "Edit", icon: "pencilSquare", onclick: "openNode('" + n.id + "')" },
            { label: n.enabled ? "Disable" : "Enable", icon: n.enabled ? "noSymbol" : "checkCircle", onclick: "toggleNodeEnabled('" + n.id + "')" },
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

  // While the data loads the table body stays empty, as in the reference (no
  // skeleton, R125); a failed load is shown as a toast by navigate().
  const emptyRow = state.loading ? "" : '<tr><td colspan="6">No nodes yet. Add your first node.</td></tr>';

  // Page title and lead line (R90) sit in the toolbar row next to the
  // "+ Add node" button, as in the reference.
  return \`
    <div class="toolbar">
      <div>
        <h2>Nodes</h2>
        <p class="lead" style="margin:4px 0 0">Servers that deliver your subscriptions.</p>
      </div>
      <button class="btn-primary btn-sm" onclick="openNodeEditor()">+ Add node</button>
    </div>
    <div class="card">
      <div class="table-wrap">
      <table class="data-table\${state.animateRows ? " rows-animate" : ""}\${animateSortRows ? " rows-sorted" : ""}">
        <thead><tr>\${nodeSortHeader("name", "Name")}\${nodeSortHeader("type", "Type")}\${nodeSortHeader("createdAt", "Created at")}\${nodeSortHeader("updatedAt", "Updated at")}\${nodeSortHeader("editedAt", "Edited at")}<th></th></tr></thead>
        <tbody>\${rows || emptyRow}</tbody>
      </table>
      </div>
      <div class="date-tip" id="dateTip" role="tooltip"></div>
    </div>
  \`;
}

function openNodeEditor() {
  state.editingNode = null;
  state.editingNodeSource = "";
  state.modal = "nodeEditor";
  render();
}
`;
