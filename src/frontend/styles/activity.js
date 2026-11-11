export const ACTIVITY_CSS = `
/* Activity rows, per the reference .act: a 38px rounded-square icon tile, the
   event text (a title with an optional muted entity line, see
   client/recent-activity.js) and a muted right-aligned relative time. The row
   has no side padding; the card around the list supplies it. */
/* The Logs card is a bare .card without padding, so its list gets the 18px of
   the reference card (the Dashboard card .activity-card pads itself). */
.card:not(.activity-card) > .activity-list { padding: 18px; }
.activity-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); padding: var(--space-md) 0; border-bottom: 1px solid var(--color-border); font-size: var(--text-body); }
.activity-row:last-child { border-bottom: none; }
.activity-icon {
  width: 38px; height: 38px; border-radius: var(--radius-md); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-primary-soft); color: var(--color-primary);
}
.activity-icon .ui-icon { width: 18px; height: 18px; }
.activity-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.activity-time { color: var(--color-muted); font-size: var(--text-caption); white-space: nowrap; }
`;
