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
  if (state.view === "dashboard") { view.innerHTML = renderDashboardView(); }
  else if (state.view === "users") { view.innerHTML = renderUsersView(); }
  else if (state.view === "nodes") { view.innerHTML = renderNodesView(); }
  else if (state.view === "log") { view.innerHTML = renderLogView(); }
  else if (state.view === "settings") { view.innerHTML = renderSettingsView(); }
  // A view change (a tab change, or the first render after login or page load) fades the
  // new view in with a 6px slide up, once. Re-renders of the same view do not replay it.
  // Nothing plays under reduced motion.
  if (view._shown !== state.view) {
    view._shown = state.view;
    if (view.animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      view.animate(
        [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
        { duration: 200, easing: "ease-out" }
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
    // Focus the first field only when the modal opens, not on every re-render.
    if (!wasOpen) modalLayer.querySelector("input")?.focus();
  }

  // Every render of a view starts at the top of the page. Below 760px the page does not scroll
  // (only .main does), so its scroll position is reset too.
  window.scrollTo(0, 0);
  document.querySelector(".main")?.scrollTo(0, 0);
}
`;
