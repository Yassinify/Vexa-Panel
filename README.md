# Vexa Panel — VPN Subscription Manager for Cloudflare Workers

> A self-hosted VPN subscription management panel that runs entirely on **Cloudflare Workers**. Vexa Panel manages Users and reusable Nodes, combines subscription sources, and generates unified subscription links for VLESS, VMess, Trojan, Shadowsocks, Hysteria2, and more.

Vexa Panel is a Cloudflare Worker that acts as a **VPN subscription manager**: it takes raw proxy links, subscription URLs, Xray/V2Ray JSON configs, or Clash/Mihomo YAML lists, deduplicates the proxy nodes inside them, and serves clean, unified subscription links back out — in raw, sing-box, or Clash/Mihomo format. It runs on Cloudflare's edge network with no separate server to manage, using **Cloudflare KV** for storage and a **Durable Object** to coordinate safe concurrent writes.

This README is written for two audiences: people who already run Cloudflare Workers and just want the reference, and people who have **never used Cloudflare, Node.js, or a terminal before** and want a complete, step-by-step deployment guide. If you're in the second group, skip straight to [Beginner's Guide: Deploying Vexa Panel From Scratch](#-beginners-guide-deploying-vexa-panel-from-scratch).

---

## 🌟 What Vexa Panel Does

- **Manage Users.** Each User is a named entity with its own list of subscription sources (`sources[]`) — raw proxy links, subscription URLs, Xray JSON, or Clash YAML. A User can be enabled or disabled from the panel.
- **Manage reusable Nodes.** A Node is a single Name + Source pair that isn't tied to one User. Create it once, then assign it to as many Users as you like.
- **Assign Nodes to Users.** Any User can reference any number of Nodes (`nodeIds[]`). Editing a Node's source updates every User it's assigned to, instantly.
- **Combine sources.** Each User gets one subscription link that merges their own direct sources together with the sources of every Node assigned to them, then removes duplicate proxies.
- **Generate subscription output.** The combined link can be read as a raw Base64 list, a sing-box JSON config, or a Clash/Mihomo YAML config — either by adding `?format=` to the URL or automatically, based on which VPN client is requesting it.
- **Manage everything through a web interface.** Vexa Panel serves its own admin UI (Dashboard, Users, Nodes, and Log views) directly from the Worker — there's no separate app or server to install.

There is no separate "Profile" concept in the current version — sources live directly on the User, and Nodes are the only shared/reusable layer.

### Supported protocols and formats

- **Protocols:** VLESS, VMess, Trojan, Shadowsocks (including SIP022 / Shadowsocks 2022), ShadowsocksR, Hysteria (v1 and v2/hy2), TUIC, WireGuard, SOCKS5, HTTP, and NaiveProxy.
- **Input formats:** plaintext proxy-link lists, Base64-encoded subscriptions, Xray/V2Ray JSON configs, and Clash/Mihomo YAML proxy lists.
- **Output formats:** raw Base64 link list (default), sing-box JSON, and Clash/Mihomo YAML — selectable with `?format=singbox` / `?format=clash`, or auto-detected from the requesting VPN client's User-Agent.

### Other features

- **Smart deduplication:** identical proxies (same host, credentials, transport, SNI, path, and security settings) are collapsed into one entry, even when they come from a mix of a User's own sources and their assigned Nodes.
- **Fault-tolerant caching:** if a remote subscription URL is temporarily unreachable, Vexa Panel serves a cached copy (kept for up to 14 days) instead of dropping those proxies.
- **Guided first-time setup:** if the required Cloudflare KV namespace isn't connected yet, the Worker shows a step-by-step setup page instead of a generic error.
- **Single-admin authentication:** login is protected with a PBKDF2-hashed password and short-lived signed session tokens, with rate-limiting on login attempts.

---

## 🏗️ Architecture

- **`src/index.js`** is the application's entry point — the single `fetch` handler Cloudflare Workers calls for every request.
- The application logic is split into small ES modules under **`src/`** (routing, authentication, KV data access, the Node/User APIs, protocol parsers, and the admin UI), rather than living in one large file.
- Because a Cloudflare Worker can only load a single script, a build step bundles everything under `src/` into one generated file, **`worker.js`**, at the repository root. `worker.js` is a build artifact — it is not meant to be edited by hand, and Cloudflare's own runtime is what ultimately deploys and executes it.
- **Cloudflare Workers** is the runtime the application executes on — a Worker runs your code on Cloudflare's global network instead of a traditional server.
- **Cloudflare KV**, a globally distributed key-value store, holds all persistent data: Users, Nodes, dashboard statistics, the recent-activity log, login rate-limit counters, and the subscription fallback cache.
- A **Durable Object** (`IndexCoordinator`) is used internally to safely coordinate certain KV updates (for example, the Users and Nodes index lists) when multiple requests arrive at the same time, so a burst of concurrent changes can't silently lose an entry. You don't interact with it directly — it's part of how the Worker keeps its own data consistent.

---

## 📡 API Endpoints Summary

### Public Routes

- `GET /` / `/index.html` / `/login` / `/panel` / `/Dashboard` / `/Users` / `/Nodes` / `/Log`: Serves the admin web interface (redirects to `/secret` if admin secrets aren't configured yet).
- `GET /secret` or `/secrets`: Initial setup / secret regeneration page.
- `GET /change-panel-password`: Dedicated page for rotating the admin password.
- `GET /sub/user/:userId`: Public combined subscription link for a User — merges that User's own sources with any assigned Nodes' sources, deduplicated. Stops serving nodes immediately if the User is disabled.
  - _Query Parameters:_
    - `?canonical=1` (Optional) — Normalizes and re-serializes nodes through canonical link generation.
    - `?format=singbox` (Optional) — Returns a ready-to-use sing-box JSON config instead of the raw list.
    - `?format=clash` (Optional) — Returns a Clash/Mihomo YAML config instead of the raw list.
    - If `?format=` is omitted, the format is auto-detected from the requesting client's User-Agent (falling back to raw Base64).
- `GET /api/version`: Unauthenticated endpoint returning the currently deployed version string.
- `POST /api/login`: Validates the admin password and returns a session token (valid for 48 hours). Always public — this is how a session token is obtained in the first place.
- `POST /api/secret/generate`: Generates fresh `ADMIN_SALT`, `ADMIN_PASSWORD_HASH`, and `JWT_SECRET` values from a chosen password. Public and unauthenticated during initial setup (before any admin secrets are configured); once secrets already exist, requires a valid admin session, same as the Authenticated Routes below.

### Authenticated Routes (require a valid session token)

- `POST /api/secret/change-password`: Rotates `ADMIN_PASSWORD_HASH` without invalidating other secrets.
- `GET /api/stats`: Returns dashboard summary statistics.
- `GET /api/users`: Lists all Users.
- `POST /api/users`: Creates a new User (accepts `name`, `sources[]`, `nodeIds[]`).
- `GET /api/users/:id`: Retrieves a single User's full record.
- `PUT /api/users/:id`: Updates a User — name, `enabled`, `sources[]`, and/or `nodeIds[]`.
- `DELETE /api/users/:id`: Removes a User.
- `GET /api/nodes`: Lists all reusable Nodes.
- `POST /api/nodes`: Creates a new Node (`name` + `source`; name must be unique).
- `GET /api/nodes/:id`: Retrieves a single Node.
- `PUT /api/nodes/:id`: Updates a Node's name, source, and/or `enabled` state.
- `DELETE /api/nodes/:id`: Removes a Node from storage and from every User that referenced it.
- `POST /api/merge-preview`: Previews deduplication counts, total nodes, and source-fetch error statuses for a given User.

---

## 🗂️ Data Model

Vexa Panel persists everything in one Cloudflare KV namespace (bound as `STORAGE`). The two core record types:

**User** (`user:{uuid}`)

| Field | Description |
| --- | --- |
| `id` | UUID |
| `name` | Display name |
| `enabled` | Whether the User's combined subscription link is currently serving nodes |
| `sources[]` | Subscription sources owned directly by this User (raw links, subscription URLs, Xray JSON, Clash YAML) |
| `nodeIds[]` | Ordered list of reusable Node IDs assigned to this User |
| `createdAt` / `updatedAt` | Timestamps |

**Node** (`node:{uuid}`)

| Field | Description |
| --- | --- |
| `id` | UUID |
| `name` | Display name (must be unique across Nodes) |
| `source` | A single classified source object (same shape as one entry of a User's `sources[]`) |
| `enabled` | Whether this Node currently contributes nodes to any User that references it |
| `createdAt` / `updatedAt` | Timestamps |

A User's combined subscription link merges their own `sources[]` together with the `source` of every enabled Node listed in `nodeIds[]`, then removes duplicates — there is no separate Profile layer sitting between Users and their sources.

---

## 🧰 What You Need Before You Start

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (the free plan is enough to run this project).
- [Node.js](https://nodejs.org/) installed on your computer, so you can run `npm`/`npx` commands. If you've never installed Node.js, see the [beginner's guide](#-beginners-guide-deploying-vexa-panel-from-scratch) below — it walks you through it.
- A copy of this repository's files on your computer (downloaded as a ZIP, or cloned with Git).

---

## 🚀 Beginner's Guide: Deploying Vexa Panel From Scratch

This section assumes you've never used a terminal, Node.js, or Cloudflare Workers before. Follow every step in order — don't skip ahead.

### Part 1 — Install Node.js

Node.js is a program that lets your computer run JavaScript tools outside a web browser. Vexa Panel's build tool (which packages the project for Cloudflare) needs it, and it also comes with `npm`/`npx`, the commands used to run that tool and to install Wrangler (Cloudflare's deployment tool) in the next part.

1. Open your web browser and go to **[nodejs.org](https://nodejs.org/)**.
2. Click the button for the **LTS** version (LTS means "Long-Term Support" — the more stable option, recommended for almost everyone).
3. Once the installer file has downloaded, open it.
   - **Windows:** double-click the downloaded `.msi` file, then click "Next" through the installer, accepting the default options.
   - **macOS:** double-click the downloaded `.pkg` file and follow the installer.
4. Confirm Node.js installed correctly:
   - **Windows:** Press the **Windows key**, type `PowerShell`, and press Enter. This opens **PowerShell**, a command-line tool built into Windows where you type text commands instead of clicking buttons.
   - **macOS:** Open **Terminal** (press `Cmd + Space`, type `Terminal`, press Enter).
5. In the terminal window that opened, type the following and press Enter:
   ```powershell
   node --version
   ```
6. Confirm that you see a version number printed, such as `v22.x.x`. If you see an error like "node is not recognized," see [Troubleshooting](#-troubleshooting) below.
7. Continue to Part 2.

### Part 2 — Get the Project Files Open in a Terminal

1. Download this repository's files to your computer (using the "Code → Download ZIP" button on GitHub, or by cloning it with Git if you're familiar with Git).
2. If you downloaded a ZIP file, extract it to a folder you'll remember, for example `Documents\vexa-panel`.
3. Open a terminal **inside that folder**:
   - **Windows:** Open the extracted folder in File Explorer, click once in the address bar at the top (where the folder path is shown), type `powershell`, and press Enter. A PowerShell window opens already pointed at that folder.
   - **macOS:** Open **Terminal**, type `cd ` (with a trailing space), drag the extracted folder from Finder into the Terminal window (this fills in its path automatically), then press Enter.
4. Confirm you're in the right place by typing:
   ```powershell
   dir
   ```
   (on macOS/Linux, use `ls` instead). Confirm you see files like `wrangler.jsonc`, `README.md`, and a `src` folder listed.
5. Keep this terminal window open — every command below is run from here.

### Part 3 — Install Wrangler and Sign In to Cloudflare

**Wrangler** is Cloudflare's official command-line tool for deploying Workers. You don't need to install it globally — running it with `npx` (which comes with Node.js) downloads and runs it automatically.

1. In your terminal (still inside the project folder), run:
   ```powershell
   npx wrangler --version
   ```
2. Confirm you see a Wrangler version number printed. The first time you run this, `npx` may ask to install Wrangler — type `y` and press Enter if prompted.
3. Sign in to your Cloudflare account by running:
   ```powershell
   npx wrangler login
   ```
4. This opens a browser window asking you to log in to Cloudflare and authorize Wrangler. Log in (or sign up if you don't have an account yet) and click **Allow**.
5. Return to your terminal. Confirm you see a message saying you're successfully logged in.
6. Continue to Part 4.

### Part 4 — Create the Required KV Namespace

Vexa Panel stores all of its data (Users, Nodes, settings) in a **Cloudflare KV namespace** — a simple key-value database Cloudflare provides. This repository does **not** create this namespace for you automatically; you create it once, and then connect it to the Worker.

1. In your terminal, run:
   ```powershell
   npx wrangler kv namespace create STORAGE
   ```
2. Wrangler will print a result that includes an `id` value, for example:
   ```
   { binding = "STORAGE", id = "abcd1234...".
   ```
3. Copy that `id` value — you'll need it in the next step.
4. Open the file `wrangler.jsonc` in this project (any plain text editor works, including Notepad).
5. Add a `kv_namespaces` entry using the `id` you copied, so the file includes a block like this (the rest of the existing file should stay as it is):
   ```jsonc
   "kv_namespaces": [
     { "binding": "STORAGE", "id": "PASTE_YOUR_ID_HERE" }
   ]
   ```
6. Save the file. This tells your deployed Worker to use the namespace you just created whenever it accesses `env.STORAGE` in the code.

### Part 5 — About the Durable Object (No Action Needed)

Vexa Panel uses one Cloudflare **Durable Object** (a small piece of always-consistent server-side state) called `IndexCoordinator`, to avoid data-loss bugs when multiple changes happen at the same moment. This is already fully configured in `wrangler.jsonc` — the binding, the class name, and the required SQLite-backed storage migration are all present in the repository. You do not need to create anything in the Cloudflare dashboard for this; it's provisioned automatically the first time you deploy.

### Part 6 — Build and Deploy the Worker

Cloudflare Workers can only load a single script, so the modular `src/` source needs to be bundled into one file (`worker.js`) before deploying.

1. In your terminal, run:
   ```powershell
   npx esbuild src/index.js --bundle --format=esm --external:cloudflare:workers --outfile=worker.js
   ```
2. Confirm this finishes without printing any error text, and that a new file named `worker.js` now exists in the project folder.
3. Now deploy the bundled Worker to Cloudflare by running:
   ```powershell
   npx wrangler deploy
   ```
4. The first time you deploy, Wrangler may ask you to pick which Cloudflare account to use (if you have more than one) and may ask for a name for the Worker — this project intentionally doesn't hard-code one, so you choose it here.
5. Confirm the command finishes with a success message and prints a URL that looks like `https://your-worker-name.your-subdomain.workers.dev`. That URL is your deployed panel.
6. Keep this URL — you'll open it in Part 8.

> **Finding your Account ID (only if asked):** If a command asks for your Account ID and doesn't show it automatically, run `npx wrangler whoami` — it prints your account email and Account ID together, or open the [Cloudflare dashboard](https://dash.cloudflare.com/) and check the Account Home page, where the Account ID is listed on the right-hand side.

### Part 7 — Configure the Admin Password and Secrets

Vexa Panel is protected by a single admin password. Before you can log in, three values need to be set as Cloudflare Worker **Secrets** (encrypted values, different from plain configuration variables): `JWT_SECRET`, `ADMIN_SALT`, and `ADMIN_PASSWORD_HASH`. You don't need to invent these values yourself — the deployed Worker generates them for you from a password you choose.

1. Open the URL from Part 6 in your web browser.
2. Since no secrets exist yet, you'll be redirected automatically to a setup page.
3. Choose an admin password (the page requires at least 8 characters) and submit the form.
4. The page displays three generated values: `ADMIN_PASSWORD_HASH`, `ADMIN_SALT`, and `JWT_SECRET`. **Copy all three now** — the plain password you typed is never stored anywhere and can't be recovered once you leave this page.
5. Set each of the three values as a Secret on your Worker. The currently recommended way is the Wrangler command, run once per value, back in your terminal:
   ```powershell
   npx wrangler secret put JWT_SECRET
   npx wrangler secret put ADMIN_SALT
   npx wrangler secret put ADMIN_PASSWORD_HASH
   ```
   Each command will prompt you to paste in the corresponding value from step 4 and press Enter.
   - Alternatively, you can set them from the Cloudflare dashboard instead: go to **Workers & Pages → (your Worker) → Settings → Variables and Secrets → Add**, choose type **Secret**, and enter the variable name and value for each of the three.
6. Refresh your Worker's URL in the browser. You should now see the login screen instead of the setup page.
7. **Do not commit any of these three values to Git**, and don't share them — see [Security Notes](#-security-notes) below.

### Part 8 — First Login and First Use

1. Open your Worker's URL in a browser (from Part 6).
2. You'll see the panel's login screen. Enter the admin password you chose in Part 7.
3. After logging in, you'll land on the **Dashboard** view.
4. Go to the **Users** section and create your first User (just a display name).
5. If this User has their own proxy link, subscription URL, Xray JSON, or Clash YAML, paste it into the User's sources when creating or editing them.
6. If you'd rather set up a proxy source once and reuse it across several Users, go to the **Nodes** section instead and create a Node there (a name plus one source).
7. Open the User you created, and assign the Node to them from the User editor's Node picker.
8. Back in the Users list, open or copy that User's generated subscription link (`/sub/user/:id`) — this is the single URL you give to a VPN client app.
9. Paste that link into a compatible VPN client (or scan the QR code shown on the link's page). The client should see a combined, deduplicated list of every proxy from that User's own sources and their assigned Nodes.

---

## 🖥️ Manual Deployment (Reference, for Returning Users)

If you've already deployed once and just want the commands:

```bash
# 1. Bundle the modular src/ source into the single-file worker.js Cloudflare expects
npx esbuild src/index.js --bundle --format=esm --external:cloudflare:workers --outfile=worker.js

# 2. Deploy the bundled Worker
npx wrangler deploy
```

The `--external:cloudflare:workers` flag tells esbuild not to try to bundle the `cloudflare:workers` module (used by the `IndexCoordinator` Durable Object) — that module only exists inside Cloudflare's own runtime and is supplied automatically at deploy time.

Before your first deploy, make sure:
- A KV namespace exists and is bound as `STORAGE` in `wrangler.jsonc` (see Part 4 above) — the repository does not create this for you.
- `JWT_SECRET`, `ADMIN_SALT`, and `ADMIN_PASSWORD_HASH` are set as Worker Secrets (see Part 7 above).

The Durable Object binding and its SQLite storage migration are already defined in `wrangler.jsonc` and require no manual setup.

## ⚙️ GitHub Actions / Release Workflow

This repository includes a GitHub Actions workflow at `.github/workflows/release.yml`. It is a **build/release workflow, not a deploy workflow** — it does not deploy anything to Cloudflare.

- **Trigger:** runs automatically whenever a Git tag matching `v*` (for example `v4.0.0`) is pushed to the repository.
- **What it does:** checks out the repository, sets up Node.js 20, and runs the same `esbuild` bundle command shown above (with the same `--external:cloudflare:workers` flag) to produce `worker.js` from the current `src/` source.
- **What it creates:** a GitHub Release for that tag, with the generated `worker.js` file attached as a downloadable release asset, using the built-in `GITHUB_TOKEN` — no Cloudflare credentials are used or required by this workflow.
- **Deploying that artifact:** downloading the `worker.js` attached to a GitHub Release and deploying it to Cloudflare (for example with `npx wrangler deploy`) is a separate, manual step this workflow does not perform.

If you want the project deployed to Cloudflare automatically on every push, that would require adding a separate deploy step (for example, one using a Cloudflare API token) — this is not currently part of the repository.

---

## 🔐 Secrets / Admin Password

- The admin password itself is never stored. Instead, three related values are stored as Cloudflare Worker **Secrets** (encrypted at rest, distinct from plain-text `vars`):
  - **`JWT_SECRET`** — a random value used to sign and verify session tokens issued at login.
  - **`ADMIN_SALT`** — a random salt used when hashing the admin password.
  - **`ADMIN_PASSWORD_HASH`** — the PBKDF2 hash (100,000 iterations, SHA-256) of your admin password combined with `ADMIN_SALT`. This is what your typed password is checked against at login — the plain password itself is never saved anywhere.
- All three values are generated for you by visiting `/secret` on your deployed Worker (see Part 7 above), or regenerated later from the same page. `/change-panel-password` lets you rotate just `ADMIN_PASSWORD_HASH` without touching the other two, so existing sessions and subscription links keep working.
- Configure them either with `npx wrangler secret put <NAME>` (recommended, shown in Part 7), or from **Cloudflare dashboard → Workers & Pages → (your Worker) → Settings → Variables and Secrets**, using type **Secret** rather than the default **Text** type.
- **Never commit these values, or a `.dev.vars`/`.env` file containing them, to Git.** They are not part of this repository and should never appear in it.
- The admin password must be at least 8 characters; there is no other enforced complexity rule, so choose a genuinely strong, unique password.

---

## 🗄️ KV and Durable Objects (What You Need to Know)

- **Cloudflare KV** is where all of Vexa Panel's data lives: Users, Nodes, dashboard stats, the activity log, login rate-limit counters, and the subscription fallback cache. You must create one KV namespace and bind it as `STORAGE` in `wrangler.jsonc` before the Worker can do anything beyond showing its own setup guide (see Part 4).
- **The `IndexCoordinator` Durable Object** exists to prevent a rare kind of bug where two changes happening at almost the same instant could overwrite each other in the Users/Nodes index. It requires no separate resource creation on your part — `wrangler.jsonc` already declares its binding (`INDEX_COORDINATOR`) and the SQLite-backed storage migration it needs, and Cloudflare provisions it automatically the first time you deploy.
- You do not need to understand Durable Objects in depth to deploy or use this project — this is the extent of what running it requires.

---

## 🩹 Troubleshooting

- **"`wrangler` is not recognized" / "`npx` is not recognized":** Node.js isn't installed, or your terminal was opened before installing it. Install Node.js from [nodejs.org](https://nodejs.org/) (see Part 1), then close and reopen your terminal.
- **"`node` is not recognized" after installing Node.js:** Close every open terminal window completely and open a new one — Windows only picks up the updated PATH in new windows. If it still fails, restart your computer.
- **Cloudflare authentication failed / `wrangler login` doesn't open a browser:** Run `npx wrangler login` again; make sure your default browser isn't blocked from opening. If you're on a remote/headless machine with no browser, authenticate with an API token instead (`CLOUDFLARE_API_TOKEN` environment variable) rather than `wrangler login`.
- **Account ID missing or wrong:** Run `npx wrangler whoami` to see the account(s) your login has access to and their Account IDs. If you have multiple Cloudflare accounts, `wrangler` may ask you to pick one during `wrangler deploy`.
- **KV binding/namespace missing:** If you deploy without adding a `kv_namespaces` entry to `wrangler.jsonc` (Part 4), the Worker will still deploy and run, but every page will show the built-in "KV Namespace Required" setup guide instead of the panel, since `kvBound(env)` checks for the `STORAGE` binding on every request.
- **Durable Object deployment error:** This usually means the `durable_objects` binding or `migrations` block in `wrangler.jsonc` was edited or removed. Compare your file against the version in this repository — both blocks need to stay intact and reference the `IndexCoordinator` class exported from `src/index.js`.
- **A required secret is missing:** If `JWT_SECRET`, `ADMIN_SALT`, or `ADMIN_PASSWORD_HASH` isn't set, the panel redirects every page to `/secret` until all three are configured (Part 7). Re-run the three `wrangler secret put` commands if you're unsure whether they were saved.
- **Deployment succeeds, but the panel can't be accessed:** Double-check the URL Wrangler printed after `wrangler deploy` — it's specific to your Worker's name and Cloudflare subdomain. If the page loads but shows an error instead of the setup guide or login screen, confirm the KV namespace ID in `wrangler.jsonc` matches the one from `npx wrangler kv namespace create STORAGE`.
- **The bundle command fails with an error mentioning `cloudflare:workers`:** Make sure you're using the exact command shown in this README, including `--external:cloudflare:workers` — without that flag, esbuild cannot resolve the Durable Object import in `src/index-coordinator.js`.

---

## 🔒 Security Notes

- Never commit `JWT_SECRET`, `ADMIN_SALT`, `ADMIN_PASSWORD_HASH`, or any file containing them (such as `.dev.vars` or `.env`) to Git.
- Choose a strong, unique admin password — it is the only credential that gates access to the entire panel (Users, Nodes, and every subscription source configured in it).
- Protect the Cloudflare account itself (use a strong Cloudflare account password and, ideally, two-factor authentication) — anyone with access to your Cloudflare account can read or rotate your Worker's secrets directly from the dashboard.
- Don't share your admin password. Anyone who has it can log in to the panel and see or change every User's and Node's data.
- A User's subscription URL (`/sub/user/:id`) itself functions as an access credential: anyone who has that link can fetch that User's combined, deduplicated proxy list without logging in, for as long as that User stays enabled. Treat subscription links with the same care as a password, and disable or don't recreate a User if their link is exposed.

---

## 🛠️ Development

- **Requirements:** [Node.js](https://nodejs.org/) (for `npm`/`npx`) and Wrangler, run via `npx wrangler` — no global install is required.
- **Building:** run `npx esbuild src/index.js --bundle --format=esm --external:cloudflare:workers --outfile=worker.js` to produce `worker.js` from the current `src/` source (see [Manual Deployment](#️-manual-deployment-reference-for-returning-users) above). This is the same command used by the GitHub Actions release workflow.
- **Local development:** this repository does not currently document or configure a `wrangler dev` local-development setup; the supported workflow is to build with esbuild and deploy with `wrangler deploy` as described above.
- **Deploying changes:** after editing files under `src/`, re-run the build command above and then `npx wrangler deploy` to publish the updated Worker.
- **Automated tests:** this repository does not currently include an automated test suite. Verification during development is done by manual review and manual testing against a deployed Worker.

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

- [Get started with Workers (CLI)](https://developers.cloudflare.com/workers/get-started/guide/)
- [Wrangler overview and commands](https://developers.cloudflare.com/workers/wrangler/)
- [Wrangler configuration reference](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Environment variables and secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Workers KV — Getting started](https://developers.cloudflare.com/kv/get-started/)
- [Workers KV — Wrangler `kv` commands](https://developers.cloudflare.com/kv/reference/kv-commands/)
- [Durable Objects — migrations](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)
- [Durable Objects — accessing storage (SQLite backend)](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
