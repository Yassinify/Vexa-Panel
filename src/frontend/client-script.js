// =====================================================================
// VEXA — Client-side SPA logic (hand-rolled, no framework). Injected into
// the app shell as an inline <script> — see pages/app-shell.js. Runs as a
// plain classic script (not an ES module), so it cannot use `import`.
// =====================================================================

export const CLIENT_SCRIPT = `
const state = {
  token: localStorage.getItem("vexa_token") || null,
  view: "login",
  loading: false,
  errorMsg: "",

  users: [],
  userSearch: "",
  userSort: { key: "updatedAt", dir: "desc" },

  nodes: [],

  stats: null,
  activity: [],

  modal: null,
  editingUser: null,
  editingUserSources: null,
  editingUserNodeIds: null,
  editingNode: null,
  editingNodeSource: "",
  mergeResult: null,
  confirmDialog: null,
  subFormatTarget: null
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
  return sort.dir === "asc" ? " ↑" : " ↓";
}

// ---------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------
function renderLoginView() {
  return \`
    <div class="login-wrap">
      <div class="card login-card">
        <img class="logo-glow" src="/favicon.svg" alt="VEXA logo">
        <div class="brand">VEXA</div>
        <div class="brand-sub">Secure subscription manager</div>
        <div class="field-group" style="text-align:left;">
          <label class="field-label">Password</label>
          <input type="password" id="loginPassword" placeholder="Enter admin password" />
        </div>
        <button class="btn-primary" style="width:100%;" onclick="doLogin()">Sign In</button>
        <div class="error-text" id="loginError">\${state.errorMsg || ""}</div>
      </div>
    </div>
  \`;
}

async function doLogin() {
  const password = document.getElementById("loginPassword").value;
  state.errorMsg = "";
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

async function bootAuthenticated() {
  state.loading = true;
  render();
  try {
    await loadViewData(state.view);
  } finally {
    state.loading = false;
    render();
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
  state.view = view;
  state.errorMsg = "";
  const path = VIEW_PATHS[view];
  if (path && location.pathname !== path) history.pushState(null, "", path);
  state.loading = true;
  render();
  loadViewData(view).finally(() => { state.loading = false; render(); });
}

function renderSidebar() {
  const items = [
    { key: "dashboard", label: "Dashboard", icon: icon("dashboard") },
    { key: "users", label: "Users", icon: icon("users") },
    { key: "nodes", label: "Nodes", icon: icon("link") },
    { key: "log", label: "Log", icon: icon("log") }
  ];
  return \`
    <div class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <img class="avatar" src="/favicon.svg" alt="VEXA logo">
        <div>
          <div style="font-weight:700;font-size:clamp(13px, .6vw + 12px, 14px);color:var(--accent-light);">VEXA</div>
          <div style="font-size:clamp(9px, .3vw + 8px, 10px);color:var(--text-muted);">Admin Panel</div>
        </div>
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
  return \`
    <div class="app-shell">
      \${renderSidebar()}
      <div class="sidebar-backdrop" id="sidebarBackdrop" onclick="closeSidebar()"></div>
      <div class="main">
        <div class="topbar">
          <div style="display:flex;align-items:center;gap:var(--space-3);">
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
    </div>
  \`;
}

// ---------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------
function renderDashboardView() {
  if (state.loading || !state.stats) {
    return renderShell(\`
      <div class="stat-grid">
        \${[1,2,3,4].map(() => \`
          <div class="card stat-card">
            <div class="skel" style="width:65%;height:11px;margin-bottom:10px;"></div>
            <div class="skel" style="width:38%;height:26px;"></div>
          </div>
        \`).join("")}
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="status-row">
          <span class="skel" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;"></span>
          <div class="skel" style="width:130px;height:13px;"></div>
          <div class="skel" style="width:150px;height:12px;margin-left:auto;"></div>
        </div>
      </div>
    \`);
  }
  const s = state.stats;
  const cards = [
    { label: "Total Users", num: s.totalUsers },
    { label: "Subscription Sources", num: s.totalSubSources },
    { label: "Raw / Static Sources", num: s.totalRawSources }
  ];
  return renderShell(\`
    <div class="stat-grid">
      \${cards.map(c => \`
        <div class="card stat-card">
          <div class="stat-card-label">\${c.label}</div>
          <div class="stat-card-num">\${c.num}</div>
        </div>
      \`).join("")}
    </div>
    <div class="card" style="margin-bottom:16px;">
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
              <div class="skel" style="width:55%;height:13px;"></div>
              <div class="skel" style="width:48px;height:12px;flex-shrink:0;"></div>
            </div>
          \`).join("")}
        </div>
      </div>
    \`);
  }
  const activityHtml = state.activity.length
    ? state.activity.map(a => \`
        <div class="activity-row">
          <span>\${escapeHtml(a.message)}</span>
          <span class="activity-time">\${timeAgo(a.ts)}</span>
        </div>
      \`).join("")
    : '<div class="empty-state">No activity yet.</div>';

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

function renderUsersView() {
  if (state.loading) {
    return renderShell(\`
      <div class="toolbar">
        <div class="toolbar-left"><div class="skel search-input" style="height:34px;"></div></div>
        <div class="skel" style="width:112px;height:34px;border-radius:4px;"></div>
      </div>
      <div class="card">
        <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Sources</th><th>Active</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            \${[1,2,3,4,5].map(() => \`
              <tr>
                <td><div class="skel" style="width:130px;height:13px;"></div></td>
                <td><div class="skel" style="width:76px;height:19px;border-radius:4px;"></div></td>
                <td><div class="skel" style="width:36px;height:20px;border-radius:10px;"></div></td>
                <td><div class="skel" style="width:64px;height:12px;"></div></td>
                <td><div class="skel-row-actions">\${[1,2,3,4].map(() => '<div class="skel" style="width:22px;height:22px;border-radius:50%;"></div>').join("")}</div></td>
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
      <td data-label="Name"><span class="row-name" onclick="openUser('\${u.id}')">\${escapeHtml(u.name)}</span>\${u._pending && u._pendingKind !== "toggle" ? ' <span class="spinner" title="Saving…"></span>' : ''}</td>
      <td data-label="Sources">
        <div class="badge-row">
          <span class="badge">\${u.subCount} subs</span>
          <span class="badge green">\${u.rawCount} raw</span>
        </div>
      </td>
      <td data-label="Active">
        <button class="switch \${u.enabled ? "on" : ""} \${u._pending && u._pendingKind === "toggle" ? "pending" : ""}" role="switch" aria-checked="\${u.enabled ? "true" : "false"}"
                title="\${u.enabled ? "Active — click to disable" : "Disabled — click to enable"}"
                onclick="toggleUserEnabled('\${u.id}')"><span class="switch-knob"></span>\${u._pending && u._pendingKind === "toggle" ? '<span class="spinner switch-spinner"></span>' : ''}</button>
      </td>
      <td class="timestamp" data-label="Updated">\${timeAgo(u.updatedAt)}</td>
      <td data-label="">
        <div class="row-actions">
          <button class="btn-icon icon-link" title="Get subscription link" onclick="openSubFormatPicker('\${u.id}', '\${escapeHtml(u.name).replace(/'/g, "&#39;")}')">\${icon("link")}</button>
          <button class="btn-icon icon-merge" title="Merge / QR" onclick="openMerge('\${u.id}')">\${icon("merge")}</button>
          <button class="btn-icon icon-open" title="Edit sources" onclick="openUser('\${u.id}')">\${icon("open")}</button>
          <button class="btn-icon icon-delete" title="Delete" onclick="askDeleteUser('\${u.id}', '\${escapeHtml(u.name).replace(/'/g, "&#39;")}')">\${icon("delete")}</button>
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
      \${sorted.length === 0
        ? '<div class="empty-state"><div class="empty-state-icon">' + icon("users") + '</div>No users yet. Create one to get started.</div>'
        : \`
          <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th onclick="setUserSort('name')">Name\${sortIndicator(state.userSort, "name")}</th>
                <th>Sources</th>
                <th>Active</th>
                <th onclick="setUserSort('updatedAt')">Updated\${sortIndicator(state.userSort, "updatedAt")}</th>
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
    state.users.push({ id: tempId, name, enabled: true, subCount: 0, rawCount: 0, updatedAt: Date.now(), _pending: true, _pendingKind: "create" });
    render();
    try {
      const result = await apiFetch("/api/users", { method: "POST", body: JSON.stringify({ name, sources, nodeIds: state.editingUserNodeIds }) });
      const u = result.user;
      const idx = state.users.findIndex(x => x.id === tempId);
      state.users[idx] = {
        id: u.id, name: u.name, enabled: u.enabled !== false,
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
  showToast("Link copied to clipboard!");
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
// NODES — reusable Name+Source pairs assignable to any User. Node CRUD
// mirrors the Users list/edit pattern above; the Node picker used inside
// the userEditor modal lives further down alongside that modal.
// ---------------------------------------------------------------------
function renderNodesView() {
  if (state.loading) {
    return renderShell(\`
      <div class="toolbar">
        <div class="toolbar-left"></div>
        <div class="skel" style="width:112px;height:34px;border-radius:4px;"></div>
      </div>
      <div class="card">
        <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Type</th><th>Active</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            \${[1,2,3].map(() => \`
              <tr>
                <td><div class="skel" style="width:130px;height:13px;"></div></td>
                <td><div class="skel" style="width:76px;height:19px;border-radius:4px;"></div></td>
                <td><div class="skel" style="width:36px;height:20px;border-radius:10px;"></div></td>
                <td><div class="skel" style="width:64px;height:12px;"></div></td>
                <td><div class="skel-row-actions">\${[1,2].map(() => '<div class="skel" style="width:22px;height:22px;border-radius:50%;"></div>').join("")}</div></td>
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
      <td data-label="Type"><span class="badge">\${n.source.type}</span></td>
      <td data-label="Active">
        <button class="switch \${n.enabled ? "on" : ""}" role="switch" aria-checked="\${n.enabled ? "true" : "false"}"
                title="\${n.enabled ? "Active — click to disable" : "Disabled — click to enable"}"
                onclick="toggleNodeEnabled('\${n.id}')"><span class="switch-knob"></span></button>
      </td>
      <td class="timestamp" data-label="Updated">\${timeAgo(n.updatedAt)}</td>
      <td data-label="">
        <div class="row-actions">
          <button class="btn-icon" title="Edit" onclick="openNode('\${n.id}')">\${icon("edit")}</button>
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
      \${state.nodes.length === 0
        ? '<div class="empty-state">No nodes yet. Create one to reuse across users.</div>'
        : \`
          <div class="table-wrap">
          <table class="data-table">
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
  const isEdit = state.editingNode && state.editingNode.id;
  const name = document.getElementById("nodeNameInput").value.trim();
  const errorEl = document.getElementById("nodeNameError");
  if (errorEl) errorEl.textContent = "";
  if (!name) { showToast("Name is required.", true); return; }
  const source = document.getElementById("nodeSourceInput").value.trim();
  if (!source) { showToast("Source is required.", true); return; }

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
  if (idx === -1) return;
  const prevEnabled = state.nodes[idx].enabled;
  state.nodes[idx] = { ...state.nodes[idx], enabled: !prevEnabled };
  render();
  try {
    const result = await apiFetch("/api/nodes/" + id, { method: "PUT", body: JSON.stringify({ enabled: !prevEnabled }) });
    state.nodes[idx] = result.node;
    render();
    showToast(result.node.enabled ? "Node enabled." : "Node disabled.");
  } catch (e) {
    state.nodes[idx] = { ...state.nodes[idx], enabled: prevEnabled };
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
            <span class="badge">\${escapeHtml(n.name)} <button type="button" class="btn-icon" style="color:#eab308;width:16px;height:16px;" title="Remove" onclick="removeNodeFromUser('\${n.id}')">\${icon("delete")}</button></span>
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
  const data = await apiFetch("/api/merge-preview", {
    method: "POST",
    body: JSON.stringify({ userId: id })
  });
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
          <div class="helper-text" style="margin-bottom:10px;">One link works with any supported client — the format is detected automatically.</div>
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
            <div class="helper-text" style="margin-bottom:8px;">Paste subscription URLs, individual vless/vmess/ss/trojan links, or an Xray/V2Ray JSON outbound — each source gets its own row (JSON entries can span multiple lines within a row).</div>
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
            <div class="helper-text" style="margin-bottom:8px;">A subscription URL, a single vless/vmess/ss/trojan link, or an Xray/V2Ray JSON outbound.</div>
            <textarea id="nodeSourceInput" rows="3" placeholder="https://example.com/sub-link">\${escapeHtml(state.editingNodeSource)}</textarea>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-primary" onclick="saveNode()">Save</button>
          </div>
        </div>
      </div>
    \`;
  }

  if (state.modal === "merge") {
    const r = state.mergeResult;
    if (r.loading) {
      return \`
        <div class="modal-overlay">
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
          <div class="helper-text" style="margin-bottom:16px;">
            Rotates only ADMIN_PASSWORD_HASH — update just that one value in
            <strong>Variables and Secrets</strong> (type <strong>Secret</strong>). Sessions and links keep working.
          </div>
          <button class="btn-danger btn-secondary" style="width:100%;" onclick="location.href='/secret?action=destroy'">Regenerate All Secrets</button>
          <div class="helper-text">
            Step-by-step walkthrough to replace ADMIN_SALT, ADMIN_PASSWORD_HASH, and JWT_SECRET
            all at once. Every existing session, login token, and subscription link stops
            working until the new values are saved in Cloudflare.
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
          <div class="helper-text" style="font-size:13px;color:var(--text-primary);">\${escapeHtml(c.message)}</div>
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
    app.innerHTML = renderLoginView();
    document.getElementById("loginPassword")?.addEventListener("keydown", e => {
      if (e.key === "Enter") doLogin();
    });
    return;
  }
  if (state.view === "dashboard") { app.innerHTML = renderDashboardView(); }
  else if (state.view === "users") { app.innerHTML = renderUsersView(); }
  else if (state.view === "nodes") { app.innerHTML = renderNodesView(); }
  else if (state.view === "log") { app.innerHTML = renderLogView(); }

  // Confirm dialogs attach their handler post-render since the callback is
  // a closure, not something that survives being stamped into an HTML string.
  const confirmBtn = document.getElementById("confirmActionBtn");
  if (confirmBtn && state.confirmDialog) {
    confirmBtn.onclick = state.confirmDialog.onConfirm;
  }
}

// ---------------------------------------------------------------------
// MATERIAL RIPPLE — a single delegated listener (attached once, not
// per-render) spawns a \`.ripple-ink\` span at the pointer-down point on
// any ripple-eligible element, sized to cover it, then removes itself
// after the CSS animation finishes. Table rows are intentionally excluded:
// <tr> doesn't reliably support position/overflow for this across browsers.
// ---------------------------------------------------------------------
const RIPPLE_SELECTOR = ".btn-primary, .btn-secondary, .btn-danger, .btn-icon, .mobile-fab, .sidebar-link, .format-menu-item, .switch";
const RIPPLE_LIGHT_SELECTOR = ".btn-primary, .btn-danger, .mobile-fab, .switch.on";
function attachRippleEffect() {
  document.addEventListener("pointerdown", e => {
    if (e.button === 1 || e.button === 2) return;
    const target = e.target.closest(RIPPLE_SELECTOR);
    if (!target || target.disabled) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const ripple = document.createElement("span");
    ripple.className = "ripple-ink";
    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.left = (e.clientX - rect.left - size / 2) + "px";
    ripple.style.top = (e.clientY - rect.top - size / 2) + "px";
    ripple.style.background = target.matches(RIPPLE_LIGHT_SELECTOR) ? "rgba(255,255,255,.45)" : "rgba(0,0,0,.15)";
    target.appendChild(ripple);
    const remove = () => ripple.remove();
    ripple.addEventListener("animationend", remove);
    setTimeout(remove, 700); // fallback if animationend never fires
  });
}

(async function init() {
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSidebar(); });
  attachRippleEffect();

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
  render();
})();

`;
