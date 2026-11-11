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

// mergeResult stays in the signature for the caller (public-sub.js). Like the panel's
// Subscription popup, the page shows no merge counts or source issues.
export function renderUserSubPage(user, mergeResult, url) {
  const base = `${url.origin}/sub/user/${user.id}`;

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
<style>${STYLES}</style>
</head>
<body>
<div class="login-wrap">
  <div class="card login-card" style="max-width:420px;text-align:center;">
    <!-- Same logo block as the login screen (logoMark() in icons.js). -->
    <div class="login-logo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 34" width="30" height="26" class="logo-mark" aria-hidden="true">${LOGO_MARK_PATHS}</svg>Vexa Panel</div>
    <h1 style="margin-bottom:var(--space-lg);">Subscription</h1>
    <div class="qr-box" id="qrBox"></div>
    <small style="color:var(--color-muted);">Scan the QR code or copy the link below</small>
    <div class="link-row">
      <input id="subLinkInput" readonly value="${base}" onclick="this.select()" />
      <button class="btn-secondary" onclick="copyLink()">Copy</button>
    </div>
    <button class="btn-primary btn-full" onclick="downloadLink()">Download</button>
  </div>
</div>
<div id="toast" role="status"></div>
<script>${QR_LIB}</script>
<script>
const SUB_URL = ${JSON.stringify(base)};
const qr = qrcodegen.QrCode.encodeText(SUB_URL, qrcodegen.QrCode.Ecc.MEDIUM);
document.getElementById("qrBox").innerHTML = qr.toSvgString(4);

// One persistent #toast element: a new message replaces the text and restarts the 1800 ms timer.
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

// Selects the link field and copies it; a clipboard failure is swallowed.
function copyLink() {
  const input = document.getElementById("subLinkInput");
  input.select();
  try {
    navigator.clipboard.writeText(input.value).catch(() => {});
  } catch (e) {}
  showToast("Link copied");
}

// Mock, as in the panel's Subscription modal: nothing is downloaded, only the toast is shown.
function downloadLink() {
  showToast("Download started");
}
</script>
</body>
</html>`;
}
