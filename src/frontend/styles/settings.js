export const SETTINGS_CSS = `
/* --- Settings view (renderSettingsView in client/shell.js); the rows follow the reference .set --- */
/* Card padding matches the reference .card (18px); each row adds its own 14px. The card fills its grid column (no width cap). */
.settings-card { padding: 18px; }
.setting-row {
  display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--space-sm) var(--space-lg);
  padding: 14px 0; border-bottom: 1px solid var(--color-border);
}
.setting-row:last-child { border-bottom: 0; }
/* The text block may shrink and wrap; the button keeps its size. */
.setting-text { min-width: 0; }
.setting-title { display: block; }
.setting-desc { display: block; color: var(--color-muted); font-size: var(--text-caption); }
.setting-row .btn-secondary { flex: none; white-space: nowrap; }
/* Two actions in one row (Account Recovery: Backup left, Restore right); the gap comes from the spacing scale. */
.setting-actions { display: flex; flex: none; align-items: center; gap: var(--space-md); }
/* The sections sit in one column (renderSettingsView() in client/shell.js) and stack vertically at every width; the gap comes
   from the spacing scale. Each section has a title above its card. The calendar dropdown (client/shell.js, growth dropdown
   styles) keeps its size. */
.settings-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-xl); align-items: start; }
.settings-section-title { margin: 0 0 var(--space-sm); font-size: var(--text-body-lg); font-weight: 600; color: var(--color-text); }
.setting-row .calendar-dropdown, .setting-row .date-format-dropdown { flex: none; }
/* The date format dropdowns hold long examples ("Sunday February 15, 2026"); a row that is too narrow for the title and the
   dropdown wraps the dropdown below the title (flex-wrap above). The Short menu has two items like the calendar menu. */
.date-format-short .growth-menu { --wave-out-total: calc(var(--wave-out-time) + var(--wave-out-step)); }
`;
