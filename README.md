# VEXA — VPN Subscription Manager

> **A secure, single-file Cloudflare Worker for merging, managing, and canonicalizing V2Ray / Xray / Shadowsocks / Hysteria2 VPN subscription links.**

VEXA is a lightweight, zero-dependency subscription panel and aggregator built to run entirely inside a single Cloudflare Worker. It fetches proxy nodes from multiple subscription links or raw URI lists, deduplicates them by structural fingerprinting, and provides clean, unified subscription links for your VPN clients.

---

## 🌟 Key Features

- **Single-File Deployment:** Everything (Backend API, Router, Logic, Base64/JWT, QR Generator, and Glassmorphism Frontend) is bundled in a single Worker file.
- **Protocol & Format Support:**
  - Protocols: VLESS, VMess, Trojan, Shadowsocks (including SIP022 / Shadowsocks 2022), and Hysteria2 (hy2).
  - Formats: Plaintext URI lists, Base64-encoded subscriptions, Xray/V2Ray JSON configs, and Clash/Mihomo YAML lists.
- **Smart Deduplication & Fingerprinting:** Identifies identical proxy nodes based on host, credentials, transport types, SNI, path, and security parameters—removing redundant proxies cleanly.
- **Fault-Tolerant Cache:** Caches external subscription nodes for up to 14 days. If a remote subscription goes down, VEXA serves the fallback cache seamlessly.
- **Security & Authentication:**
  - Single-admin authentication using PBKDF2 (100,000 iterations) and HS256 JWT tokens.
  - Strict CORS policies and rate-limiting on authentication attempts.
- **Modern Web Interface:** Built-in glassmorphism UI with a native byte-mode QR Code generator for quick mobile imports.

---

## 🚀 Quick Start & Deployment

### 1. Prerequisites

- A [Cloudflare](https://dash.cloudflare.com/) account.
- A Cloudflare KV Namespace created for persistent storage (e.g., profiles, login rate-limiting, and subscription fallback caches).

### 2. Environment Variables & KV Bindings

Configure the following bindings in your Cloudflare Worker setting (`wrangler.toml` or via Cloudflare Dashboard):

| Variable / Binding    | Type             | Description                                                    |
| :-------------------- | :--------------- | :------------------------------------------------------------- |
| `STORAGE`             | **KV Namespace** | Required for storing profiles and subscription fallback cache. |
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

---

## 📡 API Endpoints Summary

### Public Routes

- `GET /` or `/index.html`: Serves the integrated web UI dashboard.
- `GET /sub/:profileId`: Public subscription download link (returns Base64-encoded URI list).
  - _Query Parameter:_ `?canonical=1` (Optional) — Normalizes and re-serializes nodes through canonical URI generation.
- `GET /api/version`: Unauthenticated endpoint returning version and build date.

### Authenticated Routes (`Bearer <JWT>`)

- `POST /api/login`: Validates the admin password and returns a JWT token.
- `GET /api/profiles`: Lists all created subscription profiles.
- `POST /api/profiles`: Creates a new profile with subscription sources or raw URIs.
- `GET /api/profiles/:id`: Retrieves full configuration details for a given profile ID.
- `PUT /api/profiles/:id`: Updates profile name or sources.
- `DELETE /api/profiles/:id`: Removes a profile.
- `POST /api/merge-preview`: Previews deduplication counts, total nodes, and source error statuses.

---

## 📋 Changelog

### **1.6.0**

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
