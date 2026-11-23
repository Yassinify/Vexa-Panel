// One persistent #toast element (pages/app-shell.js); showToast() in helpers.js toggles .show.
// z-index 60 keeps it above the modal layer (#md, z-index 50), so toasts shown while a popup is open stay visible.
export const TOAST_CSS = `
#toast {
  position: fixed; left: 50%; bottom: calc(var(--space-xl) + env(safe-area-inset-bottom, 0px));
  transform: translate(-50%, 20px); opacity: 0;
  background: var(--color-surface); border: 1px solid var(--color-border);
  display: flex; align-items: center; gap: 10px;
  padding: 10px 18px 10px 14px; border-radius: var(--radius-lg);
  transition: .2s; pointer-events: none; z-index: 60;
}
#toast.show { opacity: 1; transform: translate(-50%, 0); }
/* The status icon before the text (toastSuccess or toastError in icons.js). */
#toast .ui-icon { width: 22px; height: 22px; flex: none; }
`;
