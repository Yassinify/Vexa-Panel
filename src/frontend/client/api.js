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
    clearLoadedData();
    state.view = "login";
    if (location.pathname !== "/login") history.replaceState(null, "", "/login");
    render();
    throw new Error("unauthorized");
  }
  return res.json();
}

// When each data set was last loaded successfully (epoch ms, 0 = never). A load that returns an error body does
// not count. Used to tell whether the data in memory can be shown and when a background refresh is due.
const dataLoadedAt = { stats: 0, users: 0, nodes: 0 };

// True when two loaded values have the same content. The loaders below use it to keep the object already in state
// when a refresh returns nothing new, so anything keyed to that object (the Dashboard count-up) does not replay.
function sameData(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// The same for a list of records with an id: order is ignored, because a sort click stores the displayed order in
// state while the server sends its own order.
function sameList(a, b) {
  const byId = list => [...list].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return sameData(byId(a), byId(b));
}

// Each loader stores a result only when the server sent a real one: an error body keeps what is already loaded.
async function loadDashboard() {
  const data = await apiFetch("/api/stats");
  if (!data || !data.stats) return;
  if (!sameData(state.stats, data.stats)) state.stats = data.stats;
  const activity = data.activity || [];
  if (!sameData(state.activity, activity)) state.activity = activity;
  const userGrowth = data.userGrowth || [];
  if (!sameData(state.userGrowth, userGrowth)) state.userGrowth = userGrowth;
  dataLoadedAt.stats = Date.now();
}

async function loadUsers() {
  const data = await apiFetch("/api/users");
  if (!data || !Array.isArray(data.users)) return;
  if (!sameList(state.users, data.users)) state.users = data.users;
  dataLoadedAt.users = Date.now();
}

async function loadNodes() {
  const data = await apiFetch("/api/nodes");
  if (!data || !Array.isArray(data.nodes)) return;
  if (!sameList(state.nodes, data.nodes)) state.nodes = data.nodes;
  state.nodesLoaded = true;
  dataLoadedAt.nodes = Date.now();
}

// Forgets everything loaded for the session (sign out, rejected token), so the next sign-in cannot show or trust old data.
function clearLoadedData() {
  state.users = [];
  state.nodes = [];
  state.nodesLoaded = false;
  state.stats = null;
  state.activity = [];
  state.userGrowth = [];
  dataLoadedAt.stats = 0;
  dataLoadedAt.users = 0;
  dataLoadedAt.nodes = 0;
}

// Marks loaded data as out of date after an edit (save, delete, toggle), so the next visit to a section that shows it
// refetches in the background. The data stays in memory and keeps being shown meanwhile. A stamp of 1 counts as
// stale (older than DATA_FRESH_MS, see viewDataState() in shell.js); a data set that was never loaded (stamp 0) is
// left alone, because it already loads in full when opened. Keys: "stats", "users" or "nodes".
function markDataStale(...keys) {
  keys.forEach(key => {
    if (dataLoadedAt[key]) dataLoadedAt[key] = 1;
  });
}

// Starts the loads of the sections other than currentView in the background, so a later visit finds their data
// already in memory. A failure is ignored here: that section loads again when it is opened. The needed loads match
// loadViewData() below (Users also needs Nodes, Dashboard and Logs share the stats).
function preloadData(currentView) {
  const needed = [];
  if (currentView !== "dashboard" && currentView !== "log") needed.push(loadDashboard);
  if (currentView !== "users") needed.push(loadUsers);
  if (currentView !== "users" && currentView !== "nodes") needed.push(loadNodes);
  needed.forEach(load => load().catch(() => {}));
}

// Loads the panel settings. An error body or an unknown value keeps the default calendar (Gregorian).
async function loadSettings() {
  const data = await apiFetch("/api/settings");
  if (data && (data.calendar === "gregorian" || data.calendar === "jalali")) state.calendar = data.calendar;
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
