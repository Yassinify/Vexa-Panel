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

// ---------------------------------------------------------------------
// STAT CARD count-up (Dashboard): each .stat-card-num counts from 0 to the
// whole number the markup already holds, about 1 second, ease-out. Called by
// render() right after the Dashboard markup is written. Only #view is
// searched, so the inert exit copy of the previous view is not animated.
// No motion under reduced motion (the final number stays as rendered).
// ---------------------------------------------------------------------
const STAT_COUNT_MS = 1000;
let statCountRun = 0;

function animateStatNumbers() {
  // A newer call cancels any count still running from an older one.
  const run = ++statCountRun;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const items = [];
  document.querySelectorAll("#view .stat-card-num").forEach((el) => {
    const target = Number(el.textContent);
    if (!Number.isInteger(target) || target <= 0) return;
    el.textContent = "0";
    items.push({ el, target });
  });
  if (items.length === 0) return;
  const start = performance.now();
  function frame(now) {
    if (run !== statCountRun) return;
    const t = Math.min(1, (now - start) / STAT_COUNT_MS);
    const eased = 1 - Math.pow(1 - t, 3);
    for (const item of items) {
      if (!item.el.isConnected) continue;
      item.el.textContent = String(Math.round(item.target * eased));
    }
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
`;
