export const SETTINGS_CSS = `
/* --- Settings view (renderSettingsView in client/shell.js); the rows follow the reference .set --- */
/* Card padding matches the reference .card (18px); each row adds its own 14px. */
.settings-card { max-width: 560px; padding: 18px; }
.setting-row {
  display: flex; justify-content: space-between; align-items: center; gap: var(--space-lg);
  padding: 14px 0; border-bottom: 1px solid var(--color-border);
}
.setting-row:last-child { border-bottom: 0; }
/* The text block may shrink and wrap; the button keeps its size. */
.setting-text { min-width: 0; }
.setting-title { display: block; }
.setting-desc { display: block; color: var(--color-muted); font-size: var(--text-caption); }
.setting-row .btn-secondary { flex: none; white-space: nowrap; }
`;
