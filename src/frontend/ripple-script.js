// =====================================================================
// VEXA — Shared ripple-interaction script. Extracted verbatim from the
// SPA's client-script.js so both the SPA and the standalone pages
// (src/pages/d1-setup.js, src/pages/change-password-page.js) can inject
// the exact same behavior via one inline <script>, instead of the effect
// only existing inside client-script.js's own IIFE. Plain classic script
// (no `import`), same as CLIENT_SCRIPT/QR_LIB — injected as a template
// string wherever it's needed.
//
// Respects prefers-reduced-motion via CSS alone: .ripple-ink's animation
// is defined in styles.js under `@keyframes ripple-anim`, and the global
// `@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }`
// rule already disables it there — no JS-side check needed, and none is
// added here, so this file only ever has to agree with the CSS, not
// duplicate its logic.
// =====================================================================

export const RIPPLE_SCRIPT = `
// Material ink-ripple: a JS-spawned span expands from the pointer-down
// point and fades out, giving click feedback the way Material components
// do. Color/opacity is picked per-element (light ink on colored surfaces
// like .btn-primary/.mobile-fab, dark ink everywhere else) since a single
// fixed color wouldn't read on both. The host element needs
// position:relative + overflow:hidden (set alongside each component in
// styles.js) so the ripple is clipped to its shape, rounded corners
// included. Pointer-based by design (mousedown/touchstart via
// "pointerdown"), matching the existing SPA behavior — this does not add
// a keyboard-triggered ripple, so keyboard activation (Enter/Space) is
// unaffected and unchanged.
const RIPPLE_SELECTOR = ".btn-primary, .btn-secondary, .btn-danger, .btn-icon, .mobile-fab, .sidebar-link, .format-menu-item, .switch";
const RIPPLE_LIGHT_SELECTOR = ".btn-primary, .btn-danger, .mobile-fab, .switch.on";
function attachRippleEffect() {
  document.addEventListener("pointerdown", e => {
    if (e.button === 1 || e.button === 2) return;
    const target = e.target.closest(RIPPLE_SELECTOR);
    if (!target || target.disabled) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const ripple = document.createElement("span");
    ripple.className = "ripple-ink";
    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.left = (e.clientX - rect.left - size / 2) + "px";
    ripple.style.top = (e.clientY - rect.top - size / 2) + "px";
    ripple.style.background = target.matches(RIPPLE_LIGHT_SELECTOR) ? "rgba(255,255,255,.45)" : "rgba(0,0,0,.15)";
    target.appendChild(ripple);
    const remove = () => ripple.remove();
    ripple.addEventListener("animationend", remove);
    setTimeout(remove, 700); // fallback if animationend never fires
  });
}
attachRippleEffect();
`;
