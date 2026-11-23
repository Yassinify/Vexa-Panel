export const TOOLBAR_CSS = `.toolbar { display: flex; justify-content: space-between; align-items: center; gap: var(--space-md); margin-bottom: 14px; flex-wrap: wrap; }
/* Narrow phones: the button stays at the right of the title instead of wrapping under it; the lead line wraps. */
@media (max-width: 439px) {
  .toolbar:has(> .btn-primary) { flex-wrap: nowrap; align-items: flex-start; }
  .toolbar:has(> .btn-primary) > :first-child { min-width: 0; }
  .toolbar > .btn-primary { flex: none; margin-left: auto; }
}
/* Empty Users or Nodes view: the Add button alone, centered in the free space under the title. */
.empty-add { display: flex; align-items: center; justify-content: center; min-height: 60vh; }
/* Add user and Add node buttons (toolbar and empty state): the bevel look of the icon tiles. Other primary buttons are unchanged. */
.toolbar > .btn-primary, .empty-add > .btn-primary {
  background: linear-gradient(180deg, var(--color-primary), var(--color-primary-hover));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 -1px 0 rgba(0, 0, 0, 0.18), 0 2px 6px rgba(225, 29, 72, 0.35);
}
.toolbar > .btn-primary:hover, .empty-add > .btn-primary:hover { filter: brightness(1.08); }`;
