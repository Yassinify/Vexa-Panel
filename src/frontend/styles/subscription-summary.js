export const SUBSCRIPTION_SUMMARY_CSS = `
/* QR box: a 180px white square with 10px padding (the QR itself is 160px), centered, 14px below (reference .qr). */
.qr-box { width: 180px; height: 180px; background: #fff; border-radius: var(--radius-md); padding: 10px; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; }
.qr-box svg { width: 100%; height: 100%; }
/* Link row: 8px gap and 14px vertical margin (reference .copy); the field keeps the normal input font. */
.link-row { display: flex; gap: var(--space-sm); align-items: stretch; margin: 14px 0; }
.link-row input { min-width: 0; }
`;
