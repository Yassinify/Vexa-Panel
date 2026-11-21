export const SUBSCRIPTION_SUMMARY_CSS = `
/* QR box: a 180px white square with 10px padding (the QR itself is 160px), centered, 14px below (reference .qr). */
.qr-box { width: 180px; height: 180px; background: #fff; border-radius: var(--radius-md); padding: 10px; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; }
.qr-box svg { width: 100%; height: 100%; }
/* Link row: 8px gap and 14px vertical margin (reference .copy); the field keeps the normal input font. */
.link-row { display: flex; gap: var(--space-sm); align-items: stretch; margin: 14px 0; }
.link-row input { min-width: 0; }
/* Popup blocks: the Normal block and the JSON block sit side by side (Normal on the left) and share the width
   equally; at 760px and below they stack with the Normal block on top. A lone block fills the row as before. */
.sub-blocks { display: flex; flex-direction: row; align-items: flex-start; gap: var(--space-lg); }
.sub-block { flex: 1 1 0; min-width: 0; }
/* Block title (both-mode only): a fixed 24px high, so the QR boxes of both blocks start at the same height. */
.sub-block-title { height: 24px; line-height: 24px; font-size: var(--text-body-lg); font-weight: 600; margin: 0 0 var(--space-md); }
/* Plus icon between the two blocks (both-mode only): muted, 32px. Side by side it is centered on the QR boxes:
   their centre is the title (24px) + the gap below it + half of the 180px box from the top of the row, and
   the icon is lifted by half of its own height (16px). Stacked it is centered on the width instead. */
.sub-plus { flex: none; align-self: flex-start; margin-top: calc(24px + var(--space-md) + 90px - 16px); display: grid; place-items: center; color: var(--color-muted); }
.sub-plus .ui-icon { width: 32px; height: 32px; }
@media (max-width: 760px) {
  .sub-blocks { flex-direction: column; align-items: stretch; }
  .sub-block { flex: none; }
  .sub-plus { align-self: center; margin-top: 0; }
}
`;
