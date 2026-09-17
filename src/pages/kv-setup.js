// =====================================================================
// VEXA — /KV SETUP GUIDE page: shown for every route when the KV
// namespace isn't bound yet. Nothing in this Worker (sessions, users,
// their subscription sources, secrets) can function without it, so this
// takes priority over every other page, including the secret setup flow.
// =====================================================================

import { STYLES } from "../frontend/styles.js";

export function renderKvSetupGuide() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VEXA — KV Namespace Setup Required</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>${STYLES}</style>
</head>
<body data-theme="dark">
<div class="login-wrap">
  <div class="glass-card login-card" style="max-width:560px;text-align:left;">
    <div style="text-align:center;">
      <div class="logo-glow">🗄️</div>
      <div class="brand">KV Namespace Required</div>
      <div class="brand-sub">This Worker needs a KV namespace bound before it can run</div>
    </div>
    <div class="helper-text" style="margin:16px 0 10px;">Follow these steps in the Cloudflare dashboard:</div>
    <ol style="margin:0 0 18px 18px;padding:0;font-size:13px;color:var(--text-primary);line-height:1.9;">
      <li>Open your Worker in the Cloudflare dashboard.</li>
      <li>Go to <strong>Settings → Bindings</strong>.</li>
      <li>Click <strong>Add binding</strong> and choose <strong>KV Namespace</strong>.</li>
      <li>Set the <strong>Variable name</strong> to exactly <code>STORAGE</code> (all uppercase).</li>
      <li>Select an existing KV namespace, or create a new one right there.</li>
      <li>Click <strong>Save and deploy</strong>.</li>
      <li>Reload this page.</li>
    </ol>
    <button class="btn-primary" style="width:100%;" onclick="location.reload()">I've added it — Reload</button>
  </div>
</div>
</body>
</html>`;
}
