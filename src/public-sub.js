import { mergeUserNodes } from "./merge.js";
import {
  buildFormattedSubResponse,
  buildJsonConfigResponse,
} from "./output-formats.js";
import { htmlResponse } from "./http.js";
import { renderUserSubPage } from "./pages/sub-page.js";
import {
  getUserRowById,
  getUserNodeIds,
  rowToUser,
  touchUserUpdatedAt,
  touchNodesUpdatedAt,
  recordActivity,
} from "./backend/database/d1.js";

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
// subscriptions, YAML) attached directly to the user, deduplicates the
// links, and stops serving nodes the moment the user is disabled.
// JSON configs are never converted or deduplicated: they are returned as
// the original text (see buildJsonConfigResponse()), either on this same
// link when the user has no links, or with ?format=json.
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

  // ?format=json is excluded so the panel's Download button can fetch the JSON from a browser.
  if (isBrowserRequest(request) && url.searchParams.get("format") !== "json") {
    return htmlResponse(renderUserSubPage(user, mergeResult, url));
  }

  // A client app fetching the link is a subscription refresh: it becomes the user's Updated at, and the
  // Updated at of every enabled Node the merge used. Browser views (the status page, the panel's Download)
  // returned or skipped above do not count. Non-fatal: a failed write must not fail the subscription response.
  if (!isBrowserRequest(request)) {
    const refreshedAt = Date.now();
    try {
      await touchUserUpdatedAt(env, id, refreshedAt);
    } catch (err) {
      console.error("touchUserUpdatedAt failed (non-fatal):", err);
    }
    try {
      await touchNodesUpdatedAt(env, mergeResult.usedNodeIds, refreshedAt);
    } catch (err) {
      console.error("touchNodesUpdatedAt failed (non-fatal):", err);
    }
    // One log entry per counted fetch, no throttle (same rule as Updated at). recordActivity() never throws.
    await recordActivity(env, `Updated subscription for user "${user.name}"`);
  }

  const subtitle = `Vexa - ${user.name}`;
  const { nodes, jsonConfigs } = mergeResult;
  const explicitFormat = url.searchParams.get("format");

  // ?format=json returns the user's JSON configs as they are.
  if (explicitFormat === "json") {
    if (jsonConfigs.length === 0) {
      return new Response("Not found", { status: 404 });
    }
    return buildJsonConfigResponse(jsonConfigs, subtitle);
  }

  // A user with JSON configs and no links gets the JSON on the normal link.
  // An explicit sing-box or Clash request still converts links only.
  const wantsConvertedLinks =
    explicitFormat === "singbox" || explicitFormat === "clash";
  if (!wantsConvertedLinks && nodes.length === 0 && jsonConfigs.length > 0) {
    return buildJsonConfigResponse(jsonConfigs, subtitle);
  }

  return buildFormattedSubResponse(nodes, subtitle, url, request);
}

