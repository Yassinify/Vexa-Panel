// =====================================================================
// VEXA — ROUTER: top-level request dispatch
// =====================================================================

import { VEXA_VERSION } from "./constants.js";
import { withCors, json, htmlResponse, svgResponse } from "./http.js";
import { FAVICON_SVG } from "./favicon-assets.js";
import { kvBound } from "./kv.js";
import { requireAuth } from "./jwt.js";
import {
  secretsConfigured,
  handleGenerateSecrets,
  handleChangePassword,
  handleLogin,
} from "./secrets.js";
import { handlePublicUserSub } from "./public-sub.js";
import { renderKvSetupGuide } from "./pages/kv-setup.js";
import { renderApp } from "./pages/app-shell.js";
import { renderSecretPage } from "./pages/secret-page.js";
import { renderChangePanelPasswordPage } from "./pages/change-password-page.js";
import { handleApi } from "./api-router.js";

export async function route(request, env, ctx) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  if (method === "OPTIONS") {
    return withCors(request, new Response(null, { status: 204 }), env);
  }

  // Reachable before KV/secrets are configured — the favicon has no
  // dependency on storage or auth.
  if (pathname === "/favicon.svg" && method === "GET") {
    return svgResponse(FAVICON_SVG);
  }

  // The KV binding is required for every other feature (sessions, users,
  // secret generation). If it isn't bound yet, stop here and walk
  // the admin through binding it rather than letting every downstream call
  // fail with an opaque internal_error.
  if (!kvBound(env)) {
    if (pathname === "/api/version" && method === "GET") {
      return withCors(request, json({ version: VEXA_VERSION }), env);
    }
    if (pathname.startsWith("/api/") || pathname.startsWith("/sub/")) {
      return withCors(request, json({ error: "kv_not_configured" }, 503), env);
    }
    return htmlResponse(renderKvSetupGuide());
  }

  // Per-user combined subscription link — merges every source attached
  // directly to the user into a single output.
  if (pathname.startsWith("/sub/user/") && method === "GET") {
    return handlePublicUserSub(pathname.split("/sub/user/")[1], request, env, url);
  }

  // Required Cloudflare Variables/Secrets missing → force the admin through
  // the setup page rather than serving a panel that can't log anyone in.
  if (
    (pathname === "/" ||
      pathname === "/index.html" ||
      pathname === "/login" ||
      pathname === "/panel" ||
      pathname === "/Dashboard" ||
      pathname === "/Users" ||
      pathname === "/Nodes" ||
      pathname === "/Log") &&
    !secretsConfigured(env)
  ) {
    return Response.redirect(`${url.origin}/secret`, 302);
  }

  if (
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/login" ||
    pathname === "/panel" ||
    pathname === "/Dashboard" ||
    pathname === "/Users" ||
    pathname === "/Nodes" ||
    pathname === "/Log"
  ) {
    return htmlResponse(renderApp());
  }

  if ((pathname === "/secret" || pathname === "/secrets") && method === "GET") {
    return htmlResponse(renderSecretPage(secretsConfigured(env)));
  }

  // Dedicated deep link for the panel's Settings → "Change Panel Password"
  // action. Nothing to change if secrets were never generated in the first
  // place, so send the admin through initial setup instead.
  if (pathname === "/change-panel-password" && method === "GET") {
    if (!secretsConfigured(env)) {
      return Response.redirect(`${url.origin}/secret`, 302);
    }
    return htmlResponse(renderChangePanelPasswordPage());
  }

  // Generating new secret values never reads or writes any existing secret
  // (it's a stateless generator — the Worker can't write its own Variables
  // and Secrets at runtime, only the admin can paste these into the
  // Cloudflare dashboard). In setup mode nothing is configured yet, so
  // there's nothing to protect and no admin session could exist. Once
  // secrets ARE configured, regenerating requires a valid admin session so
  // a stranger who finds /secret can't spam-generate values (they still
  // can't apply them, but there's no reason to let them try).
  if (pathname === "/api/secret/generate" && method === "POST") {
    if (secretsConfigured(env)) {
      const authResult = await requireAuth(request, env);
      if (authResult instanceof Response)
        return withCors(request, authResult, env);
    }
    return withCors(request, await handleGenerateSecrets(request), env);
  }

  // Rotates only ADMIN_PASSWORD_HASH, reusing the existing ADMIN_SALT — a
  // day-to-day "change my password" action that doesn't touch JWT_SECRET
  // or force every other secret to be re-pasted into Cloudflare. Requires
  // secrets to already be configured (nothing to rotate otherwise) and a
  // valid admin session.
  if (pathname === "/api/secret/change-password" && method === "POST") {
    if (!secretsConfigured(env)) {
      return withCors(request, json({ error: "not_configured" }, 400), env);
    }
    const authResult = await requireAuth(request, env);
    if (authResult instanceof Response)
      return withCors(request, authResult, env);
    return withCors(request, await handleChangePassword(request, env), env);
  }

  if (pathname === "/api/login" && method === "POST") {
    return withCors(request, await handleLogin(request, env), env);
  }

  // Public and unauthenticated on purpose — a version string isn't
  // sensitive, and this lets the deployed build be checked with curl
  // (or a monitoring probe) without needing to load the UI or log in.
  if (pathname === "/api/version" && method === "GET") {
    return withCors(request, json({ version: VEXA_VERSION }), env);
  }

  if (pathname.startsWith("/api/")) {
    const authResult = await requireAuth(request, env);
    if (authResult instanceof Response)
      return withCors(request, authResult, env);
    return withCors(
      request,
      await handleApi(pathname, method, request, env, authResult),
      env,
    );
  }

  return json({ error: "not_found" }, 404);
}
