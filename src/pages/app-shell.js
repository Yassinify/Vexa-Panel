// =====================================================================
// VEXA — App shell page: the SPA container that boots the client script
// (login screen + full panel), themed before first paint to avoid a flash
// of the wrong theme.
// =====================================================================

import { STYLES } from "../frontend/styles.js";
import { QR_LIB } from "../frontend/qr-lib.js";
import { CLIENT_SCRIPT } from "../frontend/client-script.js";
import { FAVICON_LINK } from "../favicon-assets.js";

export function renderApp() {
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
  <div id="app"></div>
  <div id="toast" role="status"></div>
  <script>${QR_LIB}</script>
  <script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}
