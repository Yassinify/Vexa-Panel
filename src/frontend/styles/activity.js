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
  width: 38px; height: 38px; border-radius: var(--radius-lg); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(180deg, var(--color-primary), var(--color-primary-hover)); color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 2px 6px var(--color-primary-soft);
}
.activity-icon .ui-icon { width: 18px; height: 18px; }
/* Light theme: the soft shadow is too faint on a white card, so the bevel gets a firmer shadow and a darker bottom edge. */
:root[data-theme="light"] .activity-icon { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -1px 0 rgba(0, 0, 0, 0.18), 0 2px 6px rgba(190, 18, 60, 0.35); }
.activity-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.activity-time { color: var(--color-muted); font-size: var(--text-caption); white-space: nowrap; }
/* Logs page: events grouped under day labels. Each row is its own bordered box with a soft tone gradient fading from
   the left and a plain tinted icon. The tone comes from data-tone (logKind() in client/activity/activity-view.js). */
.log-row[data-tone="success"] { --log-tone: var(--color-success); --log-tone-soft: var(--color-success-soft); }
.log-row[data-tone="primary"] { --log-tone: var(--color-primary); --log-tone-soft: var(--color-primary-soft); }
.log-row[data-tone="warning"] { --log-tone: var(--color-warning); --log-tone-soft: var(--color-warning-soft); }
.log-row[data-tone="error"] { --log-tone: var(--color-error); --log-tone-soft: var(--color-error-soft); }
.log-day-label { padding: 18px 4px 8px; font-size: var(--text-caption); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-muted); }
.log-day-label:first-child { padding-top: 0; }
.log-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); padding: 12px 16px; margin-bottom: 6px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: linear-gradient(90deg, var(--log-tone-soft), transparent 75%); font-size: var(--text-body); }
.log-icon { width: 38px; height: 38px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--log-tone); }
.log-icon .ui-icon { width: 20px; height: 20px; }
/* Light theme: a white base under the tone gradient, so the rows match the white cards instead of tinting the gray page. */
:root[data-theme="light"] .log-row { background: linear-gradient(90deg, var(--log-tone-soft), transparent 75%), var(--color-surface); }
`;
