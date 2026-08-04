# VEXA — VPN Subscription Manager

> **A secure, single-file Cloudflare Worker for merging, managing, and canonicalizing V2Ray / Xray / Shadowsocks / Hysteria2 VPN subscription links.**

VEXA is a lightweight, zero-dependency subscription panel and aggregator built to run entirely inside a single Cloudflare Worker. It fetches proxy nodes from multiple subscription links or raw URI lists, deduplicates them by structural fingerprinting, and provides clean, unified subscription links for your VPN clients — in raw, sing-box, or Clash/Mihomo format.

---

## 🌟 Key Features

- **Single-File Deployment:** Everything (Backend API, Router, Logic, Base64/JWT, QR Generator, and Glassmorphism Frontend) is bundled in a single Worker file.
- **Protocol & Format Support:**
  - Protocols: VLESS, VMess, Trojan, Shadowsocks (including SIP022 / Shadowsocks 2022), Shadowsocksr, Hysteria (v1 & v2/hy2), TUIC, WireGuard, SOCKS5, HTTP, and NaiveProxy.
  - Input Formats: Plaintext URI lists, Base64-encoded subscriptions, Xray/V2Ray JSON configs, and Clash/Mihomo YAML lists.
  - Output Formats: Raw Base64 URI list (default), **sing-box JSON**, and **Clash/Mihomo YAML** — selectable per subscription link via `?format=`.
- **Multi-User Ownership:** Profiles belong to users; each user gets a combined `/sub/user/:id` link that merges every profile they own, and can be **enabled or disabled** from the panel without touching individual profiles.
- **Smart Deduplication & Fingerprinting:** Identifies identical proxy nodes based on host, credentials, transport types, SNI, path, and security parameters—removing redundant proxies cleanly, including when merging across multiple profiles for a combined user link.
- **Fault-Tolerant Cache:** Caches external subscription nodes for up to 14 days. If a remote subscription goes down, VEXA serves the fallback cache seamlessly.
- **Guided KV Setup:** If the `STORAGE` KV binding isn't configured yet, the Worker now serves a step-by-step setup guide instead of failing with an opaque error.
- **Security & Authentication:**
  - Single-admin authentication using PBKDF2 (100,000 iterations) and HS256 JWT tokens (sessions now last 48 hours, up from 12).
  - Dedicated `/change-panel-password` deep link for rotating the admin password from Settings.
  - Strict CORS policies and rate-limiting on authentication attempts.
- **Modern Web Interface:** Built-in glassmorphism UI with light/dark/system theming, a Settings panel, a per-link format picker, and a native byte-mode QR Code generator for quick mobile imports.

---

## 🚀 Quick Start & Deployment

### 1. Prerequisites

- A [Cloudflare](https://dash.cloudflare.com/) account.
- A Cloudflare KV Namespace created for persistent storage (e.g., profiles, login rate-limiting, and subscription fallback caches). If this binding is missing, visiting the Worker now shows an in-app setup guide instead of an error.

### 2. Environment Variables & KV Bindings

Configure the following bindings in your Cloudflare Worker setting (`wrangler.toml` or via Cloudflare Dashboard):

| Variable / Binding    | Type             | Description                                                    |
| :-------------------- | :--------------- | :--------------------------------------------------------------- |
| `STORAGE`             | **KV Namespace** | Required for storing users, profiles, and subscription fallback cache. |
| `JWT_SECRET`          | **Secret Text**  | A long, secure random string used to sign JWT tokens.          |
| `ADMIN_SALT`          | **Secret Text**  | Hex-encoded salt used for PBKDF2 password derivation.          |
| `ADMIN_PASSWORD_HASH` | **Secret Text**  | Hex-encoded derived PBKDF2 hash of your admin password.        |

#### Generating PBKDF2 Password Hash

You can generate a valid salt and hashed key using Node.js or browser WebCrypto:

```javascript
const crypto = require("crypto");

const salt = crypto.randomBytes(16).toString("hex");
const password = "YourSecurePassword";
const derivedKey = crypto
  .pbkdf2Sync(password, Buffer.from(salt, "hex"), 100000, 32, "sha256")
  .toString("hex");

console.log("ADMIN_SALT:", salt);
console.log("ADMIN_PASSWORD_HASH:", derivedKey);
```

Alternatively, visit `/secret` in your deployed Worker to generate these values through the UI, or `/change-panel-password` to rotate just the password later.

---

## 📡 API Endpoints Summary

### Public Routes

- `GET /` / `/index.html` / `/login` / `/panel`: Serves the integrated web UI dashboard.
- `GET /secret` or `/secrets`: Initial setup / secret regeneration page.
- `GET /change-panel-password`: Dedicated page for rotating the admin password.
- `GET /sub/:profileId`: Public subscription download link for a single profile (returns Base64-encoded URI list by default).
  - _Query Parameters:_
    - `?canonical=1` (Optional) — Normalizes and re-serializes nodes through canonical URI generation.
    - `?format=singbox` (Optional) — Returns a ready-to-use sing-box JSON config instead of the raw list.
    - `?format=clash` (Optional) — Returns a Clash/Mihomo YAML config instead of the raw list.
- `GET /sub/user/:userId`: Public combined subscription link merging **all** profiles owned by that user, re-deduplicated across profiles. Stops serving nodes immediately if the user is disabled. Supports the same `?format=` options as `/sub/:profileId`.
- `GET /api/version`: Unauthenticated endpoint returning the current version.

### Authenticated Routes (`Bearer <JWT>`)

- `POST /api/login`: Validates the admin password and returns a JWT token (now valid for 48 hours).
- `POST /api/secret/change-password`: Rotates `ADMIN_PASSWORD_HASH` without invalidating other secrets.
- `GET /api/stats`: Returns dashboard summary statistics.
- `GET /api/users`: Lists all users.
- `POST /api/users`: Creates a new user.
- `PUT /api/users/:id`: Updates a user, including toggling `enabled` to activate/deactivate their combined subscription link.
- `GET /api/profiles`: Lists all created subscription profiles.
- `POST /api/profiles`: Creates a new profile with subscription sources or raw URIs.
- `GET /api/profiles/:id`: Retrieves full configuration details for a given profile ID.
- `PUT /api/profiles/:id`: Updates profile name or sources.
- `DELETE /api/profiles/:id`: Removes a profile.
- `POST /api/merge-preview`: Previews deduplication counts, total nodes, and source error statuses.

---

## 📋 Changelog

### **v3.2.1** *(current)*

feat: multi-format subscription export and per-user combined links

- Add `?format=singbox` and `?format=clash` output options on `/sub/:profileId`, generating ready-to-use sing-box JSON or Clash/Mihomo YAML configs on the fly
- Add `GET /sub/user/:userId`, a combined subscription link merging every profile a user owns, with cross-profile re-deduplication
- Add per-user `enabled` flag: disabling a user immediately stops their combined link from serving nodes, without touching individual profiles
- Add in-panel format picker for copying/sharing a profile or user link in the desired format
- Add guided setup screen (`renderKvSetupGuide`) shown when the `STORAGE` KV binding isn't configured yet, replacing opaque `internal_error` responses
- Add dedicated `/change-panel-password` page for rotating the admin password from Settings
- Add `/login` and `/panel` as aliases serving the same app shell as `/`
- Extend admin session lifetime from 12 hours to 48 hours
- Add Settings panel and light/dark/system theme toggle to the admin UI

### **v2.2.1**

fix(ui): improve light theme contrast and hamburger button visibility

- Darken `--border` (#d3d7dd) and `--text-muted` (#63666d) in light theme to meet WCAG AA contrast standards
- Add solid background fill (`var(--bg-page)`) to `.menu-toggle-btn` for better visibility
- Fix hamburger icon alignment by enforcing `flex` layout instead of `block`
- Note: Accent colors (`--accent`, `--good`, `--bad`) and dark theme tokens remain unchanged

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

- Introduce User-Profile ownership hierarchy with automatic zero-downtime migration
- Optimize KV storage using explicit index & stats records to avoid payload list() calls
- Add `/secret` route for initial setup and secure env secret generation
- Add modern sidebar layout with Dashboard and User/Profile management views
- Add UI enhancements: toasts, modal confirms, theme toggles (light/dark/system)
- Note: Core parsers, validators, merge engine, and `/sub/:id` endpoints remain untouched

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

- Initial baseline release featuring basic profile CRUD, KV storage integration, manual JWT authentication, and deduplication logic.
