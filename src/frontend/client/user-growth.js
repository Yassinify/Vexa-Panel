export const USER_GROWTH_SCRIPT = `
// ---------------------------------------------------------------------
// USER GROWTH card (Dashboard) - draws state.userGrowth ([{ day,
// totalUsers }], oldest first, up to 365 daily points) as in the
// reference: one SVG that holds the three gridlines, the y and x labels,
// the area and the line. The SVG is drawn at the real width of the card:
// its viewBox is as wide as the measured chart in px (growthW, 1 unit = 1px,
// height fixed), so text and strokes keep their size on a phone;
// fitGrowthChart() measures it after a render and on window resize. The card header is
// the title plus a range dropdown (Last week / Last month / Last year =
// the last 7 / 30 / 365 days, state.growthRange). The slots are
// right-aligned, so today is the right edge. Slots before the first
// recorded day count as 0 users, so the line and the area start at zero
// across the whole range, and they are drawn as one smooth curve (monotone
// cubic segments: no corners, no overshoot). With no recorded day at all no
// line or area is drawn. The
// x axis has 7 date labels spread evenly over the range (5, 4 or 3 on a narrower card). Classes
// live in styles/dashboard.js (.growth-*).
// ---------------------------------------------------------------------
const GROWTH_MS_PER_DAY = 86400000;
// Most date labels under the chart (a wide card); a narrower card shows fewer, see growthLabelCount().
const GROWTH_LABELS = 7;
// Ranges in menu order. days = number of daily slots; months = label as
// "Oct 2026" instead of "Oct 27".
const GROWTH_RANGES = {
  week: { label: "Last week", days: 7, months: false },
  month: { label: "Last month", days: 30, months: false },
  year: { label: "Last year", days: 365, months: true }
};
// Chart geometry: viewBox W x (200 + 10), where W is the measured width of the chart in px (growthW, 600 until
// the first measurement); the plot runs from x = 30 to x = W - 10 and from y = 10 (top gridline) to y = 180.
let growthW = 600;
const GROWTH_H = 200;
// From this chart width up the card is wide: 7 date labels, all centered. Narrower, the first label starts at the
// left edge of the plot and the last ends at its right edge, so none is cut off.
const GROWTH_WIDE = 520;

// How many date labels fit under the chart at its current width. The widest label ("Aban 1405") is about 50px.
function growthLabelCount() {
  if (growthW >= GROWTH_WIDE) return GROWTH_LABELS;
  if (growthW >= 400) return 5;
  if (growthW >= 280) return 4;
  return 3;
}

// "Sep 15" (Jalali: "Aban 2") for a UTC timestamp (the API's days are UTC calendar days).
function growthDayLabel(ms) {
  const jalali = state.calendar === "jalali" ? jalaliLabel(ms, "UTC", true, false) : null;
  if (jalali) return jalali;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// "Sep 2026" (Jalali: "Aban 1405") for a UTC timestamp (year range).
function growthMonthLabel(ms) {
  const jalali = state.calendar === "jalali" ? jalaliLabel(ms, "UTC", false, true) : null;
  if (jalali) return jalali;
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

// The chart SVG alone (grid, labels, area and line) for state.growthRange. Used by renderGrowthChart() for the first
// draw, by setGrowthRange() to swap the chart in place and by fitGrowthChart() to redraw it at a new width.
function growthChartSvg(series) {
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
  const W = growthW;
  const fmt = (n) => +n.toFixed(2);
  const px = (slot) => fmt(30 + (slot * (W - 40)) / (slots - 1));
  const py = (value) => fmt(baseY - (value / yMax) * (GROWTH_H - 30));

  // Three gridlines (0, half, max) with their y labels drawn inside the SVG.
  const grid = [0, yMax / 2, yMax].map((v) =>
    '<line class="growth-grid" x1="30" x2="' + (W - 10) + '" y1="' + py(v) + '" y2="' + py(v) + '"/>' +
    '<text class="growth-label" fill="currentColor" font-size="10" x="0" y="' + (py(v) + 4) + '">' + v + '</text>'
  ).join("");

  // Date labels at evenly spaced slots (7 on a wide card, fewer on a narrow one), so they stay even when slots are empty.
  const labelCount = growthLabelCount();
  const narrow = W < GROWTH_WIDE;
  let xLabels = "";
  for (let i = 0; i < labelCount; i++) {
    const slot = Math.round((i * (slots - 1)) / (labelCount - 1));
    const ms = lastSlotMs - (slots - 1 - slot) * GROWTH_MS_PER_DAY;
    const text = range.months ? growthMonthLabel(ms) : growthDayLabel(ms);
    const anchor = narrow && i === 0 ? "start" : narrow && i === labelCount - 1 ? "end" : "middle";
    xLabels += '<text class="growth-label" fill="currentColor" font-size="10" text-anchor="' + anchor + '" x="' + px(slot) + '" y="' + (GROWTH_H + 4) + '">' + text + '</text>';
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
  return '<svg class="growth-chart" viewBox="0 0 ' + W + ' ' + (GROWTH_H + 10) + '" width="100%" overflow="visible" role="img" aria-label="' + summary + '">' +
    '<defs><linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="growth-stop-top"/><stop offset="1" class="growth-stop-bottom"/></linearGradient></defs>' +
    grid + shapes + xLabels +
  '</svg>';
}

function renderGrowthChart(series) {
  const range = GROWTH_RANGES[state.growthRange] || GROWTH_RANGES.week;

  // Range dropdown: a trigger button and a popup of items. The open state
  // lives in the DOM (see setGrowthMenuOpen()); the selected item is .active.
  const items = Object.keys(GROWTH_RANGES).map((key) =>
    '<button type="button" class="growth-item' + (key === state.growthRange ? ' active' : '') + '" role="menuitem" data-range="' + key + '" onclick="setGrowthRange(this.dataset.range)">' + GROWTH_RANGES[key].label + '</button>'
  ).join("");
  const dropdown =
    '<div class="growth-dropdown">' +
      '<button type="button" class="growth-range" id="growthBtn" aria-haspopup="menu" aria-expanded="false" aria-label="Range" onclick="toggleGrowthMenu()"><span class="growth-range-label">' + range.label + '</span>' + icon("chevron") + '</button>' +
      '<div class="growth-menu" id="growthMenu" role="menu">' + items + '</div>' +
    '</div>';

  // The card is in the page after this string is used, so its real width is measured on the next frame and the
  // chart is redrawn if it differs from the width used here (fitGrowthChart()).
  requestAnimationFrame(fitGrowthChart);
  return '<div class="card growth-card" id="growthCard">' +
    '<div class="growth-head"><span class="growth-title">User growth</span>' + dropdown + '</div>' +
    growthChartSvg(series) +
  '</div>';
}

// Range dropdown open state: aria-expanded on the trigger and the classes .open and .closing on the popup, through
// setPopupOpen() (shell.js), so the popup plays the row menu enter and exit motion. The card is redrawn closed.
function setGrowthMenuOpen(open) {
  const menu = document.getElementById("growthMenu");
  const button = document.getElementById("growthBtn");
  if (!menu || !button) return;
  setPopupOpen(menu, button, open);
}
function toggleGrowthMenu() {
  const menu = document.getElementById("growthMenu");
  if (menu) setGrowthMenuOpen(!menu.classList.contains("open"));
}
function closeGrowthMenu() {
  setGrowthMenuOpen(false);
}

// Duration of the chart's exit and of its enter when the range changes (the motion the Users rows play after a sort).
const GROWTH_SWAP_MS = 160;
// True while the old chart fades out. A pick during that time only changes state.growthRange; the pending swap
// draws the latest range, and a resize only updates growthW.
let growthExitPending = false;

// Replaces the chart SVG in the card with a fresh one for the current range and width; returns the new SVG.
function redrawGrowthSvg() {
  const card = document.getElementById("growthCard");
  const svg = card ? card.querySelector(".growth-chart") : null;
  if (!svg) return null;
  svg.outerHTML = growthChartSvg(state.userGrowth);
  return card.querySelector(".growth-chart");
}

// Picks a range. The menu closes (its exit plays) and the card stays: the trigger label and the active item change
// in place, and only the chart is swapped. The old chart fades out while dropping 6px, then the new one fades in
// sliding up 6px (Web Animations API, as renderSorted() does for table rows). Without that API, or under reduced
// motion, the swap is immediate.
function setGrowthRange(rangeKey) {
  if (!GROWTH_RANGES[rangeKey]) return;
  closeGrowthMenu();
  if (rangeKey === state.growthRange) return;
  state.growthRange = rangeKey;
  const card = document.getElementById("growthCard");
  if (!card) return;
  const label = card.querySelector(".growth-range-label");
  if (label) label.textContent = GROWTH_RANGES[rangeKey].label;
  card.querySelectorAll(".growth-item").forEach(el => el.classList.toggle("active", el.dataset.range === rangeKey));
  if (growthExitPending) return;
  const svg = card.querySelector(".growth-chart");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!svg || reduceMotion || !svg.animate) {
    redrawGrowthSvg();
    return;
  }
  growthExitPending = true;
  const exit = svg.animate(
    [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(6px)" }],
    { duration: GROWTH_SWAP_MS, easing: "ease-in", fill: "forwards" }
  );
  exit.onfinish = () => {
    growthExitPending = false;
    const fresh = redrawGrowthSvg();
    if (fresh && fresh.animate) {
      fresh.animate(
        [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: GROWTH_SWAP_MS, easing: "ease-out" }
      );
    }
  };
  exit.oncancel = () => { growthExitPending = false; };
}

// Draws the chart at the card's real width. The first draw uses the last known width (600 before any measurement);
// this measures the SVG once the card is in the page and, when its width differs by more than 4px from growthW,
// redraws only the chart SVG at the new width, so an open range menu stays open. While the chart's exit is pending
// it only updates growthW (the pending swap draws at that width).
// Also runs when the window is resized, so a rotated phone or a resized window gets a chart that fits.
function fitGrowthChart() {
  const card = document.getElementById("growthCard");
  const svg = card ? card.querySelector(".growth-chart") : null;
  if (!svg) return;
  const width = Math.round(svg.getBoundingClientRect().width);
  if (width < 1 || Math.abs(width - growthW) <= 4) return;
  growthW = width;
  if (growthExitPending) return;
  redrawGrowthSvg();
}
let growthResizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(growthResizeTimer);
  growthResizeTimer = setTimeout(fitGrowthChart, 80);
});
`;
