// =====================================================================
// VEXA — API router: dispatches /api/* requests to their handlers
// =====================================================================

import { json } from "./http.js";
import { ensureMigrated } from "./kv.js";
import {
  getStats,
  listUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
} from "./users.js";
import { mergePreviewHandler } from "./merge.js";
import {
  listNodes,
  createNode,
  getNode,
  updateNode,
  deleteNode,
} from "./nodes.js";

export async function handleApi(pathname, method, request, env, authPayload) {
  await ensureMigrated(env);

  if (pathname === "/api/stats" && method === "GET") return getStats(env);

  if (pathname === "/api/users" && method === "GET") return listUsers(env);
  if (pathname === "/api/users" && method === "POST")
    return createUser(request, env);

  const userMatch = pathname.match(/^\/api\/users\/([a-f0-9-]{36})$/);
  if (userMatch) {
    const id = userMatch[1];
    if (method === "GET") return getUser(id, env);
    // Sources now live directly on the user, so updating a user's source
    // list (raw links, subscriptions, JSON, YAML) goes through this same
    // PUT alongside the enabled toggle — there's no separate profile
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

  const nodeMatch = pathname.match(/^\/api\/nodes\/([a-f0-9-]{36})$/);
  if (nodeMatch) {
    const id = nodeMatch[1];
    if (method === "GET") return getNode(id, env);
    if (method === "PUT") return updateNode(id, request, env);
    if (method === "DELETE") return deleteNode(id, env);
  }

  return json({ error: "not_found" }, 404);
}
