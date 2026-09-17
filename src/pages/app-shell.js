// =====================================================================
// VEXA — App shell page: the SPA container that boots the client script
// (login screen + full panel), themed before first paint to avoid a flash
// of the wrong theme.
// =====================================================================

import { VEXA_VERSION } from "../constants.js";
import { STYLES } from "../frontend/styles.js";
import { QR_LIB } from "../frontend/qr-lib.js";
import { CLIENT_SCRIPT } from "../frontend/client-script.js";

export function renderApp() {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vexa Panel - ${VEXA_VERSION}</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>${STYLES}</style>
</head>
<body>
  <div id="app"></div>
  <a class="version-badge" href="https://github.com/Yassinify/Vexa-Panel" target="_blank" rel="noopener noreferrer" title="Open project on GitHub">VEXA v${VEXA_VERSION}</a>
  <script>${QR_LIB}</script>
  <script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}
