export const USERS_VIEW_SCRIPT = `
// ---------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------
// Sorts the Users table: Name compares as text (case-insensitive, numbers in order), the
// date columns compare as numbers (a missing date counts as 0). It sorts ascending from the
// API order, then reverses for descending, so the default (created, descending) is exactly
// the reversed API list.
function sortedUsers() {
  const { key, dir } = state.usersSort;
  const compare = key === "name"
    ? (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })
    : (a, b) => (a[key] || 0) - (b[key] || 0);
  const sorted = [...state.users].sort(compare);
  return dir === "desc" ? sorted.reverse() : sorted;
}

// Sortable header cell: the label plus an up-arrow and a down-arrow. On the sorted column
// the arrow of the current direction is highlighted (class "on").
function sortHeader(key, label) {
  const active = state.usersSort.key === key;
  const dir = state.usersSort.dir;
  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";
  return \`<th aria-sort="\${ariaSort}"><button type="button" class="sort-btn" onclick="setUsersSort('\${key}')">\${label}<span class="sort-arrows">\${icon("arrowUp", active && dir === "asc" ? "on" : "")}\${icon("arrowDown", active && dir === "desc" ? "on" : "")}</span></button></th>\`;
}

// True only while the render that follows a sort click runs, so the rows play their entrance
// animation once (class rows-sorted); other redraws (Enable / Disable, loads) leave it off.
let animateSortRows = false;

// A new column starts ascending; the same column flips its direction.
function setUsersSort(key) {
  const current = state.usersSort;
  state.usersSort = { key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" };
  animateSortRows = true;
  render();
  animateSortRows = false;
}

// Date cell: the date text is a focusable span; hover or focus (a tap on a phone) opens, after a short delay, the one
// tooltip (#dateTip) with the full date. No native title, so two tooltips never show.
function dateCell(ts) {
  return \`<td class="timestamp"><span class="date-target" tabindex="0" aria-describedby="dateTip" data-tip="\${escapeHtml(formatDateTooltip(ts))}" onmouseenter="scheduleDateTip(this)" onmouseleave="hideDateTip()" onfocus="scheduleDateTip(this)" onblur="hideDateTip()">\${formatDate(ts)}</span></td>\`;
}

// How long the pointer (or a phone tap) must stay on a date before its tooltip opens, so the
// tooltip does not flash while the pointer crosses the table.
const DATE_TIP_DELAY_MS = 500;
let dateTipTimer = null;

// Waits DATE_TIP_DELAY_MS, then opens the tooltip. A new date restarts the wait, and hideDateTip()
// cancels it. The target may have been redrawn away during the wait, so it is checked first.
function scheduleDateTip(target) {
  clearTimeout(dateTipTimer);
  dateTipTimer = setTimeout(() => {
    if (target.isConnected) showDateTip(target);
  }, DATE_TIP_DELAY_MS);
}

// Opens the tooltip above the date, or below it when there is no room above. It is position: fixed,
// so the table's scrolling area does not clip it; it is kept inside the screen sideways and its
// arrow (--tip-arrow-x) keeps pointing at the date. The tooltip is shown first so it can be measured.
function showDateTip(target) {
  const tip = document.getElementById("dateTip");
  if (!tip) return;
  // One span per part (weekday, date, time); the " | " in data-tip only separates them and is never shown.
  const parts = target.getAttribute("data-tip").split(" | ");
  tip.textContent = "";
  parts.forEach((text, index) => {
    const part = document.createElement("span");
    part.textContent = text;
    if (parts.length === 3 && index === 0) part.className = "date-tip-day";
    tip.appendChild(part);
  });
  tip.classList.add("open");
  const rect = target.getBoundingClientRect();
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const gap = 12;
  const margin = 8;
  const below = rect.top - height - gap < margin;
  const center = rect.left + rect.width / 2;
  const maxLeft = Math.max(margin, document.documentElement.clientWidth - width - margin);
  const left = Math.min(Math.max(center - width / 2, margin), maxLeft);
  tip.style.left = left + "px";
  tip.style.top = (below ? rect.bottom + gap : rect.top - height - gap) + "px";
  tip.style.setProperty("--tip-arrow-x", Math.min(Math.max(center - left, 14), Math.max(width - 14, 14)) + "px");
  tip.classList.toggle("below", below);
}

// Closing is instant (no exit animation), because the tooltip follows the pointer between dates.
function hideDateTip() {
  clearTimeout(dateTipTimer); // also cancels a tooltip that is still waiting to open
  const tip = document.getElementById("dateTip");
  if (tip) tip.classList.remove("open", "below");
}

// Any scroll (the page, .main or the table) closes the tooltip; scroll does not bubble, so capture.
window.addEventListener("scroll", hideDateTip, true);

// One Users table row. The row carries data-row-id, so toggleRow() (helpers.js) can find it and redraw
// just this row after Enable / Disable. Row actions: the Link button stays in the row (it opens the
// link/QR and merge preview modal); Edit, Enable / Disable and Delete are in the three-dot menu
// (rowMenu() in helpers.js), each with an icon before its label (R111; the icons are Heroicons from
// icons.js). No user name is put into an inline onclick string, so every action passes only the id.
function renderUserRow(u) {
  return \`
    <tr class="row-hover" data-row-id="\${escapeHtml(u.id)}">
      <td><span class="row"><span class="status-dot\${u.enabled ? " ok" : ""}" role="img" aria-label="\${u.enabled ? "Active" : "Inactive"}" title="\${u.enabled ? "Active" : "Inactive"}"></span>\${escapeHtml(u.name)}</span></td>
      \${dateCell(u.createdAt)}
      \${dateCell(u.updatedAt)}
      \${dateCell(u.editedAt)}
      <td>
        <div class="row-actions">
          <button class="btn-secondary btn-sm" onclick="openMerge('\${u.id}')">\${icon("link")}Link</button>
          \${rowMenu([
            { label: "Edit", icon: "pencilSquare", onclick: "openUser('" + u.id + "')" },
            { label: u.enabled ? "Disable" : "Enable", icon: u.enabled ? "noSymbol" : "checkCircle", onclick: "toggleUserEnabled('" + u.id + "')" },
            { label: "Delete", icon: "trash", onclick: "askDeleteUser('" + u.id + "')", danger: true }
          ])}
        </div>
      </td>
    </tr>
  \`;
}

function renderUsersView() {
  // Page title and lead line (R90), placed in the toolbar row next to the
  // "+ Add user" button as in the reference.
  const pageTitle = \`
    <div>
      <h2>Users</h2>
      <p class="lead" style="margin:4px 0 0">Manage your users and their access.</p>
    </div>
  \`;
  // Ordered by the header the admin picked (state.usersSort); the default is
  // newest created first, as in the reference (R115).
  const ordered = sortedUsers();

  const rows = ordered.map(renderUserRow).join("");

  // While the data loads the table body is empty and the user count is left
  // out, as in the reference (no skeleton, R80); a failed load is shown as a
  // toast by navigate().
  const emptyRow = state.loading ? "" : '<tr><td colspan="5">No users yet. Add your first user.</td></tr>';
  const countLine = state.loading ? "" : \`<div class="helper-text table-count">\${ordered.length} \${ordered.length === 1 ? "user" : "users"}</div>\`;

  return \`
    <div class="toolbar">
      \${pageTitle}
      <button class="btn-primary btn-sm" onclick="openUserEditor()">+ Add user</button>
    </div>
    <div class="card">
      <div class="table-wrap">
      <table class="data-table\${state.animateRows ? " rows-animate" : ""}\${animateSortRows ? " rows-sorted" : ""}">
        <thead>
          <tr>
            \${sortHeader("name", "Name")}
            \${sortHeader("createdAt", "Created at")}
            \${sortHeader("updatedAt", "Updated at")}
            \${sortHeader("editedAt", "Edited at")}
            <th aria-label="Actions"></th>
          </tr>
        </thead>
        <tbody>\${rows || emptyRow}</tbody>
      </table>
      </div>
      <div class="date-tip" id="dateTip" role="tooltip"></div>
      \${countLine}
    </div>
  \`;
}
`;
