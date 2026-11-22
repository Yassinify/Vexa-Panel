export const SPINNER_SCRIPT = `
// ---------------------------------------------------------------------
// SPINNER - the loading ring of a button (CSS: styles/spinner.js)
// ---------------------------------------------------------------------
// The ring is an own SVG, with no library: a faint track and one dash that grows and shrinks while it turns. The three
// SMIL animations share one 1.6s cycle: the dash length (3 to 36 units of the 56.55 unit circle and back), its offset
// (so the dash grows and shrinks around the same moving point) and a full turn. The last offset is one full circle
// (-56.55), so the loop has no jump. Both circles use currentColor; the CSS gives the ring its color and size.
function spinnerRing() {
  const spline = 'calcMode="spline" keySplines=".4 0 .2 1;.4 0 .2 1"';
  return '<svg class="btn-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
    + '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity=".2"/>'
    + '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="3 53.55">'
    + '<animate attributeName="stroke-dasharray" values="3 53.55;36 20.55;3 53.55" keyTimes="0;.5;1" dur="1.6s" repeatCount="indefinite" ' + spline + '/>'
    + '<animate attributeName="stroke-dashoffset" values="0;-12;-56.55" keyTimes="0;.5;1" dur="1.6s" repeatCount="indefinite" ' + spline + '/>'
    + '<animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1.6s" repeatCount="indefinite"/>'
    + '</circle></svg>';
}

// The content of a button that can swap its label for the ring: one grid cell holding the label and the ring, so the
// button keeps its size. label is trusted markup; the caller escapes any text it did not write. The button then gets
// or loses the loading state through setButtonLoading().
function buttonSwap(label) {
  return '<span class="btn-swap"><span class="btn-swap-label">' + label + '</span>' + spinnerRing() + '</span>';
}

// Shows the ring in place of the label (on) or the label again (off). aria-busy tells assistive technology that the
// button is working; the button is not disabled, so the callers keep their own guard against a second click.
function setButtonLoading(button, on) {
  if (!button) return;
  button.classList.toggle("btn-loading", on);
  if (on) button.setAttribute("aria-busy", "true");
  else button.removeAttribute("aria-busy");
}

// Plays the swap back (ring out, label in) on a button that was rebuilt in its label state while the ring was meant
// to be showing, for example when render() rewrote the table that held it: the old button, and its ring, are gone, so
// removing .btn-loading from the new one would change nothing. The ring is first put in place without motion (inline
// transition: none on the label and the ring, then .btn-loading, then a forced style recalculation), then the inline
// styles and the class are removed, so the CSS plays the swap backwards from the loading look. Under reduced motion the
// CSS has no transitions, so the label is back at once. The new ring starts its own turn from the beginning.
function playButtonSwapBack(button) {
  if (!button) return;
  const parts = button.querySelectorAll(".btn-swap-label, .btn-spinner");
  parts.forEach(part => { part.style.transition = "none"; });
  button.classList.add("btn-loading");
  void button.offsetWidth;
  parts.forEach(part => { part.style.transition = ""; });
  button.classList.remove("btn-loading");
}
`;
