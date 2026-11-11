export const RECENT_ACTIVITY_SCRIPT = `
// ---------------------------------------------------------------------
// RECENT ACTIVITY card (Dashboard) — short companion to the User Growth
// card, per the reference. Shows the first 4 records of state.activity
// (already loaded by loadDashboard()), reusing the Log page's
// .activity-row/.activity-icon/.activity-text/.activity-time and
// timeAgo(); "View all" navigates to the full list on the Log page.
// Records only carry { message, ts } (no type field), so mapActivity()
// below turns the message into a title and an entity line. It is not
// specific to this card: the Logs page can use it too. Classes live in
// styles/dashboard.js (.activity-card-head, .activity-viewall);
// .growth-title is reused for the card title.
// ---------------------------------------------------------------------
// One entry per message the backend writes (users.js, nodes.js and
// backend/auth/secrets.js): a regex whose capture groups are the quoted
// names, and the sentence-case title shown for it.
const ACTIVITY_PATTERNS = [
  { re: /^Created user "(.+)"$/, title: "New user registered" },
  { re: /^Updated sources for user "(.+)"$/, title: "User sources edited" },
  { re: /^Updated nodes for user "(.+)"$/, title: "User nodes edited" },
  { re: /^Updated subscription for user "(.+)"$/, title: "Subscription refreshed" },
  { re: /^Enabled user "(.+)"$/, title: "User enabled" },
  { re: /^Disabled user "(.+)"$/, title: "User disabled" },
  { re: /^Renamed user "(.+)" to "(.+)"$/, title: "User renamed" },
  { re: /^Deleted user "(.+)"$/, title: "User deleted" },
  { re: /^Created node "(.+)"$/, title: "Node added" },
  { re: /^Updated source for node "(.+)"$/, title: "Node source edited" },
  { re: /^Renamed node "(.+)" to "(.+)"$/, title: "Node renamed" },
  { re: /^Enabled node "(.+)"$/, title: "Node enabled" },
  { re: /^Disabled node "(.+)"$/, title: "Node disabled" },
  { re: /^Deleted node "(.+)"$/, title: "Node deleted" },
  { re: /^Changed password for "(.+)"$/, title: "Password changed" },
  { re: /^Created admin account$/, title: "Admin account created" },
  { re: /^Signed in$/, title: "Signed in" }
];

// Maps one activity record to { title, entity }. The entity is the quoted
// name from the message (a rename gives "old to new") and is empty when the
// message has none ("Signed in"). A message that matches no pattern keeps
// the raw message as its title, so a future message still renders.
function mapActivity(a) {
  for (const p of ACTIVITY_PATTERNS) {
    const m = p.re.exec(a.message);
    if (m) return { title: p.title, entity: m.slice(1).join(" to ") };
  }
  return { title: a.message, entity: "" };
}

// Relative time of one activity record. The text is a focusable span that opens the same full-date
// tooltip as the Users and Nodes date cells (dateCell() in users-view.js); the card that shows it
// must contain the #dateTip element. Also used by the Logs view.
function activityTime(ts) {
  return \`<span class="activity-time"><span class="date-target" tabindex="0" aria-describedby="dateTip" data-tip="\${escapeHtml(formatDateTooltip(ts))}" onmouseenter="scheduleDateTip(this)" onmouseleave="hideDateTip()" onfocus="scheduleDateTip(this)" onblur="hideDateTip()">\${timeAgo(ts)}</span></span>\`;
}

function renderRecentActivity() {
  const items = state.activity.slice(0, 4);
  const rowsHtml = items.length
    ? items.map(a => {
        const mapped = mapActivity(a);
        // Every Dashboard row uses the same users icon, as in the reference.
        // The entity span is left out when the message has no entity.
        return \`
        <div class="activity-row">
          <span class="activity-icon">\${icon("users")}</span>
          <span class="activity-text"><span class="activity-title">\${escapeHtml(mapped.title)}</span>\${mapped.entity ? \`<span class="activity-entity">\${escapeHtml(mapped.entity)}</span>\` : ""}</span>
          \${activityTime(a.ts)}
        </div>
      \`;
      }).join("")
    : "<p>No activity yet.</p>";
  return \`
    <div class="card activity-card">
      <div class="activity-card-head">
        <span class="growth-title">Recent activity</span>
        <button class="activity-viewall" onclick="navigate('log')">View all</button>
      </div>
      <div class="activity-list">\${rowsHtml}</div>
      <div class="date-tip" id="dateTip" role="tooltip"></div>
    </div>
  \`;
}
`;
