export const TABLES_CSS = `/* Scrolls sideways when the table is narrow, never vertically: with overflow-x: auto alone the
   vertical overflow is auto too, and the row slide after a sort would flash a scrollbar. */
.table-wrap { width: 100%; overflow-x: auto; overflow-y: hidden; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th {
  text-align: left; font-size: var(--text-caption); font-weight: 500; color: var(--color-muted);
  padding: 10px 12px; border-bottom: 1px solid var(--color-border);
}
.data-table td { padding: var(--space-md); border-bottom: 1px solid var(--color-border); font-size: var(--text-body); vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
/* Name cell: status dot and name on one line. */
.data-table td .row { display: flex; align-items: center; gap: 10px; }
/* Status dot left of the name: green = Active, red = Inactive. */
.status-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--color-error); }
.status-dot.ok { background: var(--color-success); }
/* Enable / Disable feedback (toggleRow() in client/helpers.js). A span.row-spin is put in the row's first cell and
   is positioned against the row (a table row can neither take a rounded border nor a pseudo-element reliably).
   While the server answers, a 2px border spins around the whole row in the color of the target state: green for
   Enable (.to-on), red for Disable (.to-off). The angle of the gradient is animated through an @property custom
   property; a browser without @property shows the same border without the spin. */
@property --row-spin-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
.data-table tr { position: relative; }
.row-spin {
  --row-spin-color: var(--color-success);
  position: absolute; inset: 0; z-index: 1; pointer-events: none; padding: 2px; border-radius: var(--radius-md);
  background: conic-gradient(from var(--row-spin-angle), transparent 0 55%, var(--row-spin-color) 100%);
  /* Only the 2px frame stays visible: the content box is cut out of the full box. */
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  animation: row-spin 1s linear infinite;
}
.row-spin.to-off { --row-spin-color: var(--color-error); }
@keyframes row-spin { to { --row-spin-angle: 360deg; } }
/* After the row is redrawn the border is a full ring in the same color that fades out once. */
.row-spin.settle { background: var(--row-spin-color); animation: row-spin-settle .6s ease-out forwards; }
@keyframes row-spin-settle { from { opacity: 1; } to { opacity: 0; } }
/* Status dot. While the server answers it pulses in the target color; when the row is redrawn it turns from the
   old color to the new one with a short pop and one ring that spreads and fades. */
.status-dot.busy-on { background: var(--color-success); animation: dot-busy .8s ease-in-out infinite; }
.status-dot.busy-off { background: var(--color-error); animation: dot-busy .8s ease-in-out infinite; }
@keyframes dot-busy { 50% { transform: scale(1.5); opacity: .55; } }
.status-dot.turn-on { --dot-from: var(--color-error); --dot-to: var(--color-success); animation: dot-turn .6s ease-out; }
.status-dot.turn-off { --dot-from: var(--color-success); --dot-to: var(--color-error); animation: dot-turn .6s ease-out; }
@keyframes dot-turn {
  0% { background: var(--dot-from); transform: scale(1); box-shadow: 0 0 0 0 transparent; }
  40% { background: var(--dot-to); transform: scale(1.7); box-shadow: 0 0 0 0 var(--dot-to); }
  100% { background: var(--dot-to); transform: scale(1); box-shadow: 0 0 0 10px transparent; }
}
/* Reduced motion: the border is a still ring (gone at once after the redraw) and the dot does not move. */
@media (prefers-reduced-motion: reduce) {
  .row-spin { animation: none; background: var(--row-spin-color); }
  .row-spin.settle { animation: none; opacity: 0; }
  .status-dot.busy-on, .status-dot.busy-off, .status-dot.turn-on, .status-dot.turn-off { animation: none; }
}
/* Users and Nodes Actions: the Link button (Users only) and a ⋯ button that opens the row menu. Link is
   92px wide, as the action buttons were before the menu. */
.row-actions { display: flex; align-items: center; gap: var(--space-sm); }
.row-actions .btn-sm { flex: none; min-width: 92px; padding: 0; gap: 6px; white-space: nowrap; }
.row-actions .ui-icon { width: 16px; height: 16px; }
/* The ⋯ button is a square icon button; its dots need a bigger icon than the button icons have. */
.row-menu { display: inline-flex; flex: none; }
.row-actions .row-menu-btn { flex: none; width: 34px; min-width: 0; }
.row-actions .row-menu-btn .ui-icon { width: 20px; height: 20px; }
.row-menu-btn[aria-expanded="true"] { color: var(--color-text); }
/* Row menu popup: the same surface, border, radius and shadow as the Dashboard range menu
   (styles/dashboard.js). It is position: fixed (the script sets left and top and the class .above),
   because .table-wrap's overflow would clip an absolute popup; the script toggles .open. */
.row-menu-popup {
  display: none; position: fixed; z-index: 10; left: 0; top: 0; min-width: 150px;
  flex-direction: column; gap: 2px; padding: 6px;
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  --account-menu-shift: -6px;
}
/* Same fade and 6px slide as the other popups (account-menu-in, styles/app-shell.js); closing is instant. */
.row-menu-popup.open { display: flex; animation: account-menu-in .16s ease-out; }
.row-menu-popup.above { --account-menu-shift: 6px; }
@media (prefers-reduced-motion: reduce) { .row-menu-popup.open { animation: none; } }
/* Items look like the Dashboard range items, each with its icon before the label. */
.row-menu-item {
  display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 0 var(--space-md);
  border: 0; background: none; text-align: left; border-radius: var(--radius-md);
  color: var(--color-muted); cursor: pointer; font-size: var(--text-body); white-space: nowrap;
}
.row-menu-item:hover { background: var(--color-surface-alt); color: var(--color-text); }
.row-menu-item:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
.row-menu-item .ui-icon { width: 16px; height: 16px; flex: none; }
/* Delete is the only destructive item, so it keeps the Danger Button's color. */
.row-menu-item.danger, .row-menu-item.danger:hover { color: var(--color-primary); }
.row-menu-item.danger:hover { background: rgba(225, 29, 72, .12); }
/* "N users" line under the Users table; the double class beats .helper-text's top margin. */
.helper-text.table-count { margin-top: 0; padding: 0 var(--space-md) var(--space-md); }
/* Dates stay on one line (they would break at the hyphens when the table is narrow). */
.data-table td.timestamp { white-space: nowrap; }
/* Sortable Users header: a button that looks like the header text, followed by an up-arrow and a
   down-arrow (Heroicons). The arrow of the current direction is solid, the other one is dimmed. */
.sort-btn {
  display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
  background: none; border: none; padding: 0; cursor: pointer;
  font-weight: inherit; font-size: inherit; color: inherit;
}
.sort-btn:hover { color: var(--color-text); }
.sort-btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; border-radius: var(--radius-sm); }
.sort-arrows { display: inline-flex; align-items: center; }
.sort-arrows .ui-icon { width: 12px; height: 12px; opacity: .35; }
.sort-arrows .ui-icon.on { opacity: 1; color: var(--color-text); }
/* After a sort click (class rows-sorted, set by script for that one render) the rows play the popup's
   motion once: the same fade and 6px slide up as the popups (account-menu-in, styles/app-shell.js).
   The header stays still. */
.data-table.rows-sorted tbody tr { animation: account-menu-in .16s ease-out; }
/* Reduced motion: no animation at all. */
@media (prefers-reduced-motion: reduce) { .data-table.rows-sorted tbody tr { animation: none; } }
/* Date tooltip: one element in the Users view, styled like the Sign out popup (surface, border, 12px
   radius, shadow, 10px arrow) with no blur backdrop. Script sets left, top and --tip-arrow-x (the
   arrow's distance from the tooltip's left edge) and toggles .open and .below (.below = under the date). */
.date-tip {
  display: none; position: fixed; z-index: 10; left: 0; top: 0; pointer-events: none;
  padding: var(--space-sm) var(--space-md); white-space: nowrap;
  font-size: var(--text-caption); line-height: 1.5; color: var(--color-text);
  /* The parts (weekday, date, time) sit in a row with an equal 12px gap, the same as the side padding;
     tabular figures keep the width the same from one date to the next. */
  gap: var(--space-md); align-items: baseline; font-variant-numeric: tabular-nums;
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  --account-menu-shift: 6px;
}
/* Same fade and 6px slide as the popups; closing is instant (display: none). */
.date-tip.open { display: flex; animation: account-menu-in .16s ease-out; }
/* The weekday is the label: muted and medium weight; the date and the time keep the text color. */
.date-tip-day { color: var(--color-muted); font-weight: 500; }
.date-tip.below { --account-menu-shift: -6px; }
.date-tip::after {
  content: ""; position: absolute; bottom: -6px; left: var(--tip-arrow-x, 50%); margin-left: -5px;
  width: 10px; height: 10px; background: var(--color-surface);
  border: solid var(--color-border); border-width: 0 1px 1px 0; transform: rotate(45deg);
}
.date-tip.below::after { top: -6px; bottom: auto; border-width: 1px 0 0 1px; }
/* The focusable date text inside a date cell: keyboard focus and a tap open the tooltip. */
.date-target { cursor: default; border-radius: var(--radius-sm); }
@media (prefers-reduced-motion: reduce) { .date-tip.open { animation: none; } }
/* Phone width: the Users and Nodes tables become a list of cards (reference/Vexa Panel User Management.png).
   Each row is a card: status dot and name, then Created at (Users) or Type (Nodes), then the actions
   row: the Link button (Users) and the ⋯ button. The other date columns are hidden (Updated at and Edited at on
   Users; Created at, Updated at and Edited at on Nodes). The labels are
   ::before text, so the markup is the same as on desktop. */
@media (max-width: 760px) {
  /* The outer card loses its frame; every row is its own card. */
  .card:has(> .table-wrap) { background: none; border: none; border-radius: 0; }
  .table-wrap { overflow: visible; }
  .data-table { display: block; min-width: 0; }
  .data-table thead { display: none; }
  .data-table tbody { display: flex; flex-direction: column; gap: var(--space-sm); }
  .data-table tr {
    display: flex; flex-direction: column; gap: var(--space-xs); padding: var(--space-md) var(--space-lg);
    background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-xl);
  }
  .data-table td { display: block; padding: 0; border-bottom: none; line-height: 1.3; }
  .data-table td:first-child { font-size: var(--text-body-lg); font-weight: 600; }
  .data-table td .row .status-dot { width: 10px; height: 10px; }
  /* Second line sits under the name: 20px = the 10px dot plus its 10px gap. */
  .data-table td.timestamp:nth-child(2),
  .data-table td:nth-child(2):not(.timestamp) { padding-left: 20px; color: var(--color-muted); }
  .data-table td.timestamp:nth-child(2)::before { content: "Created at "; }
  .data-table td:nth-child(2):not(.timestamp)::before { content: "Type: "; }
  .data-table td.timestamp:nth-child(3),
  .data-table td.timestamp:nth-child(4),
  .data-table td.timestamp:nth-child(5) { display: none; }
  .data-table tr { position: relative; }
  /* On a card the Enable / Disable border follows the card's corners. */
  .row-spin { border-radius: var(--radius-xl); }
  .row-actions { gap: var(--space-sm); margin-top: var(--space-sm); }
  /* The Link button (Users) keeps its natural width, left-aligned: a stretched button next to the small ⋯ looks out of proportion. */
  .row-actions .btn-sm { flex: none; width: auto; min-width: 0; min-height: 32px; padding: 0 var(--space-md); font-size: 13px; }
  .row-actions .row-menu-btn { flex: none; width: 32px; min-width: 0; padding: 0; }
  /* The ⋯ button sits at the top right of every card, beside the name, on Users and Nodes alike; it is taken out of the row's flow. */
  .row-menu { position: absolute; top: var(--space-sm); right: var(--space-md); }
  /* A Nodes row has nothing else in its action row, so that empty row takes no space (the negative margin cancels the card's gap). */
  .row-actions:has(> .row-menu:only-child) { margin-top: 0; }
  .data-table td:has(> .row-actions > .row-menu:only-child) { height: 0; margin-top: calc(-1 * var(--space-xs)); }
  .data-table tr:has(.row-menu) td:first-child { padding-right: 28px; }
  .helper-text.table-count { padding: 0 var(--space-xs); }
}`;
