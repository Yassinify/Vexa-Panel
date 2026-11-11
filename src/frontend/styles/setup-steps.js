export const SETUP_STEPS_CSS = `
/* --- D1 setup guide: wide card, horizontal stepper, detail panel, footer --- */
.setup-card { width: 100%; max-width: 920px; padding: var(--space-xl); }
.setup-brand { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 500; margin-bottom: var(--space-lg); }
.setup-inner { background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: var(--radius-xl); padding: 28px; }

/* Header: icon tile, title and subtitle. */
.setup-head { display: flex; align-items: center; gap: var(--space-lg); padding-bottom: 22px; border-bottom: 1px solid var(--color-border); }
.setup-head-icon {
  flex-shrink: 0; width: 56px; height: 56px; border-radius: 50%;
  background: var(--color-warning-soft); color: var(--color-warning);
  display: flex; align-items: center; justify-content: center;
}
.setup-head-icon svg { width: 28px; height: 28px; }
.setup-head h1 { font-size: var(--text-h1); font-weight: 700; line-height: 1.15; }
.setup-sub { color: var(--color-muted); font-size: var(--text-body-lg); margin-top: var(--space-xs); }
.setup-intro { margin: 22px 0 var(--space-lg); }

/* Stepper: numbered circles joined by a line; never scrolls sideways (labels hide and circles shrink on narrow screens). */
.setup-stepper { --setup-num: 44px; list-style: none; padding: 0; display: flex; }
.setup-stepper li { position: relative; flex: 1 1 0; min-width: 0; }
/* Connector: runs from this circle to the next one (circle size is --setup-num). */
.setup-stepper li:not(:last-child)::after {
  content: ""; position: absolute; top: calc(var(--setup-num) / 2 - 1px); left: calc(50% + var(--setup-num) / 2); width: calc(100% - var(--setup-num));
  height: 2px; background: var(--color-border);
}
.setup-stepper li.is-done:not(:last-child)::after { background: var(--color-primary); }
.setup-step-btn {
  width: 100%; display: flex; flex-direction: column; align-items: center; gap: 10px;
  background: none; border: 0; padding: 0; cursor: pointer; color: var(--color-muted);
}
.setup-step-btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; border-radius: var(--radius-md); }
.setup-step-num {
  position: relative; z-index: 1; width: var(--setup-num); height: var(--setup-num); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-surface); border: 1px solid var(--color-border);
  color: var(--color-text); font-size: 18px; font-weight: 600;
}
.setup-step-label { font-size: var(--text-caption); font-weight: 500; line-height: 1.3; text-align: center; padding: 0 var(--space-xs); overflow-wrap: anywhere; }
.is-done .setup-step-num { background: var(--color-primary-soft); border-color: transparent; color: var(--color-primary); }
.is-active .setup-step-num { background: var(--color-primary); border-color: transparent; color: #fff; box-shadow: 0 0 0 4px var(--color-primary-soft); }
.is-active .setup-step-label { color: var(--color-text); }

/* Detail panel: dashboard mock on the left, step text on the right. */
.setup-detail { margin-top: 22px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-xl); padding: 20px; }
.setup-pane { display: none; grid-template-columns: 240px minmax(0, 1fr); gap: 28px; align-items: start; }
.setup-pane.is-active { display: grid; }
.setup-mock { background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 14px; }
.setup-mock-brand { color: var(--color-warning); font-size: var(--text-caption); font-weight: 700; letter-spacing: .12em; padding: 4px 6px 12px; border-bottom: 1px solid var(--color-border); margin-bottom: var(--space-sm); }
/* Platform brand headers: logo left of the name, in that platform's font and colors (GitHub: Primer's system font stack; Cloudflare: Inter, its brand typeface, with the orange cloud; Vexa Panel: the panel's own font and theme text color, with the V mark). */
.setup-mock-brand-github, .setup-mock-brand-cloudflare, .setup-mock-brand-vexa { display: flex; align-items: center; gap: 8px; }
.setup-mock-logo { flex-shrink: 0; }
.setup-mock-brand-github { color: #f0f6fc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; font-weight: 600; letter-spacing: .04em; }
:root[data-theme="light"] .setup-mock-brand-github { color: #1f2328; }
.setup-mock-brand-cloudflare { color: var(--color-text); font-family: Inter, sans-serif; font-weight: 500; }
.setup-mock-brand-vexa { color: var(--color-text); font-family: var(--font-stack); font-weight: 600; }
.setup-mock-item { font-size: 13px; color: var(--color-muted); padding: 7px 10px; border-radius: var(--radius-md); border-left: 2px solid transparent; }
/* Current row: same look as the panel's active sidebar item (.sidebar-link.active in app-shell.js). */
.setup-mock-item.is-current { background: var(--color-primary-hover); border-radius: var(--radius-lg); color: #fff; }
.setup-mock-item.is-target { color: var(--color-primary); font-weight: 600; }
.setup-mock-sub { padding-left: var(--space-lg); }
.setup-body h2 { font-size: var(--text-h3); font-weight: 600; margin-bottom: var(--space-sm); }
.setup-body p { color: var(--color-muted); line-height: 1.6; margin-bottom: var(--space-sm); }
.setup-body strong { color: var(--color-text); font-weight: 600; }
.setup-body code { background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 1px 6px; color: var(--color-text); }
.setup-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); margin-top: var(--space-lg); }
.setup-actions a { text-decoration: none; }
/* Back / Next row: between the stepper and the detail panel, right-aligned above the panel's top-right corner. */
.setup-actions-nav { justify-content: flex-end; margin-top: 22px; }
.setup-actions-nav + .setup-detail { margin-top: var(--space-sm); }

/* Footer: info note on the left, reload button on the right. */
.setup-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-lg); margin-top: 22px; padding-top: var(--space-lg); border-top: 1px solid var(--color-border); }
.setup-note { display: flex; align-items: center; gap: 10px; color: var(--color-muted); }
.setup-note svg { flex-shrink: 0; width: 18px; height: 18px; }

/* Below 961px ten labels no longer fit their slots: the stepper keeps only the numbers (the step title is shown in the detail panel). */
@media (max-width: 960px) {
  .setup-stepper { --setup-num: 36px; }
  .setup-step-label { display: none; }
  .setup-step-num { font-size: var(--text-body); }
  .is-active .setup-step-num { box-shadow: 0 0 0 3px var(--color-primary-soft); }
}

@media (max-width: 760px) {
  .setup-card { padding: var(--space-lg); }
  .setup-inner { padding: var(--space-lg); }
  .setup-head h1 { font-size: var(--text-h2); }
  .setup-pane { grid-template-columns: minmax(0, 1fr); gap: var(--space-lg); }
  .setup-footer { flex-direction: column; align-items: stretch; }
  .setup-footer .btn-primary { width: 100%; }
}

/* Smaller circles keep all 10 steps on one row (a slot is about a tenth of the stepper width). */
@media (max-width: 600px) {
  .setup-stepper { --setup-num: 28px; }
}

/* Very narrow screens: smaller circles and padding so all 10 steps fit without scrolling. */
@media (max-width: 480px) {
  .setup-card, .setup-inner { padding: var(--space-md); }
  .setup-stepper { --setup-num: 22px; }
  .setup-step-num { font-size: var(--text-caption); }
}

@media (max-width: 360px) {
  .setup-stepper { --setup-num: 20px; }
}
`;
