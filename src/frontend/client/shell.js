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
  const change = () => { root.dataset.theme = theme; };
  // A changed theme crossfades through the browser's view transition (about
  // 0.25s). The startup call (theme already applied by the inline script),
  // browsers without the API and reduced motion switch at once.
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (document.startViewTransition && !reduceMotion && root.dataset.theme !== theme) document.startViewTransition(change);
  else change();
  try { localStorage.setItem("vexa_theme", theme); } catch (e) {}
}
function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
}

// Version label: a link to the project's GitHub page. Hovering or focusing it
// shows a small popup with the GitHub mark and the project name (CSS only, see
// .version-pop in styles/app-shell.js). Used in the sidebar and the compact topbar.
function versionLink() {
  return '<a class="brand-version" href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer" aria-label="Vexa Panel v${VEXA_VERSION} on GitHub">v${VEXA_VERSION}' +
    '<span class="version-pop" role="tooltip"><svg class="version-pop-logo" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${GITHUB_MARK_PATH}</svg>${GITHUB_REPO_NAME}</span></a>';
}

function navigate(view) {
  closeMoreMenu();
  closeAccountMenus();
  state.view = view;
  state.errorMsg = "";
  const path = VIEW_PATHS[view];
  if (path && location.pathname !== path) history.pushState(null, "", path);
  state.loading = true;
  render();
  loadViewData(view)
    // Ignore a stale failure if the user has already moved to another view.
    // A failed load shows its error message as a toast (R112, R125).
    .catch(err => {
      if (state.view !== view) return;
      showToast(err && err.message ? err.message : "Could not load data");
    })
    .finally(() => { state.loading = false; renderAfterLoad(); });
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

// Routed Settings view (/settings); reuses the content of the former
// Settings modal.
function renderSettingsView() {
  return \`
    <h2>Settings</h2>
    <p class="lead">Adjust how your panel behaves.</p>
    <div class="card settings-card">
      <div class="setting-row">
        <div class="setting-text">
          <span class="setting-title">Change Password</span>
          <span class="setting-desc">Rotates your admin password. Sessions and subscription links keep working.</span>
        </div>
        <button class="btn-secondary btn-sm" onclick="openChangePasswordModal()">Change</button>
      </div>
    </div>
  \`;
}

// The persistent frame (sidebar, header, #view, #md). render() mounts it
// once; later renders only rewrite #view and the modal layer, and
// syncShellFrame() updates the parts that depend on state.
function renderShellFrame() {
  // Header follows reference/reference.html: a search field (no behavior, as
  // in the reference), a flexible spacer, the Theme button and the Admin
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
          <button type="button" class="btn-secondary btn-sm" id="themeBtn" aria-label="Toggle light or dark theme" onclick="toggleTheme()">Theme</button>
          <div class="account-wrap account-wrap-top">
            <button type="button" class="topbar-avatar" id="avatarBtn" aria-label="Account menu" aria-haspopup="menu" aria-expanded="false" onclick="toggleAccountMenu('avatar')">A</button>
            <div class="account-menu" id="avatarMenu" role="menu">
              <button type="button" class="account-signout" role="menuitem" onclick="closeAccountMenus(); logout()">\${icon("logout")}<span>Sign out</span></button>
            </div>
            <div class="account-backdrop" onclick="closeAccountMenus()"></div>
          </div>
        </div>
        <div class="container" id="view"></div>
      </div>
      <div id="md"></div>
    </div>
  \`;
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
}
`;
