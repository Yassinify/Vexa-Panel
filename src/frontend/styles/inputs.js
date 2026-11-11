export const INPUTS_CSS = `
/* --- Inputs / selects (reference board: bordered, dark-filled, small
   leading-icon slot on "Input field") --- */
input, textarea, select {
  width: 100%; background: var(--color-surface-alt); border: 1px solid var(--color-border-input);
  color: var(--color-text); min-height: 42px; padding: 0 var(--space-md);
  border-radius: var(--radius-md); font-size: var(--text-body); font-family: inherit;
}
/* A textarea has no fixed height, so it keeps vertical padding. */
textarea { padding: var(--space-sm) var(--space-md); line-height: 1.4; }
input:focus, textarea:focus, select:focus { outline: none; border-color: var(--color-primary); }
:focus-visible {
  outline: 2px solid var(--color-primary); outline-offset: 2px;
}
`;
