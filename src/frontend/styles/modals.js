const MODALS_CSS = String.raw`
/* --- Modals / confirm dialog --- */
/* #md is the overlay itself: hidden until render() adds .show, as in the reference.
   Every popup sits on a softly blurred page (the same 3px blur as the Sign out popup). */
#md {
  position: fixed; inset: 0; background: rgba(0,0,0,.6); display: none; place-items: center;
  padding: 20px; z-index: 50;
  -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
}
/* Open: the overlay and its blur fade in. The card fades in while sliding 6px, but only while
   the script sets .opening (it removes it when the animation ends), so a re-render of the
   modal markup (for example adding a source row) does not replay the card animation. */
#md.show { display: grid; animation: modal-overlay-in .16s ease-out; }
#md.opening .modal-card { animation: modal-card-in .16s ease-out; }
/* Close: the script swaps .show for .closing and keeps the old markup in place while this plays. */
#md.closing { display: grid; animation: modal-overlay-out .16s ease-in forwards; }
#md.closing .modal-card { animation: modal-card-out .16s ease-in forwards; }
@keyframes modal-overlay-in {
  from { background-color: rgba(0,0,0,0); -webkit-backdrop-filter: blur(0); backdrop-filter: blur(0); }
  to { background-color: rgba(0,0,0,.6); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
}
@keyframes modal-overlay-out {
  from { background-color: rgba(0,0,0,.6); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
  to { background-color: rgba(0,0,0,0); -webkit-backdrop-filter: blur(0); backdrop-filter: blur(0); }
}
@keyframes modal-card-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@keyframes modal-card-out {
  from { opacity: 1; transform: none; }
  to { opacity: 0; transform: translateY(6px); }
}
@media (prefers-reduced-motion: reduce) {
  #md.show, #md.closing, #md.opening .modal-card, #md.closing .modal-card { animation: none; }
}
/* max-height + scroll stay: the user editor has an unbounded source repeater, so a tall card must scroll. */
.modal-card { width: 100%; max-width: 400px; padding: 18px; max-height: 85vh; overflow-y: auto; }
.modal-card.small { max-width: 400px; }
/* The Subscription popup does not scroll above 760px; at 760px and below its two blocks stack, so the card can be
   taller than the screen and scrolls like the other popups. */
.modal-card-static { max-height: none; overflow: visible; }
@media (max-width: 760px) {
  .modal-card-static { max-height: 85vh; overflow-y: auto; }
}
/* With two blocks (the plus icon only exists then) the Subscription card is wider so they fit side by side.
   Only above 760px: at 760px and below the blocks stack, so the card stays 400px. One block stays 400px.
   :has() needs a current browser; without it the card simply stays 400px. */
@media (min-width: 761px) {
  .modal-card-static:has(.sub-plus) { max-width: 600px; }
}
/* Change Password popup: the card takes the look of the login card (styles/login.js). The
   two-class selector beats the width and padding of .modal-card; the sibling rule spaces
   stacked full-width buttons. */
.modal-card.login-card { max-width: 380px; padding: var(--space-xxl); }
.login-card .btn-full + .btn-full { margin-top: var(--space-sm); }
/* User and Node editors: a wider card, so long sources fit. The two-class selector beats .modal-card. */
.modal-card.editor-card { max-width: 480px; }
.modal-title { font-size: var(--text-body); font-weight: 600; margin-bottom: var(--space-md); }
.source-repeater { display: flex; flex-direction: column; gap: var(--space-sm); margin-bottom: var(--space-sm); }
.source-row { display: flex; gap: var(--space-sm); align-items: flex-start; }
/* Font and size come from the shared textarea rule (R162); the field stays a textarea for multi-line sources. */
.source-row-input { flex: 1; min-width: 0; resize: vertical; }
/* The Remove icon button is centered on the first line of its 42px textarea. */
.source-row .icon-btn { margin-top: 4px; }
/* An added source: a one-line preview (type label and shortened text) with Edit and Delete beside it. */
.source-row-added { align-items: center; }
.source-row-added .icon-btn { margin-top: 0; }
.source-preview {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--space-sm);
  min-height: 42px; padding: 0 var(--space-md);
  border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-alt);
}
.source-type {
  flex: none; padding: 1px 8px; border: 1px solid var(--color-border); border-radius: 999px;
  color: var(--color-muted); font-size: var(--text-caption); line-height: 1.5; white-space: nowrap;
}
.source-preview-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* --- User and Node editor fields --- */
/* Label row: the title, an optional count pill after it and an optional button at the right edge. */
.field-head { display: flex; align-items: center; gap: var(--space-sm); margin-bottom: 6px; }
.field-head .field-label { margin-bottom: 0; }
.field-head .btn-sm { flex: none; margin-left: auto; white-space: nowrap; }
.field-head .btn-sm .ui-icon { width: 16px; height: 16px; }
/* Count pill, like the version label in the sidebar. */
.field-count {
  padding: 1px 8px; border: 1px solid var(--color-border); border-radius: 999px;
  color: var(--color-muted); font-size: var(--text-caption); line-height: 1.5;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
/* One-line hint under a field. */
.field-hint { color: var(--color-muted); font-size: var(--text-caption); line-height: 1.5; margin-top: 6px; }
/* Selected Nodes: a bordered list on the surface-alt color. A row is a status dot, the name and a Remove icon button. */
.node-list {
  border: 1px solid var(--color-border); border-radius: var(--radius-md);
  background: var(--color-surface-alt); margin-bottom: var(--space-sm);
}
.node-list-item {
  display: flex; align-items: center; gap: 10px;
  padding: var(--space-xs) var(--space-xs) var(--space-xs) var(--space-md); border-bottom: 1px solid var(--color-border);
}
.node-list-item:last-child { border-bottom: 0; }
.node-list-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
/* Available Nodes: pill buttons with a plus icon; a long name is cut with an ellipsis. */
.node-pills { display: flex; flex-wrap: wrap; gap: var(--space-sm); }
.node-pill { max-width: 100%; border-radius: 999px; padding: 0 var(--space-md) 0 10px; gap: 6px; }
.node-pill .ui-icon { width: 16px; height: 16px; }
.node-pill:hover { border-color: var(--color-primary); }
.node-pill:hover .ui-icon { color: var(--color-primary); }
.node-pill-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Small square icon button (Remove): muted, with a soft error fill on hover like Sign out. */
.icon-btn {
  position: relative; flex: none; display: inline-grid; place-items: center; width: 34px; height: 34px; padding: 0;
  border: 0; border-radius: var(--radius-md); background: none; color: var(--color-muted); cursor: pointer;
  transition: background .12s ease, color .12s ease, z-index 0s linear .16s;
}
.icon-btn .ui-icon { width: 16px; height: 16px; }
.icon-btn:hover { background: var(--color-error-soft); color: var(--color-error); }
.icon-btn:focus-visible { outline-color: var(--color-error); }
.icon-btn:hover, .icon-btn:focus-visible { z-index: 2; }
/* Tooltip from the data-tip attribute (the markup also sets aria-label). It looks like the date tooltip
   (surface, border, 12px radius, shadow, arrow), opens above the button after 500ms on hover or keyboard
   focus, and its right edge lines up with the button. It is always laid out and shown through opacity,
   so it can fade out as well as in; visibility switches after the fade, so a hidden tooltip is not exposed. */
.icon-btn[data-tip]::before, .icon-btn[data-tip]::after {
  position: absolute; pointer-events: none; opacity: 0; visibility: hidden;
  transition: opacity .16s ease-in, transform .16s ease-in, visibility 0s linear .16s;
}
.icon-btn[data-tip]::after {
  content: attr(data-tip); right: 0; bottom: calc(100% + 12px); padding: var(--space-sm) var(--space-md);
  white-space: nowrap; font-size: var(--text-caption); font-weight: 400; line-height: 1.5; color: var(--color-text);
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); transform: translateY(6px);
}
.icon-btn[data-tip]::before {
  content: ""; z-index: 1; right: 12px; bottom: calc(100% + 7px); width: 10px; height: 10px;
  background: var(--color-surface); border: solid var(--color-border); border-width: 0 1px 1px 0; transform: translateY(6px) rotate(45deg);
}
/* Open: the same fade and 6px slide as the popups, after a 500ms wait. Close: the same motion backwards,
   at once (the base rule above). The arrow keeps its 45deg turn in every state. */
.icon-btn[data-tip]:hover::before, .icon-btn[data-tip]:hover::after,
.icon-btn[data-tip]:focus-visible::before, .icon-btn[data-tip]:focus-visible::after {
  opacity: 1; visibility: visible;
  transition: opacity .16s ease-out .5s, transform .16s ease-out .5s, visibility 0s linear .5s;
}
.icon-btn[data-tip]:hover::after, .icon-btn[data-tip]:focus-visible::after { transform: none; }
.icon-btn[data-tip]:hover::before, .icon-btn[data-tip]:focus-visible::before { transform: rotate(45deg); }
/* Reduced motion: the tooltip shows and hides at once (the global rule in reduced-motion.js does not reach pseudo-elements). */
@media (prefers-reduced-motion: reduce) {
  .icon-btn[data-tip]::before, .icon-btn[data-tip]::after,
  .icon-btn[data-tip]:hover::before, .icon-btn[data-tip]:hover::after,
  .icon-btn[data-tip]:focus-visible::before, .icon-btn[data-tip]:focus-visible::after { transition: none; }
}
/* --- UUID section of the User editor --- */
/* The Regenerate button is disabled for a new User and in username mode: it looks inactive and ignores hover. */
.field-head .btn-sm:disabled { opacity: .5; cursor: not-allowed; }
.field-head .btn-sm:disabled:hover { color: var(--color-muted); }
/* A long username id is cut with an ellipsis; the field stays selectable. */
#userUuidInput { text-overflow: ellipsis; }
/* Switch row: the label on the left, the switch at the right edge. */
.switch-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); margin-top: var(--space-sm); }
/* Switch: a button with role="switch"; aria-checked="true" turns it on (primary track, white knob).
   Inside the 1px border the track is 38px by 20px, so the knob travels 18px. Transitions stop under reduced motion (reduced-motion.js). */
.switch {
  position: relative; flex: none; width: 40px; height: 22px; padding: 0; cursor: pointer;
  border: 1px solid var(--color-border-input); border-radius: 999px; background: var(--color-surface-alt);
  transition: background .15s ease, border-color .15s ease;
}
.switch-knob {
  position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
  background: var(--color-muted); transition: transform .15s ease, background .15s ease;
}
.switch[aria-checked="true"] { background: var(--color-primary); border-color: var(--color-primary); }
.switch[aria-checked="true"] .switch-knob { background: #fff; transform: translateX(18px); }
.modal-footer { display: flex; gap: var(--space-md); margin-top: var(--space-sm); }
.modal-footer button { flex: 1; }
`;

export { MODALS_CSS };
