export const ROOT_RENDER_SCRIPT = `
// ---------------------------------------------------------------------
// ROOT RENDER
// ---------------------------------------------------------------------
// Modal layer open and close (#md). The CSS in styles/modals.js animates both.
// Opening: .show plays the overlay fade; .opening lets the card slide in once and
// is removed when the animation ends, so a later rewrite of the markup does not
// replay it. Closing: .show becomes .closing, the old markup stays in place while
// the exit animation plays, then the layer is emptied. With no animation (reduced
// motion) both steps finish at once.
function openModalLayer(layer, wasOpen) {
  layer.classList.remove("closing");
  layer.classList.add("show");
  if (wasOpen) return;
  layer.classList.add("opening");
  if (getComputedStyle(layer).animationName === "none") {
    layer.classList.remove("opening");
    return;
  }
  const done = e => {
    if (e.target !== layer) return;
    layer.removeEventListener("animationend", done);
    layer.classList.remove("opening");
  };
  layer.addEventListener("animationend", done);
}
function closeModalLayer(layer) {
  layer.classList.remove("show", "opening");
  layer.classList.add("closing");
  const clear = () => {
    layer.classList.remove("closing");
    layer.innerHTML = "";
    layer._html = "";
  };
  if (getComputedStyle(layer).animationName === "none") {
    clear();
    return;
  }
  const finish = e => {
    if (e.target !== layer) return;
    layer.removeEventListener("animationend", finish);
    // A modal opened again in the meantime keeps its new markup.
    if (layer.classList.contains("closing")) clear();
  };
  layer.addEventListener("animationend", finish);
}

// Easing of the view enter: the --spring-soft curve from styles/tokens.js, shared with the theme toggle.
// A browser without linear() support falls back to ease-out.
function viewEnterEasing() {
  const spring = getComputedStyle(document.documentElement).getPropertyValue("--spring-soft").trim();
  return spring && window.CSS && CSS.supports("animation-timing-function", spring) ? spring : "ease-out";
}

// View change exit. The old view is copied into an inert clone that sits over #view in the same grid cell
// (.view-stack, styles/app-shell.js) and plays a quick fade-out with a 6px slide down (200ms), then is
// removed. The new view is rendered at once, so nothing waits for the exit: data loads and the modal layer are
// not delayed. The clone starts at the view's current opacity and position, so a view that is still entering does not pop.
// Only the clone's root id is dropped. Inner ids stay: the clone comes after #view in the DOM, so
// getElementById still finds the real elements first, and SVG references such as the growth chart gradient
// keep resolving. Nothing plays under reduced motion.
function playViewExit(view) {
  if (!view.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const style = getComputedStyle(view);
  const from = Number(style.opacity);
  const fromTransform = style.transform;
  const ghost = view.cloneNode(true);
  ghost.removeAttribute("id");
  ghost.classList.add("view-exit");
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  view.after(ghost);
  const exit = ghost.animate(
    [{ opacity: isNaN(from) ? 1 : from, transform: fromTransform || "none" }, { opacity: 0, transform: "translateY(6px)" }],
    { duration: 200, easing: "ease-in", fill: "forwards" }
  );
  exit.onfinish = exit.oncancel = () => ghost.remove();
}

function render() {
  const app = document.getElementById("app");
  if (state.view === "login") {
    app.innerHTML = renderLoginView();
    const submit = state.authInitialized === false ? doCreateAccount : doLogin;
    document.getElementById("loginPassword")?.addEventListener("keydown", e => {
      if (e.key === "Enter") submit();
    });
    document.getElementById("loginPasswordConfirm")?.addEventListener("keydown", e => {
      if (e.key === "Enter") submit();
    });
    return;
  }
  // Mount the persistent frame once; later renders only rewrite #view.
  if (!document.getElementById("view")) app.innerHTML = renderShellFrame();
  syncShellFrame();
  const view = document.getElementById("view");
  // A view change (not the first render after login or page load, where #view is new) copies the old
  // content into an exit clone before it is replaced below.
  if (view._shown !== undefined && view._shown !== state.view) playViewExit(view);
  if (state.view === "dashboard") {
    view.innerHTML = renderDashboardView();
    // Count the stat numbers up once per newly loaded state.stats (each load stores a new
    // object); a re-render of the same data does not replay it. The cards exist only when
    // the data is loaded, as in renderDashboardView().
    if (!state.loading && state.stats && view._countedStats !== state.stats) {
      view._countedStats = state.stats;
      animateStatNumbers();
    }
  }
  else if (state.view === "users") { view.innerHTML = renderUsersView(); }
  else if (state.view === "nodes") { view.innerHTML = renderNodesView(); }
  else if (state.view === "log") { view.innerHTML = renderLogView(); }
  else if (state.view === "settings") { view.innerHTML = renderSettingsView(); }
  // A view change (a tab change, or the first render after login or page load) fades the
  // new view in with a 16px slide up on the spring curve (450ms), once; the old view fades out (playViewExit). Re-renders of
  // the same view do not replay it. Nothing plays under reduced motion.
  if (view._shown !== state.view) {
    view._shown = state.view;
    if (view.animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      view.animate(
        [{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }],
        { duration: 450, easing: viewEnterEasing() }
      );
    }
  }

  // The modal layer is rewritten only when its markup changed, so text typed
  // into an open modal survives a render that leaves the modal as it is.
  const modalLayer = document.getElementById("md");
  const modalHtml = renderModal();
  const wasOpen = modalLayer.classList.contains("show");
  if (modalHtml === "") {
    // Closing: the old markup stays until the exit animation ends (closeModalLayer).
    if (wasOpen) closeModalLayer(modalLayer);
    else if (!modalLayer.classList.contains("closing") && modalLayer._html !== "") {
      modalLayer.innerHTML = "";
      modalLayer._html = "";
    }
  } else {
    if (modalLayer._html !== modalHtml) {
      modalLayer.innerHTML = modalHtml;
      modalLayer._html = modalHtml;
    }
    openModalLayer(modalLayer, wasOpen);
    // No field is focused when a modal opens: on a phone that would open the keyboard at once.
  }

  // Every render of a view starts at the top of the page. Below 760px the page does not scroll
  // (only .main does), so its scroll position is reset too.
  window.scrollTo(0, 0);
  document.querySelector(".main")?.scrollTo(0, 0);
}
`;
