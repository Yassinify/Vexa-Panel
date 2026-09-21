export const STYLES = `
/* =====================================================================
   VEXA — visual design system, rebuilt from scratch from the supplied
   reference board (ChatGPT_Image_Sep_18__2026__04_02_40_AM.png). Every
   token below is taken directly from that board's labeled Color Palette,
   Typography, and Spacing & Radius panels — not carried over from any
   prior implementation. Class names / element ids referenced by
   client-script.js and the standalone pages (d1-setup.js,
   change-password-page.js, sub-page.js) are preserved exactly so no
   selector, DOM id, or inline handler needs to change — only the visual
   values behind them do.
   ===================================================================== */
:root {
  /* --- Color Palette (reference board, labeled swatches) --- */
  --color-primary: #E11D48;
  --color-primary-hover: #BE123C;
  --color-bg: #0B0B0F;
  --color-surface: #111317;
  --color-border: #1F1F24;
  --color-text: #F8FAFC;
  --color-muted: #9CA3AF;
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;
  --color-disabled: #4B5563;

  /* Derived-but-necessary variants (not separately swatched on the board,
     needed for hover/soft-fill/active states — built from the primary
     scale above, same hue family, not introduced from outside it). */
  --color-primary-active: #9F1239;
  --color-primary-soft: rgba(225, 29, 72, 0.14);
  --color-success-soft: rgba(16, 185, 129, 0.14);
  --color-warning-soft: rgba(245, 158, 11, 0.14);
  --color-error-soft: rgba(239, 68, 68, 0.14);
  --color-surface-raised: #26262c;
  --color-text-dim: #6b7280;

  /* --- Spacing Scale (reference board: xs 4 / sm 8 / md 12 / lg 16 /
     xl 24 / xxl 32) --- */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-xxl: 32px;

  /* Shared content width: .container and .topbar align to the same
     centered measure, so the page title and the content below it keep
     one left edge at wide viewports. */
  --container-max: 1180px;

  /* --- Border Radius (reference board: sm 4 / md 8 / lg 12 / xl 16) --- */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* --- Typography (reference board: H1 32/700, H2 24/600, H3 18/600,
     Body Large 16/400, Body 14/400, Caption 12/400) --- */
  --font-stack: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --mono-stack: 'SF Mono', Consolas, monospace;
  --text-h1: 32px;
  --text-h2: 24px;
  --text-h3: 18px;
  --text-body-lg: 16px;
  --text-body: 14px;
  --text-caption: 12px;

  /* Elevation: the board shows flat surfaces with hairline borders, not
     heavy drop shadows — shadows here stay restrained (depth cue only). */
  --shadow-card: 0 1px 2px rgba(0,0,0,.35), 0 1px 3px 1px rgba(0,0,0,.25);
  --shadow-raised: 0 1px 2px rgba(0,0,0,.45), 0 3px 10px 1px rgba(0,0,0,.35);
  --shadow-glow: 0 0 0 1px rgba(225,29,72,.28), 0 4px 16px rgba(225,29,72,.30);

  /* Back-compat aliases: a handful of inline styles in client-script.js /
     change-password-page.js reference these two tokens directly by name
     (--space-3, --accent-light, --text-muted, --mono-stack). Mapped onto
     the rebuilt scale above so those call sites keep working without
     editing files outside this task's current checkpoint. */
  --space-3: var(--space-md);
  --accent-light: #fb6f86;
  --text-muted: var(--color-muted);
}

* { box-sizing: border-box; }
html, body { height: 100%; }
html { color-scheme: dark; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body {
  margin: 0; min-height: 100vh;
  /* Ambient background per reference image 2: one large, soft crimson
     glow anchored above the upper-left, falling off smoothly into the
     near-black base. Pixel radii (not percentages) keep the glow the
     same size whatever the page height. Single gradient, no texture,
     no decorative shapes, no animation. Literal rgba of
     --color-primary, same convention as the --color-*-soft tokens. */
  background-color: var(--color-bg);
  background-image: radial-gradient(1200px 800px at 20% -160px,
    rgba(225,29,72,.20) 0%, rgba(225,29,72,.06) 45%, rgba(225,29,72,0) 72%);
  background-repeat: no-repeat;
  font-family: var(--font-stack); color: var(--color-text);
  font-size: var(--text-body); line-height: 1.5;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  -webkit-tap-highlight-color: transparent; overscroll-behavior-y: none;
}
h1, h2, h3, h4, h5, h6 { margin: 0; font-weight: 700; letter-spacing: -0.01em; }
p { margin: 0; }
* { scrollbar-width: thin; }
.table-wrap::-webkit-scrollbar, .modal-card::-webkit-scrollbar { height: 6px; width: 6px; }
.table-wrap::-webkit-scrollbar-thumb, .modal-card::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 4px; }
a { color: inherit; }

/* --- Surface: card --- */
.card {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-card);
}

/* --- Buttons (reference board: Primary Button filled + arrow accent,
   Secondary Button outlined/muted, Danger Button filled red-error) --- */
.btn-primary {
  background: var(--color-primary); border: 1px solid var(--color-primary); color: #fff;
  padding: var(--space-sm) var(--space-lg); border-radius: var(--radius-md);
  font-weight: 600; font-size: var(--text-body); line-height: 1.4; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-xs);
  transition: background .12s ease, border-color .12s ease, box-shadow .15s ease;
  box-shadow: var(--shadow-card); position: relative; overflow: hidden;
}
.btn-primary:hover { background: var(--color-primary-hover); border-color: var(--color-primary-hover); box-shadow: var(--shadow-raised), var(--shadow-glow); }
.btn-primary:active { background: var(--color-primary-active); border-color: var(--color-primary-active); box-shadow: var(--shadow-card); }
.btn-secondary {
  background: transparent; border: 1px solid var(--color-border); color: var(--color-text);
  padding: var(--space-sm) var(--space-lg); border-radius: var(--radius-md);
  font-weight: 500; font-size: var(--text-body); line-height: 1.4; cursor: pointer;
  transition: background .12s ease, border-color .12s ease, color .12s ease;
  position: relative; overflow: hidden;
}
.btn-secondary:hover { color: var(--accent-light); border-color: var(--color-primary-hover); background: var(--color-primary-soft); }
.btn-secondary:active { color: var(--color-primary-active); border-color: var(--color-primary-active); }
.btn-danger { background: var(--color-error); border-color: var(--color-error); color: #fff; font-weight: 600; }
.btn-danger:hover { background: #f87171; border-color: #f87171; color: #fff; }
.btn-danger:active { background: var(--color-error); border-color: var(--color-error); }
.btn-icon {
  background: transparent; border: none; color: var(--color-muted); cursor: pointer;
  width: 34px; height: 34px; font-size: 15px;
  border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  transition: background .15s ease, color .15s ease, transform .15s cubic-bezier(.34,1.56,.64,1);
  position: relative; overflow: hidden;
}
.btn-icon:hover { background: var(--color-primary-soft); color: var(--color-primary); transform: translateY(-1px) scale(1.06); }
.btn-icon:active { transform: translateY(0) scale(.94); transition-duration: .08s; }

/* --- Icons (Heroicons outline, inherited currentColor) --- */
.ui-icon { width: 17px; height: 17px; stroke: currentColor; fill: none; flex-shrink: 0; display: block; }
.nav-icon .ui-icon { width: 17px; height: 17px; }
.menu-icon .ui-icon { width: 20px; height: 20px; }
.empty-state-icon .ui-icon { width: 30px; height: 30px; margin: 0 auto; }
.sort-icon { display: inline-flex; vertical-align: middle; }
.btn-icon.icon-link { color: var(--color-primary); }
.btn-icon.icon-link:hover { background: var(--color-primary-soft); color: var(--color-primary); }
.btn-icon.icon-open { color: var(--color-success); }
.btn-icon.icon-open:hover { background: var(--color-success-soft); color: var(--color-success); }
.btn-icon.icon-merge { color: var(--color-muted); }
.btn-icon.icon-merge:hover { background: var(--color-surface-raised); color: var(--color-text); }
.btn-icon.icon-edit { color: var(--color-warning); }
.btn-icon.icon-edit:hover { background: var(--color-warning-soft); color: var(--color-warning); }
.btn-icon.icon-delete { color: var(--color-error); }
.btn-icon.icon-delete:hover { background: var(--color-error-soft); color: var(--color-error); transform: translateY(-1px) scale(1.06) rotate(-5deg); }

/* --- Inputs / selects (reference board: bordered, dark-filled, small
   leading-icon slot on "Input field") --- */
input, textarea, select {
  width: 100%; background: var(--color-bg); border: 1px solid var(--color-border);
  color: var(--color-text); padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md); font-size: var(--text-body); font-family: inherit;
  /* Same line-height the buttons use, so an input and the button beside
     it (.link-row, .toolbar) resolve to the same height. */
  line-height: 1.4;
  transition: border-color .12s ease, box-shadow .12s ease;
}
input::placeholder, textarea::placeholder { color: var(--color-text-dim); }
input:focus, textarea:focus, select:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-soft); }
button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: 2px solid var(--color-primary); outline-offset: 2px;
}
button:disabled, .btn-primary:disabled, .btn-secondary:disabled, .btn-danger:disabled {
  background: var(--color-surface); border-color: var(--color-border); color: var(--color-disabled);
  cursor: not-allowed; box-shadow: none; transform: none;
}
input:disabled, textarea:disabled, select:disabled {
  background: var(--color-surface); color: var(--color-disabled); cursor: not-allowed; border-color: var(--color-border);
}

/* --- Login card --- */
.login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: var(--space-xl); }
.login-card { width: 100%; max-width: 380px; padding: var(--space-xxl) var(--space-xl); text-align: center; }
.logo-glow { margin-bottom: var(--space-sm); width: 56px; height: 56px; border-radius: var(--radius-lg); }
.brand { font-weight: 700; font-size: var(--text-h3); letter-spacing: -.01em; margin-bottom: var(--space-xs); }
.brand-sub { color: var(--color-muted); font-size: var(--text-body); margin-bottom: var(--space-xl); }

/* --- App shell: sidebar + topbar (reference board Desktop/Tablet/
   Mobile panels) --- */
.app-shell { display: flex; min-height: 100vh; }
.sidebar {
  width: 232px; flex-shrink: 0; background: var(--color-bg); border-right: 1px solid var(--color-border);
  display: flex; flex-direction: column; padding: var(--space-lg) var(--space-md);
}
.sidebar-brand { display: flex; align-items: center; gap: var(--space-md); padding: var(--space-sm) var(--space-sm) var(--space-xl); }
.sidebar-brand .avatar {
  width: 32px; height: 32px; border-radius: var(--radius-md); background: var(--color-primary);
  display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; color: #fff;
  object-fit: cover;
}
.sidebar-brand .brand { color: var(--color-text); font-size: var(--text-body-lg); margin-bottom: 0; }
.sidebar-link {
  display: flex; align-items: center; gap: var(--space-md); padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md); margin-bottom: 2px;
  color: var(--color-muted); cursor: pointer; font-size: var(--text-body); font-weight: 500; text-decoration: none;
  transition: background .15s ease, color .15s ease, transform .15s ease;
  position: relative; overflow: hidden;
}
.sidebar-link:hover { background: var(--color-surface); color: var(--color-text); transform: translateX(2px); }
.sidebar-link.active { background: var(--color-primary); color: #fff; }
.sidebar-link .nav-icon { display: inline-flex; transition: transform .2s cubic-bezier(.34,1.56,.64,1); }
.sidebar-link.active .nav-icon { color: #fff; }
.sidebar-link:hover .nav-icon { transform: scale(1.1); }
.sidebar-footer { margin-top: auto; padding-top: var(--space-md); border-top: 1px solid var(--color-border); display: flex; flex-direction: column; gap: var(--space-sm); }
.main { flex: 1; min-width: 0; }
.menu-toggle-btn {
  display: none; align-items: center; justify-content: center;
  background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text);
  width: 40px; height: 40px; border-radius: var(--radius-md);
  cursor: pointer; flex-shrink: 0; transition: background .15s ease, color .15s ease, transform .2s ease;
}
.menu-toggle-btn:hover { background: var(--color-primary-soft); color: var(--color-primary); }
.menu-toggle-btn:active { transform: scale(.92); }
.menu-toggle-btn .menu-icon { display: inline-block; transition: transform .25s ease; }
.menu-toggle-btn.is-open .menu-icon { transform: rotate(90deg); }
.sidebar-backdrop {
  display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 39;
  opacity: 0; pointer-events: none; transition: opacity .2s ease;
}
.sidebar-backdrop.visible { opacity: 1; pointer-events: auto; }
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  /* Horizontal padding tracks .container's centered measure so the title
     shares its left edge; falls back to --space-xl below that width.
     The border/background still span the full width. */
  padding: var(--space-lg) max(var(--space-xl), calc((100% - var(--container-max)) / 2 + var(--space-xl)));
  border-bottom: 1px solid var(--color-border); background: var(--color-surface); gap: var(--space-md);
}
.topbar h1 {
  font-size: var(--text-h2); margin: 0; font-weight: 600; letter-spacing: -.01em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46vw;
}
.topbar-sub {
  color: var(--color-muted); font-size: var(--text-caption); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46vw;
}
.container { max-width: var(--container-max); margin: 0 auto; padding: var(--space-xl) var(--space-xl) 60px; }

/* --- Stat cards --- */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-lg); margin-bottom: var(--space-xl); }
.stat-card { padding: var(--space-lg) var(--space-xl); }
.stat-card-label { font-size: var(--text-caption); color: var(--color-muted); margin-bottom: var(--space-sm); }
.stat-card-num { font-size: var(--text-h1); font-weight: 700; letter-spacing: -.01em; }
/* Dashboard-only: small icon badge in each stat card's header row, per
   the reference board's Desktop/Tablet/Mobile Dashboard panels (each
   stat card leads with a colored icon-in-rounded-square). Built only
   from existing tokens; no new colors introduced. */
.stat-card-head { display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-md); }
/* .stat-card-label keeps margin-bottom: var(--space-sm) for its other use
   (stacked above .stat-card-num, no head wrapper). Inside .stat-card-head
   that margin was part of the label's flex-centered margin box, pushing
   the text 4px above the 34px icon's midline. Zeroing it only in this
   context centers the label against the icon without touching the
   stacked layout or the shared token. */
.stat-card-head .stat-card-label { margin-bottom: 0; }
.stat-card-icon {
  width: 34px; height: 34px; border-radius: var(--radius-md); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-primary-soft); color: var(--color-primary);
}
.stat-card-icon .ui-icon { width: 18px; height: 18px; }
/* --- User Growth chart (Dashboard), per the reference board's User Growth
   panel. The SVG only draws the gridlines, area and line with non-scaling
   strokes so it can stretch to any card width; the y values, date labels
   and the latest-point marker are HTML, so text never scales or distorts.
   The plot height (--growth-plot-h) and the note row are fixed, so the
   loading skeleton and the loaded card have the same height. --- */
.growth-card { --growth-plot-h: 200px; --growth-yaxis-w: 40px; padding: var(--space-lg) var(--space-xl); margin-bottom: var(--space-xl); }
.growth-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); margin-bottom: var(--space-lg); min-height: 28px; }
.growth-title { font-size: var(--text-body-lg); font-weight: 600; }
.growth-range { font-size: var(--text-caption); line-height: 1.4; color: var(--color-muted); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-xs) var(--space-md); white-space: nowrap; }
.growth-body { display: flex; gap: var(--space-sm); }
.growth-yaxis { position: relative; flex-shrink: 0; width: var(--growth-yaxis-w); height: var(--growth-plot-h); }
.growth-ytick { position: absolute; right: 0; transform: translateY(50%); font-size: var(--text-caption); line-height: 1; color: var(--color-muted); white-space: nowrap; }
.growth-plot { position: relative; flex: 1; min-width: 0; height: var(--growth-plot-h); }
.growth-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.growth-grid { stroke: var(--color-border); stroke-width: 1; vector-effect: non-scaling-stroke; }
.growth-line { fill: none; stroke: var(--color-primary); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.growth-stop-top { stop-color: var(--color-primary); stop-opacity: .35; }
.growth-stop-bottom { stop-color: var(--color-primary); stop-opacity: 0; }
.growth-dot { position: absolute; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%; background: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-soft); }
.growth-xaxis { position: relative; height: 16px; margin: var(--space-sm) 0 0 calc(var(--growth-yaxis-w) + var(--space-sm)); }
.growth-xlabel { position: absolute; top: 0; transform: translateX(-50%); font-size: var(--text-caption); line-height: 16px; color: var(--color-muted); white-space: nowrap; }
.growth-note { height: 18px; margin-top: var(--space-sm); font-size: var(--text-caption); line-height: 18px; color: var(--color-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* --- Dashboard row: User Growth + Recent Activity side by side, per the
   reference board's Desktop Dashboard; one column at 1024px and below.
   The row owns the spacing, so the growth card's own bottom margin is
   dropped inside it. --- */
.dash-row { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: var(--space-lg); align-items: stretch; margin-bottom: var(--space-xl); }
.dash-row .growth-card { margin-bottom: 0; }
/* Recent Activity card: reuses the Log page's .activity-row/.activity-icon/
   .activity-text/.activity-time. Rows stay on one line (ellipsis) so each is
   32px icon + 2 x space-md tall, and the list keeps room for four rows
   (4 x 56px + 3 borders + the list's own 2 x space-xs padding), so the card
   is the same height with fewer than four records. In the row it stretches
   to the growth card's height and clips any overflow. */
.activity-card { display: flex; flex-direction: column; min-width: 0; padding: 0; overflow: hidden; }
.activity-card-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); padding: var(--space-lg) var(--space-xl) var(--space-sm); min-height: calc(28px + var(--space-lg) + var(--space-sm)); }
.activity-viewall { background: none; border: none; padding: 0; font: inherit; font-size: var(--text-caption); font-weight: 600; color: var(--color-primary); cursor: pointer; white-space: nowrap; }
.activity-viewall:hover { color: var(--color-primary-hover); }
.activity-card .activity-list { flex: 1; min-height: calc(4 * (32px + 2 * var(--space-md)) + 3px + 2 * var(--space-xs)); overflow: hidden; }
.activity-card .activity-text { overflow: hidden; overflow-wrap: normal; text-overflow: ellipsis; white-space: nowrap; }
.section-title { font-size: var(--text-body); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--color-muted); margin: 0 0 var(--space-md); }
/* Log / activity list, per the reference board's "Recent Activity" card:
   each row leads with a small circular icon badge, then the event text,
   then a muted right-aligned relative time. Vexa's activity records only
   carry { message, ts } (activity table, src/d1.js), so there is no
   per-event type or subtitle to show — the badge is uniform, not a
   fabricated event-type indicator. */
.activity-list { padding: var(--space-xs) 0; }
.activity-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); padding: var(--space-md) var(--space-xl); border-bottom: 1px solid var(--color-border); font-size: var(--text-body); }
.activity-row:last-child { border-bottom: none; }
.activity-icon {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-primary-soft); color: var(--color-primary);
}
.activity-icon .ui-icon { width: 16px; height: 16px; }
.activity-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.activity-time { color: var(--color-muted); font-size: var(--text-caption); white-space: nowrap; }
.status-row { display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-sm) var(--space-xl); font-size: var(--text-body); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-success); box-shadow: 0 0 0 3px var(--color-success-soft); animation: status-pulse 2.4s ease-in-out infinite; }
@keyframes status-pulse {
  0%, 100% { box-shadow: 0 0 0 3px var(--color-success-soft); }
  50% { box-shadow: 0 0 0 6px transparent; }
}

/* --- Toolbar / search / table --- */
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: var(--space-md); margin-bottom: var(--space-lg); flex-wrap: wrap; }
.toolbar-left { display: flex; align-items: center; gap: var(--space-md); flex: 1; min-width: 200px; }
.mobile-fab {
  display: none; position: fixed; z-index: 30; align-items: center; justify-content: center;
  background: var(--color-primary); color: #fff; border: none; border-radius: 50%; cursor: pointer; overflow: hidden;
  width: 56px; height: 56px; box-shadow: var(--shadow-raised);
  transition: transform .15s cubic-bezier(.34,1.56,.64,1), background .15s ease;
}
.mobile-fab:hover { background: var(--color-primary-hover); transform: scale(1.05); }
.mobile-fab:active { transform: scale(.92); }
.mobile-fab .ui-icon { width: 24px; height: 24px; }
.search-input { max-width: 280px; }
.breadcrumb {
  display: flex; align-items: center; gap: var(--space-xs); color: var(--color-muted); font-size: var(--text-body);
  margin-bottom: var(--space-xs); white-space: nowrap; overflow: hidden;
}
.breadcrumb span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.breadcrumb a { cursor: pointer; }
.breadcrumb a:hover { color: var(--color-primary); }
.table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th {
  text-align: left; font-size: var(--text-caption); text-transform: uppercase; letter-spacing: .04em; color: var(--color-muted);
  padding: var(--space-sm) var(--space-lg); border-bottom: 1px solid var(--color-border); user-select: none; white-space: nowrap;
}
/* Only headers with a click handler (the sortable ones, marked by their
   onclick attribute in client-script.js) get the interactive cursor and
   hover treatment — a header with no handler has nothing to click. */
.data-table th[onclick] { cursor: pointer; }
.data-table th[onclick]:hover { color: var(--color-text); }
.data-table td { padding: var(--space-md) var(--space-lg); border-bottom: 1px solid var(--color-border); font-size: var(--text-body); vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.data-table tr.row-hover:hover { background: var(--color-primary-soft); }
.data-table.rows-animate tbody tr { animation: row-in .3s ease both; }
.data-table tbody tr:nth-child(1) { animation-delay: 0s; }
.data-table tbody tr:nth-child(2) { animation-delay: .03s; }
.data-table tbody tr:nth-child(3) { animation-delay: .06s; }
.data-table tbody tr:nth-child(4) { animation-delay: .09s; }
.data-table tbody tr:nth-child(5) { animation-delay: .12s; }
.data-table tbody tr:nth-child(n+6) { animation-delay: .15s; }
@keyframes row-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
.row-name {
  font-weight: 600; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 100%; display: inline-block; vertical-align: middle;
}
.row-name:hover { color: var(--color-primary); }
/* Wraps the QR/subscription-link icon button and the name on one line
   (Users table only). min-width:0 on both the wrapper and .row-name lets
   the name shrink to its own ellipsis instead of overflowing the row. */
.row-name-cell { display: flex; align-items: center; gap: var(--space-sm); min-width: 0; }
.row-name-cell .row-name { min-width: 0; flex: 1; }
.row-name-cell .btn-icon { flex-shrink: 0; }
.row-actions { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: nowrap; }

/* --- Badges (reference board: Success pill dot+label, Error pill
   dot+label) --- */
.badge-row { display: flex; gap: var(--space-sm); flex-wrap: wrap; }
.badge {
  font-size: var(--text-caption); padding: 3px var(--space-md); border-radius: 999px;
  background: var(--color-primary-soft); color: var(--color-primary);
  font-weight: 600; letter-spacing: .02em; border: 1px solid transparent; display: inline-flex; align-items: center;
  gap: 5px; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis;
}
.badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.badge.green { background: var(--color-success-soft); color: var(--color-success); }
.badge-row .btn-secondary { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }

/* --- Switch (reference board: pill toggle, filled-red = on) --- */
.switch { position: relative; overflow: hidden; width: 38px; height: 21px; border-radius: 999px; border: none; background: var(--color-surface); cursor: pointer; padding: 0; flex-shrink: 0; transition: background .15s ease; }
.switch.on { background: var(--color-primary); }
.switch.pending { cursor: default; pointer-events: none; }
.switch-knob { position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: transform .15s ease; }
.switch.on .switch-knob { transform: translateX(17px); }
.spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--color-border); border-top-color: var(--color-primary); border-radius: 50%; animation: spin .6s linear infinite; vertical-align: middle; flex-shrink: 0; }
/* Centered with inset + margin:auto instead of a transform, so the shared
   spin keyframes' rotate() has no translate to replace and the ring turns
   in place. */
.switch-spinner { position: absolute; top: 0; right: 0; bottom: 0; left: 0; margin: auto; width: 13px; height: 13px; border-width: 2px; }
@keyframes spin { to { transform: rotate(360deg); } }

/* --- Ripple ink (see ripple-script.js for the JS half) --- */
.ripple-ink {
  position: absolute; border-radius: 50%; transform: scale(0); pointer-events: none;
  animation: ripple-anim .5s cubic-bezier(.4,0,.2,1) forwards;
}
@keyframes ripple-anim { to { transform: scale(1); opacity: 0; } }

.format-menu { display: flex; flex-direction: column; gap: var(--space-sm); margin-bottom: var(--space-sm); }
.format-menu-item {
  display: flex; align-items: center; justify-content: space-between; width: 100%;
  padding: var(--space-md); font-size: var(--text-body); font-weight: 600; color: var(--color-text);
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md);
  cursor: pointer; transition: background .15s ease, border-color .15s ease, box-shadow .15s ease;
  box-shadow: var(--shadow-card); position: relative; overflow: hidden;
}
.format-menu-item:hover { background: var(--color-primary-soft); border-color: var(--color-primary); box-shadow: var(--shadow-raised); }
.format-menu-arrow { color: var(--color-muted); font-size: 15px; }

.timestamp { color: var(--color-muted); font-size: var(--text-caption); }
.empty-state { text-align: center; padding: 60px var(--space-lg); color: var(--color-muted); }
.empty-state-icon {
  margin-bottom: var(--space-sm); opacity: .85; color: var(--color-primary);
  display: inline-block; animation: empty-float 3s ease-in-out infinite;
}
@keyframes empty-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

/* --- Skeletons --- */
.skel { display: block; background: var(--color-bg); border-radius: 4px; position: relative; overflow: hidden; }
.skel::after {
  content: ""; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, var(--color-primary-soft), transparent);
  animation: skel-shimmer 1.4s ease-in-out infinite;
}
@keyframes skel-shimmer { 100% { transform: translateX(100%); } }
.skel-row-actions { display: flex; gap: var(--space-xs); justify-content: flex-end; }

/* --- Modals / confirm dialog / toasts --- */
@keyframes modal-overlay-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes modal-card-in { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center;
  padding: var(--space-lg); z-index: 50; animation: modal-overlay-in .18s ease both;
}
.modal-card { width: 100%; max-width: 520px; padding: var(--space-xl); max-height: 85vh; overflow-y: auto; animation: modal-card-in .22s cubic-bezier(.2,.8,.3,1) both; }
.modal-card.small { max-width: 400px; }
.modal-title { font-size: var(--text-h3); font-weight: 600; margin-bottom: var(--space-lg); }
.field-label { font-size: var(--text-caption); text-transform: uppercase; letter-spacing: .04em; color: var(--color-muted); margin-bottom: var(--space-xs); display: block; }
.field-group { margin-bottom: var(--space-lg); }
.source-repeater { display: flex; flex-direction: column; gap: var(--space-sm); margin-bottom: var(--space-sm); }
.source-row { display: flex; gap: var(--space-sm); align-items: flex-start; }
.source-row-input { flex: 1; min-width: 0; font-family: var(--mono-stack); font-size: var(--text-caption); resize: vertical; }
.source-row .btn-icon { flex-shrink: 0; margin-top: 2px; }
.modal-footer { display: flex; justify-content: flex-end; gap: var(--space-sm); margin-top: var(--space-sm); }
.stat-row { display: flex; gap: var(--space-md); margin-bottom: var(--space-lg); flex-wrap: wrap; }
.stat-box { flex: 1; min-width: 100px; text-align: center; padding: var(--space-lg); background: var(--color-bg); border-radius: var(--radius-md); border: 1px solid var(--color-border); box-shadow: var(--shadow-card); }
.stat-num { font-size: var(--text-h3); font-weight: 700; }
.stat-label { font-size: var(--text-caption); color: var(--color-muted); margin-top: var(--space-xs); }
.qr-box { background: #fff; border-radius: var(--radius-lg); padding: var(--space-lg); display: flex; align-items: center; justify-content: center; margin: var(--space-lg) 0; }
.qr-box svg { width: 160px; height: 160px; }
.link-row { display: flex; gap: var(--space-sm); align-items: stretch; }
.link-row input { min-width: 0; font-family: var(--mono-stack); font-size: var(--text-caption); }
@keyframes toast-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.toast {
  position: fixed; bottom: var(--space-xl); right: var(--space-xl); max-width: min(340px, calc(100vw - 48px));
  background: var(--color-surface-raised); border: 1px solid var(--color-success-soft); color: var(--color-success);
  padding: var(--space-sm) var(--space-xl); border-radius: var(--radius-md); font-size: var(--text-body);
  z-index: 100; box-shadow: var(--shadow-raised); animation: toast-in .2s cubic-bezier(.2,.8,.3,1) both;
}
.toast.error { border-color: var(--color-error-soft); color: var(--color-error); }
.version-badge {
  position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%);
  background: var(--color-surface-raised); border: 1px solid var(--color-border);
  color: var(--color-muted); font-family: var(--mono-stack); font-size: 11px;
  letter-spacing: .02em; padding: 4px var(--space-md); border-radius: 20px;
  z-index: 20; cursor: pointer; text-decoration: none; display: inline-block;
}
.version-badge:hover { color: var(--color-text); border-color: var(--color-primary); }
.error-text { color: var(--color-error); font-size: var(--text-body); margin-top: var(--space-sm); min-height: 16px; }
.helper-text { color: var(--color-muted); font-size: var(--text-caption); margin-top: var(--space-xs); }

.setup-steps { list-style: none; margin: 0 0 var(--space-xl); padding: 0; display: flex; flex-direction: column; gap: var(--space-sm); counter-reset: setup-step; }
.setup-steps li {
  counter-increment: setup-step;
  display: flex; align-items: flex-start; gap: var(--space-md);
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md);
  padding: var(--space-md) var(--space-lg); line-height: 1.55;
}
.setup-steps li::before {
  content: counter(setup-step);
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
  background: var(--color-primary-soft); color: var(--color-primary); font-weight: 700; font-size: var(--text-caption);
  display: flex; align-items: center; justify-content: center; margin-top: 1px;
}

/* --- Responsive tiers, rebuilt against the reference board's Desktop /
   Tablet / Mobile panels: Tablet narrows the sidebar and tightens
   margins; Mobile drops the sidebar to an off-canvas drawer behind the
   hamburger and switches to a bottom tab bar + FAB, tables become
   stacked cards. --- */
@media (max-width: 1024px) {
  .sidebar { width: 200px; }
  .topbar { padding-left: var(--space-lg); padding-right: var(--space-lg); }
  .container { padding: var(--space-xl) var(--space-lg) 60px; }
  .dash-row { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 780px) {
  .menu-toggle-btn { display: flex; }
  .sidebar-backdrop { display: block; }
  .sidebar {
    position: fixed; z-index: 40; top: 0; left: 0; height: 100vh; width: 250px;
    transform: translateX(-100%); transition: transform .2s ease;
  }
  .sidebar.open { transform: translateX(0); }
  .topbar { padding: var(--space-md) var(--space-lg); }
  .container { padding: var(--space-lg) var(--space-lg) 60px; }
  .modal-card { max-width: 100%; }
  input, textarea, select { font-size: 16px; }
  /* Skeleton search bar: its inline height is derived from the 14px body size.
     min-height raises it to the 16px input above (16px x 1.4 + 2 x --space-sm + 2px
     border). Only the skeleton has .skel; the loaded input is unaffected. */
  .skel.search-input { min-height: calc(16px * 1.4 + var(--space-sm) * 2 + 2px); }
  .stat-grid { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
  .desktop-only-action { display: none; }
  .mobile-fab {
    display: flex; right: max(18px, env(safe-area-inset-right));
    bottom: max(18px, env(safe-area-inset-bottom, 0px) + 18px);
  }
  .table-wrap { overflow-x: hidden; }
  .data-table, .data-table tbody, .data-table tr, .data-table td { display: block; width: 100%; }
  .data-table thead { display: none; }
  .data-table tr {
    border: 1px solid var(--color-border); border-radius: var(--radius-lg); margin-bottom: var(--space-md);
    padding: var(--space-md) var(--space-lg); background: var(--color-surface);
  }
  .data-table tr:last-child { margin-bottom: 0; }
  .data-table td {
    border-bottom: none; padding: 7px 0; display: flex; align-items: center;
    justify-content: space-between; gap: var(--space-md); white-space: normal;
  }
  .data-table td:not([data-label=""])::before {
    content: attr(data-label); font-size: var(--text-caption); font-weight: 600; text-transform: uppercase;
    letter-spacing: .04em; color: var(--color-muted); flex-shrink: 0;
  }
  .data-table td[data-label=""] { justify-content: flex-end; padding-top: var(--space-sm); margin-top: 4px; border-top: 1px solid var(--color-border); }
  .data-table td[data-label="Name"] { padding-top: 0; }
  .data-table td[data-label="Name"] .row-name { max-width: calc(62vw - 42px); }
  .row-actions { gap: 2px; }
  .skel-row-actions { gap: 2px; }
  /* A flex cell is as tall as the taller of its label (18px) and its value. The
     skeleton date bars are shorter than a 14px x 1.5 = 21px value line, so
     their cells came out 3px short. Margins pad each bar's box to that line
     (bar height 12px, set inline in client-script.js); the bars themselves
     keep their size. Loaded cells never contain a .skel. The Name cell's own
     34px icon placeholder (row-name-cell, already centered via its
     align-items:center) is taller than that value line, so it needs no
     such margin. */
  .data-table td[data-label="Updated"] > .skel,
  .data-table td[data-label="Created At"] > .skel { margin-block: calc((var(--text-body) * 1.5 - 12px) / 2); }
  .card { border-radius: var(--radius-lg); }
  html, body { overflow-x: hidden; max-width: 100vw; }
  .toast { bottom: calc(94px + env(safe-area-inset-bottom, 0px)); }
}
@media (max-width: 480px) {
  .stat-grid { grid-template-columns: 1fr; }
  .toolbar { flex-direction: column; align-items: stretch; }
  .toolbar-left, .search-input { max-width: none; width: 100%; }
  .login-card { padding: var(--space-xl) var(--space-lg); }
  .stat-row { flex-direction: column; }
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal-card { max-height: 92vh; border-radius: var(--radius-xl) var(--radius-xl) 0 0; padding: var(--space-md) var(--space-lg) var(--space-xl); position: relative; }
  .modal-card::before {
    content: ""; position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
    width: 36px; height: 4px; border-radius: 999px; background: var(--color-border);
  }
  .modal-title { margin-top: var(--space-sm); }
  .modal-footer { flex-direction: column-reverse; gap: var(--space-sm); }
  .modal-footer button { width: 100%; padding: var(--space-md) 15px; }
  .card { border-radius: var(--radius-md); }
  .growth-card { --growth-plot-h: 160px; }
  .growth-xlabel:nth-child(even) { display: none; }
  .data-table tr { border-radius: var(--radius-md); padding: var(--space-md); }
  .stat-box { border-radius: var(--radius-sm); }
  .badge, .switch { border-radius: 999px; }
  .topbar h1, .breadcrumb, .stat-card-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
@media (hover: none) {
  .btn-primary:hover { background: var(--color-primary); border-color: var(--color-primary); }
  .btn-secondary:hover { background: transparent; border-color: var(--color-border); color: var(--color-text); }
  .btn-danger:hover, .btn-danger.btn-secondary:hover { background: var(--color-error); border-color: var(--color-error); color: #fff; }
  .btn-icon:hover { background: transparent; color: var(--color-muted); }
  .data-table tr.row-hover:hover { background: transparent; }
}
.toast { padding-bottom: max(10px, env(safe-area-inset-bottom)); right: max(16px, env(safe-area-inset-right)); }
.version-badge { bottom: max(10px, env(safe-area-inset-bottom)); }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;
