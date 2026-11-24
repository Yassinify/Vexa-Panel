import { VEXA_VERSION } from "../../constants.js";
import { GITHUB_MARK_PATH } from "../../pages/d1-setup.js";

// Project page: the version label links to it and its popup shows the name.
const GITHUB_REPO_URL = "https://github.com/Yassinify/Vexa-Panel";
const GITHUB_REPO_NAME = "Yassinify / Vexa Panel";

export const SHELL_SCRIPT = `
// ---------------------------------------------------------------------
// SHELL: sidebar + topbar
// ---------------------------------------------------------------------
// Theme: a plain string under vexa_theme (the inline script in
// pages/app-shell.js reads the same key), applied as data-theme on <html>.
function applyTheme(theme) {
  const root = document.documentElement;
  const changed = root.dataset.theme !== theme;
  // A changed theme crossfades through the browser's view transition (about
  // 0.25s). The startup call (theme already applied by the inline script),
  // browsers without the API and reduced motion switch at once.
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The toggle's look follows data-theme through CSS. The script only keeps aria-checked in
  // step and squashes the knob on a real change, inside the same step as the theme itself.
  const change = () => {
    root.dataset.theme = theme;
    syncThemeToggle(changed && !reduceMotion);
  };
  if (document.startViewTransition && !reduceMotion && changed) document.startViewTransition(change);
  else change();
  try { localStorage.setItem("vexa_theme", theme); } catch (e) {}
}
// Keeps the toggle in step with the theme. The button does not exist yet when the startup
// call runs; themeToggleMarkup() reads the theme itself when the frame is mounted.
function syncThemeToggle(squash) {
  const btn = document.getElementById("themeBtn");
  if (!btn) return;
  btn.setAttribute("aria-checked", document.documentElement.dataset.theme === "light" ? "false" : "true");
  const knob = btn.querySelector(".tt-knob");
  // Squash and stretch while the knob travels (the slide itself is a CSS transition on .tt-knob-track).
  if (squash && knob && knob.animate) {
    knob.animate(
      [
        { transform: "scale(1, 1)" },
        { transform: "scale(1.14, .88)", offset: .25 },
        { transform: "scale(.94, 1.06)", offset: .55 },
        { transform: "scale(1.02, .98)", offset: .75 },
        { transform: "scale(1, 1)" }
      ],
      { duration: 800, easing: "ease-out" }
    );
  }
}
function toggleTheme() {
  // .tt-touched lets the halo ripple play (styles/theme-toggle.js), so it never plays on page load.
  document.getElementById("themeBtn")?.classList.add("tt-touched");
  applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
}

// Day/night toggle markup for the topbar (the CSS is in styles/theme-toggle.js). Built with the frame;
// the look follows data-theme through CSS. The star shapes are about twice the reference size,
// which would be sub-pixel at this width.
function themeToggleMarkup() {
  const night = document.documentElement.dataset.theme !== "light";
  const sparkle = '<path d="M0 -1 Q0.12 -0.12 1 0 Q0.12 0.12 0 1 Q-0.12 0.12 -1 0 Q-0.12 -0.12 0 -1Z"/>';
  // x, y, scale, twinkle seconds
  const sparkles = [[70, 70, 14, 3.2], [160, 92, 10, 2.6], [232, 72, 12, 3.8], [250, 160, 16, 3.1], [120, 175, 10, 2.9]];
  // x, y, radius, twinkle seconds
  const dots = [[48, 130, 4.8, 2.2], [110, 40, 3.6, 2.7], [200, 130, 4.4, 3.4], [296, 108, 3.2, 2.4], [180, 205, 3.6, 3], [82, 205, 3.2, 2.5], [288, 45, 2.8, 3.6]];
  // --i staggers the entry of each star, --t sets its twinkle speed.
  const star = (x, y, scale, i, t, shape) => '<g transform="translate(' + x + " " + y + ") scale(" + scale + ')"><g class="tt-star" style="--i:' + i + ";--t:" + t + 's">' + shape + "</g></g>";
  const stars = sparkles.map((s, i) => star(s[0], s[1], s[2], i, s[3], sparkle)).join("") +
    dots.map((d, i) => star(d[0], d[1], 1, i + sparkles.length, d[3], '<circle r="' + d[2] + '"/>')).join("");
  // Cloud layers from back to front: a cluster of circles each (cx, cy, r).
  const cloud = (n, circles) => '<svg class="tt-cloud tt-cloud-' + n + '" viewBox="0 0 530 243" aria-hidden="true"><g fill="var(--tt-cloud-' + n + ')">' +
    circles.map(c => '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '"/>').join("") + "</g></svg>";
  const clouds =
    cloud(1, [[230, 232, 42], [310, 205, 48], [388, 172, 54], [462, 110, 70], [528, 48, 72], [480, 262, 100], [540, 150, 60]]) +
    cloud(2, [[180, 248, 40], [262, 228, 44], [345, 212, 46], [428, 180, 54], [505, 118, 66], [548, 62, 58], [500, 252, 90]]) +
    cloud(3, [[118, 268, 42], [200, 254, 42], [285, 246, 44], [370, 238, 46], [452, 208, 52], [530, 150, 66], [510, 262, 85]]);
  return '<button type="button" class="theme-toggle" id="themeBtn" role="switch" aria-checked="' + night + '" aria-label="Dark mode" onclick="toggleTheme()">' +
    '<span class="tt-pill"><span class="tt-layer tt-sky-night"></span>' +
    '<svg class="tt-layer tt-stars" viewBox="0 0 530 243" aria-hidden="true">' + stars + "</svg>" +
    '<span class="tt-knob-track"><span class="tt-halo"></span><span class="tt-knob"><span class="tt-sun"></span>' +
    '<span class="tt-moon"><span class="tt-crater tt-c1"></span><span class="tt-crater tt-c2"></span><span class="tt-crater tt-c3"></span></span></span></span>' +
    clouds + "</span></button>";
}

// Version label: a link to the project's GitHub page. Hovering or focusing it
// shows a small popup with the GitHub mark and the project name (CSS only, see
// .version-pop in styles/app-shell.js). Used in the sidebar and the compact topbar.
function versionLink() {
  return '<a class="brand-version" href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer" onclick="dismissVersionPop(this)" onmouseleave="restoreVersionPop(this)" onblur="restoreVersionPop(this, true)" aria-label="Vexa Panel v${VEXA_VERSION} on GitHub">v${VEXA_VERSION}' +
    '<span class="version-pop" role="tooltip"><svg class="version-pop-logo" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${GITHUB_MARK_PATH}</svg>${GITHUB_REPO_NAME}</span></a>';
}

// Version popup after a click: the link opens in a new window while the pointer is still over the label, so :hover
// would keep the popup on screen. A click adds .pop-off (styles/app-shell.js hides the popup at once); the class is
// removed when the pointer or focus leaves the label. A blur caused by the window losing focus (the new window
// opens) is ignored, so the popup does not come back when the user returns with the pointer still over the label.
function dismissVersionPop(link) {
  link.classList.add("pop-off");
}
function restoreVersionPop(link, fromBlur) {
  if (fromBlur && !document.hasFocus()) return;
  link.classList.remove("pop-off");
}

// How long loaded data counts as fresh (ms): a section whose data is younger is shown from memory with no request.
const DATA_FRESH_MS = 30000;

// Where a section's data stands in memory: "none" (never loaded), "fresh" (loaded within DATA_FRESH_MS) or "stale"
// (in memory but older). Settings has no data to load, so it is always "fresh". Dashboard and Logs share the stats.
function viewDataState(view) {
  if (view === "settings") return "fresh";
  const loadedAt = { dashboard: dataLoadedAt.stats, log: dataLoadedAt.stats, users: dataLoadedAt.users, nodes: dataLoadedAt.nodes }[view];
  if (!loadedAt) return "none";
  return Date.now() - loadedAt < DATA_FRESH_MS ? "fresh" : "stale";
}

// A string that changes when the data a section shows changes, so a background refresh redraws only on a real
// difference. Lists are compared by id, not by order, because a sort click stores the displayed order in state.
function viewDataSignature(view) {
  const byId = list => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (view === "users") return JSON.stringify(byId(state.users));
  if (view === "nodes") return JSON.stringify(byId(state.nodes));
  if (view === "dashboard" || view === "log") return JSON.stringify([state.stats, state.activity, state.userGrowth]);
  return "";
}

function navigate(view) {
  closeMoreMenu();
  closeAccountMenus();
  state.view = view;
  state.errorMsg = "";
  const path = VIEW_PATHS[view];
  if (path && location.pathname !== path) history.pushState(null, "", path);
  const dataState = viewDataState(view);
  if (dataState === "none") {
    // Nothing in memory yet: draw the loading state, load, then draw the result.
    state.loading = true;
    render();
    loadViewData(view)
      // Ignore a stale failure if the user has already moved to another view.
      // A failed load shows its error message as a toast (R112, R125).
      .catch(err => {
        if (state.view !== view) return;
        showToast(err && err.message ? err.message : "Could not load data", "error");
      })
      .finally(() => { state.loading = false; renderAfterLoad(); });
    return;
  }
  // Data in memory: draw it at once, with no loading state.
  state.loading = false;
  render();
  // Fresh data needs no request. Older data is refreshed in the background; if the data changed and the user is still
  // on this view, only the parts that differ are updated in place (refreshViewInPlace() in app/root-render.js).
  // A failed refresh keeps what is shown, with no toast.
  if (dataState === "fresh") return;
  const before = viewDataSignature(view);
  loadViewData(view)
    .then(() => {
      if (state.view === view && viewDataSignature(view) !== before) refreshViewInPlace(view);
    })
    .catch(() => {});
}

// Shared open/close for the More menu and the account menus. Opening adds
// .open (the CSS plays the fade-in). Closing swaps .open for .closing, which
// keeps the popup and its blur on screen while the CSS plays the fade-out,
// then removes .closing. With no animation (reduced motion) it hides at once.
function setPopupOpen(menu, button, open) {
  button.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    menu.classList.remove("closing");
    menu.classList.add("open");
    return;
  }
  if (!menu.classList.contains("open")) return;
  menu.classList.remove("open");
  menu.classList.add("closing");
  if (getComputedStyle(menu).animationName === "none") {
    menu.classList.remove("closing");
    return;
  }
  const finish = e => {
    if (e.target !== menu) return;
    menu.removeEventListener("animationend", finish);
    menu.classList.remove("closing");
  };
  menu.addEventListener("animationend", finish);
}

// More menu (compact bottom bar). Its open state lives in the DOM (class
// .open and aria-expanded), because the frame is mounted once and render()
// does not redraw the sidebar.
function setMoreMenuOpen(open) {
  const menu = document.getElementById("moreMenu");
  const button = document.getElementById("moreBtn");
  if (!menu || !button) return;
  setPopupOpen(menu, button, open);
}
function toggleMoreMenu() {
  const menu = document.getElementById("moreMenu");
  if (menu) setMoreMenuOpen(!menu.classList.contains("open"));
}
function closeMoreMenu() {
  setMoreMenuOpen(false);
}

// Account menus: a small Sign out tooltip. "admin" belongs to the sidebar
// Admin card (wide layout), "avatar" to the header avatar (compact layout).
// Like the More menu, the open state lives in the DOM (class .open and
// aria-expanded), because the frame is mounted once.
function setAccountMenuOpen(name, open) {
  const menu = document.getElementById(name + "Menu");
  const button = document.getElementById(name + "Btn");
  if (!menu || !button) return;
  setPopupOpen(menu, button, open);
}
function closeAccountMenus() {
  setAccountMenuOpen("admin", false);
  setAccountMenuOpen("avatar", false);
}
function toggleAccountMenu(name) {
  const menu = document.getElementById(name + "Menu");
  if (!menu) return;
  const willOpen = !menu.classList.contains("open");
  closeMoreMenu();
  closeAccountMenus();
  setAccountMenuOpen(name, willOpen);
}

function renderSidebar() {
  const items = [
    { key: "dashboard", label: "Dashboard", icon: icon("dashboard") },
    { key: "users", label: "Users", icon: icon("users") },
    { key: "nodes", label: "Nodes", icon: icon("globe") },
    { key: "log", label: "Logs", icon: icon("log"), extra: true },
    { key: "settings", label: "Settings", icon: icon("settings"), extra: true }
  ];
  // Items flagged extra stay in the sidebar on desktop, but move into the
  // More menu on the compact bottom bar (CSS hides the links there).
  const moreItems = items.filter(it => it.extra);
  const moreActive = moreItems.some(it => it.key === state.view);
  // Sidebar markup follows reference/reference.html: the V logo mark with
  // "Vexa Panel", five real nav buttons (aria-current on the active one) and
  // a clickable Admin card at the bottom (it opens a Sign out tooltip).
  // Nav IDs, classes and handlers are unchanged (#sidebar,
  // .sidebar-link, .nav-icon, navigate()).
  return \`
    <div class="sidebar" id="sidebar">
      <span class="nav-indicator" id="navIndicator" aria-hidden="true"></span>
      <div class="sidebar-brand">
        \${logoMark()}<span class="brand">Vexa Panel</span>\${versionLink()}
      </div>
      \${items.map(it => \`
        <button type="button" class="sidebar-link\${it.extra ? " sidebar-link-extra" : ""}\${state.view === it.key ? " active" : ""}" data-view="\${it.key}"\${state.view === it.key ? ' aria-current="page"' : ""}
                onclick="navigate('\${it.key}')">
          <span class="nav-icon">\${it.icon}</span><span>\${it.label}</span>
        </button>
      \`).join("")}
      <div class="more-wrap">
        <button type="button" class="sidebar-link\${moreActive ? " active" : ""}" id="moreBtn" aria-haspopup="menu" aria-expanded="false" onclick="toggleMoreMenu()">
          <span class="nav-icon">\${icon("more")}</span><span>More</span>
        </button>
        <div class="more-menu" id="moreMenu" role="menu">
          \${moreItems.map(it => \`
            <button type="button" class="more-item\${state.view === it.key ? " active" : ""}" role="menuitem" data-view="\${it.key}" onclick="navigate('\${it.key}')">
              <span class="nav-icon">\${it.icon}</span><span>\${it.label}</span>
            </button>
          \`).join("")}
        </div>
        <div class="more-backdrop" onclick="closeMoreMenu()"></div>
      </div>
      <div class="sidebar-footer">
        <div class="account-wrap account-wrap-sidebar">
          <button type="button" class="sidebar-me" id="adminBtn" aria-haspopup="menu" aria-expanded="false" onclick="toggleAccountMenu('admin')">
            <span class="sidebar-me-avatar">A</span>
            <span class="sidebar-me-text">Admin<small>Administrator</small></span>
            <span class="sidebar-me-dots" aria-hidden="true">\${icon("more")}</span>
          </button>
          <div class="account-menu" id="adminMenu" role="menu">
            <button type="button" class="account-signout" role="menuitem" onclick="closeAccountMenus(); logout()">\${icon("logout")}<span>Sign out</span></button>
          </div>
          <div class="account-backdrop" onclick="closeAccountMenus()"></div>
        </div>
      </div>
    </div>
  \`;
}

// Calendar choices in menu order, for the Settings dropdown (state.calendar holds the key).
const CALENDAR_LABELS = { gregorian: "Gregorian Calendar", jalali: "Jalali Calendar" };

// Calendar dropdown, built like the growth range dropdown (renderGrowthChart() in user-growth.js) and styled with its
// classes: a trigger button and a popup of items, the selected item is .active. The open state lives in the DOM.
function renderCalendarDropdown() {
  const items = Object.keys(CALENDAR_LABELS).map(key =>
    '<button type="button" class="growth-item' + (key === state.calendar ? ' active' : '') + '" role="menuitem" data-calendar="' + key + '" onclick="setCalendar(this.dataset.calendar)">' + CALENDAR_LABELS[key] + '</button>'
  ).join("");
  return '<div class="growth-dropdown calendar-dropdown">' +
    '<button type="button" class="growth-range" id="calendarBtn" aria-haspopup="menu" aria-expanded="false" aria-label="Calendar" onclick="toggleCalendarMenu()">' + (CALENDAR_LABELS[state.calendar] || CALENDAR_LABELS.gregorian) + icon("chevron") + '</button>' +
    '<div class="growth-menu" id="calendarMenu" role="menu">' + items + '</div>' +
  '</div>';
}

// Calendar menu open state: aria-expanded on the trigger and the classes .open and .closing on the popup, through
// setPopupOpen(), so the popup plays the same enter and exit motion as the growth range menu (styles/dashboard.js).
function setCalendarMenuOpen(open) {
  const menu = document.getElementById("calendarMenu");
  const button = document.getElementById("calendarBtn");
  if (!menu || !button) return;
  setPopupOpen(menu, button, open);
}
function toggleCalendarMenu() {
  const menu = document.getElementById("calendarMenu");
  if (!menu) return;
  const willOpen = !menu.classList.contains("open");
  closeDateFormatMenus();
  setCalendarMenuOpen(willOpen);
}
function closeCalendarMenu() {
  setCalendarMenuOpen(false);
}

// Resolves when a closing popup has finished its exit animation: at once when it is not closing, and after 500 ms at
// the latest, so a missing animationend can never hold the caller.
function popupClosed(menu) {
  if (!menu || !menu.classList.contains("closing")) return Promise.resolve();
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      menu.removeEventListener("animationend", onEnd);
      clearTimeout(timer);
      resolve();
    };
    const onEnd = e => { if (e.target === menu) finish(); };
    const timer = setTimeout(finish, 500);
    menu.addEventListener("animationend", onEnd);
  });
}

// Saves the chosen calendar on the server, then redraws the view so every date shows in it at once. The menu closes
// at once on every pick (also for the selected item and for a pick during a save), so its exit plays; after the
// server confirms, the redraw waits for that exit so render() does not cut it off. Nothing is applied before the
// server confirms; a failure shows a toast and keeps the old calendar. A pick during a save is ignored.
let calendarSaving = false;
async function setCalendar(key) {
  if (!CALENDAR_LABELS[key]) return;
  closeCalendarMenu();
  if (key === state.calendar || calendarSaving) return;
  calendarSaving = true;
  try {
    const data = await apiFetch("/api/settings", { method: "PUT", body: JSON.stringify({ calendar: key }) });
    if (!data || data.calendar !== key) throw new Error("save_failed");
    state.calendar = key;
    await popupClosed(document.getElementById("calendarMenu"));
    render();
  } catch (e) {
    // A 401 already showed the login view (apiFetch()).
    if (!e || e.message !== "unauthorized") showToast("Could not save the calendar", "error");
  } finally {
    calendarSaving = false;
  }
}

// Date format dropdowns of the Settings view, one per kind. stateKey is the field in state and in the settings API
// (the same name), choices are the style keys in menu order (the same keys as SHORT_DATE_FORMATS and LONG_DATE_FORMATS
// in the server's records/settings.js). The ids of a dropdown are stateKey + "Btn" and stateKey + "Menu".
const DATE_FORMAT_KINDS = {
  short: { stateKey: "shortDateFormat", title: "Short Format", choices: ["iso", "month-day-year"] },
  long: { stateKey: "longDateFormat", title: "Long Format", choices: ["weekday-month-day-year", "weekday-day-month-year", "weekday-iso"] }
};

// The text of a style choice: today's date written in that style, in the chosen calendar, so the menu shows real
// examples ("2026-02-15", "Sunday February 15, 2026") and not style names.
function dateFormatExample(kind, choice) {
  const now = Date.now();
  return kind === "short" ? formatDate(now, choice) : longDateParts(dateParts(new Date(now)), choice).join(" ");
}

// Date format dropdown, built like renderCalendarDropdown() with the same classes. The kind travels in data-kind, so
// no inline handler carries text. A state value that is not a choice shows the first choice.
function renderDateFormatDropdown(kind) {
  const cfg = DATE_FORMAT_KINDS[kind];
  const current = cfg.choices.includes(state[cfg.stateKey]) ? state[cfg.stateKey] : cfg.choices[0];
  // The Long Format menu lists the saved choice first, then the others in their usual order.
  const ordered = kind === "long" ? [current].concat(cfg.choices.filter(choice => choice !== current)) : cfg.choices;
  const items = ordered.map(choice =>
    '<button type="button" class="growth-item' + (choice === current ? ' active' : '') + '" role="menuitem" data-kind="' + kind + '" data-choice="' + choice + '" onclick="setDateFormat(this.dataset.kind, this.dataset.choice)">' + dateFormatExample(kind, choice) + '</button>'
  ).join("");
  return '<div class="growth-dropdown date-format-dropdown date-format-' + kind + '" data-kind="' + kind + '">' +
    '<button type="button" class="growth-range" id="' + cfg.stateKey + 'Btn" data-kind="' + kind + '" aria-haspopup="menu" aria-expanded="false" aria-label="' + cfg.title + '" onclick="toggleDateFormatMenu(this.dataset.kind)">' + dateFormatExample(kind, current) + icon("chevron") + '</button>' +
    '<div class="growth-menu" id="' + cfg.stateKey + 'Menu" role="menu">' + items + '</div>' +
  '</div>';
}

// Open state of a date format menu, through setPopupOpen() like the calendar menu.
function setDateFormatMenuOpen(kind, open) {
  const cfg = DATE_FORMAT_KINDS[kind];
  if (!cfg) return;
  const menu = document.getElementById(cfg.stateKey + "Menu");
  const button = document.getElementById(cfg.stateKey + "Btn");
  if (!menu || !button) return;
  setPopupOpen(menu, button, open);
}
// Closes every date format menu except the kind given (none given: all of them).
function closeDateFormatMenus(exceptKind) {
  Object.keys(DATE_FORMAT_KINDS).forEach(kind => {
    if (kind !== exceptKind) setDateFormatMenuOpen(kind, false);
  });
}
// Opening one dropdown closes the others, so only one menu is open at a time.
function toggleDateFormatMenu(kind) {
  const cfg = DATE_FORMAT_KINDS[kind];
  const menu = cfg ? document.getElementById(cfg.stateKey + "Menu") : null;
  if (!menu) return;
  const willOpen = !menu.classList.contains("open");
  closeCalendarMenu();
  closeDateFormatMenus(kind);
  setDateFormatMenuOpen(kind, willOpen);
}

// Saves the chosen date format on the server, then redraws the view so every date shows in it at once. It follows
// setCalendar(): the menu closes at once on every pick, nothing is applied before the server confirms, the redraw
// waits for the menu's exit, a failure shows a toast and keeps the old format, and a pick during a save is ignored.
let dateFormatSaving = false;
async function setDateFormat(kind, choice) {
  const cfg = DATE_FORMAT_KINDS[kind];
  if (!cfg || !cfg.choices.includes(choice)) return;
  setDateFormatMenuOpen(kind, false);
  if (choice === state[cfg.stateKey] || dateFormatSaving) return;
  dateFormatSaving = true;
  try {
    const body = {};
    body[cfg.stateKey] = choice;
    const data = await apiFetch("/api/settings", { method: "PUT", body: JSON.stringify(body) });
    if (!data || data[cfg.stateKey] !== choice) throw new Error("save_failed");
    state[cfg.stateKey] = choice;
    await popupClosed(document.getElementById(cfg.stateKey + "Menu"));
    render();
  } catch (e) {
    // A 401 already showed the login view (apiFetch()).
    if (!e || e.message !== "unauthorized") showToast("Could not save the date format", "error");
  } finally {
    dateFormatSaving = false;
  }
}

// Routed Settings view (/settings); reuses the content of the former
// Settings modal. Two titled sections in this order: Date & Time (Calendar, Short Format and Long Format), then
// Account (Change Password). The lead line is visible text; the row description is the text of an info icon.
function renderSettingsView() {
  return \`
    <h2>Settings</h2>
    <p class="lead">Adjust how your panel behaves.</p>
    <section class="settings-section">
      <h3 class="settings-section-title">Date &amp; Time</h3>
      <div class="card settings-card">
        <div class="setting-row">
          <div class="setting-text">
            <span class="setting-title">Calendar \${infoTip("Choose how dates are shown across the panel. The choice is saved on the server, so it applies in every browser.", "below")}</span>
          </div>
          \${renderCalendarDropdown()}
        </div>
        <div class="setting-row">
          <div class="setting-text">
            <span class="setting-title">Short Format \${infoTip("Used for dates in the Created at, Updated at and Edited at columns and for the days in the Logs. Hover a date to see it in the long format.", "below")}</span>
          </div>
          \${renderDateFormatDropdown("short")}
        </div>
        <div class="setting-row">
          <div class="setting-text">
            <span class="setting-title">Long Format \${infoTip("Used when you hover a date: the full date with the weekday, followed by the time. The choice is saved on the server, so it applies in every browser.", "below")}</span>
          </div>
          \${renderDateFormatDropdown("long")}
        </div>
      </div>
    </section>
    <section class="settings-section">
      <h3 class="settings-section-title">Account</h3>
      <div class="card settings-card">
        <div class="setting-row">
          <div class="setting-text">
            <span class="setting-title">Change Password \${infoTip("Rotates your admin password. Sessions and subscription links keep working. You will be signed out and must sign in again with the new password.", "below")}</span>
          </div>
          <button class="btn-secondary btn-sm" onclick="openChangePasswordModal()">Change</button>
        </div>
      </div>
    </section>
  \`;
}

// The persistent frame (sidebar, header, #view, #md). render() mounts it
// once; later renders only rewrite #view and the modal layer, and
// syncShellFrame() updates the parts that depend on state. #view sits in
// .view-stack so the exiting copy of the old view can overlap it (render()).
function renderShellFrame() {
  // Header follows reference/reference.html: a search field (no behavior, as
  // in the reference), a flexible spacer, the day/night theme toggle and the Admin
  // avatar (compact layout only). Sign out lives in the account menus: the
  // avatar opens one here, the sidebar Admin card opens the other. Page
  // titles are drawn inside each view, so the header carries none, and
  // there is no hamburger or backdrop (R48).
  return \`
    <div class="app-shell">
      \${renderSidebar()}
      <div class="main">
        <div class="topbar">
          <div class="topbar-brand">
            \${logoMark()}<span class="brand">Vexa Panel</span>\${versionLink()}
          </div>
          <input class="topbar-search" type="text" placeholder="Search…" aria-label="Search">
          <span class="topbar-spacer" style="flex:1;"></span>
          \${themeToggleMarkup()}
          <div class="account-wrap account-wrap-top">
            <button type="button" class="topbar-avatar" id="avatarBtn" aria-label="Account menu" aria-haspopup="menu" aria-expanded="false" onclick="toggleAccountMenu('avatar')">A</button>
            <div class="account-menu" id="avatarMenu" role="menu">
              <button type="button" class="account-signout" role="menuitem" onclick="closeAccountMenus(); logout()">\${icon("logout")}<span>Sign out</span></button>
            </div>
            <div class="account-backdrop" onclick="closeAccountMenus()"></div>
          </div>
        </div>
        <div class="view-stack">
          <div class="container" id="view"></div>
        </div>
      </div>
      <div id="md"></div>
    </div>
  \`;
}

// Active item indicator (styles/app-shell.js): one element placed behind the active sidebar link. Its size and
// position come from the link's rectangle, so the same code serves the desktop column and the phone bottom bar
// (offsetLeft would be wrong for the More button, whose offset parent is .more-wrap). A link hidden by the layout
// has no width and cannot be the target; with none visible the indicator hides. The class .slide is set only for a
// real move between two items, so the first placement and a layout change (resize, font load) snap into place.
let navIndicatorBound = false;
function placeNavIndicator(slide) {
  const bar = document.getElementById("navIndicator");
  const sidebar = document.getElementById("sidebar");
  if (!bar || !sidebar) return;
  const target = Array.from(sidebar.querySelectorAll(".sidebar-link.active")).find(el => el.getBoundingClientRect().width > 0);
  if (!target) { bar.classList.remove("on", "slide"); return; }
  const box = sidebar.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const wasOn = bar.classList.contains("on");
  bar.classList.toggle("slide", Boolean(slide) && wasOn);
  bar.style.width = rect.width + "px";
  bar.style.height = rect.height + "px";
  bar.style.transform = "translate(" + (rect.left - box.left - sidebar.clientLeft) + "px, " + (rect.top - box.top - sidebar.clientTop) + "px)";
  bar.classList.add("on");
}

// In-place update of the persistent frame after a view change: the active
// nav item (class and aria-current). The header has no title any more.
function syncShellFrame() {
  // The More button is active while a view that lives in its menu is shown.
  let inMore = false;
  document.querySelectorAll(".more-item").forEach(el => {
    const isActive = el.dataset.view === state.view;
    el.classList.toggle("active", isActive);
    if (isActive) inMore = true;
  });
  document.getElementById("moreBtn")?.classList.toggle("active", inMore);
  document.querySelectorAll(".sidebar-link[data-view]").forEach(el => {
    const isActive = el.dataset.view === state.view;
    el.classList.toggle("active", isActive);
    if (isActive) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  placeNavIndicator(true);
  if (!navIndicatorBound) {
    navIndicatorBound = true;
    window.addEventListener("resize", () => placeNavIndicator(false));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeNavIndicator(false));
  }
}
`;
