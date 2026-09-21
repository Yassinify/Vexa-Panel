import { RIPPLE_SCRIPT } from "./ripple-script.js";

export const CLIENT_SCRIPT = `
const state = {
  token: localStorage.getItem("vexa_token") || null,
  view: "login",
  loading: false,
  // Set when the last data load rejected, so the Users/Nodes views can show
  // a load-error state instead of a misleading empty state.
  loadError: false,
  // True only for the single render() that follows a completed data load,
  // so table rows animate in once instead of on every re-render.
  animateRows: false,
  // In-flight guards for submit buttons (see setButtonPending()).
  authPending: false,
  savingNode: false,
  errorMsg: "",

  // Whether admin authentication has been initialized yet (D1 auth_config
  // row exists, or a complete Cloudflare Secret triplet is bound) — null
  // until the first /api/version check resolves it. The login view uses
  // this to decide between the normal login form and the first-run
  // "choose a password" form; there is no separate /secret page anymore.
  authInitialized: null,

  users: [],
  userSearch: "",
  userSort: { key: "createdAt", dir: "desc" },

  nodes: [],

  stats: null,
  activity: [],
  // Daily total-user snapshots for the Dashboard growth chart (API userGrowth).
  userGrowth: [],

  modal: null,
  editingUser: null,
  editingUserSources: null,
  editingUserNodeIds: null,
  editingNode: null,
  editingNodeSource: "",
  mergeResult: null,
  confirmDialog: null,
  subFormatTarget: null,
  // Open Users row "..." menu ({ userId }) or null; drawn by renderRowMenu()
  // (see the ROW MENU block).
  menu: null
};

// ---------------------------------------------------------------------
// API
// ---------------------------------------------------------------------
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: "Bearer " + state.token } : {}),
      ...(opts.headers || {})
    }
  });
  if (res.status === 401) {
    state.token = null;
    localStorage.removeItem("vexa_token");
    state.view = "login";
    if (location.pathname !== "/login") history.replaceState(null, "", "/login");
    render();
    throw new Error("unauthorized");
  }
  return res.json();
}

async function loadDashboard() {
  const data = await apiFetch("/api/stats");
  state.stats = data.stats;
  state.activity = data.activity || [];
  state.userGrowth = data.userGrowth || [];
}

async function loadUsers() {
  const data = await apiFetch("/api/users");
  state.users = data.users || [];
}

async function loadNodes() {
  const data = await apiFetch("/api/nodes");
  state.nodes = data.nodes || [];
}

// Sidebar view <-> URL path mapping, used by navigate() and init() for
// path-based routing (/Dashboard, /Users, /Nodes, /Log). /panel stays a
// legacy alias and is left untouched here.
const VIEW_PATHS = { dashboard: "/Dashboard", users: "/Users", nodes: "/Nodes", log: "/Log" };

function loadViewData(view) {
  if (view === "users") return loadUsers();
  if (view === "nodes") return loadNodes();
  return loadDashboard(); // dashboard and log both read stats/activity
}

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

function formatCacheAge(ms) {
  const diff = Math.floor(ms / 1000);
  if (diff < 60) return "moments old";
  if (diff < 3600) return Math.floor(diff / 60) + "m old";
  if (diff < 86400) return Math.floor(diff / 3600) + "h old";
  return Math.floor(diff / 86400) + "d old";
}

function renderSourceIssues(sourceErrors) {
  if (!sourceErrors || !sourceErrors.length) return "";
  const degraded = sourceErrors.filter(e => e.usedCache);
  const failed = sourceErrors.filter(e => !e.usedCache);
  const parts = [];
  if (failed.length) {
    parts.push('<div class="error-text">' + failed.length + ' source(s) failed to fetch — nodes missing.</div>');
  }
  if (degraded.length) {
    const detail = degraded.map(e => escapeHtml(e.url) + ' (cache ' + formatCacheAge(e.cacheAgeMs) + ')').join(', ');
    parts.push('<div class="helper-text">' + degraded.length + ' source(s) used a cached copy — ' + detail + '.</div>');
  }
  return parts.join("");
}

// Heroicons (outline, 1.5 stroke) inline SVGs for every UI icon. Using
// currentColor for stroke means each icon inherits whatever color its
// wrapping .icon-* class sets — same mechanism as the emoji glyphs they
// replace, so no other CSS needs to change. icon() wraps the raw path
// markup in a consistently-sized <svg class="ui-icon"> shell.
const ICONS = {
  dashboard: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />',
  users: '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />',
  link: '<path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />',
  open: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />',
  delete: '<path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />',
  merge: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />',
  edit: '<path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />',
  menu: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />',
  plus: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />',
  settings: '<path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />',
  logout: '<path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" />',
  log: '<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />',
  sortAsc: '<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />',
  sortDesc: '<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />',
  more: '<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />',
  activate: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />',
  deactivate: '<path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />',
};
function icon(name, extraClass) {
  const paths = ICONS[name] || "";
  return '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="ui-icon' + (extraClass ? " " + extraClass : "") + '" aria-hidden="true">' + paths + '</svg>';
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}

function showToast(msg, isError) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast" + (isError ? " error" : "");
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

// In-flight state for a submit button: disabled plus an inline spinner.
// Updated in place (not via render()) so typed input values are kept, and
// restored to its normal label when the request ends.
function setButtonPending(id, pending, pendingLabel, label) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = pending;
  btn.innerHTML = pending ? '<span class="spinner"></span>' + pendingLabel : label;
}

function sortRows(rows, sort) {
  const copy = [...rows];
  copy.sort((a, b) => {
    let av = a[sort.key], bv = b[sort.key];
    if (typeof av === "string") { av = av.toLowerCase(); bv = (bv || "").toLowerCase(); }
    if (av < bv) return sort.dir === "asc" ? -1 : 1;
    if (av > bv) return sort.dir === "asc" ? 1 : -1;
    return 0;
  });
  return copy;
}

function sortIndicator(sort, key) {
  if (sort.key !== key) return "";
  // Dedicated .sort-icon wrapper (inline-flex sizing) — not .nav-icon,
  // which is scoped to .sidebar-link.
  return '<span class="sort-icon">' + (sort.dir === "asc" ? icon("sortAsc") : icon("sortDesc")) + '</span>';
}

// ---------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------
// state.authInitialized === false means no admin authentication exists
// yet anywhere (no D1 auth_config row, no complete Secret triplet) — the
// first-run "choose a password" form is shown in place of the normal
// login form, right on this same page. There is no separate /secret
// setup route; first-run and normal login are two states of one page.
function renderLoginView() {
  const firstRun = state.authInitialized === false;
  return \`
    <div class="login-wrap">
      <div class="card login-card">
        <img class="logo-glow" src="/favicon.svg" alt="VEXA logo">
        <div class="brand">VEXA</div>
        <div class="brand-sub">\${firstRun ? "Choose an admin password to finish setup" : "Secure subscription manager"}</div>
        \${firstRun ? \`
          <div class="field-group" style="text-align:left;">
            <label class="field-label">Password</label>
            <input type="password" id="loginPassword" placeholder="Choose a password" />
          </div>
          <div class="field-group" style="text-align:left;">
            <label class="field-label">Confirm Password</label>
            <input type="password" id="loginPasswordConfirm" placeholder="Confirm password" />
          </div>
          <div class="helper-text" style="text-align:left;margin-bottom:var(--space-sm);">This is the password you'll log in with. The plaintext password is never stored — only a hash of it is kept.</div>
          <button class="btn-primary" id="createAccountBtn" style="width:100%;" onclick="doCreateAccount()">Create Account</button>
        \` : \`
          <div class="field-group" style="text-align:left;">
            <label class="field-label">Password</label>
            <input type="password" id="loginPassword" placeholder="Enter admin password" />
          </div>
          <button class="btn-primary" id="loginBtn" style="width:100%;" onclick="doLogin()">Submit Password</button>
        \`}
        <div class="error-text" id="loginError">\${state.errorMsg || ""}</div>
      </div>
    </div>
  \`;
}

async function doLogin() {
  if (state.authPending) return; // ignore repeated submits while a request is in flight
  const password = document.getElementById("loginPassword").value;
  state.errorMsg = "";
  state.authPending = true;
  setButtonPending("loginBtn", true, "Signing in…", "Submit Password");
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) {
      state.errorMsg = data.error === "too_many_attempts"
        ? "Too many attempts. Wait a few minutes."
        : "Incorrect password.";
      render();
      return;
    }
    state.token = data.token;
    localStorage.setItem("vexa_token", data.token);
    state.view = "dashboard";
    history.pushState(null, "", VIEW_PATHS.dashboard);
    await bootAuthenticated();
  } catch (e) {
    state.errorMsg = "Connection error.";
    render();
  } finally {
    state.authPending = false;
    setButtonPending("loginBtn", false, "", "Submit Password");
  }
}

// First-run account creation: validates the two password fields client-
// side, then calls the existing D1-backed initialization endpoint
// (POST /api/secret/generate -> handleInitializeD1Auth, unauthenticated
// only while auth isn't configured yet). The server generates and
// persists admin_salt/admin_password_hash/jwt_secret into D1 itself and
// never returns any of them here. Per the intended first-run UX, this
// does not log the new admin in directly — it returns to the normal
// login form so the admin enters the password they just chose, exactly
// once, before reaching the panel.
async function doCreateAccount() {
  if (state.authPending) return; // ignore repeated submits while a request is in flight
  const password = document.getElementById("loginPassword").value;
  const confirm = document.getElementById("loginPasswordConfirm").value;
  state.errorMsg = "";
  if (!password) {
    state.errorMsg = "Choose a password.";
    render();
    return;
  }
  if (password !== confirm) {
    state.errorMsg = "Passwords do not match.";
    render();
    return;
  }
  state.authPending = true;
  setButtonPending("createAccountBtn", true, "Creating account…", "Create Account");
  try {
    const res = await fetch("/api/secret/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) {
      state.errorMsg = data && data.error === "already_configured"
        ? "Setup already completed — please sign in."
        : "Could not complete setup. Try again.";
      // Re-check in case another request already finished first-run setup
      // concurrently (see initAuthConfigIfAbsent()'s race-safety in
      // src/d1.js) — either way, the normal login form is now correct.
      if (data && data.error === "already_configured") state.authInitialized = true;
      render();
      return;
    }
    // Setup complete. Log out once (there is no session to hold yet
    // anyway) and return to the normal login form per the intended
    // first-run flow: Create Account -> logged out -> Login -> Logged in.
    state.authInitialized = true;
    state.errorMsg = "";
    state.token = null;
    localStorage.removeItem("vexa_token");
    render();
    showToast("Account created — sign in with your new password.");
  } catch (e) {
    state.errorMsg = "Connection error.";
    render();
  } finally {
    state.authPending = false;
    setButtonPending("createAccountBtn", false, "", "Create Account");
  }
}

// Manual logout clears the session outright — the next visit gets no
// "less than 48h since last login" grace period and lands back on /login.
function logout() {
  state.token = null;
  localStorage.removeItem("vexa_token");
  state.view = "login";
  history.pushState(null, "", "/login");
  render();
}

// Renders once right after a data load finishes, with row animation on.
// Later renders (search typing, toggles, modals) leave animateRows off so
// the table rows don't replay their entrance animation.
function renderAfterLoad() {
  state.animateRows = true;
  render();
  state.animateRows = false;
}

async function bootAuthenticated() {
  state.loading = true;
  state.loadError = false;
  render();
  try {
    await loadViewData(state.view);
  } catch (e) {
    // Flag the failure so list views don't show it as an empty dataset;
    // the error is still rethrown for the caller's own handling.
    state.loadError = true;
    throw e;
  } finally {
    state.loading = false;
    renderAfterLoad();
  }
}

// ---------------------------------------------------------------------
// SHELL: sidebar + topbar
// ---------------------------------------------------------------------
// Mobile off-canvas sidebar. Desktop ignores .open (sidebar is always
// visible there via the media query), so these are no-ops above the
// 780px breakpoint.
function toggleSidebar() {
  const isOpen = document.getElementById("sidebar")?.classList.toggle("open");
  document.getElementById("sidebarBackdrop")?.classList.toggle("visible");
  const btn = document.getElementById("menuToggleBtn");
  if (btn) {
    btn.classList.toggle("is-open", !!isOpen);
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
}
function closeSidebar() {
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("sidebarBackdrop")?.classList.remove("visible");
  const btn = document.getElementById("menuToggleBtn");
  if (btn) {
    btn.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  }
}

function navigate(view) {
  closeSidebar();
  state.menu = null;
  state.view = view;
  state.errorMsg = "";
  const path = VIEW_PATHS[view];
  if (path && location.pathname !== path) history.pushState(null, "", path);
  state.loading = true;
  state.loadError = false;
  render();
  loadViewData(view)
    // Ignore a stale failure if the user has already moved to another view.
    .catch(() => { if (state.view === view) state.loadError = true; })
    .finally(() => { state.loading = false; renderAfterLoad(); });
}

function renderSidebar() {
  const items = [
    { key: "dashboard", label: "Dashboard", icon: icon("dashboard") },
    { key: "users", label: "Users", icon: icon("users") },
    { key: "nodes", label: "Nodes", icon: icon("link") },
    { key: "log", label: "Log", icon: icon("log") }
  ];
  // Sidebar markup rebuilt from the reference board's Desktop panel:
  // brand row reads "Vexa Panel" in a single line (logo mark + wordmark),
  // active nav item is a solid filled-red pill (not a text-only row), and
  // the footer sits pinned below a divider — same structure the board
  // shows for its account/settings row. IDs/classes/handlers unchanged
  // (#sidebar, .sidebar-link, .nav-icon, navigate()/openSettings()/logout()).
  return \`
    <div class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <img class="avatar" src="/favicon.svg" alt="VEXA logo">
        <div class="brand">VEXA</div>
      </div>
      \${items.map(it => \`
        <div class="sidebar-link \${state.view === it.key ? "active" : ""}"
             onclick="navigate('\${it.key}')">
          <span class="nav-icon">\${it.icon}</span><span>\${it.label}</span>
        </div>
      \`).join("")}
      <div class="sidebar-footer">
        <button class="btn-secondary" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;" onclick="openSettings()"><span class="nav-icon">\${icon("settings")}</span>Settings</button>
        <button class="btn-secondary" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;" onclick="logout()"><span class="nav-icon">\${icon("logout")}</span>Log out</button>
      </div>
    </div>
  \`;
}

function openSettings() {
  closeSidebar();
  state.modal = "settings";
  render();
}

function shellTitle() {
  if (state.view === "dashboard") return ["Dashboard", "Overview of users and sources"];
  if (state.view === "users") return ["Users", "Managed accounts and their subscription sources"];
  if (state.view === "nodes") return ["Nodes", "Reusable sources assignable to any user"];
  if (state.view === "log") return ["Log", "Recent activity across the panel"];
  return ["", ""];
}

function renderShell(innerHtml) {
  const [title, sub] = shellTitle();
  // Topbar rebuilt from the reference board's page-header treatment
  // (page title + one-line subtitle, hamburger only on the mobile/tablet
  // off-canvas tiers per styles.js's .menu-toggle-btn media query).
  // #menuToggleBtn / #sidebarBackdrop ids and toggleSidebar()/
  // closeSidebar() handlers unchanged.
  return \`
    <div class="app-shell">
      \${renderSidebar()}
      <div class="sidebar-backdrop" id="sidebarBackdrop" onclick="closeSidebar()"></div>
      <div class="main">
        <div class="topbar">
          <div style="display:flex;align-items:center;gap:var(--space-md);">
            <button class="menu-toggle-btn" id="menuToggleBtn" aria-label="Toggle menu" aria-expanded="false" onclick="toggleSidebar()"><span class="menu-icon">\${icon("menu")}</span></button>
            <div>
              <h1>\${title}</h1>
              <div class="topbar-sub">\${sub}</div>
            </div>
          </div>
        </div>
        <div class="container">\${innerHtml}</div>
      </div>
      \${renderModal()}
      \${renderRowMenu()}
    </div>
  \`;
}

// ---------------------------------------------------------------------
// USER GROWTH card (Dashboard) — draws state.userGrowth ([{ day,
// totalUsers }], oldest first, right-aligned so today is the right edge,
// shorter than 7 entries while history is still being recorded). The SVG
// (viewBox 0 0 100 100, stretched) only holds the gridlines, area and
// line; y values, date labels and the latest-point dot are HTML so text
// never scales. Classes live in styles.js (.growth-*).
// ---------------------------------------------------------------------
const GROWTH_DAYS = 7;
const GROWTH_MS_PER_DAY = 86400000;

// "Sep 15" for a UTC timestamp (the API's days are UTC calendar days).
function growthDayLabel(ms) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Integer y ticks from 0: a 1/2/5 x 10^k step giving 4 to 5 intervals.
function growthTicks(maxValue) {
  let step = 1;
  for (let mag = 1; ; mag *= 10) {
    const found = [1, 2, 5].map((m) => m * mag).find((s) => Math.ceil(maxValue / s) <= 5);
    if (found) { step = found; break; }
  }
  const intervals = Math.max(4, Math.ceil(maxValue / step));
  const ticks = [];
  for (let i = 0; i <= intervals; i++) ticks.push(i * step);
  return ticks;
}

function renderGrowthChart(series) {
  const n = GROWTH_DAYS;
  const points = Array.isArray(series) ? series.slice(-n) : [];
  const offset = n - points.length;
  const lastMs = points.length
    ? Date.parse(points[points.length - 1].day + "T00:00:00Z")
    : Date.now();
  const maxValue = points.reduce((m, p) => Math.max(m, p.totalUsers), 0);
  const ticks = growthTicks(maxValue);
  const yMax = ticks[ticks.length - 1];
  const xPct = (slot) => (slot / (n - 1)) * 100;
  const yPct = (value) => 100 - (value / yMax) * 100;
  const coords = points.map((p, i) => xPct(offset + i).toFixed(2) + "," + yPct(p.totalUsers).toFixed(2));

  const gridLines = ticks.map((t) => {
    const y = yPct(t).toFixed(2);
    return '<line class="growth-grid" x1="0" x2="100" y1="' + y + '" y2="' + y + '"/>';
  }).join("");
  // A line and area need two points; one point is shown as the dot only.
  let shapes = "";
  if (points.length >= 2) {
    shapes =
      '<polygon points="' + xPct(offset).toFixed(2) + ',100 ' + coords.join(" ") + ' 100,100" fill="url(#growthFill)" stroke="none"/>' +
      '<polyline class="growth-line" points="' + coords.join(" ") + '"/>';
  }
  const dot = points.length
    ? '<span class="growth-dot" style="left:100%;top:' + yPct(points[points.length - 1].totalUsers).toFixed(2) + '%"></span>'
    : "";
  const yTicks = ticks.map((t) =>
    '<span class="growth-ytick" style="bottom:' + ((t / yMax) * 100).toFixed(2) + '%">' + t.toLocaleString("en-US") + '</span>'
  ).join("");
  let xLabels = "";
  for (let slot = 0; slot < n; slot++) {
    xLabels += '<span class="growth-xlabel" style="left:' + xPct(slot).toFixed(2) + '%">' +
      growthDayLabel(lastMs - (n - 1 - slot) * GROWTH_MS_PER_DAY) + '</span>';
  }
  let note = "";
  if (!points.length) note = "No data yet.";
  else if (points.length < n) {
    note = "Tracking started " + growthDayLabel(Date.parse(points[0].day + "T00:00:00Z")) + ". Earlier days are not recorded.";
  }
  const summary = "User growth, last " + n + " days" +
    (points.length ? ": " + points[points.length - 1].totalUsers + " users" : "");

  return '<div class="card growth-card">' +
    '<div class="growth-head"><span class="growth-title">User Growth</span><span class="growth-range">Last ' + n + ' days</span></div>' +
    '<div class="growth-body" role="img" aria-label="' + summary + '">' +
      '<div class="growth-yaxis">' + yTicks + '</div>' +
      '<div class="growth-plot">' +
        '<svg class="growth-svg" viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible" aria-hidden="true">' +
          '<defs><linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="growth-stop-top"/><stop offset="1" class="growth-stop-bottom"/></linearGradient></defs>' +
          gridLines + shapes +
        '</svg>' + dot +
      '</div>' +
    '</div>' +
    '<div class="growth-xaxis">' + xLabels + '</div>' +
    '<div class="growth-note">' + note + '</div>' +
  '</div>';
}

// ---------------------------------------------------------------------
// RECENT ACTIVITY card (Dashboard) — short companion to the User Growth
// card, per the reference board's Desktop Dashboard. Shows the first 4
// records of state.activity (already loaded by loadDashboard()), reusing
// the Log page's .activity-row/.activity-icon/.activity-text/.activity-time
// and timeAgo(); "View all" navigates to the full list on the Log page.
// Records only carry { message, ts } (see renderLogView()), so every row
// uses the same icon. Classes live in styles.js (.activity-card-head,
// .activity-viewall); .growth-title is reused for the card title (same
// size/weight, no new class needed).
// ---------------------------------------------------------------------
function renderRecentActivity() {
  const items = state.activity.slice(0, 4);
  const rowsHtml = items.length
    ? items.map(a => \`
        <div class="activity-row">
          <span class="activity-icon">\${icon("log")}</span>
          <span class="activity-text">\${escapeHtml(a.message)}</span>
          <span class="activity-time">\${timeAgo(a.ts)}</span>
        </div>
      \`).join("")
    : '<div class="empty-state" style="padding:var(--space-xl) var(--space-lg);">No activity yet.</div>';
  return \`
    <div class="card activity-card">
      <div class="activity-card-head">
        <span class="growth-title">Recent Activity</span>
        <button class="activity-viewall" onclick="navigate('log')">View all →</button>
      </div>
      <div class="activity-list">\${rowsHtml}</div>
    </div>
  \`;
}

// ---------------------------------------------------------------------
// DASHBOARD — visually rebuilt from the reference board's Desktop/
// Tablet/Mobile Dashboard panels: each stat card now leads with a small
// colored icon badge (.stat-card-icon, styles.js), matching the board's
// icon-in-rounded-square treatment. The 3 cards read state.stats
// (totalUsers/totalNodes/activeUsers, from getStats() in src/users.js);
// Active Subscriptions = enabled-user count, and there is no Total
// Traffic card. Below the stat cards, .dash-row holds the User Growth
// card (renderGrowthChart()) and the Recent Activity card
// (renderRecentActivity()) side by side, stacking to one column at
// 1024px and below (styles.js). The status-row card below keeps its
// existing "System operational" content, restyled to the same card
// language.
// ---------------------------------------------------------------------
function renderDashboardView() {
  if (state.loading || !state.stats) {
    // Skeleton bars are padded up to the loaded line heights (stat number:
    // --text-h1 x 1.5 = 48px, status text: --text-body x 1.5 = 21px) so the view
    // does not grow when data arrives; the bars keep their own size. The number
    // bar sits in a 48px wrapper because its own top margin would collapse into
    // the stat-card-head bottom margin; the status bar is a flex item, so a
    // margin works there.
    return renderShell(\`
      <div class="stat-grid">
        \${[1,2,3].map(() => \`
          <div class="card stat-card">
            <div class="stat-card-head">
              <div class="skel" style="width:34px;height:34px;border-radius:8px;"></div>
              <div class="skel" style="width:60%;height:11px;"></div>
            </div>
            <div style="display:flex;align-items:center;height:calc(var(--text-h1) * 1.5);">
              <div class="skel" style="width:38%;height:26px;"></div>
            </div>
          </div>
        \`).join("")}
      </div>
      <div class="dash-row">
        <div class="card growth-card">
          <div class="growth-head">
            <div class="skel" style="width:110px;height:16px;"></div>
            <div class="skel" style="width:88px;height:28px;border-radius:8px;"></div>
          </div>
          <div class="growth-body">
            <div class="growth-yaxis"></div>
            <div class="growth-plot"><div class="skel" style="width:100%;height:100%;"></div></div>
          </div>
          <div class="growth-xaxis"></div>
          <div class="growth-note"></div>
        </div>
        <div class="card activity-card">
          <div class="activity-card-head">
            <div class="skel" style="width:110px;height:16px;"></div>
            <div class="skel" style="width:56px;height:12px;"></div>
          </div>
          <div class="activity-list">
            \${[1,2,3,4].map(() => \`
              <div class="activity-row">
                <div class="skel" style="width:32px;height:32px;border-radius:50%;flex-shrink:0;"></div>
                <div class="skel" style="width:55%;height:13px;"></div>
                <div class="skel" style="width:48px;height:12px;flex-shrink:0;margin-left:auto;"></div>
              </div>
            \`).join("")}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="status-row">
          <span class="skel" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;"></span>
          <div class="skel" style="width:130px;height:13px;margin-block:calc((var(--text-body) * 1.5 - 13px) / 2);"></div>
          <div class="skel" style="width:150px;height:12px;margin-left:auto;"></div>
        </div>
      </div>
    \`);
  }
  const s = state.stats;
  const cards = [
    { label: "Total Users", num: s.totalUsers, icon: "users" },
    { label: "Total Nodes", num: s.totalNodes, icon: "link" },
    { label: "Active Subscriptions", num: s.activeUsers, icon: "merge" }
  ];
  return renderShell(\`
    <div class="stat-grid">
      \${cards.map(c => \`
        <div class="card stat-card">
          <div class="stat-card-head">
            <span class="stat-card-icon">\${icon(c.icon)}</span>
            <div class="stat-card-label">\${c.label}</div>
          </div>
          <div class="stat-card-num">\${c.num}</div>
        </div>
      \`).join("")}
    </div>
    <div class="dash-row">
      \${renderGrowthChart(state.userGrowth)}
      \${renderRecentActivity()}
    </div>
    <div class="card">
      <div class="status-row">
        <span class="status-dot"></span>
        <span>System operational</span>
        <span class="timestamp" style="margin-left:auto;">VEXA — checked \${timeAgo(Date.now())}</span>
      </div>
    </div>
  \`);
}

// ---------------------------------------------------------------------
// LOG
// ---------------------------------------------------------------------
function renderLogView() {
  if (state.loading) {
    return renderShell(\`
      <div class="card">
        <div class="activity-list">
          \${[1,2,3,4,5].map(() => \`
            <div class="activity-row">
              <div class="skel" style="width:32px;height:32px;border-radius:50%;flex-shrink:0;"></div>
              <div class="skel" style="width:55%;height:13px;"></div>
              <div class="skel" style="width:48px;height:12px;flex-shrink:0;margin-left:auto;"></div>
            </div>
          \`).join("")}
        </div>
      </div>
    \`);
  }
  const activityHtml = state.activity.length
    ? state.activity.map(a => \`
        <div class="activity-row">
          <span class="activity-icon">\${icon("log")}</span>
          <span class="activity-text">\${escapeHtml(a.message)}</span>
          <span class="activity-time">\${timeAgo(a.ts)}</span>
        </div>
      \`).join("")
    : '<div class="empty-state"><div class="empty-state-icon">' + icon("log") + '</div>No activity yet.</div>';

  return renderShell(\`
    <div class="card">
      <div class="activity-list">\${activityHtml}</div>
    </div>
  \`);
}

// ---------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------
function setUserSort(key) {
  if (state.userSort.key === key) {
    state.userSort.dir = state.userSort.dir === "asc" ? "desc" : "asc";
  } else {
    state.userSort = { key, dir: "asc" };
  }
  render();
}

// Skeleton geometry for toolbar controls (search input, primary button),
// derived from the shared control metrics in styles.js: line-height 1.4 +
// 2 x --space-sm padding + 2px border = 37.6px, with --radius-md corners.
// The skeleton search is a div, so it sets the width:100% a real input gets from
// the global input rule. The skeleton primary button carries .desktop-only-action
// so it hides at the same breakpoint as the real button (a floating button
// replaces it there) and stops reserving space the loaded toolbar does not use.
const SKEL_CONTROL_STYLE = "height:calc(var(--text-body) * 1.4 + var(--space-sm) * 2 + 2px);border-radius:var(--radius-md);";

// Skeleton geometry for table-cell badge and switch placeholders, matched to
// the loaded controls in styles.js. Badge: caption size x body line-height
// 1.5 + 2 x 3px padding + 2px border = 26px, pill radius. Switch: 38x21,
// pill radius (set inline because .skel's 4px radius is declared after
// .switch and would win if the .switch class were reused).
const SKEL_BADGE_STYLE = "height:calc(var(--text-caption) * 1.5 + 6px + 2px);border-radius:999px;";
const SKEL_SWITCH_STYLE = "width:38px;height:21px;border-radius:999px;";

// Skeleton geometry for row-action circles, matched to the loaded .btn-icon
// in styles.js (34x34, 50% radius).
const SKEL_ACTION_STYLE = "width:34px;height:34px;border-radius:50%;";

// Neutral chip for informational labels (counts, node type), same recipe as
// .version-badge in styles.js. The .badge dot still renders, in muted color.
const NEUTRAL_BADGE_STYLE = "background:var(--color-surface-raised);color:var(--color-muted);";

// Selected Node chip in the user editor. The name gets min-width:0 so it can
// shrink and end in an ellipsis; the remove button gets flex-shrink:0 so the
// shrinking row cannot squeeze it out of its 34x34 circle. Together a long
// name no longer pushes the button outside the chip's overflow:hidden box.
const NODE_CHIP_LABEL_STYLE = "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
const NODE_CHIP_REMOVE_STYLE = "flex-shrink:0;";

function renderUsersView() {
  if (state.loading) {
    return renderShell(\`
      <div class="toolbar">
        <div class="toolbar-left"><div class="skel search-input" style="width:100%;\${SKEL_CONTROL_STYLE}"></div></div>
        <div class="skel desktop-only-action" style="width:112px;\${SKEL_CONTROL_STYLE}"></div>
      </div>
      <div class="card">
        <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Sources</th><th>Created At</th><th></th></tr></thead>
          <tbody>
            \${[1,2,3,4,5].map(() => \`
              <tr>
                <td data-label="Name"><div class="row-name-cell"><div class="skel" style="\${SKEL_ACTION_STYLE}flex-shrink:0;"></div><div class="skel" style="width:130px;height:13px;"></div></div></td>
                <td data-label="Sources"><div class="skel" style="width:76px;\${SKEL_BADGE_STYLE}"></div></td>
                <td data-label="Created At"><div class="skel" style="width:64px;height:12px;"></div></td>
                <td data-label=""><div class="skel-row-actions">\${[1,2].map(() => '<div class="skel" style="' + SKEL_ACTION_STYLE + '"></div>').join("")}</div></td>
              </tr>
            \`).join("")}
          </tbody>
        </table>
        </div>
      </div>
    \`);
  }

  const filtered = state.users.filter(u =>
    !state.userSearch || u.name.toLowerCase().includes(state.userSearch.toLowerCase())
  );
  const sorted = sortRows(filtered, state.userSort);

  const rows = sorted.map(u => \`
    <tr class="row-hover">
      <td data-label="Name"><div class="row-name-cell"><button class="btn-icon icon-link" title="Subscription link and QR" aria-label="Subscription link and QR" onclick="openSubFormatPicker('\${u.id}', '\${escapeHtml(u.name).replace(/'/g, "&#39;")}')">\${icon("merge")}</button><span class="row-name" onclick="openUser('\${u.id}')">\${escapeHtml(u.name)}</span>\${u._pending ? ' <span class="spinner" title="Saving…"></span>' : ''}</div></td>
      <td data-label="Sources">
        <div class="badge-row">
          <span class="badge" style="\${NEUTRAL_BADGE_STYLE}">\${u.subCount} subs</span>
          <span class="badge" style="\${NEUTRAL_BADGE_STYLE}">\${u.rawCount} raw</span>
        </div>
      </td>
      <td class="timestamp" data-label="Created At">\${formatDate(u.createdAt)}</td>
      <td data-label="">
        <div class="row-actions">
          <button class="btn-icon icon-merge" title="Merge / QR" onclick="openMerge('\${u.id}')">\${icon("merge")}</button>
          <button class="btn-icon icon-more row-menu-trigger" data-user-id="\${u.id}" title="More actions" aria-label="More actions" aria-haspopup="menu" aria-expanded="\${state.menu && state.menu.userId === u.id ? "true" : "false"}" onclick="openRowMenu('\${u.id}')">\${icon("more")}</button>
        </div>
      </td>
    </tr>
  \`).join("");

  return renderShell(\`
    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-input" placeholder="Search users…" value="\${escapeHtml(state.userSearch)}"
               oninput="state.userSearch=this.value; render();" />
      </div>
      <button class="btn-primary desktop-only-action" onclick="openUserEditor()">+ New User</button>
    </div>
    <button class="mobile-fab" onclick="openUserEditor()" aria-label="New User" title="New User">\${icon("plus")}</button>
    <div class="card">
      \${state.loadError
        ? '<div class="empty-state"><div class="error-text">Could not load users. Please try again.</div></div>'
        : sorted.length === 0
        ? '<div class="empty-state"><div class="empty-state-icon">' + icon("users") + '</div>No users yet. Create one to get started.</div>'
        : \`
          <div class="table-wrap">
          <table class="data-table\${state.animateRows ? " rows-animate" : ""}">
            <thead>
              <tr>
                <th onclick="setUserSort('name')">Name\${sortIndicator(state.userSort, "name")}</th>
                <th>Sources</th>
                <th onclick="setUserSort('createdAt')">Created At\${sortIndicator(state.userSort, "createdAt")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>\${rows}</tbody>
          </table>
          </div>
        \`}
    </div>
  \`);
}

async function openUserEditor() {
  state.editingUser = null;
  state.editingUserSources = [""];
  state.editingUserNodeIds = [];
  state.modal = "userEditor";
  render();
  try {
    await loadNodes();
    render();
  } catch (e) {
    /* Node list just stays empty — sources-only editing still works */
  }
}

// ---------------------------------------------------------------------
// SOURCE REPEATER — one row per state.editingUserSources[i], used by the
// userEditor modal. updateSourceRow() only writes into the array (no
// render) so the textarea keeps focus/caret while typing; add/remove
// change row count and need a re-render.
// ---------------------------------------------------------------------
function addSourceRow() {
  state.editingUserSources.push("");
  render();
}

function removeSourceRow(i) {
  state.editingUserSources.splice(i, 1);
  render();
}

function updateSourceRow(i, value) {
  state.editingUserSources[i] = value;
}

async function saveUser() {
  const isEdit = state.editingUser && state.editingUser.id;
  const name = document.getElementById("userNameInput").value.trim();
  if (!name) { showToast("Name is required.", true); return; }
  const sources = state.editingUserSources.map(s => s.trim()).filter(Boolean);

  if (isEdit) {
    const id = state.editingUser.id;
    closeModal();
    const idx = state.users.findIndex(u => u.id === id);
    const prev = idx !== -1 ? state.users[idx] : null;
    if (idx !== -1) { state.users[idx] = { ...prev, _pending: true, _pendingKind: "sources" }; render(); }
    try {
      const result = await apiFetch("/api/users/" + id, { method: "PUT", body: JSON.stringify({ name, sources, nodeIds: state.editingUserNodeIds }) });
      const u = result.user;
      if (idx !== -1) {
        state.users[idx] = {
          ...state.users[idx], name: u.name, enabled: u.enabled,
          subCount: u.sources.filter(s => s.type === "subscription").length,
          rawCount: u.sources.filter(s => s.type !== "subscription").length,
          updatedAt: u.updatedAt, _pending: false
        };
      }
      render();
      if (result.invalidSources && result.invalidSources.length) {
        showToast(result.invalidSources.length + " line(s) skipped — invalid format.", true);
      } else {
        showToast("User updated.");
      }
    } catch (e) {
      if (idx !== -1 && prev) state.users[idx] = prev;
      showToast("Could not save user.", true);
      render();
    }
  } else {
    closeModal();
    const tempId = "temp-" + Date.now();
    state.users.push({ id: tempId, name, enabled: true, subCount: 0, rawCount: 0, createdAt: Date.now(), updatedAt: Date.now(), _pending: true, _pendingKind: "create" });
    render();
    try {
      const result = await apiFetch("/api/users", { method: "POST", body: JSON.stringify({ name, sources, nodeIds: state.editingUserNodeIds }) });
      const u = result.user;
      const idx = state.users.findIndex(x => x.id === tempId);
      state.users[idx] = {
        id: u.id, name: u.name, enabled: u.enabled !== false, createdAt: u.createdAt,
        subCount: u.sources.filter(s => s.type === "subscription").length,
        rawCount: u.sources.filter(s => s.type !== "subscription").length,
        updatedAt: u.updatedAt, _pending: false
      };
      render();
      if (result.invalidSources && result.invalidSources.length) {
        showToast(result.invalidSources.length + " line(s) skipped — invalid format.", true);
      } else {
        showToast("User created.");
      }
    } catch (e) {
      state.users = state.users.filter(u => u.id !== tempId);
      showToast("Could not create user.", true);
      render();
    }
  }
}

function askDeleteUser(id, name) {
  state.confirmDialog = {
    title: "Delete user?",
    message: \`This permanently deletes "\${name}" and all its subscription sources. This cannot be undone.\`,
    danger: true,
    confirmLabel: "Delete",
    onConfirm: () => performDeleteUser(id)
  };
  state.modal = "confirm";
  render();
}

async function performDeleteUser(id) {
  closeModal();
  const prev = state.users;
  state.users = state.users.filter(u => u.id !== id);
  render();
  try {
    await apiFetch("/api/users/" + id, { method: "DELETE" });
    showToast("User deleted.");
  } catch (e) {
    state.users = prev;
    showToast("Could not delete user.", true);
    render();
  }
}

// Combined per-user subscription link (/sub/user/:id). One link works for
// every client — the server auto-detects sing-box/Clash/plain from the
// requesting client's User-Agent (see detectFormatFromUserAgent in
// output-formats.js), so there's no format to pick here anymore.
function buildSubUrl(id) {
  return location.origin + "/sub/user/" + id;
}

function openSubFormatPicker(id, name) {
  state.modal = "subFormat";
  state.subFormatTarget = { id, name };
  render();
  setTimeout(() => {
    const el = document.getElementById("subFormatQrBox");
    if (el && window.qrcodegen) {
      const qr = qrcodegen.QrCode.encodeText(buildSubUrl(id), qrcodegen.QrCode.Ecc.MEDIUM);
      el.innerHTML = qr.toSvgString(4);
    }
  }, 0);
}

function copySubFormatLink() {
  const t = state.subFormatTarget;
  if (!t) return;
  navigator.clipboard.writeText(buildSubUrl(t.id));
  showToast("Copied to clipboard!");
}

async function toggleUserEnabled(id) {
  const idx = state.users.findIndex(u => u.id === id);
  if (idx === -1 || state.users[idx]._pending) return;
  const prevEnabled = state.users[idx].enabled;
  state.users[idx] = { ...state.users[idx], enabled: !prevEnabled, _pending: true, _pendingKind: "toggle" };
  render();
  try {
    const result = await apiFetch("/api/users/" + id, { method: "PUT", body: JSON.stringify({ enabled: !prevEnabled }) });
    state.users[idx] = { ...state.users[idx], enabled: result.user.enabled, _pending: false };
    render();
    showToast(result.user.enabled ? "User enabled." : "User disabled.");
  } catch (e) {
    state.users[idx] = { ...state.users[idx], enabled: prevEnabled, _pending: false };
    showToast("Could not update user status.", true);
    render();
  }
}

// ---------------------------------------------------------------------
// ROW MENU — the "..." actions menu on a Users row. The table scrolls
// inside .table-wrap (overflow-x: auto), which would clip a dropdown
// placed in the row, so the menu is one position:fixed element drawn by
// renderShell() after the modal. A transparent backdrop closes it on an
// outside click; Escape, scrolling, resizing, choosing an item,
// navigating and the login view close it too. Opening and closing add
// and remove the two elements directly instead of calling render(), which
// would rebuild the table and reset its horizontal scroll, moving the
// button from under the menu. Any other render() while the menu is open
// redraws it from state.menu and positionRowMenu() places it again.
// Classes live in styles.js (.row-menu*).
// ---------------------------------------------------------------------
const ROW_MENU_GAP = 4;
const ROW_MENU_EDGE = 8;

function rowMenuTrigger(userId) {
  return document.querySelector('.row-menu-trigger[data-user-id="' + userId + '"]');
}

function removeRowMenuElements() {
  const menu = document.getElementById("rowMenu");
  if (menu) menu.remove();
  const backdrop = document.querySelector(".row-menu-backdrop");
  if (backdrop) backdrop.remove();
}

function openRowMenu(userId) {
  const shell = document.querySelector(".app-shell");
  if (!shell) return;
  removeRowMenuElements();
  state.menu = { userId };
  shell.insertAdjacentHTML("beforeend", renderRowMenu());
  const btn = rowMenuTrigger(userId);
  if (btn) btn.setAttribute("aria-expanded", "true");
  positionRowMenu();
  const first = document.querySelector("#rowMenu .row-menu-item");
  if (first) first.focus();
}

// restoreFocus is only passed for Escape, so a keyboard user lands back on
// the button; after a click or a scroll focus is left alone.
function closeRowMenu(restoreFocus) {
  if (!state.menu) return;
  const userId = state.menu.userId;
  state.menu = null;
  removeRowMenuElements();
  const btn = rowMenuTrigger(userId);
  if (!btn) return;
  btn.setAttribute("aria-expanded", "false");
  if (restoreFocus) btn.focus({ preventScroll: true });
}

// Right edge on the button's right edge, below the button, flipped above
// it when there is no room; always kept inside the viewport. If the row is
// gone (deleted, or filtered out by the search) the menu is dropped.
function positionRowMenu() {
  if (!state.menu) return;
  const el = document.getElementById("rowMenu");
  const btn = rowMenuTrigger(state.menu.userId);
  if (!el || !btn) {
    state.menu = null;
    removeRowMenuElements();
    return;
  }
  const r = btn.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const left = Math.max(ROW_MENU_EDGE, Math.min(r.right - w, vw - w - ROW_MENU_EDGE));
  let top = r.bottom + ROW_MENU_GAP;
  if (top + h > vh - ROW_MENU_EDGE) top = Math.max(ROW_MENU_EDGE, r.top - ROW_MENU_GAP - h);
  el.style.left = left + "px";
  el.style.top = top + "px";
}

// The item handlers take the user from state.users by id at click time, so
// no name is put in an inline onclick string (a name containing an
// apostrophe would break it).
function menuEditUser() {
  const userId = state.menu && state.menu.userId;
  state.menu = null;
  if (userId) openUser(userId); else render();
}

function menuToggleUser() {
  const userId = state.menu && state.menu.userId;
  // closeRowMenu() rather than a bare state reset: toggleUserEnabled() can
  // return without rendering (row gone or still saving), which would leave
  // the menu on screen.
  closeRowMenu();
  if (userId) toggleUserEnabled(userId);
}

function menuDeleteUser() {
  const userId = state.menu && state.menu.userId;
  state.menu = null;
  const u = userId && state.users.find(x => x.id === userId);
  if (u) askDeleteUser(u.id, u.name); else render();
}

function renderRowMenu() {
  if (!state.menu || state.view !== "users") return "";
  const u = state.users.find(x => x.id === state.menu.userId);
  if (!u) return "";
  const toggleLabel = u.enabled ? "Deactivate" : "Activate";
  const toggleIcon = u.enabled ? "deactivate" : "activate";
  return '<div class="row-menu-backdrop" onclick="closeRowMenu()"></div>' +
    '<div class="row-menu" id="rowMenu" role="menu" aria-label="User actions">' +
      '<button type="button" class="row-menu-item" role="menuitem" onclick="menuToggleUser()"><span class="row-menu-icon">' + icon(toggleIcon) + '</span>' + toggleLabel + '</button>' +
      '<button type="button" class="row-menu-item" role="menuitem" onclick="menuEditUser()"><span class="row-menu-icon">' + icon("edit") + '</span>Edit</button>' +
      '<button type="button" class="row-menu-item danger" role="menuitem" onclick="menuDeleteUser()"><span class="row-menu-icon">' + icon("delete") + '</span>Delete</button>' +
    '</div>';
}

// ---------------------------------------------------------------------
// NODES — reusable Name+Source pairs assignable to any User. Node CRUD
// mirrors the Users list/edit pattern above; the Node picker used inside
// the userEditor modal lives further down alongside that modal.
// ---------------------------------------------------------------------
function renderNodesView() {
  if (state.loading) {
    return renderShell(\`
      <div class="toolbar">
        <div class="toolbar-left"></div>
        <div class="skel desktop-only-action" style="width:112px;\${SKEL_CONTROL_STYLE}"></div>
      </div>
      <div class="card">
        <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Type</th><th>Active</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            \${[1,2,3].map(() => \`
              <tr>
                <td data-label="Name"><div class="skel" style="width:130px;height:13px;"></div></td>
                <td data-label="Type"><div class="skel" style="width:76px;\${SKEL_BADGE_STYLE}"></div></td>
                <td data-label="Active"><div class="skel" style="\${SKEL_SWITCH_STYLE}"></div></td>
                <td data-label="Updated"><div class="skel" style="width:64px;height:12px;"></div></td>
                <td data-label=""><div class="skel-row-actions">\${[1,2].map(() => '<div class="skel" style="' + SKEL_ACTION_STYLE + '"></div>').join("")}</div></td>
              </tr>
            \`).join("")}
          </tbody>
        </table>
        </div>
      </div>
    \`);
  }

  const rows = state.nodes.map(n => \`
    <tr class="row-hover">
      <td data-label="Name"><span class="row-name" onclick="openNode('\${n.id}')">\${escapeHtml(n.name)}</span></td>
      <td data-label="Type"><span class="badge" style="\${NEUTRAL_BADGE_STYLE}">\${n.source.type}</span></td>
      <td data-label="Active">
        <button class="switch \${n.enabled ? "on" : ""} \${n._pending ? "pending" : ""}" role="switch" aria-checked="\${n.enabled ? "true" : "false"}"
                title="\${n.enabled ? "Active — click to disable" : "Disabled — click to enable"}"
                onclick="toggleNodeEnabled('\${n.id}')"><span class="switch-knob"></span>\${n._pending ? '<span class="spinner switch-spinner"></span>' : ''}</button>
      </td>
      <td class="timestamp" data-label="Updated">\${timeAgo(n.updatedAt)}</td>
      <td data-label="">
        <div class="row-actions">
          <button class="btn-icon icon-edit" title="Edit" onclick="openNode('\${n.id}')">\${icon("edit")}</button>
          <button class="btn-icon icon-delete" title="Delete" onclick="askDeleteNode('\${n.id}', '\${escapeHtml(n.name).replace(/'/g, "&#39;")}')">\${icon("delete")}</button>
        </div>
      </td>
    </tr>
  \`).join("");

  return renderShell(\`
    <div class="toolbar">
      <div class="toolbar-left"></div>
      <button class="btn-primary desktop-only-action" onclick="openNodeEditor()">+ New Node</button>
    </div>
    <button class="mobile-fab" onclick="openNodeEditor()" aria-label="New Node" title="New Node">\${icon("plus")}</button>
    <div class="card">
      \${state.loadError
        ? '<div class="empty-state"><div class="error-text">Could not load nodes. Please try again.</div></div>'
        : state.nodes.length === 0
        ? '<div class="empty-state"><div class="empty-state-icon">' + icon("link") + '</div>No nodes yet. Create one to reuse across users.</div>'
        : \`
          <div class="table-wrap">
          <table class="data-table\${state.animateRows ? " rows-animate" : ""}">
            <thead><tr><th>Name</th><th>Type</th><th>Active</th><th>Updated</th><th></th></tr></thead>
            <tbody>\${rows}</tbody>
          </table>
          </div>
        \`}
    </div>
  \`);
}

function openNodeEditor() {
  state.editingNode = null;
  state.editingNodeSource = "";
  state.modal = "nodeEditor";
  render();
}

async function openNode(id) {
  state.modal = "nodeEditor";
  state.editingNode = state.nodes.find(n => n.id === id) || { id };
  state.editingNodeSource = "";
  render();
  try {
    const data = await apiFetch("/api/nodes/" + id);
    state.editingNode = data.node;
    state.editingNodeSource = data.node.source.value || data.node.source.url || "";
    render();
  } catch (e) {
    closeModal();
  }
}

async function saveNode() {
  if (state.savingNode) return; // ignore repeated Save clicks while a request is in flight
  const isEdit = state.editingNode && state.editingNode.id;
  const name = document.getElementById("nodeNameInput").value.trim();
  const errorEl = document.getElementById("nodeNameError");
  if (errorEl) errorEl.textContent = "";
  if (!name) { showToast("Name is required.", true); return; }
  const source = document.getElementById("nodeSourceInput").value.trim();
  if (!source) { showToast("Source is required.", true); return; }

  state.savingNode = true;
  setButtonPending("nodeSaveBtn", true, "Saving…", "Save");
  try {
    const result = isEdit
      ? await apiFetch("/api/nodes/" + state.editingNode.id, { method: "PUT", body: JSON.stringify({ name, source }) })
      : await apiFetch("/api/nodes", { method: "POST", body: JSON.stringify({ name, source }) });

    if (result.error === "duplicate_name") {
      if (errorEl) errorEl.textContent = "A node with this name already exists.";
      return;
    }
    if (result.error) {
      showToast("Could not save node — check the source format.", true);
      return;
    }

    if (isEdit) {
      const idx = state.nodes.findIndex(n => n.id === result.node.id);
      if (idx !== -1) state.nodes[idx] = result.node; else state.nodes.push(result.node);
      closeModal();
      showToast("Node updated.");
    } else {
      state.nodes.push(result.node);
      closeModal();
      showToast("Node created.");
    }
  } catch (e) {
    // Request failed: keep the modal open so the entered values are not lost.
    showToast("Could not save node.", true);
  } finally {
    state.savingNode = false;
    setButtonPending("nodeSaveBtn", false, "", "Save");
  }
}

function askDeleteNode(id, name) {
  state.confirmDialog = {
    title: "Delete node?",
    message: \`This removes "\${name}" from every user it's assigned to. This cannot be undone.\`,
    danger: true,
    confirmLabel: "Delete",
    onConfirm: () => performDeleteNode(id)
  };
  state.modal = "confirm";
  render();
}

async function performDeleteNode(id) {
  closeModal();
  const prev = state.nodes;
  state.nodes = state.nodes.filter(n => n.id !== id);
  render();
  try {
    await apiFetch("/api/nodes/" + id, { method: "DELETE" });
    showToast("Node deleted.");
  } catch (e) {
    state.nodes = prev;
    showToast("Could not delete node.", true);
    render();
  }
}

async function toggleNodeEnabled(id) {
  const idx = state.nodes.findIndex(n => n.id === id);
  if (idx === -1 || state.nodes[idx]._pending) return;
  const prevEnabled = state.nodes[idx].enabled;
  state.nodes[idx] = { ...state.nodes[idx], enabled: !prevEnabled, _pending: true };
  render();
  try {
    const result = await apiFetch("/api/nodes/" + id, { method: "PUT", body: JSON.stringify({ enabled: !prevEnabled }) });
    state.nodes[idx] = result.node;
    render();
    showToast(result.node.enabled ? "Node enabled." : "Node disabled.");
  } catch (e) {
    state.nodes[idx] = { ...state.nodes[idx], enabled: prevEnabled, _pending: false };
    showToast("Could not update node status.", true);
    render();
  }
}

// ---------------------------------------------------------------------
// NODE PICKER — used inside the userEditor modal. Selected chips render
// above the Available buttons; Available excludes anything already
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
  return \`
    <div class="field-group">
      <label class="field-label">Nodes</label>
      \${selected.length ? \`
        <div class="badge-row" style="margin-bottom:8px;flex-wrap:wrap;">
          \${selected.map(n => \`
            <span class="badge" style="\${NEUTRAL_BADGE_STYLE}"><span style="\${NODE_CHIP_LABEL_STYLE}">\${escapeHtml(n.name)}</span> <button type="button" class="btn-icon icon-delete" title="Remove" style="\${NODE_CHIP_REMOVE_STYLE}" onclick="removeNodeFromUser('\${n.id}')">\${icon("delete")}</button></span>
          \`).join("")}
        </div>
      \` : ""}
      \${available.length ? \`
        <div class="badge-row" style="flex-wrap:wrap;">
          \${available.map(n => \`<button type="button" class="btn-secondary" onclick="addNodeToUser('\${n.id}')">+ \${escapeHtml(n.name)}</button>\`).join("")}
        </div>
      \` : ""}
      \${state.nodes.length === 0 ? '<div class="helper-text">No nodes yet — create one from the Nodes section.</div>' : ""}
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

// ---------------------------------------------------------------------
// USER EDITOR + MERGE PREVIEW
// ---------------------------------------------------------------------
async function openUser(id) {
  state.modal = "userEditor";
  state.editingUser = state.users.find(u => u.id === id) || { id };
  state.editingUserSources = [""];
  state.editingUserNodeIds = [];
  render();
  try {
    const [data] = await Promise.all([apiFetch("/api/users/" + id), loadNodes()]);
    state.editingUser = data.user;
    state.editingUserSources = data.user.sources.map(s =>
      (s.type === "raw" || s.type === "json" || s.type === "yaml") ? s.value : s.url
    );
    if (state.editingUserSources.length === 0) state.editingUserSources = [""];
    state.editingUserNodeIds = (data.user.nodeIds || []).filter(nid =>
      state.nodes.some(n => n.id === nid && n.enabled !== false)
    );
    render();
  } catch (e) {
    closeModal();
  }
}

async function openMerge(id) {
  state.modal = "merge";
  state.mergeResult = { loading: true, userId: id };
  render();
  // The loading overlay can be dismissed via the backdrop, so a response (or
  // failure) may arrive after the modal was closed or reopened for another
  // user. Only apply it while this request is still the one being shown.
  const isCurrent = () => state.modal === "merge" && state.mergeResult && state.mergeResult.userId === id;
  try {
    const data = await apiFetch("/api/merge-preview", {
      method: "POST",
      body: JSON.stringify({ userId: id })
    });
    if (!isCurrent()) return;
    state.mergeResult = { ...data, loading: false, userId: id };
    render();
    setTimeout(() => {
      const qrEl = document.getElementById("qrContainer");
      if (qrEl && window.qrcodegen) {
        const fullUrl = location.origin + data.subUrl;
        const qr = qrcodegen.QrCode.encodeText(fullUrl, qrcodegen.QrCode.Ecc.MEDIUM);
        qrEl.innerHTML = qr.toSvgString(4);
      }
    }, 0);
  } catch (e) {
    if (!isCurrent()) return;
    // closeModal() also clears state.mergeResult, ending the loading state.
    closeModal();
    showToast("Could not load merge preview.", true);
  }
}

function copyLink() {
  const input = document.getElementById("subLinkInput");
  input.select();
  navigator.clipboard.writeText(input.value);
  showToast("Copied to clipboard!");
}

// ---------------------------------------------------------------------
// MODALS
// ---------------------------------------------------------------------
function closeModal() {
  state.modal = null;
  state.mergeResult = null;
  state.editingUser = null;
  state.editingUserSources = null;
  state.editingUserNodeIds = null;
  state.editingNode = null;
  state.editingNodeSource = "";
  state.confirmDialog = null;
  state.subFormatTarget = null;
  state.subFormatSelected = null;
  render();
}

function renderModal() {
  if (state.modal === "subFormat") {
    const t = state.subFormatTarget;
    const fullUrl = buildSubUrl(t.id);
    return \`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="card modal-card small">
          <div class="modal-title">Subscription — \${escapeHtml(t.name)}</div>
          <div class="helper-text" style="margin-bottom:var(--space-md);">One link works with any supported client — the format is detected automatically.</div>
          <div class="qr-box" id="subFormatQrBox"></div>
          <label class="field-label">Subscription Link</label>
          <div class="link-row">
            <input id="subFormatLinkInput" readonly value="\${fullUrl}" />
            <button class="btn-primary" onclick="copySubFormatLink()">Copy</button>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Close</button>
          </div>
        </div>
      </div>
    \`;
  }

  if (state.modal === "userEditor") {
    const u = state.editingUser;
    const isEdit = u && u.id;
    return \`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="card modal-card">
          <div class="modal-title">\${isEdit ? "Edit User" : "New User"}</div>
          <div class="field-group">
            <label class="field-label">Name</label>
            <input id="userNameInput" value="\${isEdit ? escapeHtml(u.name) : ""}" placeholder="e.g. Alice" />
          </div>
          \${renderNodePicker()}
          <div class="field-group">
            <label class="field-label">Sources</label>
            <div class="helper-text" style="margin-bottom:var(--space-sm);">Paste subscription URLs, individual vless/vmess/ss/trojan links, or an Xray/V2Ray JSON outbound — each source gets its own row (JSON entries can span multiple lines within a row).</div>
            <div class="source-repeater">
              \${state.editingUserSources.map((val, i) => \`
                <div class="source-row">
                  <textarea class="source-row-input" rows="2" placeholder="https://example.com/sub-link" oninput="updateSourceRow(\${i}, this.value)">\${escapeHtml(val)}</textarea>
                  <button type="button" class="btn-icon icon-delete" title="Remove source" onclick="removeSourceRow(\${i})">\${icon("delete")}</button>
                </div>
              \`).join("")}
            </div>
            <button type="button" class="btn-secondary" onclick="addSourceRow()">+ Add Source</button>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-primary" onclick="saveUser()">Save</button>
          </div>
        </div>
      </div>
    \`;
  }

  if (state.modal === "nodeEditor") {
    const n = state.editingNode;
    const isEdit = n && n.id;
    return \`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="card modal-card">
          <div class="modal-title">\${isEdit ? "Edit Node" : "New Node"}</div>
          <div class="field-group">
            <label class="field-label">Name</label>
            <input id="nodeNameInput" value="\${isEdit ? escapeHtml(n.name) : ""}" placeholder="e.g. US-East" oninput="document.getElementById('nodeNameError').textContent=''" />
            <div class="error-text" id="nodeNameError"></div>
          </div>
          <div class="field-group">
            <label class="field-label">Source</label>
            <div class="helper-text" style="margin-bottom:var(--space-sm);">A subscription URL, a single vless/vmess/ss/trojan link, or an Xray/V2Ray JSON outbound.</div>
            <textarea id="nodeSourceInput" rows="3" placeholder="https://example.com/sub-link">\${escapeHtml(state.editingNodeSource)}</textarea>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-primary" id="nodeSaveBtn" onclick="saveNode()">Save</button>
          </div>
        </div>
      </div>
    \`;
  }

  if (state.modal === "merge") {
    const r = state.mergeResult;
    if (r.loading) {
      return \`
        <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
          <div class="card modal-card">
            <div class="modal-title">Merge Result</div>
            <div class="stat-row">
              <div class="stat-box"><div class="skel" style="width:36px;height:22px;margin:0 auto 4px;"></div><div class="skel" style="width:64px;height:11px;margin:0 auto;"></div></div>
              <div class="stat-box"><div class="skel" style="width:36px;height:22px;margin:0 auto 4px;"></div><div class="skel" style="width:90px;height:11px;margin:0 auto;"></div></div>
            </div>
            <div class="skel" style="width:clamp(140px, 45vw, 180px);height:clamp(140px, 45vw, 180px);margin:16px auto;border-radius:12px;"></div>
            <div class="skel" style="width:90px;height:11px;margin-bottom:6px;"></div>
            <div class="skel" style="width:100%;height:36px;"></div>
          </div>
        </div>
      \`;
    }
    const fullUrl = location.origin + r.subUrl;
    return \`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="card modal-card">
          <div class="modal-title">Merge Result</div>
          <div class="stat-row">
            <div class="stat-box"><div class="stat-num">\${r.totalNodes}</div><div class="stat-label">Total Nodes</div></div>
            <div class="stat-box"><div class="stat-num">\${r.duplicatesRemoved}</div><div class="stat-label">Duplicates Removed</div></div>
          </div>
          <div class="qr-box" id="qrContainer"></div>
          <label class="field-label">Subscription Link</label>
          <div class="link-row">
            <input id="subLinkInput" readonly value="\${fullUrl}" />
            <button class="btn-primary" onclick="copyLink()">Copy</button>
          </div>
          \${renderSourceIssues(r.sourceErrors)}
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Close</button>
          </div>
        </div>
      </div>
    \`;
  }

  if (state.modal === "settings") {
    return \`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="card modal-card small">
          <div class="modal-title">Settings</div>
          <button class="btn-primary" style="width:100%;" onclick="location.href='/change-panel-password'">Change Panel Password</button>
          <div class="helper-text">
            Rotates your admin password. Sessions and subscription links keep working.
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Close</button>
          </div>
        </div>
      </div>
    \`;
  }

  if (state.modal === "confirm") {
    const c = state.confirmDialog;
    return \`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="card modal-card small">
          <div class="modal-title">\${escapeHtml(c.title)}</div>
          <div class="helper-text">\${escapeHtml(c.message)}</div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-secondary \${c.danger ? "btn-danger" : ""}" id="confirmActionBtn">\${escapeHtml(c.confirmLabel || "Confirm")}</button>
          </div>
        </div>
      </div>
    \`;
  }

  return "";
}

// ---------------------------------------------------------------------
// ROOT RENDER
// ---------------------------------------------------------------------
function render() {
  const app = document.getElementById("app");
  if (state.view === "login") {
    state.menu = null;
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
  if (state.view === "dashboard") { app.innerHTML = renderDashboardView(); }
  else if (state.view === "users") { app.innerHTML = renderUsersView(); }
  else if (state.view === "nodes") { app.innerHTML = renderNodesView(); }
  else if (state.view === "log") { app.innerHTML = renderLogView(); }

  // The row menu is placed from its button's position in the new DOM.
  positionRowMenu();

  // Confirm dialogs attach their handler post-render since the callback is
  // a closure, not something that survives being stamped into an HTML string.
  const confirmBtn = document.getElementById("confirmActionBtn");
  if (confirmBtn && state.confirmDialog) {
    confirmBtn.onclick = state.confirmDialog.onConfirm;
  }
}

// ---------------------------------------------------------------------
// MATERIAL RIPPLE — shared with the standalone pages (src/pages/
// d1-setup.js, src/pages/change-password-page.js) via RIPPLE_SCRIPT
// (src/frontend/ripple-script.js), so the SPA and those pages run the
// exact same implementation instead of each keeping their own copy. See
// that file for the full behavior comment (selector, light/dark ink,
// pointerdown-only, reduced-motion handling via CSS).
// ---------------------------------------------------------------------
${RIPPLE_SCRIPT}

(async function init() {
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    // The row menu closes first, then an open modal; otherwise fall back to
    // closing the sidebar.
    if (state.menu) closeRowMenu(true);
    else if (state.modal) closeModal();
    else closeSidebar();
  });
  // The fixed-position row menu would drift away from its button, so it
  // closes on any scroll (capture, so the table's own scrolling counts) and
  // on resize.
  window.addEventListener("scroll", () => { if (state.menu) closeRowMenu(); }, true);
  window.addEventListener("resize", () => { if (state.menu) closeRowMenu(); });

  if (state.token) {
    try {
      const path = location.pathname;
      state.view = path === "/Users" ? "users" : path === "/Nodes" ? "nodes" : path === "/Log" ? "log" : "dashboard";
      const canonicalPath = VIEW_PATHS[state.view];
      if (path !== canonicalPath && path !== "/panel") history.replaceState(null, "", canonicalPath);
      await bootAuthenticated();
      return;
    } catch {
      state.view = "login";
      if (location.pathname !== "/login") history.replaceState(null, "", "/login");
    }
  } else {
    state.view = "login";
    if (location.pathname !== "/login") history.replaceState(null, "", "/login");
  }

  // No valid session at this point (either no token was stored, or the
  // token was rejected above). Before showing the login form, check
  // whether authentication has even been initialized yet — this is what
  // decides between the normal login form and the first-run "choose a
  // password" form (see renderLoginView()). /api/version is public and
  // unauthenticated, so this call works even on a completely fresh
  // deployment with no admin account yet.
  try {
    const res = await fetch("/api/version");
    const data = await res.json();
    state.authInitialized = typeof data.authInitialized === "boolean" ? data.authInitialized : true;
  } catch (e) {
    // Connection error: fall back to the normal login form rather than
    // guessing first-run — doLogin()'s own error handling already covers
    // a subsequent connection failure on submit.
    state.authInitialized = true;
  }
  render();
})();

`;
