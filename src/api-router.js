import { json } from "./http.js";
import { ensureD1Migrated } from "./backend/database/migrations.js";
import {
  getStats,
  listUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
} from "./users.js";
import { mergePreviewHandler } from "./merge.js";
import { getSettings, updateSettings } from "./settings.js";
import {
  listNodes,
  createNode,
  updateNode,
  deleteNode,
  getNodeUsers,
} from "./nodes.js";

export async function handleApi(pathname, method, request, env, authPayload) {
  // ensureD1Migrated() (src/d1.js) is self-contained per the corrected
  // DK-16 scope: it does not depend on src/kv.js's ensureMigrated() having
  // run, and internally handles legacy KV data (if any) behind its own
  // env.STORAGE guard. Runs before any handler below touches D1, so no
  // D1-backed read here can observe un-migrated data. Reached only after
  // requireAuth() has already validated the caller (src/router.js).
  await ensureD1Migrated(env);

  if (pathname === "/api/stats" && method === "GET") return getStats(env);

  if (pathname === "/api/settings" && method === "GET") return getSettings(env);
  if (pathname === "/api/settings" && method === "PUT")
    return updateSettings(request, env);

  if (pathname === "/api/users" && method === "GET") return listUsers(env);
  if (pathname === "/api/users" && method === "POST")
    return createUser(request, env);

  // A user id is a UUID or, in username mode, the name (letters, digits, - and _).
  const userMatch = pathname.match(/^\/api\/users\/([A-Za-z0-9_-]+)$/);
  if (userMatch) {
    const id = userMatch[1];
    if (method === "GET") return getUser(id, env);
    // Sources now live directly on the user, so updating a user's source
    // list (raw links, subscriptions, JSON, YAML) goes through this same
    // PUT alongside the enabled toggle - there's no separate profile
    // resource to address anymore.
    if (method === "PUT") return updateUser(id, request, env);
    if (method === "DELETE") return deleteUser(id, env);
  }

  if (pathname === "/api/merge-preview" && method === "POST") {
    return mergePreviewHandler(request, env);
  }

  if (pathname === "/api/nodes" && method === "GET") return listNodes(env);
  if (pathname === "/api/nodes" && method === "POST")
    return createNode(request, env);

  // The Users a Node is linked to, for the Node editor's User Selection.
  const nodeUsersMatch = pathname.match(/^\/api\/nodes\/([a-f0-9-]{36})\/users$/);
  if (nodeUsersMatch && method === "GET") return getNodeUsers(nodeUsersMatch[1], env);

  const nodeMatch = pathname.match(/^\/api\/nodes\/([a-f0-9-]{36})$/);
  if (nodeMatch) {
    const id = nodeMatch[1];
    if (method === "PUT") return updateNode(id, request, env);
    if (method === "DELETE") return deleteNode(id, env);
  }

  return json({ error: "not_found" }, 404);
}
