export const API_SCRIPT = `
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
  // Loaded only after a real Node list, not after an error body.
  state.nodesLoaded = Array.isArray(data.nodes);
}

// Sidebar view <-> URL path mapping, used by navigate() and init() for
// path-based routing (/Dashboard, /Users, /Nodes, /Log, /settings).
const VIEW_PATHS = { dashboard: "/Dashboard", users: "/Users", nodes: "/Nodes", log: "/Log", settings: "/settings" };

function loadViewData(view) {
  if (view === "users") {
    // Warm the Node list for the User editor; a failure is ignored here.
    loadNodes().catch(() => {});
    return loadUsers();
  }
  if (view === "nodes") return loadNodes();
  // Settings has no data to load; a resolved promise keeps callers that
  // chain .catch/.finally on the result (navigate()) working.
  if (view === "settings") return Promise.resolve();
  return loadDashboard(); // dashboard and log both read stats/activity
}
`;
