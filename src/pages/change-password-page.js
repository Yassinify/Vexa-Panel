// =====================================================================
// VEXA — /change-panel-password PAGE: standalone deep link reached from
// the panel's Settings menu. Skips straight to the change-password form if
// a still-valid session token is already in localStorage; otherwise asks
// for the current password first (same password-gate pattern the old
// /secret page used, now standalone here since /secret no longer exists).
// =====================================================================

import { STYLES } from "../frontend/styles.js";
import { RIPPLE_SCRIPT } from "../frontend/ripple-script.js";

export function renderChangePanelPasswordPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VEXA — Change Panel Password</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>${STYLES}</style>
</head>
<body data-theme="dark">
<div class="login-wrap">
  <div class="card login-card" style="max-width:520px;text-align:left;">
    <div style="text-align:center;">
      <img class="logo-glow" src="/favicon.svg" alt="VEXA logo">
      <div class="brand">Change Panel Password</div>
      <div class="brand-sub">Sessions and subscription links keep working</div>
    </div>
    <div id="changePwBody"></div>
    <button class="btn-secondary" style="width:100%;margin-top:14px;" onclick="location.href='/panel'">Back to Panel</button>
  </div>
</div>
<script>
let sessionToken = localStorage.getItem("vexa_token");

function fieldsHtml(values) {
  return Object.entries(values).map(([k, v]) => \`
    <div class="field-group">
      <label class="field-label">\${k}</label>
      <input readonly value="\${v}" onclick="this.select()" style="font-family:var(--mono-stack);font-size:12px;" />
    </div>
  \`).join("");
}

function copyAllText(values) {
  return Object.entries(values).map(([k, v]) => k + "=" + v).join("\\n");
}

function showToast(msg) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function renderGate() {
  sessionToken = null;
  document.getElementById("changePwBody").innerHTML = \`
    <div class="field-group">
      <label class="field-label">Current Admin Password</label>
      <input type="password" id="gatePassword" placeholder="Enter current password" />
    </div>
    <button class="btn-secondary" style="width:100%;" id="gateBtn">Continue</button>
    <div class="error-text" id="gateError"></div>
  \`;
  document.getElementById("gateBtn").onclick = async () => {
    const password = document.getElementById("gatePassword").value;
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      document.getElementById("gateError").textContent = "Incorrect password.";
      return;
    }
    const data = await res.json();
    sessionToken = data.token;
    renderForm();
  };
  document.getElementById("gatePassword")?.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("gateBtn").click();
  });
}

function renderForm() {
  document.getElementById("changePwBody").innerHTML = \`
    <div class="field-group">
      <label class="field-label">New Admin Password</label>
      <input type="password" id="newPw" placeholder="New password" />
    </div>
    <button class="btn-primary" style="width:100%;" id="submitBtn">Change Password</button>
    <div class="error-text" id="formError"></div>
  \`;
  const submit = async () => {
    const password = document.getElementById("newPw").value;
    document.getElementById("changePwBody").innerHTML = '<div class="skel" style="width:100%;height:36px;margin-top:6px;"></div>';
    const res = await fetch("/api/secret/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + sessionToken },
      body: JSON.stringify({ password })
    });
    if (res.status === 401) {
      renderGate();
      return;
    }
    if (!res.ok) {
      renderForm();
      document.getElementById("formError").textContent = "Could not change password. Try again.";
      return;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }

    if (data && data.values) {
      // Secret-backed: unchanged legacy manual-copy flow.
      document.getElementById("changePwBody").innerHTML = \`
        <div class="helper-text" style="margin:16px 0;">
          Copy this value now — the plaintext password is not stored anywhere and cannot be
          recovered after you leave this page. ADMIN_SALT and JWT_SECRET are unchanged, so
          existing sessions stay valid.
        </div>
        \${fieldsHtml(data.values)}
        <button class="btn-primary" style="width:100%;margin-top:6px;" id="copyAllBtn">Copy Value</button>
        <div class="helper-text" style="margin-top:14px;">
          In <strong>Cloudflare Dashboard → Workers → Settings → Variables and Secrets</strong>,
          update <strong>ADMIN_PASSWORD_HASH</strong> with this value. Set its type to
          <strong>Secret</strong> (not the default Text), then save and redeploy.
        </div>
      \`;
      document.getElementById("copyAllBtn").onclick = () => {
        navigator.clipboard.writeText(copyAllText(data.values));
        showToast("Copied — paste into Cloudflare now.");
      };
      return;
    }

    // D1-backed: the new hash was already persisted server-side (salt and
    // JWT secret untouched, so existing sessions stay valid).
    document.getElementById("changePwBody").innerHTML = \`
      <div class="helper-text" style="margin:16px 0;">
        Password updated. ADMIN_SALT and JWT_SECRET are unchanged, so existing sessions stay valid.
      </div>
      <button class="btn-secondary" style="width:100%;" id="donePwBtn">Done</button>
    \`;
    document.getElementById("donePwBtn").onclick = () => {
      location.href = "/panel";
    };
  };
  document.getElementById("submitBtn").onclick = submit;
}

if (sessionToken) {
  renderForm();
} else {
  renderGate();
}
</script>
<script>${RIPPLE_SCRIPT}</script>
</body>
</html>`;
}
