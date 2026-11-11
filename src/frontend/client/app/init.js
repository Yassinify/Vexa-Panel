export const INIT_SCRIPT = `
(async function init() {
  // Apply the saved theme before the first render (same vexa_theme key as
  // the inline script in pages/app-shell.js); anything but light or dark,
  // or a storage error, falls back to dark.
  let savedTheme = "dark";
  try {
    const stored = localStorage.getItem("vexa_theme");
    if (stored === "light" || stored === "dark") savedTheme = stored;
  } catch (e) {}
  applyTheme(savedTheme);

  // Escape closes an open modal, the More menu, the account menus and the
  // growth range dropdown.
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    closeMoreMenu();
    closeAccountMenus();
    closeGrowthMenu();
    if (state.modal) closeModal();
  });

  // A click outside the More menu and its button closes the menu; the same
  // for the account menus and the growth range dropdown.
  document.addEventListener("click", e => {
    if (!e.target.closest(".more-wrap")) closeMoreMenu();
    if (!e.target.closest(".account-wrap")) closeAccountMenus();
    if (!e.target.closest(".growth-dropdown")) closeGrowthMenu();
  });

  // A click on the dark area around the Subscription popup closes it. The press must
  // also start on the overlay, so dragging a text selection out of the card does not.
  let pressedOnOverlay = false;
  document.addEventListener("mousedown", e => {
    pressedOnOverlay = e.target.id === "md";
  });
  document.addEventListener("click", e => {
    if (e.target.id === "md" && pressedOnOverlay && state.modal === "merge") closeModal();
  });

  if (state.token) {
    try {
      // The stored session is kept and the view comes from the URL path
      // (/Dashboard, /Users, /Nodes, /Log, /settings). Any other path, such
      // as "/", lands on the Dashboard and the address is corrected.
      const path = location.pathname;
      const pathView = Object.keys(VIEW_PATHS).find(view => VIEW_PATHS[view] === path);
      state.view = pathView || "dashboard";
      const canonicalPath = VIEW_PATHS[state.view];
      if (path !== canonicalPath) history.replaceState(null, "", canonicalPath);
      await bootAuthenticated();
      return;
    } catch {
      state.view = "login";
      if (location.pathname !== "/login") history.replaceState(null, "", "/login");
    }
  } else {
    state.view = "login";
    if (location.pathname !== "/login") history.replaceState(null, "", "/login");
  }

  // No valid session at this point (either no token was stored, or the
  // token was rejected above). Before showing the login form, check
  // whether authentication has even been initialized yet — this is what
  // decides between the normal login form and the first-run "choose a
  // password" form (see renderLoginView()). /api/version is public and
  // unauthenticated, so this call works even on a completely fresh
  // deployment with no admin account yet.
  try {
    const res = await fetch("/api/version");
    const data = await res.json();
    state.authInitialized = typeof data.authInitialized === "boolean" ? data.authInitialized : true;
  } catch (e) {
    // Connection error: fall back to the normal login form rather than
    // guessing first-run — doLogin()'s own error handling already covers
    // a subsequent connection failure on submit.
    state.authInitialized = true;
  }
  render();
})();
`;
