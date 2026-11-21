// =====================================================================
// VEXA — Public subscription status page: shown when a user opens their
// /sub/user/:id link directly in a browser (as opposed to a VPN client
// app fetching it as a subscription source). Browser detection lives in
// isBrowserRequest() in public-sub.js — a client app still gets the exact
// raw formatted response, unchanged.
// =====================================================================

import { STYLES } from "../frontend/styles.js";
import { QR_LIB } from "../frontend/qr-lib.js";
import { LOGO_MARK_PATHS, FAVICON_LINK } from "../favicon-assets.js";

// Like the panel's Subscription popup, the page shows no merge counts or source issues.
// mergeResult only decides which blocks show: the Normal block shows when the output has
// links or no JSON, the JSON block when it has JSON configs (same rules as the popup). A plus
// icon (the markup icon("plus") draws in icons.js) sits between them when both show, and each
// block then gets a title (.sub-block-title) so the QR codes line up.
export function renderUserSubPage(user, mergeResult, url) {
  const base = `${url.origin}/sub/user/${user.id}`;
  const hasJson = mergeResult.jsonConfigs.length > 0;
  const showNormal = mergeResult.nodes.length > 0 || !hasJson;

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Vexa Panel</title>
${FAVICON_LINK}
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<!-- Apply the saved theme before first paint so the page does not flash dark. -->
<script>try { const t = localStorage.getItem("vexa_theme"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch (e) {}</script>
<style>${STYLES}
/* The card fades in with the same 6px slide as the panel popups (modal-card-in in STYLES). Nothing on this page disappears, so there is no exit. */
.login-card { animation: modal-card-in .16s ease-out; }
@media (prefers-reduced-motion: reduce) { .login-card { animation: none; } }
/* The card is 420px wide, or 600px above 760px when both blocks show (the plus icon exists only then), as in the panel popup. */
.login-card { max-width: 420px; }
@media (min-width: 761px) { .login-card:has(.sub-plus) { max-width: 600px; } }
</style>
</head>
<body>
<div class="login-wrap">
  <div class="card login-card" style="text-align:center;">
    <!-- Same logo block as the login screen (logoMark() in icons.js). -->
    <div class="login-logo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 34" width="30" height="26" class="logo-mark" aria-hidden="true">${LOGO_MARK_PATHS}</svg>Vexa Panel</div>
    <h1 style="margin-bottom:var(--space-lg);">Subscription</h1>
    <div class="sub-blocks">${showNormal ? `
      <div class="sub-block">${showNormal && hasJson ? `
        <h3 class="sub-block-title">Normal</h3>` : ""}
        <div class="qr-box" id="qrBox"></div>
        <small style="color:var(--color-muted);">Scan the QR code or copy the link below</small>
        <div class="link-row">
          <input id="subLinkInput" readonly value="${base}" onclick="this.select()" />
          <button class="btn-secondary" onclick="copyLink('subLinkInput')">Copy</button>
        </div>
      </div>` : ""}${showNormal && hasJson ? `
      <div class="sub-plus" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="ui-icon" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg></div>` : ""}${hasJson ? `
      <div class="sub-block">
        <h3 class="sub-block-title">JSON</h3>
        <div class="qr-box" id="qrBoxJson"></div>
        <small style="color:var(--color-muted);">Scan the QR code or copy the link below</small>
        <div class="link-row">
          <input id="subLinkInputJson" readonly value="${base}?format=json" onclick="this.select()" />
          <button class="btn-secondary" onclick="copyLink('subLinkInputJson')">Copy</button>
        </div>
        <button class="btn-primary btn-full" onclick="downloadLink()">Download</button>
      </div>` : ""}
    </div>
  </div>
</div>
<div id="toast" role="status"></div>
<script>${QR_LIB}</script>
<script>
const SUB_URL = ${JSON.stringify(base)};
// One QR code per shown block; a QR box is absent when its block is not shown.
const qrBox = document.getElementById("qrBox");
if (qrBox) {
  const qr = qrcodegen.QrCode.encodeText(SUB_URL, qrcodegen.QrCode.Ecc.MEDIUM);
  qrBox.innerHTML = qr.toSvgString(4);
}
const qrBoxJson = document.getElementById("qrBoxJson");
if (qrBoxJson) {
  const qrJson = qrcodegen.QrCode.encodeText(SUB_URL + "?format=json", qrcodegen.QrCode.Ecc.MEDIUM);
  qrBoxJson.innerHTML = qrJson.toSvgString(4);
}

// One persistent #toast element: a new message replaces the text and restarts the 1800 ms timer.
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

// Selects the given link field and copies it; a clipboard failure is swallowed.
function copyLink(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.select();
  try {
    navigator.clipboard.writeText(input.value).catch(() => {});
  } catch (e) {}
  showToast("Link copied");
}

// Downloads the user's JSON configs from the JSON link field as a .json file, like the panel's popup.
// The server answers 404 when the user has no JSON configs.
async function downloadLink() {
  const jsonInput = document.getElementById("subLinkInputJson");
  if (!jsonInput) return;
  try {
    const res = await fetch(jsonInput.value);
    if (res.status === 404) {
      showToast("No JSON configs to download");
      return;
    }
    if (!res.ok) {
      showToast("Could not download the file");
      return;
    }
    const blobUrl = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "vexa-config.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
    showToast("Download started");
  } catch (e) {
    showToast("Could not download the file");
  }
}
</script>
</body>
</html>`;
}
