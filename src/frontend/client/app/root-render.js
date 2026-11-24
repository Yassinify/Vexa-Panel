export const ROOT_RENDER_SCRIPT = `
// ---------------------------------------------------------------------
// ROOT RENDER
// ---------------------------------------------------------------------
// Modal layer open and close (#md). The CSS in styles/modals.js animates both.
// Opening: .show plays the overlay fade; .opening lets the card slide in once and
// is removed when the animation ends, so a later rewrite of the markup does not
// replay it. Closing: .show becomes .closing, the old markup stays in place while
// the exit animation plays, then the layer is emptied. With no animation (reduced
// motion) both steps finish at once.
function openModalLayer(layer, wasOpen) {
  layer.classList.remove("closing");
  layer.classList.add("show");
  if (wasOpen) return;
  layer.classList.add("opening");
  if (getComputedStyle(layer).animationName === "none") {
    layer.classList.remove("opening");
    return;
  }
  const done = e => {
    if (e.target !== layer) return;
    layer.removeEventListener("animationend", done);
    layer.classList.remove("opening");
  };
  layer.addEventListener("animationend", done);
}
function closeModalLayer(layer) {
  layer.classList.remove("show", "opening");
  layer.classList.add("closing");
  const clear = () => {
    layer.classList.remove("closing");
    layer.innerHTML = "";
    layer._html = "";
  };
  if (getComputedStyle(layer).animationName === "none") {
    clear();
    return;
  }
  const finish = e => {
    if (e.target !== layer) return;
    layer.removeEventListener("animationend", finish);
    // A modal opened again in the meantime keeps its new markup.
    if (layer.classList.contains("closing")) clear();
  };
  layer.addEventListener("animationend", finish);
}

// Easing of the view enter: the --spring-soft curve from styles/tokens.js, shared with the theme toggle.
// A browser without linear() support falls back to ease-out.
function viewEnterEasing() {
  const spring = getComputedStyle(document.documentElement).getPropertyValue("--spring-soft").trim();
  return spring && window.CSS && CSS.supports("animation-timing-function", spring) ? spring : "ease-out";
}

// View change exit. The old view is copied into an inert clone that sits over #view in the same grid cell
// (.view-stack, styles/app-shell.js) and plays a quick fade-out with a 6px slide down (200ms), then is
// removed. The new view is rendered at once, so nothing waits for the exit: data loads and the modal layer are
// not delayed. The clone starts at the view's current opacity and position, so a view that is still entering does not pop.
// Only the clone's root id is dropped. Inner ids stay: the clone comes after #view in the DOM, so
// getElementById still finds the real elements first, and SVG references such as the growth chart gradient
// keep resolving. Nothing plays under reduced motion.
function playViewExit(view) {
  if (!view.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const style = getComputedStyle(view);
  const from = Number(style.opacity);
  const fromTransform = style.transform;
  const ghost = view.cloneNode(true);
  ghost.removeAttribute("id");
  ghost.classList.add("view-exit");
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  view.after(ghost);
  const exit = ghost.animate(
    [{ opacity: isNaN(from) ? 1 : from, transform: fromTransform || "none" }, { opacity: 0, transform: "translateY(6px)" }],
    { duration: 200, easing: "ease-in", fill: "forwards" }
  );
  exit.onfinish = exit.oncancel = () => ghost.remove();
}

function render() {
  const app = document.getElementById("app");
  if (state.view === "login") {
    app.innerHTML = renderLoginView();
    const submit = state.authInitialized === false ? doCreateAccount : doLogin;
    document.getElementById("loginPassword")?.addEventListener("keydown", e => {
      if (e.key === "Enter") submit();
    });
    document.getElementById("loginPasswordConfirm")?.addEventListener("keydown", e => {
      if (e.key === "Enter") submit();
    });
    return;
  }
  // Mount the persistent frame once; later renders only rewrite #view.
  if (!document.getElementById("view")) app.innerHTML = renderShellFrame();
  syncShellFrame();
  const view = document.getElementById("view");
  // A view change (not the first render after login or page load, where #view is new) copies the old
  // content into an exit clone before it is replaced below.
  if (view._shown !== undefined && view._shown !== state.view) playViewExit(view);
  if (state.view === "dashboard") {
    view.innerHTML = renderDashboardView();
    // Count the stat numbers up once per newly loaded state.stats (each load stores a new
    // object); a re-render of the same data does not replay it. The cards exist only when
    // the data is loaded, as in renderDashboardView().
    if (!state.loading && state.stats && view._countedStats !== state.stats) {
      view._countedStats = state.stats;
      animateStatNumbers();
    }
  }
  else if (state.view === "users") { view.innerHTML = renderUsersView(); }
  else if (state.view === "nodes") { view.innerHTML = renderNodesView(); }
  else if (state.view === "log") { view.innerHTML = renderLogView(); }
  else if (state.view === "settings") { view.innerHTML = renderSettingsView(); }
  // A view change (a tab change, or the first render after login or page load) fades the
  // new view in with a 16px slide up on the spring curve (450ms), once; the old view fades out (playViewExit). Re-renders of
  // the same view do not replay it. Nothing plays under reduced motion.
  if (view._shown !== state.view) {
    view._shown = state.view;
    if (view.animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      view.animate(
        [{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }],
        { duration: 450, easing: viewEnterEasing() }
      );
    }
  }

  // The modal layer is rewritten only when its markup changed, so text typed
  // into an open modal survives a render that leaves the modal as it is.
  const modalLayer = document.getElementById("md");
  const modalHtml = renderModal();
  const wasOpen = modalLayer.classList.contains("show");
  if (modalHtml === "") {
    // Closing: the old markup stays until the exit animation ends (closeModalLayer).
    if (wasOpen) closeModalLayer(modalLayer);
    else if (!modalLayer.classList.contains("closing") && modalLayer._html !== "") {
      modalLayer.innerHTML = "";
      modalLayer._html = "";
    }
  } else {
    if (modalLayer._html !== modalHtml) {
      modalLayer.innerHTML = modalHtml;
      modalLayer._html = modalHtml;
    }
    openModalLayer(modalLayer, wasOpen);
    // The layer is on screen now, so the source boxes can be sized to their text (autoGrowAll() in modals.js): a box that
    // opens with text, or was rebuilt by this render, starts at its rows height until then.
    autoGrowAll();
    // No field is focused when a modal opens: on a phone that would open the keyboard at once.
  }

  // Every render of a view starts at the top of the page. Below 760px the page does not scroll
  // (only .main does), so its scroll position is reset too.
  window.scrollTo(0, 0);
  document.querySelector(".main")?.scrollTo(0, 0);
}

// Redraws like render() but keeps where the page is scrolled. Used by the background refreshes (navigate() in
// shell.js, the tab-focus refresh in app/init.js), which redraw a section the admin is already reading, so the
// page must not jump to the top. The page scroll and the .main scroll (the page does not scroll below 760px)
// are saved before render() and put back after it; a page that became shorter is clamped by the browser.
function renderKeepingPageScroll() {
  const main = document.querySelector(".main");
  const pageTop = window.scrollY;
  const mainTop = main ? main.scrollTop : 0;
  render();
  window.scrollTo(0, pageTop);
  const nextMain = document.querySelector(".main");
  if (nextMain) nextMain.scrollTo(0, mainTop);
}

// ---------------------------------------------------------------------
// IN-PLACE UPDATE (background refresh)
// ---------------------------------------------------------------------
// When a background refresh brings changed data into a section the admin is already looking at, only the parts
// that differ are touched, so nothing else flickers, no hover, focus or open menu is lost and the page keeps its
// scroll. Each patch function returns false when it cannot do its job (the section shows its empty state, or the
// expected elements are missing); refreshViewInPlace() then draws the whole view with renderKeepingPageScroll().

// Users and Nodes tables: updates the rows from list (already in display order) and renderRow. Rows are matched by
// data-row-id: a row with the same markup keeps its element, a changed row is replaced, a new row is inserted at its
// place and a row that is no longer in the list is removed. A row that waits for the server (rowsToggling in
// helpers.js) or holds an open or closing row menu is left as it is for the next refresh, so its status dot animation
// and its menu are not cut off. The markup a row was drawn with is kept in row._html, because the live row gains
// classes and inline styles (an opened menu) that a fresh draw does not have. The date tooltip is hidden when any row
// changes. Returns false when there is no table or the list is empty (the empty state is a different layout).
function patchTableRows(list, renderRow) {
  const tbody = document.querySelector("#view .data-table tbody");
  if (!tbody || list.length === 0) return false;
  const holder = document.createElement("tbody");
  holder.innerHTML = list.map(renderRow).join("");
  const existing = new Map();
  Array.from(tbody.children).forEach(tr => existing.set(tr.dataset.rowId, tr));
  let changed = false;
  let prev = null;
  Array.from(holder.children).forEach(fresh => {
    const id = fresh.dataset.rowId;
    const current = existing.get(id);
    existing.delete(id);
    const html = fresh.outerHTML;
    const busy = Boolean(current) && (rowsToggling.has(id) || Boolean(current.querySelector(".row-menu-popup.open, .row-menu-popup.closing")));
    const same = Boolean(current) && (current._html !== undefined ? current._html === html : current.outerHTML === html);
    const keep = busy || same;
    if (same) current._html = html;
    if (!keep) { fresh._html = html; changed = true; }
    const node = keep ? current : fresh;
    const ref = prev ? prev.nextElementSibling : tbody.firstElementChild;
    if (node !== ref) tbody.insertBefore(node, ref);
    if (current && !keep) current.remove();
    prev = node;
  });
  if (existing.size > 0) changed = true;
  existing.forEach(tr => tr.remove());
  if (changed) hideDateTip();
  return true;
}

// Dashboard: writes the four stat numbers and the change lines into the existing cards, redraws only the growth
// chart SVG when the growth series changed and swaps the Recent activity rows when their records changed. A count-up
// still running is stopped first (the numbers are set to their final values at once) and the stats object is marked as
// counted, so the next full render of the same data does not replay it. Returns false when the cards or the growth
// card are not on the page.
function patchDashboard() {
  const view = document.getElementById("view");
  const s = state.stats;
  const cards = view ? Array.from(view.querySelectorAll(".stat-card")) : [];
  if (!s || state.loading || cards.length !== 4 || !document.getElementById("growthCard")) return false;
  const info = [
    { num: s.totalUsers, prev: usersOneMonthAgo(state.userGrowth), delta: true },
    { num: s.activeUsers },
    { num: s.totalNodes, prev: s.previousTotalNodes, delta: true },
    { num: s.activeNodes }
  ];
  statCountRun++;
  cards.forEach((card, i) => {
    const numEl = card.querySelector(".stat-card-num");
    if (numEl) numEl.textContent = String(info[i].num);
    const deltaEl = card.querySelector(".stat-card-delta");
    if (info[i].delta && deltaEl) {
      const delta = statDelta(info[i].num, info[i].prev);
      deltaEl.className = "stat-card-delta " + delta.kind;
      deltaEl.textContent = delta.text + " vs. last month";
    }
  });
  view._countedStats = s;
  // The chart is redrawn only when the growth series changed. A pending range swap draws the latest data itself
  // (setGrowthRange() in user-growth.js), so nothing is done then and the next refresh checks again.
  const growthCard = document.getElementById("growthCard");
  const growthKey = JSON.stringify(state.userGrowth);
  if (!growthExitPending && growthCard._growthKey !== growthKey) {
    redrawGrowthSvg();
    growthCard._growthKey = growthKey;
  }
  // The Recent activity rows are swapped only when the records changed (compared by data-log-key), so the relative
  // times of unchanged rows are not rewritten.
  const holder = document.createElement("div");
  holder.innerHTML = renderRecentActivity();
  const freshList = holder.querySelector(".activity-list");
  const list = view.querySelector(".activity-list");
  const keysOf = el => JSON.stringify(Array.from(el.querySelectorAll(".log-row")).map(row => row.dataset.logKey));
  if (freshList && list && keysOf(list) !== keysOf(freshList)) {
    hideDateTip();
    list.innerHTML = freshList.innerHTML;
  }
  return true;
}

// Logs page: rows are matched by data-log-key (time and message of the record). When the rows and day labels are the
// same nothing is touched. Otherwise a row that is already on the page keeps its element (and its relative time text),
// new rows and the day labels come from a fresh draw, and rows that left the list (the log keeps 20) are dropped. So
// an event that arrives shows up as one new row at the top. The date tooltip is hidden when the list changes.
// Returns false when the page shows no rows (the empty text is a different layout).
function patchLogList() {
  const list = document.querySelector("#view .log-list");
  if (!list || !list.querySelector(".log-row") || !state.activity.length) return false;
  const holder = document.createElement("div");
  holder.innerHTML = renderLogView();
  const freshList = holder.querySelector(".log-list");
  if (!freshList) return false;
  const keyOf = el => el.classList.contains("log-row") ? el.dataset.logKey : "label:" + el.textContent;
  if (JSON.stringify(Array.from(list.children).map(keyOf)) === JSON.stringify(Array.from(freshList.children).map(keyOf))) return true;
  const existing = new Map();
  list.querySelectorAll(".log-row").forEach(row => existing.set(row.dataset.logKey, row));
  const nodes = Array.from(freshList.children).map(child => {
    const key = child.classList.contains("log-row") ? child.dataset.logKey : null;
    const old = key !== null ? existing.get(key) : null;
    if (!old) return child;
    // One element per record: a second record with the same key gets its fresh row.
    existing.delete(key);
    return old;
  });
  hideDateTip();
  list.replaceChildren(...nodes);
  return true;
}

// Entry point of the background refresh (navigate() in shell.js, the tab-focus refresh in app/init.js): patches the
// section in place, or draws it whole while keeping the scroll when the patch cannot be done.
function refreshViewInPlace(view) {
  let patched = false;
  if (view === "users") patched = patchTableRows(sortedUsers(), renderUserRow);
  else if (view === "nodes") patched = patchTableRows(sortedNodes(), renderNodeRow);
  else if (view === "dashboard") patched = patchDashboard();
  else if (view === "log") patched = patchLogList();
  if (!patched) renderKeepingPageScroll();
}
`;
