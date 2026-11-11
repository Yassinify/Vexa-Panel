export const STAT_CARD_SCRIPT = `
// ---------------------------------------------------------------------
// STAT CARD change line (Dashboard): percentage change versus last month.
// The caller (dashboard.js) passes the total from one month ago: for users,
// the growth point 30 days back; for nodes, stats.previousTotalNodes (nodes
// created 30 or more days ago). Only a positive, finite previous value
// counts as history; a zero or missing base has no percentage and shows a
// neutral "0%". The text is
// signed without arrows ("+12%", "-6%"); kind (up, dn or flat) is used as a
// class by the Dashboard markup, and the colors live in styles/dashboard.js.
// ---------------------------------------------------------------------

function statDelta(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return { kind: "flat", text: "0%" };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return { kind: "up", text: "+" + pct + "%" };
  if (pct < 0) return { kind: "dn", text: "-" + Math.abs(pct) + "%" };
  return { kind: "flat", text: "0%" };
}
`;
