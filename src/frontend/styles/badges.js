// Badges CSS (reference board: Success pill dot+label, Error pill
// dot+label). Extracted verbatim from styles.js's Badges section
// (frontend modularization step 12).
export const BADGES_CSS = `
/* --- Badges (reference board: Success pill dot+label, Error pill
   dot+label) --- */
.badge-row { display: flex; gap: var(--space-sm); flex-wrap: wrap; }
.badge {
  font-size: var(--text-caption); padding: 2px 10px; border-radius: 999px;
  background: var(--color-primary-soft); color: var(--color-primary);
  display: inline-flex; align-items: center;
  gap: 6px;
}
.badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.badge.green, .badge.ok { background: var(--color-success-soft); color: var(--color-success); }
.badge.no { background: var(--color-error-soft); color: var(--color-error); }
.badge-row .btn-secondary { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }

@media (max-width: 480px) {
  .badge { border-radius: 999px; }
}
`;
