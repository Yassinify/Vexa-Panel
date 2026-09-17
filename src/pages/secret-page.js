// =====================================================================
// VEXA — /secret PAGE: standalone, deliberately independent of the SPA/
// session state (it has to work with zero configured secrets).
// =====================================================================

import { STYLES } from "../frontend/styles.js";

export function renderSecretPage(configured) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VEXA — Secret Setup</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>${STYLES}</style>
</head>
<body data-theme="dark">
<div class="login-wrap">
  <div class="glass-card login-card" style="max-width:520px;text-align:left;">
    <div style="text-align:center;">
      <div class="logo-glow">🔑</div>
      <div class="brand">${configured ? "Admin Secrets" : "VEXA Initial Setup"}</div>
      <div class="brand-sub">${
        configured
          ? "Change your password, or destroy and rotate every secret"
          : "Required Cloudflare Variables and Secrets are missing"
      }</div>
    </div>
    <div id="secretBody"></div>
  </div>
</div>
<script>
const configured = ${configured ? "true" : "false"};
let sessionToken = null;

function fieldsHtml(values) {
  return Object.entries(values).map(([k, v]) => \`
    <div class="field-group">
      <label class="field-label">\${k}</label>
      <input readonly value="\${v}" onclick="this.select()" style="font-family:monospace;font-size:12px;" />
    </div>
  \`).join("");
}

function copyAllText(values) {
  return Object.entries(values).map(([k, v]) => k + "=" + v).join("\\n");
}

// Skeleton placeholders sized like the real field-group/button they stand in
// for, so the layout doesn't jump once the response comes back.
function skeletonFields(n) {
  return Array.from({ length: n }).map(() => \`
    <div class="field-group">
      <div class="skel" style="width:150px;height:10px;margin-bottom:6px;"></div>
      <div class="skel" style="width:100%;height:36px;"></div>
    </div>
  \`).join("");
}

function showSecretSkeleton(fieldCount) {
  document.getElementById("secretBody").innerHTML = \`
    <div class="skel" style="width:180px;height:11px;margin:16px 0 14px;"></div>
    \${skeletonFields(fieldCount)}
    <div class="skel" style="width:100%;height:36px;margin-top:6px;"></div>
  \`;
}

async function generate(password) {
  showSecretSkeleton(3);
  const res = await fetch("/api/secret/generate", {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      sessionToken ? { Authorization: "Bearer " + sessionToken } : {}
    ),
    body: JSON.stringify({ password })
  });
  if (!res.ok) {
    let message = "Could not generate secrets (" + res.status + "). Try again.";
    try {
      const err = await res.json();
      if (err.error === "password_too_short") message = "Password must be at least 8 characters.";
    } catch {}
    document.getElementById("secretBody").innerHTML =
      '<div class="error-text">' + message + '</div>' +
      '<button class="btn-secondary" style="width:100%;margin-top:10px;" id="retryBtn">Back</button>';
    document.getElementById("retryBtn").onclick = configured ? renderChoice : renderPasswordPrompt;
    return;
  }
  const data = await res.json();
  document.getElementById("secretBody").innerHTML = \`
    <div class="helper-text" style="margin:16px 0;">
      Copy these three values now — the plaintext password is not stored anywhere and cannot be
      recovered after you leave this page.
    </div>
    \${fieldsHtml(data.values)}
    <button class="btn-primary" style="width:100%;margin-top:6px;" id="copyAllBtn">Copy All Secrets</button>
    <div class="helper-text" style="margin-top:14px;">
      Paste these into <strong>Cloudflare Dashboard → Workers → Settings → Variables and Secrets</strong>,
      then redeploy / save. Cloudflare defaults each new variable to type <strong>Text</strong> — for
      all three of these, switch the type dropdown to <strong>Secret</strong> before saving, so the
      values are encrypted at rest instead of stored as plain text.
    </div>
    \${configured ? '<div class="error-text" style="margin-top:10px;">Existing sessions, tokens, and subscription links tied to the OLD secrets stop working the moment you save these — only after you update them in Cloudflare.</div>' : ''}
  \`;
  document.getElementById("copyAllBtn").onclick = () => {
    navigator.clipboard.writeText(copyAllText(data.values));
    showToast("Copied — paste into Cloudflare now.");
  };
}

async function changePassword(password) {
  showSecretSkeleton(1);
  const res = await fetch("/api/secret/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + sessionToken },
    body: JSON.stringify({ password })
  });
  if (!res.ok) {
    let message = "Could not change password (" + res.status + "). Try again.";
    try {
      const err = await res.json();
      if (err.error === "password_too_short") message = "Password must be at least 8 characters.";
    } catch {}
    document.getElementById("secretBody").innerHTML =
      '<div class="error-text">' + message + '</div>' +
      '<button class="btn-secondary" style="width:100%;margin-top:10px;" id="retryBtn">Back</button>';
    document.getElementById("retryBtn").onclick = renderChoice;
    return;
  }
  const data = await res.json();
  document.getElementById("secretBody").innerHTML = \`
    <div class="helper-text" style="margin:16px 0;">
      Copy this value now — the plaintext password is not stored anywhere and cannot be
      recovered after you leave this page. ADMIN_SALT and JWT_SECRET are unchanged, so
      existing sessions stay valid — only ADMIN_PASSWORD_HASH needs updating in Cloudflare.
    </div>
    \${fieldsHtml(data.values)}
    <button class="btn-primary" style="width:100%;margin-top:6px;" id="copyAllBtn">Copy Value</button>
    <div class="helper-text" style="margin-top:14px;">
      Paste this into <strong>Cloudflare Dashboard → Workers → Settings → Variables and Secrets</strong>,
      then redeploy / save. Make sure <strong>ADMIN_PASSWORD_HASH</strong>'s type is set to
      <strong>Secret</strong> (not the default Text), so it's encrypted at rest.
    </div>
  \`;
  document.getElementById("copyAllBtn").onclick = () => {
    navigator.clipboard.writeText(copyAllText(data.values));
    showToast("Copied — paste into Cloudflare now.");
  };
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

function renderPasswordPrompt() {
  document.getElementById("secretBody").innerHTML = \`
    <div class="field-group">
      <label class="field-label">Choose Admin Password</label>
      <input type="password" id="newPasswordInput" placeholder="At least 8 characters" />
    </div>
    <div class="helper-text" style="margin-bottom:6px;">
      This is the password you'll log in with — it's never stored in plaintext, only hashed
      into ADMIN_PASSWORD_HASH below.
    </div>
    <button class="btn-primary" style="width:100%;" id="genFromPasswordBtn">Generate Secrets</button>
    <div class="error-text" id="newPasswordError"></div>
  \`;
  const input = document.getElementById("newPasswordInput");
  const submit = () => {
    const password = input.value;
    if (password.length < 8) {
      document.getElementById("newPasswordError").textContent = "Password must be at least 8 characters.";
      return;
    }
    generate(password);
  };
  document.getElementById("genFromPasswordBtn").onclick = submit;
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
  input.focus();
}

function renderSetupMode() {
  renderPasswordPrompt();
}

function renderRegenGate() {
  document.getElementById("secretBody").innerHTML = \`
    <div class="field-group">
      <label class="field-label">Admin Password</label>
      <input type="password" id="gatePassword" placeholder="Enter admin password" />
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
    sessionToken = data.token; // kept in memory only, never persisted for this page
    const action = new URLSearchParams(location.search).get("action");
    if (action === "destroy") {
      renderDestroyConfirm();
    } else {
      renderChoice();
    }
  };
  document.getElementById("gatePassword")?.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("gateBtn").click();
  });
}

function renderChoice() {
  document.getElementById("secretBody").innerHTML = \`
    <button class="btn-primary" style="width:100%;" id="choiceChangePassword">Change Password</button>
    <div class="helper-text" style="margin-bottom:16px;">Rotates only ADMIN_PASSWORD_HASH. Sessions and links keep working.</div>
    <button class="btn-danger btn-secondary" style="width:100%;" id="choiceDestroy">Destroy Secrets</button>
    <div class="helper-text">Regenerates ADMIN_SALT, ADMIN_PASSWORD_HASH, and JWT_SECRET. Every session, token, and subscription link tied to the old values stops working.</div>
  \`;
  document.getElementById("choiceChangePassword").onclick = renderChangePasswordPrompt;
  document.getElementById("choiceDestroy").onclick = renderDestroyConfirm;
}

function renderChangePasswordPrompt() {
  document.getElementById("secretBody").innerHTML = \`
    <div class="field-group">
      <label class="field-label">New Admin Password</label>
      <input type="password" id="changePasswordInput" placeholder="At least 8 characters" />
    </div>
    <div class="helper-text" style="margin-bottom:6px;">
      ADMIN_SALT and JWT_SECRET stay the same — only ADMIN_PASSWORD_HASH is recomputed.
    </div>
    <button class="btn-primary" style="width:100%;" id="changePasswordBtn">Change Password</button>
    <div class="error-text" id="changePasswordError"></div>
    <button class="btn-secondary" style="width:100%;margin-top:10px;" id="changePasswordBack">Back</button>
  \`;
  const input = document.getElementById("changePasswordInput");
  const submit = () => {
    const password = input.value;
    if (password.length < 8) {
      document.getElementById("changePasswordError").textContent = "Password must be at least 8 characters.";
      return;
    }
    changePassword(password);
  };
  document.getElementById("changePasswordBtn").onclick = submit;
  document.getElementById("changePasswordBack").onclick = renderChoice;
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
  input.focus();
}

function renderDestroyConfirm() {
  document.getElementById("secretBody").innerHTML = \`
    <div class="error-text" style="margin:14px 0 18px;">
      Destroying will immediately invalidate every existing admin session, every issued
      login token, and every existing subscription link once you save the new values in
      Cloudflare. Users and their subscription sources themselves are NOT deleted, but their
      old links stop resolving until you share the new ones.
    </div>
    <button class="btn-danger btn-secondary" style="width:100%;" id="destroyBtn">Destroy Secrets</button>
    <button class="btn-secondary" style="width:100%;margin-top:10px;" id="destroyBack">Back</button>
  \`;
  document.getElementById("destroyBtn").onclick = renderPasswordPrompt;
  document.getElementById("destroyBack").onclick = renderChoice;
}

if (configured) {
  renderRegenGate();
} else {
  renderSetupMode();
}
</script>
</body>
</html>`;
}
