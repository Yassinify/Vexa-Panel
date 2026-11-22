export const TOOLBAR_CSS = `.toolbar { display: flex; justify-content: space-between; align-items: center; gap: var(--space-md); margin-bottom: 14px; flex-wrap: wrap; }
/* Narrow phones: the button stays at the right of the title instead of wrapping under it; the lead line wraps. */
@media (max-width: 439px) {
  .toolbar:has(> .btn-primary) { flex-wrap: nowrap; align-items: flex-start; }
  .toolbar:has(> .btn-primary) > :first-child { min-width: 0; }
  .toolbar > .btn-primary { flex: none; margin-left: auto; }
}
/* Empty Users or Nodes view: the Add button alone, centered in the free space under the title. */
.empty-add { display: flex; align-items: center; justify-content: center; min-height: 60vh; }`;
