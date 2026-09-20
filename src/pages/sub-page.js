// =====================================================================
// VEXA — Public subscription status page: shown when a user opens their
// /sub/user/:id link directly in a browser (as opposed to a VPN client
// app fetching it as a subscription source). Browser detection lives in
// isBrowserRequest() in public-sub.js — a client app still gets the exact
// raw formatted response, unchanged.
// =====================================================================

import { STYLES } from "../frontend/styles.js";
import { QR_LIB } from "../frontend/qr-lib.js";
import { RIPPLE_SCRIPT } from "../frontend/ripple-script.js";

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderUserSubPage(user, mergeResult, url) {
  const base = `${url.origin}/sub/user/${user.id}`;
  const { nodes, duplicatesRemoved, sourceErrors } = mergeResult;

  const failed = (sourceErrors || []).filter((e) => !e.usedCache);
  const degraded = (sourceErrors || []).filter((e) => e.usedCache);
  const issuesHtml =
    failed.length || degraded.length
      ? `<div style="margin-bottom:var(--space-lg);">
          ${failed.length ? `<div class="error-text" style="margin-top:0;">${failed.length} source(s) failed to fetch — nodes missing.</div>` : ""}
          ${degraded.length ? `<div class="helper-text">${degraded.length} source(s) used a cached copy.</div>` : ""}
        </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VEXA — ${escapeHtml(user.name)}</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>${STYLES}</style>
</head>
<body data-theme="dark">
<div class="login-wrap">
  <div class="card login-card" style="width:100%;max-width:560px;min-width:0;text-align:left;">
    <div style="text-align:center;margin-bottom:var(--space-xl);">
      <img class="logo-glow" src="/favicon.svg" alt="VEXA logo">
      <div class="brand" style="overflow-wrap:anywhere;">${escapeHtml(user.name)}</div>
      <div class="brand-sub">VEXA subscription</div>
    </div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-num">${nodes.length}</div><div class="stat-label">Nodes</div></div>
      <div class="stat-box"><div class="stat-num">${duplicatesRemoved}</div><div class="stat-label">Duplicates Removed</div></div>
    </div>
    ${issuesHtml}
    <div class="helper-text" style="margin-bottom:var(--space-md);">One link works with any supported client — the format is detected automatically.</div>
    <div class="qr-box" id="qrBox"></div>
    <label class="field-label">Subscription Link</label>
    <div class="link-row">
      <input id="subLinkInput" readonly value="${base}" onclick="this.select()" />
      <button class="btn-primary" onclick="copyLink()">Copy</button>
    </div>
  </div>
</div>
<script>${QR_LIB}</script>
<script>
const SUB_URL = ${JSON.stringify(base)};
const qr = qrcodegen.QrCode.encodeText(SUB_URL, qrcodegen.QrCode.Ecc.MEDIUM);
document.getElementById("qrBox").innerHTML = qr.toSvgString(4);

function copyLink() {
  const input = document.getElementById("subLinkInput");
  input.select();
  navigator.clipboard.writeText(input.value);
  showToast("Copied to clipboard!");
}

function showToast(msg) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}
</script>
<script>${RIPPLE_SCRIPT}</script>
</body>
</html>`;
}
