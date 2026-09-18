// =====================================================================
// VEXA — /D1 SETUP GUIDE page: shown for every route when the D1
// database isn't bound yet. Nothing in this Worker (sessions, users,
// their subscription sources, secrets, rate limiting) can function
// without it, so this takes priority over every other page, including
// the secret setup flow.
// =====================================================================

import { STYLES } from "../frontend/styles.js";
import { RIPPLE_SCRIPT } from "../frontend/ripple-script.js";

export function renderD1SetupGuide() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VEXA — D1 Database Setup Required</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>${STYLES}</style>
</head>
<body data-theme="dark">
<div class="login-wrap">
  <div class="card login-card" style="max-width:560px;text-align:left;">
    <div style="text-align:center;">
      <img class="logo-glow" src="/favicon.svg" alt="VEXA logo">
      <div class="brand">D1 Database Required</div>
      <div class="brand-sub">This Worker needs a D1 database bound before it can run</div>
    </div>
    <div class="helper-text" style="margin:16px 0 10px;">Follow these steps in the Cloudflare dashboard:</div>
    <ol class="setup-steps">
      <li>Create a D1 database for this project, if you haven't already (Cloudflare dashboard → <strong>D1 SQL Database</strong> → <strong>Create</strong>). Vexa does not create this database for you.</li>
      <li>Open your Worker in the Cloudflare dashboard.</li>
      <li>Go to <strong>Settings → Bindings</strong>.</li>
      <li>Click <strong>Add binding</strong> and choose <strong>D1 database</strong>.</li>
      <li>Set the <strong>Variable name</strong> to exactly <code>DB</code> (uppercase).</li>
      <li>Select the D1 database you created.</li>
      <li>Click <strong>Save and deploy</strong>.</li>
      <li>Reload this page.</li>
    </ol>
    <button class="btn-primary" style="width:100%;" onclick="location.reload()">I've added it — Reload</button>
  </div>
</div>
<script>${RIPPLE_SCRIPT}</script>
</body>
</html>`;
}
