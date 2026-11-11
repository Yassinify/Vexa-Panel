export const AUTH_SCRIPT = `
// ---------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------
// state.authInitialized === false means no admin authentication exists
// yet anywhere (no D1 auth_config row, no complete Secret triplet) — the
// first-run "choose a password" form is shown in place of the normal
// login form, right on this same page. There is no separate /secret
// setup route; first-run and normal login are two states of one page.
function renderLoginView() {
  const firstRun = state.authInitialized === false;
  return \`
    <div class="login-wrap">
      <div class="card login-card">
        <div class="login-logo">\${logoMark()}Vexa Panel</div>
        <h1>\${firstRun ? "Set up your panel" : "Welcome back"}</h1>
        <div class="brand-sub">\${firstRun ? "Choose an admin password to finish setup" : "Sign in to your account"}</div>
        \${firstRun ? \`
          <div class="field-group">
            <label><span class="field-label">Password</span><input type="password" id="loginPassword" autocomplete="new-password" /></label>
          </div>
          <div class="field-group">
            <label><span class="field-label">Confirm password</span><input type="password" id="loginPasswordConfirm" autocomplete="new-password" /></label>
          </div>
          <div class="helper-text">This is the password you'll log in with. The plaintext password is never stored — only a hash of it is kept.</div>
        \` : \`
          <div class="field-group">
            <label><span class="field-label">Password</span><input type="password" id="loginPassword" autocomplete="current-password" /></label>
          </div>
        \`}
        <div class="error-text" id="loginError" role="alert">\${state.errorMsg || ""}</div>
        \${firstRun
          ? \`<button class="btn-primary btn-full" id="createAccountBtn" onclick="doCreateAccount()">Create account</button>\`
          : \`<button class="btn-primary btn-full" id="loginBtn" onclick="doLogin()">Sign in</button>\`}
      </div>
    </div>
  \`;
}

async function doLogin() {
  if (state.authPending) return; // ignore repeated submits while a request is in flight
  const password = document.getElementById("loginPassword").value;
  state.errorMsg = "";
  state.authPending = true;
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) {
      state.errorMsg = data.error === "too_many_attempts"
        ? "Too many attempts. Wait a few minutes."
        : "Incorrect password.";
      render();
      return;
    }
    state.token = data.token;
    localStorage.setItem("vexa_token", data.token);
    state.view = "dashboard";
    history.pushState(null, "", VIEW_PATHS.dashboard);
    await bootAuthenticated();
  } catch (e) {
    state.errorMsg = "Connection error.";
    render();
  } finally {
    state.authPending = false;
  }
}

// First-run account creation: validates the two password fields client-
// side, then calls the existing D1-backed initialization endpoint
// (POST /api/secret/generate -> handleInitializeD1Auth, unauthenticated
// only while auth isn't configured yet). The server generates and
// persists admin_salt/admin_password_hash/jwt_secret into D1 itself and
// never returns any of them here. Per the intended first-run UX, this
// does not log the new admin in directly — it returns to the normal
// login form so the admin enters the password they just chose, exactly
// once, before reaching the panel.
async function doCreateAccount() {
  if (state.authPending) return; // ignore repeated submits while a request is in flight
  const password = document.getElementById("loginPassword").value;
  const confirm = document.getElementById("loginPasswordConfirm").value;
  state.errorMsg = "";
  if (!password) {
    state.errorMsg = "Choose a password.";
    render();
    return;
  }
  if (password !== confirm) {
    state.errorMsg = "Passwords do not match.";
    render();
    return;
  }
  state.authPending = true;
  try {
    const res = await fetch("/api/secret/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) {
      state.errorMsg = data && data.error === "already_configured"
        ? "Setup already completed — please sign in."
        : "Could not complete setup. Try again.";
      // Re-check in case another request already finished first-run setup
      // concurrently (see initAuthConfigIfAbsent()'s race-safety in
      // src/d1.js) — either way, the normal login form is now correct.
      if (data && data.error === "already_configured") state.authInitialized = true;
      render();
      return;
    }
    // Setup complete. Log out once (there is no session to hold yet
    // anyway) and return to the normal login form per the intended
    // first-run flow: Create Account -> logged out -> Login -> Logged in.
    state.authInitialized = true;
    state.errorMsg = "";
    state.token = null;
    localStorage.removeItem("vexa_token");
    render();
    showToast("Account created — sign in with your new password.");
  } catch (e) {
    state.errorMsg = "Connection error.";
    render();
  } finally {
    state.authPending = false;
  }
}

// Manual logout clears the session outright — the next visit gets no
// "less than 48h since last login" grace period and lands back on /login.
function logout() {
  state.token = null;
  localStorage.removeItem("vexa_token");
  state.view = "login";
  history.pushState(null, "", "/login");
  render();
}

// ---------------------------------------------------------------------
// CHANGE PASSWORD (popup opened by the Change button in Settings)
// ---------------------------------------------------------------------
// In-flight guard for the submit: repeated clicks or Enter presses are ignored while it runs.
let changePwPending = false;

function openChangePasswordModal() {
  state.changePwValues = null;
  state.modal = "changePassword";
  render();
}

// Checks the two fields, sends the new password with the session token and shows
// the result. Errors are shown in the popup's error line; the popup stays open.
async function submitChangePassword() {
  if (changePwPending) return;
  const errorEl = document.getElementById("changePwError");
  errorEl.textContent = "";
  const password = document.getElementById("newPwInput").value;
  const confirmPassword = document.getElementById("confirmPwInput").value;
  // Client-side checks only, as in the first-run setup form; the server applies no password rules.
  if (!password) {
    errorEl.textContent = "Choose a password.";
    return;
  }
  if (password !== confirmPassword) {
    errorEl.textContent = "Passwords do not match.";
    return;
  }
  changePwPending = true;
  const submitBtn = document.getElementById("changePwBtn");
  if (submitBtn) submitBtn.disabled = true;
  try {
    let res;
    try {
      res = await fetch("/api/secret/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + state.token },
        body: JSON.stringify({ password })
      });
    } catch (e) {
      errorEl.textContent = "Connection error.";
      return;
    }
    if (res.status === 401) {
      // The session ended meanwhile: back to the login screen.
      state.modal = null;
      logout();
      showToast("Session expired. Sign in again.");
      return;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || !data) {
      errorEl.textContent = "Could not change password. Try again.";
      return;
    }
    if (data.values) {
      // Secrets-backed install: nothing was saved by the Worker; show the value to paste into Cloudflare.
      state.changePwValues = data.values;
      render();
      return;
    }
    if (data.persisted === true) {
      // D1-backed install: the new hash is saved in the database. End the session and sign in again.
      finishChangePassword();
      return;
    }
    errorEl.textContent = "Could not change password. Try again.";
  } finally {
    changePwPending = false;
    const btn = document.getElementById("changePwBtn");
    if (btn) btn.disabled = false;
  }
}

// Copies only the value (the field's own text); a blocked clipboard is ignored.
function copyChangePwValue() {
  const field = document.getElementById("changePwValue");
  if (!field) return;
  field.select();
  try {
    navigator.clipboard.writeText(field.value).catch(() => {});
  } catch (e) {}
  showToast("Copied");
}

// Closes the popup, ends the session and shows the login screen.
function finishChangePassword() {
  state.modal = null;
  state.changePwValues = null;
  logout();
  showToast("Sign in with your new password.");
}

// Renders once right after a data load finishes, with row animation on.
// Later renders (search typing, toggles, modals) leave animateRows off so
// the table rows don't replay their entrance animation.
function renderAfterLoad() {
  state.animateRows = true;
  render();
  state.animateRows = false;
}

async function bootAuthenticated() {
  state.loading = true;
  render();
  try {
    await loadViewData(state.view);
  } finally {
    state.loading = false;
    renderAfterLoad();
  }
}
`;
