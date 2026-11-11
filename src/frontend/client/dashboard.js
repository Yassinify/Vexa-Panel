export const DASHBOARD_SCRIPT = `
// ---------------------------------------------------------------------
// DASHBOARD — visually rebuilt from the reference board's Desktop/
// Tablet/Mobile Dashboard panels: each stat card now leads with a small
// colored icon badge (.stat-card-icon, styles.js), matching the board's
// icon-in-rounded-square treatment. The 2 cards (Total Users, Total Nodes)
// read state.stats (totalUsers/totalNodes, from getStats() in
// src/users.js) and each shows its change versus last month (statDelta());
// there is no Active Subscriptions or Total Traffic card. Below the stat
// cards, .dash-row holds the User Growth
// card (renderGrowthChart()) and the Recent Activity card
// (renderRecentActivity()) side by side, stacking to one column at
// 1024px and below (styles.js). The reference has no system status
// row, so none is drawn (R57).
// ---------------------------------------------------------------------

// Total users 30 days before the newest point of the growth series (the same
// span as the "Last month" range). Returns null when the series has no point
// for that day, which statDelta() shows as a neutral "0%".
function usersOneMonthAgo(series) {
  if (!Array.isArray(series) || series.length === 0) return null;
  const newestMs = Date.parse(series[series.length - 1].day + "T00:00:00Z");
  if (!Number.isFinite(newestMs)) return null;
  const targetDay = new Date(newestMs - 30 * 86400000).toISOString().slice(0, 10);
  const point = series.find((p) => p.day === targetDay);
  return point ? point.totalUsers : null;
}

function renderDashboardView() {
  // Page title and lead line, as in the reference (R90). The text does not
  // depend on loaded data, so the loading and the loaded view share it.
  const header = \`
    <h2>Dashboard</h2>
    <p class="lead">Welcome back, Admin! Here's what's happening with your panel.</p>
  \`;
  // While the data loads only the title and lead line show, as in Users, Nodes
  // and Logs (no loading placeholders, R80).
  if (state.loading || !state.stats) {
    return header;
  }
  const s = state.stats;
  // Total users compares with the total one month ago from the growth series.
  // Total nodes compares with the count of nodes created 30+ days ago, sent by
  // the API as stats.previousTotalNodes (see statDelta() for the 0% cases).
  const cards = [
    { label: "Total users", num: s.totalUsers, icon: "users", prev: usersOneMonthAgo(state.userGrowth) },
    { label: "Total nodes", num: s.totalNodes, icon: "globe", prev: s.previousTotalNodes }
  ].map(c => ({ ...c, delta: statDelta(c.num, c.prev) }));
  return \`
    \${header}
    <div class="stat-grid">
      \${cards.map(c => \`
        <div class="card stat-card">
          <span class="stat-card-icon">\${icon(c.icon)}</span>
          <div>
            <div class="stat-card-label">\${c.label}</div>
            <div class="stat-card-num">\${c.num}</div>
            <div class="stat-card-delta \${c.delta.kind}">\${c.delta.text} vs. last month</div>
          </div>
        </div>
      \`).join("")}
    </div>
    <div class="dash-row">
      \${renderGrowthChart(state.userGrowth)}
      \${renderRecentActivity()}
    </div>
  \`;
}
`;
