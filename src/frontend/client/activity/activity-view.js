export const LOG_VIEW_SCRIPT = `
// ---------------------------------------------------------------------
// LOG
// ---------------------------------------------------------------------
function renderLogView() {
  // Each row is a title with an optional muted entity line, from the shared
  // mapActivity() (client/recent-activity.js).
  const activityHtml = state.activity.length
    ? state.activity.map(a => {
        const mapped = mapActivity(a);
        return \`
        <div class="activity-row">
          <span class="activity-icon">\${icon("log")}</span>
          <span class="activity-text"><span class="activity-title">\${escapeHtml(mapped.title)}</span>\${mapped.entity ? \`<span class="activity-entity">\${escapeHtml(mapped.entity)}</span>\` : ""}</span>
          \${activityTime(a.ts)}
        </div>
      \`;
      }).join("")
    : "<p>No activity yet.</p>";

  // Page title (R90) with its lead line.
  return \`
    <h2>Logs</h2>
    <p class="lead">Recent events across your panel.</p>
    <div class="card">
      <div class="activity-list">\${activityHtml}</div>
      <div class="date-tip" id="dateTip" role="tooltip"></div>
    </div>
  \`;
}
`;
