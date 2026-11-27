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
/* User and Node editors: a wider card, so long sources fit. The two-class selector beats .modal-card. The card has no bottom
   padding because the sticky footer below carries it, and scroll-padding-bottom keeps a focused field clear of that footer. */
.modal-card.editor-card { max-width: 480px; padding-bottom: 0; scroll-padding-bottom: 80px; }
.modal-title { font-size: var(--text-body); font-weight: 600; margin-bottom: var(--space-md); }
.source-repeater { display: flex; flex-direction: column; gap: var(--space-sm); margin-bottom: var(--space-sm); }
.source-row { display: flex; gap: var(--space-sm); align-items: flex-start; }
/* Font and size come from the shared textarea rule (R162); the field stays a textarea for multi-line sources.
   resize: none: the user cannot resize it. The height starts at the rows attribute and autoGrow() (client/modals/modals.js)
   grows it to fit the text, so overflow-y: hidden keeps a scrollbar from flashing while the height catches up. */
.source-row-input { flex: 1; min-width: 0; resize: none; overflow-y: hidden; }
/* The Node editor source box is not resizable either, and grows with its text the same way. */
#nodeSourceInput { resize: none; overflow-y: hidden; }
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
/* Added sources as a dense table: a caption header (Type, Source) and 36px rows split by 1px dividers, no boxes. The dot
   color comes from data-type (set from sourcePreview() in client/modals/modals.js); the type word always accompanies it. */
.source-table { margin-bottom: var(--space-sm); }
.source-table-head, .source-table-row {
  display: grid; grid-template-columns: 104px minmax(0, 1fr) auto; align-items: center;
  padding: 0 var(--space-xs) 0 var(--space-sm); border-bottom: 1px solid var(--color-border);
}
.source-table-head { padding-bottom: var(--space-xs); color: var(--color-muted); font-size: var(--text-caption); }
.source-table-row { min-height: 36px; --source-dot: var(--color-disabled); }
.source-table-row[data-type="link"] { --source-dot: var(--color-primary); }
.source-table-row[data-type="subscription"] { --source-dot: var(--color-success); }
.source-table-row[data-type="json"] { --source-dot: var(--color-warning); }
.source-table-row[data-type="yaml"] { --source-dot: var(--color-muted); }
.source-table-type { display: inline-flex; align-items: center; gap: 6px; color: var(--color-muted); font-size: var(--text-caption); }
.source-table-dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--source-dot); }
.source-table-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Edit and Delete show on row hover and keyboard focus; always visible on touch and at 760px and below. */
.source-table-actions { display: flex; opacity: 0; transition: opacity .12s ease; }
.source-table-row:hover .source-table-actions, .source-table-row:focus-within .source-table-actions { opacity: 1; }
@media (hover: none), (max-width: 760px) { .source-table-actions { opacity: 1; } }
.source-table-actions .icon-btn { width: 28px; height: 28px; }
/* Larger touch target where the buttons are always visible; the 36px row height does not change. */
@media (hover: none), (max-width: 760px) { .source-table-actions .icon-btn { width: 32px; height: 32px; } }
/* The "N sources" count at the right of the Sources label row. */
.source-table-count { margin-left: auto; color: var(--color-muted); font-size: var(--text-caption); font-variant-numeric: tabular-nums; white-space: nowrap; }
/* Source editor box: opens under the added source being edited (client/modals/modals.js, client/users/user-editor.js).
   It takes its own space, so the sources below move down. render() rewrites the popup markup, so a transition would not
   run on the new elements: the enter is a keyframe animation, and the exit is played on the live elements through
   .closing and .undim before the redraw (endSourceEdit() in user-editor.js). Enter 180ms, exit 120ms, the popup motion
   (fade and a 6px slide). The height opens through grid-template-rows (0fr to 1fr); a browser that cannot animate it
   still fades. The three nested elements: .source-edit animates, .source-edit-inner clips while it opens (its padding
   leaves room for the arrow and the shadow), .source-edit-box is the tooltip surface. */
.source-edit { display: grid; grid-template-rows: 1fr; margin: 0 -6px; animation: source-edit-in .18s ease-out; }
.source-edit.closing { animation: source-edit-out .12s ease-in forwards; }
.source-edit-inner { min-height: 0; overflow: hidden; padding: 12px 6px 14px; }
.source-edit-box {
  position: relative; display: flex; flex-direction: column; gap: var(--space-sm); padding: var(--space-md);
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  box-shadow: 0 8px 12px -8px rgba(0, 0, 0, 0.45);
}
/* The arrow points up at the source row, like the info tooltip that opens below its icon. */
.source-edit-box::before {
  content: ""; position: absolute; top: -6px; left: 20px; width: 10px; height: 10px;
  background: var(--color-surface); border: solid var(--color-border); border-width: 1px 0 0 1px; transform: rotate(45deg);
}
/* .source-row-input has flex: 1 for the composer row; in this column it would collapse the height. */
.source-edit-box .source-row-input { flex: none; width: 100%; }
/* Cancel on the left, Save on the right, the same size. */
.source-edit-actions { display: flex; gap: var(--space-sm); }
.source-edit-actions button { flex: 1; }
/* While a box is open the other sources, the table head and the new-source input are slightly blurred and inert
   (the markup also sets the inert attribute). The static look is the end state of the enter animation. */
.source-dim { filter: blur(2px); opacity: .55; pointer-events: none; user-select: none; -webkit-user-select: none; animation: source-dim-in .18s ease-out; }
.source-dim.undim { animation: source-dim-out .12s ease-in forwards; }
@keyframes source-edit-in {
  from { grid-template-rows: 0fr; opacity: 0; transform: translateY(-6px); }
  to { grid-template-rows: 1fr; opacity: 1; transform: none; }
}
@keyframes source-edit-out {
  from { grid-template-rows: 1fr; opacity: 1; transform: none; }
  to { grid-template-rows: 0fr; opacity: 0; transform: translateY(-6px); }
}
@keyframes source-dim-in {
  from { filter: blur(0); opacity: 1; }
  to { filter: blur(2px); opacity: .55; }
}
@keyframes source-dim-out {
  from { filter: blur(2px); opacity: .55; }
  to { filter: blur(0); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .source-edit, .source-edit.closing, .source-dim, .source-dim.undim { animation: none; }
}

/* --- User and Node editor fields --- */
/* Editor sections (div.editor-section in client/modals/modals.js): related fields are grouped, and a hairline with extra
   space above the next group shows where one group ends. The gap inside a section stays the 14px of .field-group. */
.editor-section + .editor-section { margin-top: var(--space-xs); padding-top: var(--space-lg); border-top: 1px solid var(--color-border); }
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
/* Node picker cards (renderNodePicker() in client/nodes/node-picker.js): a two-column grid, one column at 400px and below.
   A card is a button with a letter badge, the name, the source type and a round check in the top right corner. The
   selected card has a primary border and fill and a filled check with a tick, so the state is not shown by color alone.
   Transitions stop under reduced motion (reduced-motion.js). .node-list, .node-pills and their rules above are no longer
   used by the picker and are kept until the user asks to remove them. */
.node-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-sm); }
.node-card {
  position: relative; display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0;
  padding: 10px 36px 10px 10px; text-align: left; cursor: pointer;
  border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface-alt);
  transition: background .12s ease, border-color .12s ease;
}
.node-card:hover { border-color: var(--color-primary); }
.node-card:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.node-card[aria-pressed="true"] { border-color: var(--color-primary); background: var(--color-primary-faint); }
/* Letter badge: the first letter of the Node name on the faint primary fill. */
.node-card-badge {
  flex: none; display: grid; place-items: center; width: 32px; height: 32px;
  border-radius: var(--radius-md); background: var(--color-primary-faint); color: var(--color-primary); font-weight: 600;
}
/* Name and source type on two lines; a long text is cut with an ellipsis (the full name is in the title attribute). */
.node-card-text { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
.node-card-name, .node-card-type { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node-card-name { font-weight: 600; }
.node-card-type { color: var(--color-muted); font-size: var(--text-caption); }
/* The round check: an empty ring on every card, filled with the primary color and showing its tick when selected. */
.node-card-check {
  position: absolute; top: 8px; right: 8px; display: grid; place-items: center; width: 18px; height: 18px;
  border: 1px solid var(--color-border-input); border-radius: 50%; color: #fff;
  transition: background .12s ease, border-color .12s ease;
}
.node-card-tick { width: 12px; height: 12px; opacity: 0; transform: scale(.6); transition: opacity .12s ease, transform .12s ease; }
.node-card[aria-pressed="true"] .node-card-check { background: var(--color-primary); border-color: var(--color-primary); }
.node-card[aria-pressed="true"] .node-card-tick { opacity: 1; transform: none; }
@media (max-width: 400px) {
  .node-cards { grid-template-columns: minmax(0, 1fr); }
}
/* Tooltip with the Node's source text on a Node picker card (data-tip, set by renderNodePicker()). It looks and moves like
   .info-tip.below further down: the same surface, border, 12px radius, shadow and arrow, opening under the card after the
   --tip-delay wait with a 160ms fade and a 6px slide, and closing at once. It opens below because a tip above would be cut
   by the scrolling popup near its top. The bubble is at most 260px and never wider than the card, wraps long text, and is
   right-aligned on the right-hand column so it stays inside the popup. The hovered card is raised so the tip covers its
   neighbours. */
.node-card[data-tip]::before, .node-card[data-tip]::after {
  position: absolute; pointer-events: none; opacity: 0; visibility: hidden;
  transition: opacity .16s ease-in, transform .16s ease-in, visibility 0s linear .16s;
}
.node-card[data-tip]::after {
  content: attr(data-tip); left: 0; top: calc(100% + 12px); box-sizing: border-box; width: max-content; max-width: min(260px, 100%);
  padding: var(--space-sm) var(--space-md); white-space: normal; overflow-wrap: anywhere; text-align: left;
  font-size: var(--text-caption); font-weight: 400; line-height: 1.5; color: var(--color-text);
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); transform: translateY(-6px);
}
.node-card[data-tip]::before {
  content: ""; z-index: 1; left: 24px; top: calc(100% + 7px); width: 10px; height: 10px;
  background: var(--color-surface); border: solid var(--color-border); border-width: 1px 0 0 1px;
  transform: translateY(-6px) rotate(45deg);
}
.node-card[data-tip]:nth-child(even)::after { left: auto; right: 0; }
.node-card[data-tip]:nth-child(even)::before { left: auto; right: 24px; }
@media (max-width: 400px) {
  .node-card[data-tip]:nth-child(even)::after { left: 0; right: auto; }
  .node-card[data-tip]:nth-child(even)::before { left: 24px; right: auto; }
}
.node-card[data-tip]:hover, .node-card[data-tip]:focus-visible { z-index: 2; }
.node-card[data-tip]:hover::before, .node-card[data-tip]:hover::after,
.node-card[data-tip]:focus-visible::before, .node-card[data-tip]:focus-visible::after {
  opacity: 1; visibility: visible;
  transition: opacity .16s ease-out var(--tip-delay), transform .16s ease-out var(--tip-delay), visibility 0s linear var(--tip-delay);
}
.node-card[data-tip]:hover::after, .node-card[data-tip]:focus-visible::after { transform: none; }
.node-card[data-tip]:hover::before, .node-card[data-tip]:focus-visible::before { transform: rotate(45deg); }
/* A touch screen has no hover and a tap does not always match :focus-visible, so there a tap (:focus) opens it. */
@media (hover: none) {
  .node-card[data-tip]:focus { z-index: 2; }
  .node-card[data-tip]:focus::before, .node-card[data-tip]:focus::after {
    opacity: 1; visibility: visible;
    transition: opacity .16s ease-out var(--tip-delay), transform .16s ease-out var(--tip-delay), visibility 0s linear var(--tip-delay);
  }
  .node-card[data-tip]:focus::after { transform: none; }
  .node-card[data-tip]:focus::before { transform: rotate(45deg); }
}
/* Reduced motion: the tip shows and hides at once (the global rule in reduced-motion.js does not reach pseudo-elements). */
@media (prefers-reduced-motion: reduce) {
  .node-card[data-tip]::before, .node-card[data-tip]::after,
  .node-card[data-tip]:hover::before, .node-card[data-tip]:hover::after,
  .node-card[data-tip]:focus-visible::before, .node-card[data-tip]:focus-visible::after { transition: none; }
}
@media (prefers-reduced-motion: reduce) and (hover: none) {
  .node-card[data-tip]:focus::before, .node-card[data-tip]:focus::after { transition: none; }
}
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
/* Press motion of the theme toggle, the same as the text buttons (styles/buttons.js): a pressed icon button scales to .96
   in 120ms and springs back over 350ms on --spring-soft. Only where linear() is supported and reduced motion is not
   requested. Its tooltip is a pseudo-element, so it scales with the button for the length of the press. */
@supports (transition-timing-function: linear(0, 1)) {
  @media (prefers-reduced-motion: no-preference) {
    .icon-btn { transition: background .12s ease, color .12s ease, z-index 0s linear .16s, transform 350ms var(--spring-soft); }
    .icon-btn:not(:disabled):active { transform: scale(.96); transition-duration: 120ms; }
  }
}
/* Wait before a tooltip opens: 500ms, or 350ms at 760px and below. It is the delay of the opening transition of the
   icon-button and info tooltips below; the date tooltip (client/users/users-view.js) uses the same two values. */
:root { --tip-delay: .5s; }
@media (max-width: 760px) { :root { --tip-delay: .35s; } }
/* Tooltip from the data-tip attribute (the markup also sets aria-label). It looks like the date tooltip
   (surface, border, 12px radius, shadow, arrow), opens above the button after the --tip-delay wait on hover or keyboard
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
/* Open: the same fade and 6px slide as the popups, after the --tip-delay wait. Close: the same motion backwards,
   at once (the base rule above). The arrow keeps its 45deg turn in every state. */
.icon-btn[data-tip]:hover::before, .icon-btn[data-tip]:hover::after,
.icon-btn[data-tip]:focus-visible::before, .icon-btn[data-tip]:focus-visible::after {
  opacity: 1; visibility: visible;
  transition: opacity .16s ease-out var(--tip-delay), transform .16s ease-out var(--tip-delay), visibility 0s linear var(--tip-delay);
}
.icon-btn[data-tip]:hover::after, .icon-btn[data-tip]:focus-visible::after { transform: none; }
.icon-btn[data-tip]:hover::before, .icon-btn[data-tip]:focus-visible::before { transform: rotate(45deg); }
/* Reduced motion: the tooltip shows and hides at once (the global rule in reduced-motion.js does not reach pseudo-elements). */
@media (prefers-reduced-motion: reduce) {
  .icon-btn[data-tip]::before, .icon-btn[data-tip]::after,
  .icon-btn[data-tip]:hover::before, .icon-btn[data-tip]:hover::after,
  .icon-btn[data-tip]:focus-visible::before, .icon-btn[data-tip]:focus-visible::after { transition: none; }
}
/* --- Info tip --- */
/* A small i in a circle (infoTip() in icons.js) that shows its text from data-tip. It looks and moves like the
   icon-button tooltip above: the same surface, border, 12px radius, shadow and arrow, opening after the --tip-delay wait with a
   160ms fade and a 6px slide and closing at once. The text wraps (260px at most) because it is a sentence, not a
   label. By default it opens above the icon with its left edge 12px before it. .below opens under the icon (for a
   field at the top of a scrolling card) and .end lines the right edge up with the icon, so the tip stays inside
   the card. */
.info-tip {
  position: relative; flex: none; display: inline-grid; place-items: center; width: 16px; height: 16px;
  vertical-align: middle; border-radius: 50%; color: var(--color-muted); cursor: default; transition: color .12s ease;
}
.info-tip .ui-icon { width: 16px; height: 16px; }
.info-tip:hover, .info-tip:focus-visible { color: var(--color-text); z-index: 2; }
.info-tip::before, .info-tip::after {
  position: absolute; pointer-events: none; opacity: 0; visibility: hidden;
  transition: opacity .16s ease-in, transform .16s ease-in, visibility 0s linear .16s;
}
.info-tip::after {
  content: attr(data-tip); left: -12px; bottom: calc(100% + 12px); width: max-content; max-width: 260px;
  padding: var(--space-sm) var(--space-md); white-space: normal; text-align: left;
  font-size: var(--text-caption); font-weight: 400; line-height: 1.5; color: var(--color-text);
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); transform: translateY(6px);
}
/* The arrow points at the middle of the 16px icon (3px plus half of the 10px arrow). */
.info-tip::before {
  content: ""; z-index: 1; left: 3px; bottom: calc(100% + 7px); width: 10px; height: 10px;
  background: var(--color-surface); border: solid var(--color-border); border-width: 0 1px 1px 0;
  transform: translateY(6px) rotate(45deg);
}
.info-tip.end::after { left: auto; right: -12px; }
.info-tip.below::after { bottom: auto; top: calc(100% + 12px); transform: translateY(-6px); }
.info-tip.below::before { bottom: auto; top: calc(100% + 7px); border-width: 1px 0 0 1px; transform: translateY(-6px) rotate(45deg); }
/* Open on hover or keyboard focus. These rules come after the modifiers above, so they win at equal specificity. */
.info-tip:hover::before, .info-tip:hover::after,
.info-tip:focus-visible::before, .info-tip:focus-visible::after {
  opacity: 1; visibility: visible;
  transition: opacity .16s ease-out var(--tip-delay), transform .16s ease-out var(--tip-delay), visibility 0s linear var(--tip-delay);
}
.info-tip:hover::after, .info-tip:focus-visible::after { transform: none; }
.info-tip:hover::before, .info-tip:focus-visible::before { transform: rotate(45deg); }
/* A touch screen has no hover and a tap does not always match :focus-visible, so there a tap (:focus) opens it. */
@media (hover: none) {
  .info-tip:focus::before, .info-tip:focus::after {
    opacity: 1; visibility: visible;
    transition: opacity .16s ease-out var(--tip-delay), transform .16s ease-out var(--tip-delay), visibility 0s linear var(--tip-delay);
  }
  .info-tip:focus::after { transform: none; }
  .info-tip:focus::before { transform: rotate(45deg); }
}
/* Reduced motion: the tip shows and hides at once (the global rule in reduced-motion.js does not reach pseudo-elements). */
@media (prefers-reduced-motion: reduce) {
  .info-tip::before, .info-tip::after,
  .info-tip:hover::before, .info-tip:hover::after,
  .info-tip:focus-visible::before, .info-tip:focus-visible::after { transition: none; }
}
@media (prefers-reduced-motion: reduce) and (hover: none) {
  .info-tip:focus::before, .info-tip:focus::after { transition: none; }
}
/* --- Shared tooltip of the User and Node editors --- */
/* One element (#editorTip, created by editorTipElement() in client/modals/modals.js) shows the info tips and the Node picker
   card tips of the two editors. It is position: fixed and appended to <body>, so it takes no room in the scrolling editor
   card and the card cannot clip it. The look is the date tooltip's (styles/tables.js): surface, border, 12px radius, shadow
   and a 10px arrow. The script sets left, top, max-width and --tip-arrow-x and toggles .open, .closing and .below (.below =
   under the trigger). z-index 60 keeps it above the popup layer (#md, z-index 50). */
.editor-tip {
  display: none; position: fixed; z-index: 60; left: 0; top: 0; pointer-events: none;
  box-sizing: border-box; width: max-content; max-width: 260px;
  padding: var(--space-sm) var(--space-md); white-space: normal; overflow-wrap: anywhere; text-align: left;
  font-size: var(--text-caption); font-weight: 400; line-height: 1.5; color: var(--color-text);
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  --account-menu-shift: 6px;
}
/* Same fade and 6px slide as the date tooltip. Closing plays the same motion backwards; hideEditorTip() sets .closing while
   it runs, then removes it. */
.editor-tip.open { display: block; animation: account-menu-in .16s ease-out; }
.editor-tip.closing { display: block; animation: account-menu-out .16s ease-in forwards; }
.editor-tip.below { --account-menu-shift: -6px; }
/* .paragraphs (set by showEditorTip() for a target with that class, the Account Recovery tip in Settings) keeps the line breaks
   of the text, so a blank line splits the tip into two parts. */
.editor-tip.paragraphs { white-space: pre-line; }
.editor-tip::after {
  content: ""; position: absolute; bottom: -6px; left: var(--tip-arrow-x, 50%); margin-left: -5px;
  width: 10px; height: 10px; background: var(--color-surface);
  border: solid var(--color-border); border-width: 0 1px 1px 0; transform: rotate(45deg);
}
.editor-tip.below::after { top: -6px; bottom: auto; border-width: 1px 0 0 1px; }
@media (prefers-reduced-motion: reduce) { .editor-tip.open, .editor-tip.closing { animation: none; } }
/* Inside the editors the pseudo-element tips above are switched off: a hidden pseudo-element is still laid out and counted in
   the card's scrollable overflow, which added horizontal scrolling and extra height. content: none removes the box. Their
   tooltip text (data-tip) is shown by #editorTip instead. The three-class selector beats the earlier rules. The Settings view
   gets the same treatment: its info tips also use #editorTip, because a hidden pseudo-element tip next to a title reached past the
   right edge on a narrow screen and added horizontal scrolling to the scrolling .main. The Backup and Restore popups
   (.backup-modal) are scrolling cards too, so their info tips use #editorTip as well. Other popups and pages keep the
   pseudo-element tips. */
.editor-card .info-tip::before, .editor-card .info-tip::after,
.editor-card .node-card[data-tip]::before, .editor-card .node-card[data-tip]::after,
.settings-section .info-tip::before, .settings-section .info-tip::after,
.backup-modal .info-tip::before, .backup-modal .info-tip::after { content: none; display: none; }
/* --- UUID section of the User editor --- */
/* The Regenerate button is disabled in username mode: it looks inactive and ignores hover. */
.field-head .btn-sm:disabled { opacity: .5; cursor: not-allowed; }
.field-head .btn-sm:disabled:hover { color: var(--color-muted); }
/* In the UUID header row Regenerate comes first and the switch after it. Regenerate takes the free space through the
   auto margin of .field-head .btn-sm above, so the two stay together at the right edge. */
/* The UUID field is display only: it looks like a disabled button (half opacity, not-allowed cursor), cannot be
   selected, and a long id is cut with an ellipsis. */
#userUuidInput { text-overflow: ellipsis; opacity: .5; cursor: not-allowed; user-select: none; -webkit-user-select: none; }
/* Switch row: the label on the left, the switch at the right edge. Unused since the UUID switch moved into the header row. */
.switch-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); margin-top: var(--space-sm); }
/* Switch: a button with role="switch"; aria-checked="true" turns it on (primary track, white knob).
   Inside the 1px border the track is 38px by 20px, so the knob travels 18px.
   The motion is the theme toggle's: the knob slides on --spring-soft (900ms) and the colors blend over 700ms with the
   same ease-out as --tt-ease-out in styles/theme-toggle.js; the squash is played by toggleUuidMode() in
   client/users/user-editor.js. Transitions stop under reduced motion (reduced-motion.js). */
.switch {
  position: relative; flex: none; width: 40px; height: 22px; padding: 0; cursor: pointer;
  border: 1px solid var(--color-border-input); border-radius: 999px; background: var(--color-surface-alt);
  transition: background 700ms cubic-bezier(.22, 1, .36, 1), border-color 700ms cubic-bezier(.22, 1, .36, 1);
}
.switch-knob {
  position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
  background: var(--color-muted); transition: transform 900ms var(--spring-soft), background 700ms cubic-bezier(.22, 1, .36, 1);
}
.switch[aria-checked="true"] { background: var(--color-primary); border-color: var(--color-primary); }
.switch[aria-checked="true"] .switch-knob { background: #fff; transform: translateX(18px); }
.modal-footer { display: flex; gap: var(--space-md); margin-top: var(--space-sm); }
.modal-footer button { flex: 1; }
/* User and Node editors: Save and Cancel stay at the bottom edge of the scrolling card. The footer spans the card width
   (the card padding is 18px), repeats the card surface so scrolled content hides behind it, and carries the bottom
   padding the card does not have. The hairline and the upward shadow show where content scrolls under it; z-index 1 keeps
   it above the page content but under a hovered tooltip (z-index 2). The shadow is stronger in the dark theme. */
.editor-card > .modal-footer {
  position: sticky; bottom: 0; z-index: 1;
  margin: var(--space-sm) -18px 0; padding: var(--space-md) 18px 18px;
  background: var(--color-surface);
  box-shadow: 0 -1px 0 var(--color-border), 0 -12px 16px -10px rgba(0, 0, 0, 0.6);
}
:root[data-theme="light"] .editor-card > .modal-footer {
  box-shadow: 0 -1px 0 var(--color-border), 0 -12px 16px -10px rgba(15, 23, 42, 0.18);
}
`;

export { MODALS_CSS };
