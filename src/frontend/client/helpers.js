export const HELPERS_SCRIPT = `
// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------
function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

// "YYYY-MM-DD" in the browser's local time; a dash for a missing or invalid value.
function formatDate(ts) {
  const d = new Date(ts);
  if (!ts || isNaN(d.getTime())) return "—";
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// "Thursday | 2026-10-29 | 14:55:13" in the browser's local time (24-hour, with seconds), used as a
// hover tooltip; a dash for a missing or invalid value.
function formatDateTooltip(ts) {
  const d = new Date(ts);
  if (!ts || isNaN(d.getTime())) return "—";
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const time = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, "0")).join(":");
  return weekday + " | " + formatDate(ts) + " | " + time;
}

// Escapes & < > " ' as numeric entities, so the result is safe in both text and attribute values.
function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");
}

// One persistent #toast element: a new message replaces the text and restarts the 1800 ms timer.
// Callers may still pass a second argument; there is no error variant, so it is ignored.
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

// ---------------------------------------------------------------------
// ROW MENU (Users and Nodes Actions)
// ---------------------------------------------------------------------
// The three-dot button of a table row opens a small popup of that row's actions. The popup is
// position: fixed (styles/tables.js), so the table's scrolling area does not clip it; the script
// places it under the button, or above it when there is no room below. Only one menu is open at a
// time. The open state lives in the DOM (class .open and aria-expanded), so a redraw of the view
// closes the menu, as it does for the date tooltip.

// Markup of the three-dot button and its popup. items is [{ label, icon, onclick, danger }]; label and
// onclick are fixed text (an onclick only carries an id, never user text), so they are not escaped.
function rowMenu(items) {
  const list = items.map(it =>
    '<button type="button" class="row-menu-item' + (it.danger ? ' danger' : '') + '" role="menuitem" onclick="closeRowMenus(); ' + it.onclick + '">' + icon(it.icon) + '<span>' + it.label + '</span></button>'
  ).join("");
  return '<div class="row-menu">' +
    '<button type="button" class="btn-secondary btn-sm row-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-label="More actions" onclick="toggleRowMenu(this)">' + icon("more") + '</button>' +
    '<div class="row-menu-popup" role="menu">' + list + '</div>' +
  '</div>';
}

// Closes every open row menu (there is at most one).
function closeRowMenus() {
  document.querySelectorAll(".row-menu-popup.open").forEach(popup => {
    popup.classList.remove("open", "above");
    const button = popup.parentElement.querySelector(".row-menu-btn");
    if (button) button.setAttribute("aria-expanded", "false");
  });
}

// Opens the popup next to its button. It is shown first so it can be measured. Its right edge lines up
// with the button's right edge and it stays inside the screen sideways. It opens below the button, or
// above when it would not fit below (the compact layout's bottom bar counts as the bottom edge).
function openRowMenu(button, popup) {
  popup.classList.add("open");
  button.setAttribute("aria-expanded", "true");
  const rect = button.getBoundingClientRect();
  const width = popup.offsetWidth;
  const height = popup.offsetHeight;
  const gap = 6;
  const margin = 8;
  const bar = document.getElementById("sidebar");
  const barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
  const bottomLimit = barTop > window.innerHeight / 2 ? barTop : window.innerHeight;
  const above = rect.bottom + gap + height > bottomLimit - margin && rect.top - gap - height >= margin;
  const maxLeft = Math.max(margin, document.documentElement.clientWidth - width - margin);
  popup.style.left = Math.min(Math.max(rect.right - width, margin), maxLeft) + "px";
  popup.style.top = (above ? rect.top - gap - height : rect.bottom + gap) + "px";
  popup.classList.toggle("above", above);
}

// The three-dot button: opens its menu, or closes it when it is already open.
function toggleRowMenu(button) {
  const popup = button.parentElement.querySelector(".row-menu-popup");
  if (!popup) return;
  const willOpen = !popup.classList.contains("open");
  closeRowMenus();
  if (willOpen) openRowMenu(button, popup);
}

// A click outside the menu, Escape, any scroll (the page, .main or the table; scroll does not bubble, so
// capture) and a resize close it, because the popup is fixed and would otherwise stay behind.
document.addEventListener("click", e => {
  if (!e.target.closest(".row-menu")) closeRowMenus();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeRowMenus();
});
window.addEventListener("scroll", closeRowMenus, true);
window.addEventListener("resize", closeRowMenus);

// ---------------------------------------------------------------------
// ROW TOGGLE (Users and Nodes Enable / Disable)
// ---------------------------------------------------------------------
// While the server changes a row's enabled state, a border spins around the row and the status dot pulses
// in the color of the target state (styles/tables.js). Nothing is optimistic: the row keeps its old look
// until the server answers, then only that row is redrawn in place, so the page does not jump to the top
// as a full render() would.

// The border spins at least this long, so a fast answer still shows it.
const ROW_TOGGLE_MIN_MS = 800;
// How long the settle ring and the dot turn last; the same as the .6s of their CSS animations.
const ROW_SETTLE_MS = 600;
// Ids of the rows that are waiting for the server; a second click on such a row is ignored.
const rowsToggling = new Set();

// The table row whose data-row-id is id, or null. Compared in script, so no id is put into a selector.
function findTableRow(id) {
  return Array.from(document.querySelectorAll("tr[data-row-id]")).find(tr => tr.dataset.rowId === id) || null;
}

// The spinning border element, put in the row's first cell and positioned against the row by the CSS.
function rowSpinner(className, target) {
  const ring = document.createElement("span");
  ring.className = className + " to-" + target;
  ring.setAttribute("aria-hidden", "true");
  return ring;
}

// Runs one Enable / Disable. id is the row's data-row-id, nextEnabled the state the row is going to,
// request() is async, changes the server and state.users / state.nodes, and throws on a failure, and
// renderRow() returns the markup of the redrawn <tr> from the updated state.
async function toggleRow(id, nextEnabled, request, renderRow) {
  if (rowsToggling.has(id)) return;
  rowsToggling.add(id);
  const target = nextEnabled ? "on" : "off";
  const startRow = findTableRow(id);
  if (startRow) {
    startRow.cells[0].appendChild(rowSpinner("row-spin", target));
    const dot = startRow.querySelector(".status-dot");
    if (dot) dot.classList.add("busy-" + target);
  }
  const startedAt = Date.now();
  try {
    await request();
    const wait = ROW_TOGGLE_MIN_MS - (Date.now() - startedAt);
    if (startRow && wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    redrawToggledRow(id, target, renderRow);
  } catch (e) {
    // A failed request leaves the row as it was: the border and the pulse stop, and the error shows as a toast.
    const row = findTableRow(id);
    if (row) {
      row.querySelectorAll(".row-spin").forEach(ring => ring.remove());
      row.querySelectorAll(".status-dot").forEach(dot => dot.classList.remove("busy-on", "busy-off"));
    }
    showToast(e.message);
  } finally {
    rowsToggling.delete(id);
  }
}

// Replaces the row with its new markup, then plays the settle ring and the dot turn once. When the row is
// not on the page any more (the view changed during the wait) the whole view is redrawn from the state.
function redrawToggledRow(id, target, renderRow) {
  const row = findTableRow(id);
  const html = row ? renderRow() : "";
  if (!html) { render(); return; }
  const holder = document.createElement("template");
  holder.innerHTML = html.trim();
  const fresh = holder.content.firstElementChild;
  row.replaceWith(fresh);
  const ring = rowSpinner("row-spin settle", target);
  fresh.cells[0].appendChild(ring);
  const dot = fresh.querySelector(".status-dot");
  if (dot) dot.classList.add("turn-" + target);
  setTimeout(() => {
    ring.remove();
    if (dot) dot.classList.remove("turn-" + target);
  }, ROW_SETTLE_MS);
}
`;
