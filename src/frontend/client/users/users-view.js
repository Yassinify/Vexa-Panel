export const USERS_VIEW_SCRIPT = `
// ---------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------
// Sorts a list with a stable sort; descending flips the comparator instead of reversing the result, so rows
// whose values are equal always keep the order they have in the list (shared by Users and Nodes).
function sortRows(list, compare, dir) {
  const sign = dir === "desc" ? -1 : 1;
  return [...list].sort((a, b) => sign * compare(a, b));
}

// Sorts the Users table: Name compares as text (case-insensitive, numbers in order), the
// date columns compare as numbers (a missing date counts as 0). Equal values keep their
// current order (setUsersSort() stores the displayed order first), so a click that has nothing to
// rearrange changes no row.
function sortedUsers() {
  const { key, dir } = state.usersSort;
  const compare = key === "name"
    ? (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })
    : (a, b) => (a[key] || 0) - (b[key] || 0);
  return sortRows(state.users, compare, dir);
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

// Set while the old rows of a sort click are fading out; a click during that time only changes the sort state.
let sortExitPending = false;

// Redraws the table after a sort click (state.usersSort or state.nodesSort is already changed). The old rows first
// fade out while still in place, with the enter motion backwards (fade and 6px slide, 160ms); when they have
// finished, the table is rendered in the new order and its rows play the enter motion (rows-sorted). With no rows,
// no Web Animations API or reduced motion the redraw is immediate. A click during the exit only changes the
// state: the pending redraw renders the latest order.
function renderSorted() {
  if (sortExitPending) return;
  const rows = [...document.querySelectorAll("#view .data-table tbody tr[data-row-id]")];
  const noMotion = !rows.length || !rows[0].animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const redraw = () => {
    sortExitPending = false;
    animateSortRows = true;
    render();
    animateSortRows = false;
  };
  if (noMotion) { redraw(); return; }
  sortExitPending = true;
  Promise.allSettled(rows.map(row => {
    // A row that is still fading in starts from its current opacity, so it does not pop.
    const from = Number(getComputedStyle(row).opacity);
    return row.animate(
      [{ opacity: isNaN(from) ? 1 : from, transform: "none" }, { opacity: 0, transform: "translateY(6px)" }],
      { duration: 160, easing: "ease-in", fill: "forwards" }
    ).finished;
  })).then(redraw);
}

// A new column starts ascending; the same column flips its direction. The displayed order is stored first,
// so rows with equal values stay where they are.
function setUsersSort(key) {
  const current = state.usersSort;
  state.users = sortedUsers();
  state.usersSort = { key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" };
  renderSorted();
}

// Date cell: the date text is a focusable span; hover or focus (a tap on a phone) opens, after a short delay, the one
// tooltip (#dateTip) with the full date. No native title, so two tooltips never show.
function dateCell(ts) {
  return \`<td class="timestamp"><span class="date-target" tabindex="0" aria-describedby="dateTip" data-tip="\${escapeHtml(formatDateTooltip(ts))}" onmouseenter="scheduleDateTip(this)" onmouseleave="hideDateTip()" onfocus="scheduleDateTip(this)" onblur="hideDateTip()">\${formatDate(ts)}</span></td>\`;
}

// How long the pointer (or a phone tap) must stay on a date before its tooltip opens, so the
// tooltip does not flash while the pointer crosses the table.
const DATE_TIP_DELAY_MS = 500;
// At 760px and below (the compact layout) the wait is shorter; the same two values as --tip-delay (styles/modals.js).
const DATE_TIP_DELAY_COMPACT_MS = 350;
let dateTipTimer = null;

// Waits DATE_TIP_DELAY_MS (DATE_TIP_DELAY_COMPACT_MS on a compact screen), then opens the tooltip. A new date restarts
// the wait, and hideDateTip() cancels it. The target may have been redrawn away during the wait, so it is checked first.
function scheduleDateTip(target) {
  clearTimeout(dateTipTimer);
  const delay = window.matchMedia("(max-width: 760px)").matches ? DATE_TIP_DELAY_COMPACT_MS : DATE_TIP_DELAY_MS;
  dateTipTimer = setTimeout(() => {
    if (target.isConnected) showDateTip(target);
  }, delay);
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
  tip.classList.remove("closing");
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

// Closing plays the exit animation: .open becomes .closing, which keeps the tooltip (and its .below) on
// screen while the CSS fades it out, then both are removed. With no animation (reduced motion) it hides at
// once. A tooltip that is not open is left alone, because this also runs on every scroll event. A new
// tooltip cancels a running exit (showDateTip() removes .closing), so it opens at once.
function hideDateTip() {
  clearTimeout(dateTipTimer); // also cancels a tooltip that is still waiting to open
  const tip = document.getElementById("dateTip");
  if (!tip || !tip.classList.contains("open")) return;
  tip.classList.remove("open");
  tip.classList.add("closing");
  if (getComputedStyle(tip).animationName === "none") {
    tip.classList.remove("closing", "below");
    return;
  }
  const finish = e => {
    if (e.target !== tip) return;
    tip.removeEventListener("animationend", finish);
    // Skipped when a tooltip opened again meanwhile (showDateTip() already removed .closing).
    if (tip.classList.contains("closing")) tip.classList.remove("closing", "below");
  };
  tip.addEventListener("animationend", finish);
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
          <button class="btn-secondary btn-sm link-btn" onclick="openMerge('\${u.id}')">\${icon("link")}\${buttonSwap("Link")}</button>
          \${rowMenu([
            { label: "Edit", icon: "pencil", onclick: "openUser('" + u.id + "')" },
            { label: u.enabled ? "Disable" : "Enable", icon: u.enabled ? "pauseCircle" : "playCircle", onclick: "toggleUserEnabled('" + u.id + "')" },
            { label: "Delete", icon: "trash", onclick: "askDeleteUser('" + u.id + "')", danger: true }
          ])}
        </div>
      </td>
    </tr>
  \`;
}

function renderUsersView() {
  // Page title (R90) with its lead line, placed in the toolbar row next to the
  // "+ Add user" button as in the reference.
  const pageTitle = \`
    <div>
      <h2>Users</h2>
      <p class="lead">Manage your users and their access.</p>
    </div>
  \`;
  // Ordered by the header the admin picked (state.usersSort); the default is
  // newest created first, as in the reference (R115).
  const ordered = sortedUsers();

  const rows = ordered.map(renderUserRow).join("");

  // A failed load is shown as a toast by navigate().
  // With no users (and no load running) only the title and a centered, larger Add button show:
  // no table, no empty-state text and no icon. The button returns to the toolbar with the first user.
  if (!state.loading && state.users.length === 0) {
    return \`
      <div class="toolbar">
        \${pageTitle}
      </div>
      <div class="empty-add">
        <button class="btn-primary" onclick="openUserEditor()">+ Add user</button>
      </div>
    \`;
  }

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
        <tbody>\${rows}</tbody>
      </table>
      </div>
      <div class="date-tip" id="dateTip" role="tooltip"></div>
    </div>
  \`;
}
`;
