// =====================================================================
// VEXA — ROUTER: top-level request dispatch
// =====================================================================

import { VEXA_VERSION } from "./constants.js";
import { withCors, json, htmlResponse, svgResponse } from "./http.js";
import { FAVICON_SVG } from "./favicon-assets.js";
import { d1Bound, ensureD1Migrated, resolveAuthConfig } from "./d1.js";
import { requireAuth } from "./jwt.js";
import {
  secretsConfigured,
  handleGenerateSecrets,
  handleInitializeD1Auth,
  handleChangePassword,
  handleLogin,
} from "./secrets.js";
import { handlePublicUserSub } from "./public-sub.js";
import { renderD1SetupGuide } from "./pages/d1-setup.js";
import { renderApp } from "./pages/app-shell.js";
import { renderChangePanelPasswordPage } from "./pages/change-password-page.js";
import { handleApi } from "./api-router.js";

// DK-18: whether authentication is usable right now, from EITHER source —
// unlike secretsConfigured(env) (Cloudflare Secrets only), this is true
// for a D1-backed installation with no Secret bindings at all. Delegates
// entirely to resolveAuthConfig() (src/d1.js) so the Secret-vs-D1
// precedence rule stays defined in exactly one place; this helper adds no
// logic of its own beyond "is the result non-null".
async function authInitialized(env) {
  return (await resolveAuthConfig(env)) !== null;
}

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

  // The D1 binding is required for every other feature (sessions, users,
  // secret generation, rate limiting). If it isn't bound yet, stop here
  // and walk the admin through binding it rather than letting every
  // downstream call fail with an opaque internal_error.
  if (!d1Bound(env)) {
    if (pathname === "/api/version" && method === "GET") {
      return withCors(request, json({ version: VEXA_VERSION }), env);
    }
    if (pathname.startsWith("/api/") || pathname.startsWith("/sub/")) {
      return withCors(request, json({ error: "d1_not_configured" }, 503), env);
    }
    return htmlResponse(renderD1SetupGuide());
  }

  // DK-18: schema bootstrap (including the auth_config table) must exist
  // before ANY of the auth-resolution calls below (authInitialized(),
  // handleLogin(), requireAuth(), handleInitializeD1Auth(), etc.) query
  // it — every one of those now touches D1 via resolveAuthConfig(),
  // unlike before DK-18 when auth never read D1 at all. Previously
  // ensureD1Migrated() only ran deep inside api-router.js's handleApi(),
  // reached solely by already-authenticated /api/* calls; that ordering
  // is preserved (this call is idempotent and memoizes schema readiness
  // per isolate — see ensureD1Ready() in src/d1.js), it is simply also
  // invoked here, earlier, so every route below it has a guaranteed-ready
  // auth_config table. Legacy KV migration logic itself is unchanged.
  await ensureD1Migrated(env);

  // Per-user combined subscription link — merges every source attached
  // directly to the user into a single output.
  if (pathname.startsWith("/sub/user/") && method === "GET") {
    return handlePublicUserSub(pathname.split("/sub/user/")[1], request, env, url);
  }

  // The app shell (login screen + full panel) is served unconditionally
  // for these paths regardless of auth-initialized state — there is no
  // separate first-run setup page to redirect to. The client script
  // (src/frontend/client-script.js) checks /api/version's
  // `authInitialized` flag and renders the first-run "choose a password"
  // form in place of the normal login form when it's false. This
  // replaces the old redirect-to-/secret gate.
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

  // Dedicated deep link for the panel's Settings → "Change Panel Password"
  // action. Nothing to change if auth was never initialized in the first
  // place (neither Secrets nor D1), so send the admin back to the normal
  // login/first-run page instead (there is no separate /secret page to
  // redirect to).
  if (pathname === "/change-panel-password" && method === "GET") {
    if (!(await authInitialized(env))) {
      return Response.redirect(`${url.origin}/`, 302);
    }
    return htmlResponse(renderChangePanelPasswordPage());
  }

  // Two independent flows share this path, distinguished by the current
  // auth state:
  //   - Secret-backed (secretsConfigured(env) true): UNCHANGED legacy
  //     compatibility behavior — a stateless generator whose values the
  //     admin pastes into Cloudflare Dashboard Secrets. Regenerating
  //     requires an existing admin session (no user-facing page links to
  //     this anymore, but the endpoint itself is left intact for any
  //     existing Secret-backed installation already relying on it).
  //   - D1-backed (no complete Secrets): this is what the normal Login
  //     page's first-run "Create Account" form calls. If auth_config
  //     already exists,
  //     there is nothing to (re)generate here — D1-backed password
  //     rotation is /api/secret/change-password, not this endpoint, so
  //     this returns an error rather than silently no-op'ing or
  //     re-initializing. If auth_config does NOT exist yet, this is
  //     genuinely first-run setup: unauthenticated on purpose (no admin
  //     session could exist yet), and reaches handleInitializeD1Auth()
  //     instead of the legacy generator — it persists the generated
  //     salt/hash/JWT secret into D1 itself and never returns JWT_SECRET
  //     for manual copying.
  if (pathname === "/api/secret/generate" && method === "POST") {
    if (secretsConfigured(env)) {
      const authResult = await requireAuth(request, env);
      if (authResult instanceof Response)
        return withCors(request, authResult, env);
      return withCors(request, await handleGenerateSecrets(request), env);
    }

    if (await authInitialized(env)) {
      return withCors(request, json({ error: "already_configured" }, 400), env);
    }

    return withCors(request, await handleInitializeD1Auth(request, env), env);
  }

  // Rotates only the password hash, reusing the existing salt — a
  // day-to-day "change my password" action that doesn't touch the JWT
  // secret or (for Secret-backed installs) force every other secret to
  // be re-pasted into Cloudflare. Gated on authInitialized(env) rather
  // than secretsConfigured(env) so this also works for D1-backed
  // installations — handleChangePassword() (src/secrets.js) already
  // branches on the resolved config's source and persists directly to D1
  // when appropriate. Requires a valid admin session either way.
  if (pathname === "/api/secret/change-password" && method === "POST") {
    if (!(await authInitialized(env))) {
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
  // `authInitialized` is included so the login page (src/frontend/
  // client-script.js) can tell first-run (no auth_config yet, neither
  // D1-backed nor a complete Secret set) apart from normal login without
  // a dedicated endpoint — also not sensitive, just a boolean.
  if (pathname === "/api/version" && method === "GET") {
    return withCors(
      request,
      json({ version: VEXA_VERSION, authInitialized: await authInitialized(env) }),
      env,
    );
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
