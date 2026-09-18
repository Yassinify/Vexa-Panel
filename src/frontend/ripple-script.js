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
