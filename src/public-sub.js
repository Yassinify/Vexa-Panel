// =====================================================================
// VEXA — PUBLIC /sub/user/:id ROUTE
// =====================================================================

import { mergeUserNodes } from "./merge.js";
import { buildFormattedSubResponse } from "./output-formats.js";
import { htmlResponse } from "./http.js";
import { renderUserSubPage } from "./pages/sub-page.js";
import { getUserRowById, getUserNodeIds, rowToUser } from "./d1.js";

// Distinguishes a browser opening the link directly from a VPN client app
// fetching it as a subscription source, so one URL can serve both: a
// browser gets a friendly status page (see pages/sub-page.js), a client
// app gets the exact raw formatted response, unchanged. Client apps
// generally don't send a browser-style "Mozilla" User-Agent.
function isBrowserRequest(request) {
  return /Mozilla/i.test(request.headers.get("User-Agent") || "");
}

// Per-user public subscription link. This is the link shown next to a
// user's name in the panel; it merges every source (raw links,
// subscriptions, JSON, YAML) attached directly to the user, deduplicates
// them, and stops serving nodes the moment the user is disabled.
export async function handlePublicUserSub(id, request, env, url) {
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const row = await getUserRowById(env, id);
  if (!row) return new Response("Not found", { status: 404 });

  // A disabled user's link stops serving nodes immediately.
  if (row.enabled === 0) {
    return new Response("Not found", { status: 404 });
  }

  const nodeIds = await getUserNodeIds(env, id);
  const user = rowToUser(row, nodeIds);

  const mergeResult = await mergeUserNodes(user, env);

  if (isBrowserRequest(request)) {
    return htmlResponse(renderUserSubPage(user, mergeResult, url));
  }

  return buildFormattedSubResponse(mergeResult.nodes, `Vexa - ${user.name}`, url, request);
}

