const DASHBOARD_CSS = String.raw`
/* --- Stat cards --- */
/* Two cards: two equal columns; one column at 760px and below (see the media rule below). */
.stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-lg); margin-bottom: var(--space-lg); }
/* Icon tile on the left; label, value and change line on the right (reference .stat). */
.stat-card { display: flex; gap: 14px; align-items: flex-start; padding: 18px; }
/* Label and change line sit on a 21px line, as in the reference (inline text in the 14px body). */
.stat-card-label { font-size: var(--text-caption); line-height: 21px; color: var(--color-muted); }
.stat-card-num { font-size: var(--text-h2); font-weight: 600; line-height: 1.3; }
/* Change line: muted by default (the neutral 0%); .up and .dn color it, as in the reference. */
.stat-card-delta { font-size: var(--text-caption); line-height: 21px; color: var(--color-muted); }
.up { color: var(--color-success); }
.dn { color: var(--color-error); }
.stat-card-icon {
  width: 38px; height: 38px; border-radius: var(--radius-md); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-primary-soft); color: var(--color-primary);
}
.stat-card-icon .ui-icon { width: 18px; height: 18px; }
/* Above 1000px the two cards are wider than the reference card, so the icon tile and the number scale up with them. */
@media (min-width: 1001px) {
  .stat-card-icon { width: 46px; height: 46px; }
  .stat-card-icon .ui-icon { width: 22px; height: 22px; }
  .stat-card-num { font-size: 30px; }
}
@media (max-width: 760px) {
  .stat-grid { grid-template-columns: 1fr; }
}
/* --- User Growth card (Dashboard), per the reference. The chart is one SVG
   (client/user-growth.js) that scales with the card width. --- */
.growth-card { padding: 18px; margin-bottom: var(--space-xl); }
/* Header row like the reference .hd: title left, range dropdown right. */
.growth-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.growth-title { font-size: var(--text-body); font-weight: 600; }
/* Range dropdown (client/user-growth.js): a small trigger button with a chevron that opens .growth-menu. */
.growth-dropdown { position: relative; }
.growth-range {
  display: inline-flex; align-items: center; gap: var(--space-xs); padding: 4px 8px;
  background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: var(--radius-md);
  color: var(--color-muted); font-size: var(--text-caption); cursor: pointer;
}
.growth-range:hover, .growth-range[aria-expanded="true"] { color: var(--color-text); }
.growth-range .ui-icon { width: 14px; height: 14px; transition: transform .15s ease; }
.growth-range[aria-expanded="true"] .ui-icon { transform: rotate(180deg); }
/* Popup: same surface, border, radius and shadow as .more-menu (app-shell.js); script toggles .open. */
.growth-menu {
  display: none; position: absolute; right: 0; top: calc(100% + 6px); z-index: 10; min-width: 140px;
  flex-direction: column; gap: 2px; padding: 6px;
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.growth-menu.open { display: flex; }
/* Items look like .more-item but shorter; .active marks the selected range like an active nav item. */
.growth-item {
  display: flex; align-items: center; min-height: 36px; padding: 0 var(--space-md);
  border: 0; background: none; text-align: left; border-radius: var(--radius-md);
  color: var(--color-muted); cursor: pointer; font-size: var(--text-body); white-space: nowrap;
}
.growth-item:hover { background: var(--color-surface-alt); color: var(--color-text); }
.growth-item.active { background: var(--color-primary-hover); color: #fff; }
.growth-grid { stroke: var(--color-border); stroke-width: 1; vector-effect: non-scaling-stroke; }
/* Axis labels inside the SVG: muted fill (the size is set on the element). */
.growth-label { fill: var(--color-muted); }
.growth-line { fill: none; stroke: var(--color-primary); stroke-width: 2; vector-effect: non-scaling-stroke; }
.growth-stop-top { stop-color: var(--color-primary); stop-opacity: .5; }
.growth-stop-bottom { stop-color: var(--color-primary); stop-opacity: 0; }
/* --- Dashboard row: User Growth + Recent Activity side by side (reference
   .two, 1.6fr 1fr); one column at 1000px and below. The growth card's own
   bottom margin is dropped inside it. --- */
.dash-row { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: var(--space-lg); align-items: stretch; }
.dash-row .growth-card { margin-bottom: 0; }
@media (max-width: 1000px) {
  .dash-row { grid-template-columns: minmax(0, 1fr); }
}
/* Recent Activity card: reuses the Log page's .activity-row/.activity-icon/
   .activity-text/.activity-time. Reference card: 18px padding, a header row
   like .hd and no reserved height; in the row it stretches to the growth
   card's height. */
.activity-card { display: flex; flex-direction: column; min-width: 0; padding: 18px; }
.activity-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.activity-viewall { background: none; border: none; padding: 0; font: inherit; font-size: var(--text-caption); font-weight: 600; color: var(--color-primary); cursor: pointer; white-space: nowrap; }
.activity-card .activity-list { flex: 1; }
/* Activity text, per the reference .act: the title (.activity-title) wraps
   normally and the muted entity (.activity-entity, see mapActivity() in
   client/recent-activity.js) is a block on its own line, like the reference
   small. No gap, clipping or ellipsis. Not scoped to .activity-card, so the
   Logs rows get the same layout. */
.activity-title { font-size: var(--text-body); font-weight: 400; color: var(--color-text); }
.activity-entity { display: block; font-size: var(--text-caption); font-weight: 400; color: var(--color-muted); }
`;

export { DASHBOARD_CSS };
