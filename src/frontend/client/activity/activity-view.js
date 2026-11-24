export const LOG_VIEW_SCRIPT = `
// ---------------------------------------------------------------------
// LOG
// ---------------------------------------------------------------------
// Records only carry { message, ts } (no type field), so logKind() picks an icon and a tone
// from the message text; the first matching entry wins. The tone is set as data-tone on the
// row and styled in styles/activity.js. A message that matches nothing gets the log icon.
const LOG_KINDS = [
  { re: /^Updated subscription/, icon: "link", tone: "primary" },
  { re: /^Created admin account/, icon: "users", tone: "warning" },
  { re: /^Created (user|node)/, icon: "plus", tone: "success" },
  { re: /^Deleted/, icon: "trash", tone: "error" },
  { re: /^(Regenerated UUID|Enabled random UUID|Disabled random UUID)/, icon: "arrowPath", tone: "primary" },
  { re: /^Enabled/, icon: "playCircle", tone: "success" },
  { re: /^Disabled/, icon: "pauseCircle", tone: "warning" },
  { re: /^(Updated|Renamed)/, icon: "pencil", tone: "primary" },
  { re: /^Changed password/, icon: "settings", tone: "warning" },
  { re: /^Signed in/, icon: "checkCircle", tone: "success" }
];

function logKind(message) {
  return LOG_KINDS.find(k => k.re.test(message)) || { icon: "log", tone: "primary" };
}

// Group label of one record: "Today", "Yesterday" or the date in the short format chosen in Settings (formatDate() in
// helpers.js: 2026-11-16 or Nov 16, 2026; Jalali: 1405-08-25 or Aban 25, 1405), by the local calendar day.
function logDayLabel(ts) {
  const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((dayStart(new Date()) - dayStart(new Date(ts))) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return formatDate(ts);
}

function renderLogView() {
  // Records are newest first, so a day label is written whenever the day changes. Each row is a
  // title with an optional muted entity line, from the shared mapActivity() (client/recent-activity.js).
  let lastDay = "";
  const activityHtml = state.activity.length
    ? state.activity.map(a => {
        const mapped = mapActivity(a);
        const kind = logKind(a.message);
        const day = logDayLabel(a.ts);
        const dayHtml = day === lastDay ? "" : \`<div class="log-day-label">\${escapeHtml(day)}</div>\`;
        lastDay = day;
        return \`\${dayHtml}
        <div class="log-row" data-tone="\${kind.tone}" data-log-key="\${escapeHtml(a.ts + "|" + a.message)}">
          <span class="log-icon">\${icon(kind.icon)}</span>
          <span class="activity-text"><span class="activity-title">\${escapeHtml(mapped.title)}</span>\${mapped.entity ? \`<span class="activity-entity">\${escapeHtml(mapped.entity)}</span>\` : ""}</span>
          \${activityTime(a.ts)}
        </div>
      \`;
      }).join("")
    : "<p>No activity yet.</p>";

  // Page title with its lead line. The #dateTip element is needed by activityTime().
  return \`
    <h2>Logs</h2>
    <p class="lead">Recent events across your panel.</p>
    <div class="log-list">\${activityHtml}</div>
    <div class="date-tip" id="dateTip" role="tooltip"></div>
  \`;
}
`;
