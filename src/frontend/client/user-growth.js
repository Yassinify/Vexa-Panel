export const USER_GROWTH_SCRIPT = `
// ---------------------------------------------------------------------
// USER GROWTH card (Dashboard) — draws state.userGrowth ([{ day,
// totalUsers }], oldest first, up to 365 daily points) as in the
// reference: one SVG (viewBox 600x210, width 100%) that holds the three
// gridlines, the y and x labels, the area and the line. The card header is
// the title plus a range dropdown (Last week / Last month / Last year =
// the last 7 / 30 / 365 days, state.growthRange). The slots are
// right-aligned, so today is the right edge. Slots before the first
// recorded day count as 0 users, so the line and the area start at zero
// across the whole range, and they are drawn as one smooth curve (monotone
// cubic segments: no corners, no overshoot). With no recorded day at all no
// line or area is drawn. The
// x axis always has 7 date labels spread evenly over the range. Classes
// live in styles/dashboard.js (.growth-*).
// ---------------------------------------------------------------------
const GROWTH_MS_PER_DAY = 86400000;
// Number of date labels under the chart, whatever the range.
const GROWTH_LABELS = 7;
// Ranges in menu order. days = number of daily slots; months = label as
// "Oct 2026" instead of "Oct 27".
const GROWTH_RANGES = {
  week: { label: "Last week", days: 7, months: false },
  month: { label: "Last month", days: 30, months: false },
  year: { label: "Last year", days: 365, months: true }
};
// Chart geometry from the reference: viewBox 600 x (200 + 10); the plot
// runs from x = 30 to x = 590 and from y = 10 (top gridline) to y = 180.
const GROWTH_W = 600;
const GROWTH_H = 200;

// "Sep 15" for a UTC timestamp (the API's days are UTC calendar days).
function growthDayLabel(ms) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// "Sep 2026" for a UTC timestamp (year range).
function growthMonthLabel(ms) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

// Top gridline value: the smallest 1/2/5 x 10^k pair that is at least the
// real maximum, so the three gridlines (0, half, max) are whole numbers.
function growthYMax(maxValue) {
  for (let mag = 1; ; mag *= 10) {
    for (const m of [1, 2, 5]) {
      if (m * mag * 2 >= maxValue) return m * mag * 2;
    }
  }
}

// Smooth SVG path through the points ([[x, y], ...], x increasing) as cubic Bezier segments (monotone
// cubic interpolation, Fritsch-Carlson). The curve passes through every point and never overshoots, so it
// stays between the lowest and the highest value: it cannot dip below 0 or above the maximum.
function growthSmoothPath(pts) {
  const n = pts.length;
  if (n < 2) return "";
  const f = (v) => +v.toFixed(2);
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    slope.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  // Tangent at each point: the mean of the two neighbouring slopes, flat at a peak, a valley or a flat run.
  const tan = [slope[0]];
  for (let i = 1; i < n - 1; i++) tan.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  tan.push(slope[n - 2]);
  // Limit the tangents so a segment never bends past its own end points.
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { tan[i] = 0; tan[i + 1] = 0; continue; }
    const a = tan[i] / slope[i];
    const b = tan[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tan[i] = t * a * slope[i];
      tan[i + 1] = t * b * slope[i];
    }
  }
  let d = "M" + f(pts[0][0]) + "," + f(pts[0][1]);
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += " C" + f(pts[i][0] + h) + "," + f(pts[i][1] + tan[i] * h) +
      " " + f(pts[i + 1][0] - h) + "," + f(pts[i + 1][1] - tan[i + 1] * h) +
      " " + f(pts[i + 1][0]) + "," + f(pts[i + 1][1]);
  }
  return d;
}

function renderGrowthChart(series) {
  const range = GROWTH_RANGES[state.growthRange] || GROWTH_RANGES.week;
  const slots = range.days;
  const all = Array.isArray(series) ? series : [];
  const points = all.slice(-slots);
  const offset = slots - points.length;
  // One value per slot: the slots before the first recorded day count as 0 users.
  const values = [];
  for (let i = 0; i < slots; i++) values.push(i < offset ? 0 : points[i - offset].totalUsers);
  const lastSlotMs = points.length
    ? Date.parse(points[points.length - 1].day + "T00:00:00Z")
    : Date.now();
  const maxValue = points.reduce((m, p) => Math.max(m, p.totalUsers), 0);
  const yMax = growthYMax(maxValue);
  const baseY = GROWTH_H - 20;
  const fmt = (n) => +n.toFixed(2);
  const px = (slot) => fmt(30 + (slot * (GROWTH_W - 40)) / (slots - 1));
  const py = (value) => fmt(baseY - (value / yMax) * (GROWTH_H - 30));

  // Three gridlines (0, half, max) with their y labels drawn inside the SVG.
  const grid = [0, yMax / 2, yMax].map((v) =>
    '<line class="growth-grid" x1="30" x2="' + (GROWTH_W - 10) + '" y1="' + py(v) + '" y2="' + py(v) + '"/>' +
    '<text class="growth-label" fill="currentColor" font-size="10" x="0" y="' + (py(v) + 4) + '">' + v + '</text>'
  ).join("");

  // Seven date labels at evenly spaced slots, so they stay even when slots are empty.
  let xLabels = "";
  for (let i = 0; i < GROWTH_LABELS; i++) {
    const slot = Math.round((i * (slots - 1)) / (GROWTH_LABELS - 1));
    const ms = lastSlotMs - (slots - 1 - slot) * GROWTH_MS_PER_DAY;
    const text = range.months ? growthMonthLabel(ms) : growthDayLabel(ms);
    xLabels += '<text class="growth-label" fill="currentColor" font-size="10" text-anchor="middle" x="' + px(slot) + '" y="' + (GROWTH_H + 4) + '">' + text + '</text>';
  }

  // The line and the area need at least one recorded day; with none only the grid and labels show.
  // Both use the same smooth path; the area closes along the baseline.
  let shapes = "";
  if (points.length >= 1) {
    const line = growthSmoothPath(values.map((v, i) => [px(i), py(v)]));
    shapes =
      '<path d="' + line + ' L' + px(slots - 1) + ',' + baseY + ' L' + px(0) + ',' + baseY + ' Z" fill="url(#growthFill)" stroke="none"/>' +
      '<path class="growth-line" d="' + line + '"/>';
  }
  const summary = "User growth over the last " + slots + " days" +
    (points.length ? ": " + points[points.length - 1].totalUsers + " users" : "");

  // Range dropdown: a trigger button and a popup of items. The open state
  // lives in the DOM (see setGrowthMenuOpen()); the selected item is .active.
  const items = Object.keys(GROWTH_RANGES).map((key) =>
    '<button type="button" class="growth-item' + (key === state.growthRange ? ' active' : '') + '" role="menuitem" data-range="' + key + '" onclick="setGrowthRange(this.dataset.range)">' + GROWTH_RANGES[key].label + '</button>'
  ).join("");
  const dropdown =
    '<div class="growth-dropdown">' +
      '<button type="button" class="growth-range" id="growthBtn" aria-haspopup="menu" aria-expanded="false" aria-label="Range" onclick="toggleGrowthMenu()">' + range.label + icon("chevron") + '</button>' +
      '<div class="growth-menu" id="growthMenu" role="menu">' + items + '</div>' +
    '</div>';

  return '<div class="card growth-card" id="growthCard">' +
    '<div class="growth-head"><span class="growth-title">User growth</span>' + dropdown + '</div>' +
    '<svg class="growth-chart" viewBox="0 0 ' + GROWTH_W + ' ' + (GROWTH_H + 10) + '" width="100%" overflow="visible" role="img" aria-label="' + summary + '">' +
      '<defs><linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="growth-stop-top"/><stop offset="1" class="growth-stop-bottom"/></linearGradient></defs>' +
      grid + shapes + xLabels +
    '</svg>' +
  '</div>';
}

// Range dropdown open state: class .open on the popup and aria-expanded on
// the trigger, as in the More menu (shell.js). The card is redrawn closed.
function setGrowthMenuOpen(open) {
  const menu = document.getElementById("growthMenu");
  const button = document.getElementById("growthBtn");
  if (!menu || !button) return;
  menu.classList.toggle("open", open);
  button.setAttribute("aria-expanded", open ? "true" : "false");
}
function toggleGrowthMenu() {
  const menu = document.getElementById("growthMenu");
  if (menu) setGrowthMenuOpen(!menu.classList.contains("open"));
}
function closeGrowthMenu() {
  setGrowthMenuOpen(false);
}

// Picks a range and redraws only the growth card (render() would scroll the
// whole view to the top). The new card is closed, so the menu closes too.
function setGrowthRange(rangeKey) {
  if (!GROWTH_RANGES[rangeKey]) return;
  state.growthRange = rangeKey;
  const card = document.getElementById("growthCard");
  if (card) card.outerHTML = renderGrowthChart(state.userGrowth);
}
`;
