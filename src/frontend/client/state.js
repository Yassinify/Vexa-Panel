export const STATE_SCRIPT = `
const state = {
  token: localStorage.getItem("vexa_token") || null,
  view: "login",
  loading: false,
  // True only for the single render() that follows a completed data load,
  // so table rows animate in once instead of on every re-render.
  animateRows: false,
  // In-flight guards for submit actions.
  authPending: false,
  errorMsg: "",

  // Whether admin authentication has been initialized yet (D1 auth_config
  // row exists, or a complete Cloudflare Secret triplet is bound) — null
  // until the first /api/version check resolves it. The login view uses
  // this to decide between the normal login form and the first-run
  // "choose a password" form; there is no separate /secret page anymore.
  authInitialized: null,

  users: [],
  // Users table sort: key is "name", "createdAt" or "updatedAt"; dir is "asc" or "desc".
  // The default is today's order, newest created first.
  usersSort: { key: "createdAt", dir: "desc" },

  nodes: [],
  // Nodes table sort: key is "name", "type", "createdAt", "updatedAt" or "editedAt"; dir is "asc" or "desc". The default is newest created first.
  nodesSort: { key: "createdAt", dir: "desc" },
  // True once the Node list has been loaded at least once; the User editor uses the cached list only then.
  nodesLoaded: false,

  stats: null,
  activity: [],
  // Daily total-user snapshots for the Dashboard growth chart (API userGrowth).
  userGrowth: [],
  // Selected range of the growth chart: "week", "month" or "year" (see GROWTH_RANGES).
  growthRange: "week",

  modal: null,
  editingUser: null,
  editingUserSources: null,
  // One boolean per editingUserSources entry: true once the source was added (shown as a preview), false while it is an input.
  editingUserSourcesAdded: null,
  editingUserNodeIds: null,
  // The Name field of the open User editor, kept here so a redraw of the modal does not reset it.
  editingUserName: "",
  editingNode: null,
  editingNodeSource: "",
  mergeResult: null,
  // Item waiting for delete confirmation, {kind: "user" | "node", id}, or null.
  // Used by the delete popup (state.modal === "confirmDelete").
  confirmDelete: null,
  // Secrets-backed Change Password result ({ADMIN_PASSWORD_HASH}), shown in the
  // Change Password popup until it closes; null while the form is shown.
  changePwValues: null
};
`;
