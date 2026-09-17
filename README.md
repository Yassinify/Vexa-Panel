# Vexa Panel — VPN Subscription Manager for Cloudflare Workers

> A self-hosted VPN subscription management panel that runs entirely on **Cloudflare Workers**. Vexa Panel manages Users and reusable Nodes, combines subscription sources, and generates unified subscription links for VLESS, VMess, Trojan, Shadowsocks, Hysteria2, and more.

---

## 🌟 What Vexa Panel Is

Vexa Panel is a Cloudflare Worker that acts as a **VPN subscription manager**. It takes raw proxy links, subscription URLs, Xray/V2Ray JSON configs, or Clash/Mihomo YAML lists, removes duplicate proxies, and serves clean, unified subscription links back out — in raw, sing-box, or Clash/Mihomo format. It runs on Cloudflare's network, with no server of your own to manage.

### The User / Node model

- **User.** A named entity with its own list of subscription sources (`sources[]`) — raw proxy links, subscription URLs, Xray JSON, or Clash YAML. Each User can be enabled or disabled, and each User has one public subscription link.
- **Node.** A reusable Name + Source pair that is not tied to any single User. Create it once, then assign it to as many Users as you like. Editing a Node's source updates every User it is assigned to.
- **Assignment.** A User references any number of Nodes through `nodeIds[]`. That User's subscription link merges their own sources with the sources of every enabled Node assigned to them, then removes duplicates.

There is no separate "Profile" layer — sources live directly on the User, and Nodes are the only shared/reusable layer.

### Supported protocols and formats

- **Protocols:** VLESS, VMess, Trojan, Shadowsocks (including SIP022 / Shadowsocks 2022), ShadowsocksR, Hysteria (v1 and v2/hy2), TUIC, WireGuard, SOCKS5, HTTP, and NaiveProxy.
- **Input formats:** plaintext proxy-link lists, Base64-encoded subscriptions, Xray/V2Ray JSON configs, and Clash/Mihomo YAML proxy lists.
- **Output formats:** raw Base64 link list (default), sing-box JSON, and Clash/Mihomo YAML — selectable with `?format=singbox` / `?format=clash`, or auto-detected from the requesting VPN client's User-Agent.

### Other features

- **Smart deduplication:** identical proxies (same host, credentials, transport, SNI, path, and security settings) collapse into one entry, even when they come from a mix of a User's own sources and their assigned Nodes.
- **Fault-tolerant caching:** if a remote subscription URL is temporarily unreachable, a cached copy (kept up to 14 days) is served instead of dropping those proxies.
- **Guided first-time setup:** if the KV namespace isn't bound yet, the Worker shows a step-by-step setup page instead of a generic error.
- **Single-admin authentication:** login is protected with a PBKDF2-hashed password and short-lived signed session tokens, with rate-limiting on login attempts.
- **Built-in admin UI:** Dashboard, Users, Nodes, Log, and Settings views are served directly by the Worker.

---

## 🧰 What You Need

- A [Cloudflare account](https://dash.cloudflare.com/sign-up).
- Access to Cloudflare Workers, Workers KV, and Durable Objects on that account.
- The `worker.js` file attached to this repository's latest GitHub Release.

Nothing is installed on your computer, and nothing runs on your computer. Cloudflare hosts and executes the panel.

---

## ⚠️ One Cloudflare Limitation, Before You Start

Vexa Panel needs a **Durable Object** class named `IndexCoordinator` (bound as `INDEX_COORDINATOR`) to keep data consistent when several changes happen at the same moment. It is required — creating, updating and deleting Users and Nodes, the one-time data migration, and dashboard statistics all call into it.

Per current official Cloudflare documentation, a **new** Durable Object class is created only by a Worker upload that carries the class declaration from a Wrangler configuration file — the declarative [`exports` field](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/), or the legacy [`migrations` array](https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/) this repository uses — applied at deploy time. Cloudflare's documentation states that these bindings "must be configured at upload time", and describes no Dashboard form that creates a new SQLite-backed Durable Object class.

What the Cloudflare Dashboard **can** do is bind a Durable Object namespace that **already exists** on the account: **Settings → Bindings → Add → Durable Object**, then select an existing namespace.

**What this means for you:** every step below is fully doable in the Dashboard **except Step 5**. If the `IndexCoordinator` namespace does not already exist on your Cloudflare account, the Dashboard alone cannot create it, and deployment cannot be completed Dashboard-only. This is a gap in what Cloudflare currently exposes, not something Vexa Panel chooses. Step 5 explains exactly what to check and what to do if it isn't there.

This limitation is described honestly here rather than papered over with Dashboard clicks that do not exist.

---

## 🌐 Deploy With the Cloudflare Dashboard

Everything below happens in your web browser, at [dash.cloudflare.com](https://dash.cloudflare.com/).

Cloudflare occasionally renames menu items. Where the exact label differs, the section names ("Bindings", "Variables and Secrets") are the ones to look for.

### Step 1 — Download `worker.js` from the GitHub Release

1. Open this repository's **Releases** page on GitHub.
2. Open the latest release and download the attached **`worker.js`** file.
3. That single file is the complete, already-built application. You don't need anything else from the repository.

### Step 2 — Create the Worker

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and select your account.
2. In the sidebar, go to **Compute (Workers) → Workers & Pages**.
3. Select **Create**, then create a Worker from scratch (a "Hello World" starter is fine) rather than from a template.
4. Give the Worker a name. Any name works — Vexa Panel does not require a specific one. This name becomes part of your URL: `https://<your-worker-name>.<your-subdomain>.workers.dev`.
5. Create the Worker.

### Step 3 — Paste in the application code

1. Open the Worker you just created and open its code editor (**Edit code**).
2. Open the downloaded `worker.js` in any plain text editor (Notepad, TextEdit), select all, and copy.
3. In the Cloudflare editor, select everything in the starter file and paste `worker.js` over it, replacing it entirely.
4. Save and deploy from the editor.

It will not work correctly yet — KV, the Durable Object binding, and the secrets are still missing. Steps 4 to 7 add them.

### Step 4 — Create and bind the KV namespace (`STORAGE`)

All Vexa Panel data lives in one Cloudflare KV namespace: Users, Nodes, dashboard statistics, the activity log, login rate-limit counters, and the subscription fallback cache.

1. Open your Worker's **Settings** tab, then **Bindings** (may be shown as **Variables and Bindings**).
2. Select **Add**, then choose the **KV Namespace** binding type.
3. Under **Variable name**, type exactly:

   ```
   STORAGE
   ```

   All uppercase. The Worker looks for `env.STORAGE` and nothing else.
4. Under **KV namespace**, select an existing namespace, or create a new one right there. Its display name is only for you (for example `vexa-panel-storage`) and has no effect on the Worker.
5. Save and deploy.

The Worker's own setup page shows these same steps if you open the panel before the binding exists.

### Step 5 — The Durable Object binding (`INDEX_COORDINATOR` → `IndexCoordinator`) — the blocked step

1. Still under **Settings → Bindings**, select **Add**, then choose the **Durable Object** binding type.
2. Under **Variable name**, type exactly:

   ```
   INDEX_COORDINATOR
   ```

3. Under **Durable Object namespace**, look for a namespace whose class is:

   ```
   IndexCoordinator
   ```

**If `IndexCoordinator` appears in that list**, select it, save, deploy, and continue to Step 6. (It appears only if that class has already been provisioned on this Cloudflare account — for example, by a previous Vexa Panel deployment.)

**If `IndexCoordinator` does not appear in that list**, stop here. There is no Dashboard action that creates it: as described in [the limitation section above](#️-one-cloudflare-limitation-before-you-start), Cloudflare creates a new SQLite-backed Durable Object class only from a Worker upload carrying that class declaration in a Wrangler configuration file, and the Dashboard code editor does not send one. Pasting `worker.js` into the editor uploads the code — including the exported `IndexCoordinator` class — but does not declare the class lifecycle, so no namespace is provisioned by that upload. This repository's `wrangler.jsonc` already contains the correct declaration (`durable_objects.bindings` with name `INDEX_COORDINATOR` / class `IndexCoordinator`, plus the `new_sqlite_classes` migration), but applying it is a deploy-time operation, not a Dashboard one.

Without this binding, the panel's pages still load, but every authenticated API call and every write (creating a User or Node, editing, deleting) fails with an `internal_error` response.

### Step 6 — Where the three secrets go

Vexa Panel needs three values stored as Worker **Secrets** (encrypted), not as plain **Text** variables:

```
JWT_SECRET
ADMIN_SALT
ADMIN_PASSWORD_HASH
```

You do not invent these values — the running Worker generates them for you in Step 8. For now, just find the screen:

1. Open your Worker's **Settings → Variables and Secrets** (or **Bindings**, depending on the current layout).
2. Note the **Add** button. Each entry has a type dropdown that defaults to **Text**; all three of these must be switched to **Secret** before saving.

### Step 7 — Deploy

Deploy the Worker again so that the bindings from Steps 4 and 5 are active on the running version. Your Worker's URL is shown at the top of its page in the Dashboard:

```
https://<your-worker-name>.<your-subdomain>.workers.dev
```

### Step 8 — Open the Worker URL and finish setup

1. Open that URL in your browser.
2. Because no secrets are configured, you are redirected to the setup page at `/secret`.
3. Choose an admin password (at least 8 characters) and submit.
4. The page shows three generated values: `ADMIN_PASSWORD_HASH`, `ADMIN_SALT`, and `JWT_SECRET`. **Copy all three now** — the password you typed is never stored and cannot be recovered after you leave the page. There is a **Copy All Secrets** button.
5. Go back to **Settings → Variables and Secrets** (Step 6). Add each of the three, using those exact names as the **Variable name**, the generated string as the **Value**, and type **Secret** for each.
6. Save and deploy.
7. Reload your Worker URL. You should now see the login screen instead of the setup page.

### Step 9 — Log in and create your first User

1. Log in with the admin password you chose in Step 8.
2. You land on the **Dashboard** view.
3. Go to **Users** and create a User (a display name is all that's required). Paste that User's own proxy links, subscription URLs, Xray JSON, or Clash YAML into their sources.
4. Optionally go to **Nodes**, create a Node (one name + one source), then open the User and assign that Node to them from the Node picker.

### Step 10 — Use the public subscription URL

Each User has one public subscription link:

```
https://<your-worker-name>.<your-subdomain>.workers.dev/sub/user/<the-users-id>
```

Open or copy it from the Users list in the panel. **This is the URL you paste into a VPN client app** (or scan as a QR code from the link's own page). It serves that User's own sources merged with their assigned Nodes, deduplicated, in the format the requesting client expects.

Optional query parameters:

- `?format=singbox` — return a sing-box JSON config.
- `?format=clash` — return a Clash/Mihomo YAML config.
- `?canonical=1` — normalize and re-serialize every node through canonical link generation.

Disabling a User in the panel makes their link stop serving nodes immediately.

---

## 🩹 Troubleshooting

- **Every page shows "KV Namespace Required".** The `STORAGE` binding is missing or misspelled. Re-check Step 4: the **Variable name** must be exactly `STORAGE`, uppercase, and the Worker must be redeployed after saving.
- **`/api/*` requests return `{"error":"kv_not_configured"}`.** Same cause as above — the Worker is running without its KV binding.
- **Every page redirects to `/secret`.** At least one of `JWT_SECRET`, `ADMIN_SALT`, `ADMIN_PASSWORD_HASH` is missing. All three must be present before the panel serves the login screen. Re-check Step 8, including that each was saved with type **Secret**.
- **The panel loads, but saving anything returns `internal_error`.** The `INDEX_COORDINATOR` Durable Object binding is missing or points at the wrong class. Every write path and the one-time data migration call into `IndexCoordinator`. See Step 5.
- **`IndexCoordinator` isn't offered in the Durable Object namespace list.** That class has never been provisioned on this account. This is the Cloudflare limitation described above, not a misconfiguration on your side.
- **Login says "too many attempts".** Login is rate-limited to 10 attempts per IP per 5 minutes. Wait and try again.
- **A subscription link returns "Not found".** Either the User ID in the URL is wrong, or that User is currently disabled.
- **A User's link is missing some proxies.** A remote subscription source may have failed to fetch; a cached copy up to 14 days old is served in that case. Use the panel's merge preview to see per-source fetch errors.
- **You lost the admin password.** Open `/secret` on your Worker and regenerate. Note that regenerating `JWT_SECRET`/`ADMIN_SALT` invalidates existing sessions once the new values are saved in Cloudflare.

---

## 🔐 Secrets / Admin Password

The admin password itself is never stored. Three related values are stored as Cloudflare Worker **Secrets** (encrypted at rest, distinct from plain-text variables):

- **`JWT_SECRET`** — signs and verifies the session tokens issued at login (sessions last 48 hours).
- **`ADMIN_SALT`** — the random salt used when hashing the admin password.
- **`ADMIN_PASSWORD_HASH`** — the PBKDF2 hash (100,000 iterations, SHA-256) of your password combined with `ADMIN_SALT`. This is what a typed password is checked against.

All three are generated at `/secret` on your deployed Worker, and can be regenerated there later. `/change-panel-password` rotates only `ADMIN_PASSWORD_HASH`, so existing sessions and subscription links keep working.

The admin password must be at least 8 characters; no other complexity rule is enforced, so choose a genuinely strong, unique password.

---

## 🔒 Security Notes

- Never commit `JWT_SECRET`, `ADMIN_SALT`, or `ADMIN_PASSWORD_HASH` anywhere. They belong only in your Worker's Secrets.
- The admin password is the only credential gating the entire panel — every User, every Node, every configured source.
- Protect the Cloudflare account itself (strong password, two-factor authentication). Anyone with access to it can read or rotate your Worker's secrets.
- A User's subscription URL (`/sub/user/:id`) is itself an access credential: anyone holding that link can fetch that User's combined proxy list without logging in, for as long as the User stays enabled. Treat it like a password, and disable the User if the link leaks.

---

## 🏗️ Architecture

- **`src/index.js`** is the application entry point — the `fetch` handler Cloudflare Workers calls for every request. It also re-exports the `IndexCoordinator` Durable Object class.
- Application logic is split into small ES modules under **`src/`** (routing, authentication, KV data access, the User/Node APIs, protocol parsers, and the admin UI).
- A Cloudflare Worker loads a single script, so a build step bundles everything under `src/` into one generated file, **`worker.js`** — the file attached to each GitHub Release and the file you deploy. It is a build artifact and is not edited by hand.
- **Cloudflare KV** (bound as `STORAGE`) holds all persistent data: Users, Nodes, dashboard statistics, the recent-activity log, login rate-limit counters, and the subscription fallback cache.
- The **`IndexCoordinator` Durable Object** (bound as `INDEX_COORDINATOR`) serializes concurrent changes — the Users/Nodes index lists, per-User record writes, Node-name uniqueness, dashboard statistics, and the one-time data migration — so simultaneous requests cannot silently overwrite each other. You never interact with it directly.

---

## 📡 API Endpoints Summary

### Public routes

- `GET /` / `/index.html` / `/login` / `/panel` / `/Dashboard` / `/Users` / `/Nodes` / `/Log`: the admin web interface (redirects to `/secret` if admin secrets aren't configured yet).
- `GET /secret` or `/secrets`: initial setup / secret regeneration page.
- `GET /change-panel-password`: page for rotating just the admin password.
- `GET /sub/user/:userId`: public combined subscription link for a User. Query parameters: `?canonical=1`, `?format=singbox`, `?format=clash`; with no `?format=`, the format is auto-detected from the client's User-Agent (falling back to raw Base64).
- `GET /api/version`: unauthenticated; returns the deployed version string.
- `POST /api/login`: validates the admin password and returns a session token (48 hours).
- `POST /api/secret/generate`: generates fresh `ADMIN_SALT`, `ADMIN_PASSWORD_HASH`, and `JWT_SECRET` from a chosen password. Public during initial setup; requires a valid session once secrets exist.

### Authenticated routes (valid session token required)

- `POST /api/secret/change-password`: rotates `ADMIN_PASSWORD_HASH` only.
- `GET /api/stats`: dashboard summary statistics.
- `GET /api/users` / `POST /api/users`: list Users / create a User (`name`, `sources[]`, `nodeIds[]`).
- `GET|PUT|DELETE /api/users/:id`: read, update (name, `enabled`, `sources[]`, `nodeIds[]`), or delete a User.
- `GET /api/nodes` / `POST /api/nodes`: list Nodes / create a Node (`name` + `source`; name must be unique).
- `GET|PUT|DELETE /api/nodes/:id`: read, update (name, source, `enabled`), or delete a Node. Deleting also removes it from every User that referenced it.
- `POST /api/merge-preview`: previews deduplication counts, total nodes, and per-source fetch errors for a User.

---

## 🗂️ Data Model

All data lives in the one KV namespace bound as `STORAGE`.

**User** (`user:{uuid}`)

| Field | Description |
| --- | --- |
| `id` | UUID |
| `name` | Display name |
| `enabled` | Whether this User's subscription link currently serves nodes |
| `sources[]` | Sources owned directly by this User (raw links, subscription URLs, Xray JSON, Clash YAML) |
| `nodeIds[]` | Ordered list of Node IDs assigned to this User |
| `createdAt` / `updatedAt` | Timestamps |

**Node** (`node:{uuid}`)

| Field | Description |
| --- | --- |
| `id` | UUID |
| `name` | Display name (unique across Nodes) |
| `source` | A single classified source object (same shape as one entry of a User's `sources[]`) |
| `enabled` | Whether this Node contributes nodes to the Users referencing it |
| `createdAt` / `updatedAt` | Timestamps |

---

## ⚙️ Release Workflow

`.github/workflows/release.yml` runs when a Git tag matching `v*` is pushed. It builds `worker.js` from the current `src/` source and attaches it to a GitHub Release as a downloadable asset. It is a build/release workflow only — it does not deploy anything to Cloudflare and uses no Cloudflare credentials. Downloading that `worker.js` is Step 1 of the deployment above.

---

## 📋 Changelog

### **v4.0.0** *(current)*

- Version bumped in `src/constants.js`; see the repository's own change history for details of what this release contains.

### **v3.2.1**

feat: multi-format subscription export and per-user combined links

- Add `?format=singbox` and `?format=clash` output options on `/sub/user/:userId`, generating ready-to-use sing-box JSON or Clash/Mihomo YAML configs on the fly, with auto-detection from the requesting client's User-Agent when `?format=` is omitted
- Add per-user `enabled` flag: disabling a user immediately stops their combined link from serving nodes
- Add reusable Nodes (`node:{uuid}` + a User's `nodeIds[]`) so a single Name+Source pair can be assigned to many Users at once
- Add a Nodes management view and a Node picker inside the User editor
- Add guided setup screen (`renderKvSetupGuide`) shown when the `STORAGE` KV binding isn't configured yet, replacing opaque `internal_error` responses
- Add dedicated `/change-panel-password` page for rotating the admin password from Settings
- Add `/login` and `/panel` as aliases serving the same app shell as `/`
- Extend admin session lifetime from 12 hours to 48 hours
- Add Settings panel to the admin UI; the admin panel is dark-themed only (no light/system theme toggle)

### **v2.2.1**

fix(ui): improve light theme contrast and hamburger button visibility

- Darken `--border` (#d3d7dd) and `--text-muted` (#63666d) in light theme to meet WCAG AA contrast standards
- Add solid background fill (`var(--bg-page)`) to `.menu-toggle-btn` for better visibility
- Fix hamburger icon alignment by enforcing `flex` layout instead of `block`
- Note: Accent colors (`--accent`, `--good`, `--bad`) and dark theme tokens remain unchanged
- (Note: the light theme and theme-switching UI described in this entry were later removed entirely — the panel is now dark-only, see v3.2.1 above)

### **v2.2.0**

fix(ui): improve mobile responsiveness and cross-browser compatibility

- Add mobile topbar menu toggle, backdrop overlay, and auto-close on navigation/Escape
- Add responsive breakpoints (1024/780/480px) and bottom-sheet modals for small screens
- Wrap data tables in scrollable containers to prevent layout overflow
- Fix iOS Safari input auto-zoom by enforcing 16px font size on mobile
- Increase mobile touch targets (`.btn-icon` to 36px) and neutralize sticky hover states
- Add safe-area-inset padding for device notches and standardize cross-browser baseline styles

### **v2.1.1**

refactor(ui): standardize layout spacing scale and improve focus accessibility

- Introduce 4/8px-based spacing scale (--space-1 to --space-6) across sidebar, toolbars, and modals
- Replace ad-hoc pixel values (10px, 14px, 18px, etc.) with standardized design tokens
- Add visible `:focus-visible` rings to all interactive elements for better keyboard accessibility
- Upgrade input focus states to use a box-shadow glow instead of plain border swaps

### **v2.1.0**

feat(ui): align UI metrics with Element Plus and add password-only rotation

- Update buttons, inputs, and badges to Element Plus specs (4px radius, hover/active states)
- Add "Change Password" action on `/secret` to rotate `ADMIN_PASSWORD_HASH` without invalidating sessions
- Rename full secret regeneration action to "Destroy Secrets" for clarity
- Replace ad-hoc loading indicators across all views with layout-matched skeleton screens

### **v2.0.2**

style(ui): update color tokens to match 3x-ui theme palette

- Adopt Element-Plus accent colors (#409eff blue, #67c23a green, #f56c6c red)
- Update content background to light-gray (#f0f2f5) with pure white cards
- Apply fixed dark slate-navy sidebar styling (#304156 idle, #1f2d3d/#263445 active)
- Keep existing 2.0.0 layout structure while refreshing theme token values

### **v2.0.1**

fix(auth): require custom admin password during initial setup and regeneration

- Enforce custom password selection (min 8 chars) instead of default "admin"
- Compute `ADMIN_PASSWORD_HASH` directly from user-defined password
- Streamline two-step secret flow (`ADMIN_PASSWORD_HASH`, `ADMIN_SALT`, `JWT_SECRET`)
- Apply consistent setup/regeneration UX for both first-time setup and manual resets

### **v2.0.0**

feat(admin): redesign admin panel (v2.0.0 Phase 1)

- Introduce a User-Profile ownership hierarchy with automatic zero-downtime migration (the Profile layer was later merged away entirely — see v3.2.1 above; sources now live directly on `user.sources[]`)
- Optimize KV storage using explicit index & stats records to avoid payload list() calls
- Add `/secret` route for initial setup and secure env secret generation
- Add modern sidebar layout with Dashboard and User/Profile management views
- Add UI enhancements: toasts, modal confirms, theme toggles (light/dark/system)
- Note: Core parsers, validators, and merge engine remain untouched

### **v1.9.0**

feat(naive): add NaiveProxy URI scheme support (naive+https:// & naive+quic://)

- Add URI parser, validator, and canonical exporter for NaiveProxy links
- Follow NaiveSharp/Qv2ray de facto URI conventions and support `padding` param
- Note: URI-only (no JSON mapping as Xray-core lacks a native naive outbound)
- Evaluated and skipped SSH support due to lack of standard URI spec or Xray outbound

### **v1.8.0**

feat: add SOCKS5 URI/JSON support and HTTP outbound JSON mapping

- Add SOCKS5 URI scheme (socks://) with optional base64 authentication
- Add Xray-core native "socks" outbound JSON import/export
- Add Xray-core native "http" outbound JSON mapping (same server/user shape as socks)
- Note: HTTP support is JSON-only to prevent collisions with subscription URL fetchers

### **v1.6.0**

feat(wireguard): add WireGuard URI scheme and Xray-core outbound JSON mapping

- Add URI parser, validator, and canonical exporter for wireguard:// scheme
- Support params: publickey, presharedkey, address, mtu, reserved
- Implement Xray-core native "wireguard" outbound JSON import/export
- Note: Uses only the first peer on JSON import (Xray outbound limitation)

### **v1.5.0**

feat: add Hysteria v1 link support (hysteria://)

- Add URI parser, validator, and canonical exporter for Hysteria v1
- Support params: auth, peer, insecure, upmbps, downmbps, obfs, obfsParam, alpn, protocol
- Handle deduplication and fingerprinting
- Note: v1 uses auth query param instead of userinfo in authority (unlike v2/tuic)

### **v1.4.0**

feat: add TUIC link support (tuic://)

- Add URI parsing & canonical export for tuic:// scheme
- Support params: congestion_control, udp_relay_mode, sni, alpn, allow_insecure, disable_sni
- Include fingerprinting deduplication & structured validation
- Note: URI-only (no JSON mapping as Xray-core lacks native tuic outbound)

### **v1.3.0**

- **UI:** Added a fixed, semi-transparent version badge footer on the admin dashboard reflecting the current build version and date.

### **v1.2.0**

- **Shadowsocks 2022 Support:** Added import/export support for V2Fly's distinct `shadowsocks2022` protocol layout (`psk`/`ipsk` fields).
- **SIP022 Compliance:** Enforced non-Base64 plain userinfo string (`method:password@host:port`) on `ss://` exports for all `2022-*` ciphers.

### **v1.1.0**

- **Fix:** Resolved RFC3986 compliance issue where node URIs with a trailing slash before the query parameters (e.g. `vless://host:443/?security=tls`) failed URL parsing/validation.

### **v1.0.0**

- Initial baseline release featuring basic user/subscription-source management, KV storage integration, manual JWT authentication, and deduplication logic.

---

## 📚 Official Cloudflare Documentation

- [Workers KV — overview](https://developers.cloudflare.com/kv/)
- [Workers — environment variables and secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Workers — bindings (env)](https://developers.cloudflare.com/workers/runtime-apis/bindings/)
- [Durable Objects — class exports](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)
- [Durable Objects — class migrations (legacy)](https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/)
- [Durable Objects — accessing storage (SQLite backend)](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
