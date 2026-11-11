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

- **Protocols:** VLESS, VMess, Trojan, Shadowsocks (including SIP022 / Shadowsocks 2022), ShadowsocksR, Hysteria (v1 and v2/hy2), TUIC, WireGuard, SOCKS5, and NaiveProxy.
- **Input formats:** plaintext proxy-link lists, Base64-encoded subscriptions, Xray/V2Ray JSON configs, and Clash/Mihomo YAML proxy lists.
- **Output formats:** raw Base64 link list (default), sing-box JSON, and Clash/Mihomo YAML — selectable with `?format=singbox` / `?format=clash`, or auto-detected from the requesting VPN client's User-Agent.

### Other features

- **Smart deduplication:** identical proxies (same host, credentials, transport, SNI, path, and security settings) collapse into one entry, even when they come from a mix of a User's own sources and their assigned Nodes.
- **Fault-tolerant caching:** if a remote subscription URL is temporarily unreachable, a cached copy (kept up to 14 days) is served instead of dropping those proxies.
- **Guided first-time setup:** if the D1 database isn't bound yet, the Worker shows a step-by-step setup page instead of a generic error.
- **Single-admin authentication:** login is protected with a PBKDF2-hashed password and short-lived signed session tokens, with rate-limiting on login attempts.
- **Built-in admin UI:** Dashboard, Users, Nodes, Logs, and Settings views are served directly by the Worker.

---

## 🧰 What You Need

- A [Cloudflare account](https://dash.cloudflare.com/sign-up).
- Access to Cloudflare Workers and D1 on that account.
- The `worker.js` file attached to this repository's latest GitHub Release.

Nothing is installed on your computer, and nothing runs on your computer. Cloudflare hosts and executes the panel. The only tool you need is a web browser.

---

## 🧭 First, Three Cloudflare Words

If you have never used Cloudflare Workers, these three words are all you need to follow the guide. Nothing here assumes you know them already.

- **Worker** — a small program Cloudflare runs for you on its own servers. Vexa Panel _is_ a Worker. You create an empty one and paste Vexa Panel's code into it.
- **D1 Database** — a small SQL database Cloudflare provides, where a program can save data and read it back later. Vexa Panel keeps all of its data (Users, Nodes, dashboard stats, activity log, login rate limiting, and its own authentication configuration) in one of these.
- **Binding** — the connection between your Worker and a resource, given a **variable name**. A Worker cannot touch a D1 database until it has been bound, under the exact variable name the program looks for.

### "Create" vs "Bind" — the one distinction that trips people up

> **Create** means making the Cloudflare resource itself exist (for example, a D1 database).
> **Bind** means connecting that already-existing resource to your Worker, under the variable name Vexa Panel expects.

They are two separate actions, done on two different screens, and **creating comes first**. A resource that exists but is not bound is invisible to the Worker. A binding that points at nothing cannot be saved.

This also means the resource ends up with **two names**:

|                           | You choose it?           | Where it is used                                        | Example         |
| ------------------------- | ------------------------ | ------------------------------------------------------- | --------------- |
| **Resource name**         | Yes, anything you like   | Only in Cloudflare's own lists, so you can recognize it | `vexa-panel-db` |
| **Binding variable name** | No — fixed by Vexa Panel | Inside the code, to find the resource                   | `DB`            |

The guide below always says which of the two it is asking for.

---

## 🌐 Deploy With the Cloudflare Dashboard

Everything below happens in your web browser, at [dash.cloudflare.com](https://dash.cloudflare.com/). Do the steps in order — each one depends on the one before it. No CLI, Node.js, npm, or Wrangler command is needed for any of it.

The order is: **get the file → create the Worker → paste the code → create the D1 database → bind it as `DB` → deploy → complete initial setup → log in → create a User → use the subscription link.**

Cloudflare occasionally renames menu items. Where the exact label differs, the section names ("Bindings", "D1 SQL Database") are the ones to look for.

### Step 1 — Get `worker.js` from the GitHub Release

1. Open this repository's **Releases** page on GitHub.
2. Open the latest release and download the attached **`worker.js`** file to your computer.
3. That single file is the complete, already-built application. You don't need anything else from the repository, and you don't open or edit this file — you will copy its contents in Step 3.

### Step 2 — Create the Worker

This creates the empty program that Vexa Panel will live inside.

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and select your account.
2. In the sidebar, go to **Compute (Workers) → Workers & Pages**.
3. Select **Create**, then choose to start from scratch (a "Hello World" starter is fine) rather than from a template.
4. Give the Worker a name. **This name is yours to choose** — Vexa Panel does not care what it is. It becomes part of your address: `https://<your-worker-name>.<your-subdomain>.workers.dev`.
5. Finish creating the Worker.

### Step 3 — Paste the released `worker.js` into the Worker

1. Open the Worker you just created, then open its code editor (**Edit code**).
2. On your computer, open the downloaded `worker.js` in any plain text editor (Notepad on Windows, TextEdit on macOS), select everything, and copy it.
3. Back in the Cloudflare editor, select everything in the starter file and paste `worker.js` over it, so the starter code is completely replaced.
4. Save and deploy from the editor.

The Worker now contains Vexa Panel's code, but it will not work yet: it has nowhere to store data. Steps 4 to 6 fix that.

### Step 4 — Create the D1 Database (the storage itself)

This step **creates** the storage. It does not yet connect it to your Worker — that is Step 5.

**What this storage holds.** Vexa Panel keeps all of its saved data in one D1 database: your Users, your Nodes, the dashboard statistics, the recent-activity list, the login rate-limit counters, the fallback cache of subscription sources, and — unless you configure Cloudflare Secrets instead (see [Secrets / Admin Password](#-secrets--admin-password) below) — the admin authentication values themselves. If this is missing, the panel has nowhere to put anything and shows a setup screen instead of the panel.

1. In the Cloudflare Dashboard sidebar, go to **Storage & Databases → D1 SQL Database**.
2. Select **Create**.
3. Type a name for the database. **You choose this name freely** — for example:

   ```
   vexa-panel-db
   ```

4. Confirm/create it.

That's all for this step. The database now exists in your account, but your Worker still cannot see it.

> ⚠️ **Do not confuse these two names:**
> `vexa-panel-db` is the **database name** — a label you picked, used only so you can find it in Cloudflare's list.
> `DB` is the **binding name** — fixed by Vexa Panel, and the name the code uses to find the database.
> They are two different things, and both are needed. The next step is where `DB` is entered.

### Step 5 — Bind the D1 Database to the Worker as `DB`

This step **binds** the database you created in Step 4 to your Worker.

1. Go back to **Workers & Pages** and open your Worker.
2. Open the **Settings** tab, then find **Bindings** (may be shown as **Variables and Bindings**).
3. Select **Add**, then choose the binding type **D1 database**.
4. In the **Variable name** field, type exactly:

   ```
   DB
   ```

   All uppercase, no spaces. The code looks for `env.DB` and for nothing else — a different spelling means the Worker will not find the database.

5. In the **D1 database** field, select the database you created in Step 4 (`vexa-panel-db`, or whatever you named it).
6. Save and deploy.

If you open the panel before this binding exists, Vexa Panel shows its own "D1 Database Required" page listing these same instructions.

### Step 6 — Deploy

Deploy the Worker again so the binding from Step 5 is live on the running version. Your Worker's address is shown at the top of its page in the Dashboard:

```
https://<your-worker-name>.<your-subdomain>.workers.dev
```

### Step 7 — Complete initial setup and choose your admin password

1. Open your Worker's address in a browser. Because authentication isn't configured yet, the normal **Login page** shows a first-run form instead of the usual sign-in form: **Password**, **Confirm password**, and **Create account**. There is no separate setup page — this is the same Login page you'll use every time afterward.
2. Enter the admin password you want to use, twice, then select **Create account**.
3. The Worker generates the underlying authentication configuration itself and saves it directly into the `auth_config` table of the D1 database you bound in Step 5 — there is nothing for you to copy or paste. The plaintext password you typed is never stored anywhere and cannot be recovered after you leave this page.
4. You are logged out once and returned to the normal Login page. This is expected, not an error — first-run setup only chooses your password, it doesn't sign you in.

### Step 8 — Log in

1. On the Login page, enter the admin password you just chose in Step 7 and sign in.
2. You land on the **Dashboard** view. Setup is complete.

### Step 9 — Create your first User (and optionally a Node)

1. Go to the **Users** section and create a User. A display name is all that's required.
2. Paste that User's own proxy links, subscription URLs, Xray JSON, or Clash YAML into their sources.
3. If you want one source shared by several Users, go to **Nodes** instead and create a Node there (one name + one source).
4. Open the User and assign that Node to them from the Node picker. Editing the Node later updates every User it is assigned to.

### Step 10 — Use the public subscription URL

Each User has one public subscription link:

```
https://<your-worker-name>.<your-subdomain>.workers.dev/sub/user/<the-users-id>
```

In the panel, select **Link** on the User's row in the Users list to open the link, its QR code and a Copy button. **This is the URL you paste into a VPN client app** (or scan as a QR code from the link's own page). It serves that User's own sources merged with their assigned Nodes, deduplicated, in the format the requesting client expects.

Optional query parameters:

- `?format=singbox` — return a sing-box JSON config.
- `?format=clash` — return a Clash/Mihomo YAML config.
- `?canonical=1` — normalize and re-serialize every node through canonical link generation.

Disabling a User in the panel makes their link stop serving nodes immediately.

---

## 🩹 Troubleshooting

- **Every page shows "D1 Database Required".** The `DB` binding is missing or misspelled. Two different things can be wrong: the D1 database itself was never created (Step 4), or it exists but was never bound to the Worker (Step 5). In Step 5 the **Variable name** must be exactly `DB`, uppercase, and the Worker must be redeployed after saving. If Vexa Panel cannot access the `DB` binding, complete the D1 configuration first. Once `DB` is available, reload the Worker and continue with the normal Login page.
- **`/api/*` requests return `{"error":"d1_not_configured"}`.** Same cause as above — the Worker is running without its D1 binding.
- **You created a D1 database but the panel still can't see it.** Creating is not binding. Go back to Step 5 and add the binding under the variable name `DB`; the database's own name (`vexa-panel-db` or whatever you chose) is not what the code looks for.
- **The Login page keeps showing the "Create account" first-run form.** Authentication hasn't been initialized yet — no `auth_config` row exists in D1 (and no complete set of Cloudflare Secrets is bound, if you use that optional path). Complete Step 7.
- **Login says "too many attempts".** Login is rate-limited to 10 attempts per IP per 5 minutes. Wait and try again.
- **A subscription link returns "Not found".** Either the User ID in the URL is wrong, or that User is currently disabled.
- **A User's link is missing some proxies.** A remote subscription source may have failed to fetch; a cached copy up to 14 days old is served in that case. Use the panel's merge preview to see per-source fetch errors.
- **You lost the admin password.** There's no password recovery — the plaintext password is never stored. If you can still log in with the old password, use **Settings → Change Panel Password**. If you can't, you'll need to clear the `auth_config` row from your D1 database (via the Cloudflare dashboard's D1 console) so the Login page shows the first-run **Create account** form again.

---

## 🔐 Secrets / Admin Password

A normal deployment does not need this section — the Login page's first-run **Create account** form (Step 7) is all that's required. It's included here for advanced users who want to understand what backs the login check, or who want the optional Cloudflare Secrets override described below.

The admin password itself is never stored. Three related values back the actual authentication check:

- **JWT secret** — signs and verifies the session tokens issued at login (sessions last 48 hours).
- **Admin salt** — the random salt used when hashing the admin password.
- **Admin password hash** — the PBKDF2 hash (100,000 iterations, SHA-256) of your password combined with the salt. This is what a typed password is checked against.

**By default, all three are generated when you select Create account on the Login page (Step 7) and saved directly into your D1 database's `auth_config` table.** Nothing needs to be copied or pasted, and there is no separate encrypted-variable step.

**Optionally**, if you instead configure all three as Cloudflare Worker **Secrets** — `JWT_SECRET`, `ADMIN_SALT`, and `ADMIN_PASSWORD_HASH`, pasted into **Settings → Variables and Secrets** with type **Secret** — the Worker uses those instead of the D1-saved values. This is an advanced/legacy path: generating these values requires calling the `POST /api/secret/generate` endpoint directly (there is no in-panel page for it anymore), and is not part of the normal deployment flow. A deployment only ever uses one source at a time: a complete set of Secrets always takes precedence over the D1-saved values, and a partial set of Secrets (e.g. only one of the three) is treated as no Secrets at all.

`/change-panel-password` (reached from the panel's **Settings → Change Panel Password**) rotates only the password hash, so existing sessions and subscription links keep working either way. For a D1-backed deployment this is saved automatically; for a Secrets-backed deployment you still have to paste the new hash into Cloudflare for it to take effect.

No minimum length or complexity rule is enforced on the admin password, so choose a genuinely strong, unique one.

---

## 🔒 Security Notes

- If you use the optional Cloudflare Secrets path, never commit `JWT_SECRET`, `ADMIN_SALT`, or `ADMIN_PASSWORD_HASH` anywhere — they belong only in your Worker's Secrets.
- The admin password is the only credential gating the entire panel — every User, every Node, every configured source.
- Protect the Cloudflare account itself (strong password, two-factor authentication). Anyone with access to it can read your D1 data or rotate your Worker's authentication values.
- A User's subscription URL (`/sub/user/:id`) is itself an access credential: anyone holding that link can fetch that User's combined proxy list without logging in, for as long as the User stays enabled. Treat it like a password, and disable the User if the link leaks.

---

## 🏗️ Architecture

- **`src/index.js`** is the application entry point — the `fetch` handler Cloudflare Workers calls for every request.
- Application logic is split into small ES modules under **`src/`** (routing, authentication, D1 data access, the User/Node APIs, protocol parsers, and the admin UI).
- A Cloudflare Worker loads a single script, so a build step bundles everything under `src/` into one generated file, **`worker.js`** — the file attached to each GitHub Release and the file you deploy. It is a build artifact and is not edited by hand.
- **Cloudflare D1** (bound as `DB`) holds all persistent data: Users, Nodes, their relationship, dashboard statistics, the recent-activity log, login rate-limit counters, the subscription fallback cache, and — unless Cloudflare Secrets are configured instead — the admin authentication values.

---

## 📡 API Endpoints Summary

### Public routes

- `GET /` / `/index.html` / `/login` / `/Dashboard` / `/Users` / `/Nodes` / `/Log` / `/settings`: the admin web interface, served unconditionally as the same app shell. The Login page shows the first-run **Create account** form instead of the normal sign-in form when authentication hasn't been initialized yet.
- `GET /change-panel-password`: page for rotating just the admin password.
- `GET /sub/user/:userId`: public combined subscription link for a User. Query parameters: `?canonical=1`, `?format=singbox`, `?format=clash`; with no `?format=`, the format is auto-detected from the client's User-Agent (falling back to raw Base64).
- `GET /api/version`: unauthenticated; returns the deployed version string and an `authInitialized` boolean the Login page uses to decide which form to show.
- `POST /api/login`: validates the admin password and returns a session token (48 hours).
- `POST /api/secret/generate`: called by the Login page's first-run **Create account** form to complete initial D1-backed setup; also used to regenerate the legacy Cloudflare Secrets-backed values (advanced/optional path, no in-panel page for it). Public only while authentication isn't configured yet; requires a valid session once it is.

### Authenticated routes (valid session token required)

- `POST /api/secret/change-password`: rotates the admin password hash only.
- `GET /api/stats`: dashboard summary statistics.
- `GET /api/users` / `POST /api/users`: list Users / create a User (`name`, `sources[]`, `nodeIds[]`).
- `GET|PUT|DELETE /api/users/:id`: read, update (name, `enabled`, `sources[]`, `nodeIds[]`), or delete a User.
- `GET /api/nodes` / `POST /api/nodes`: list Nodes / create a Node (`name` + `source`; name must be unique).
- `PUT|DELETE /api/nodes/:id`: update (name, source, `enabled`) or delete a Node. Deleting also removes it from every User that referenced it.
- `POST /api/merge-preview`: previews deduplication counts, total nodes, and per-source fetch errors for a User.

---

## 🗂️ Data Model

All data lives in the one D1 database bound as `DB`.

**User** (`users` table, `id TEXT PRIMARY KEY`)

| Field                     | Description                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `id`                      | UUID                                                                                      |
| `name`                    | Display name                                                                              |
| `enabled`                 | Whether this User's subscription link currently serves nodes                              |
| `sources[]`               | Sources owned directly by this User (raw links, subscription URLs, Xray JSON, Clash YAML) |
| `createdAt` / `updatedAt` | Timestamps                                                                                |

**Node** (`nodes` table, `id TEXT PRIMARY KEY`)

| Field                     | Description                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `id`                      | UUID                                                                                |
| `name`                    | Display name (unique across Nodes)                                                  |
| `source`                  | A single classified source object (same shape as one entry of a User's `sources[]`) |
| `enabled`                 | Whether this Node contributes nodes to the Users referencing it                     |
| `createdAt` / `updatedAt` | Timestamps                                                                          |

A User's assigned Nodes are stored as rows in a `user_nodes` relationship table (one row per User/Node pair, with an explicit ordering column), not as a JSON array on the User record. Deleting a User or a Node automatically removes the matching `user_nodes` rows.

---

## ⚙️ Release Workflow

`.github/workflows/release.yml` runs when a Git tag matching `v*` is pushed. It builds `worker.js` from the current `src/` source and attaches it to a GitHub Release as a downloadable asset. It is a build/release workflow only — it does not deploy anything to Cloudflare and uses no Cloudflare credentials. Downloading that `worker.js` is Step 1 of the deployment above.

---

## 📚 Official Cloudflare Documentation

- [D1 — overview](https://developers.cloudflare.com/d1/)
- [D1 — get started](https://developers.cloudflare.com/d1/get-started/)
- [Workers — bindings (env)](https://developers.cloudflare.com/workers/runtime-apis/bindings/)
- [Workers — environment variables and secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
