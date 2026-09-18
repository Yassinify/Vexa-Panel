export const STYLES = `
:root {
  /* 4px/8px spacing scale (Carbon-style 2x grid) — layout paddings, gaps,
     and margins below are chosen from this scale rather than ad hoc values,
     so spacing stays consistent across the whole panel. */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
}
:root {
  /* --- Design system: near-black + deep-red accent (see docs/how-program-work.md
     Change Log for the redesign this replaces). Every component below reads
     these tokens rather than a hardcoded color, so the palette below is the
     single source of truth for the whole panel's visual language. Red is
     reserved for primary actions, active/selected state, and error state —
     deliberately NOT used as a general decorative color, per the "avoid
     excessive red" constraint this palette was built against. */
  --bg-page: #0b0b0e;
  --bg-surface: #111317;
  --bg-surface-raised: #17191e;
  --bg-surface-raised: color-mix(in srgb, var(--accent) 3%, #17191e);
  --border: rgba(255,255,255,0.08);
  --accent: #e11d48;
  --accent-hover: #be123c;
  --accent-active: #9f1239;
  --accent-light: #fb6f86;
  --accent-strong: #9f1239;
  --accent-soft: rgba(225,29,72,0.14);
  --good: #10b981;
  --good-soft: rgba(16,185,129,0.14);
  --warn: #f59e0b;
  --warn-soft: rgba(245,158,11,0.14);
  --bad: #ef4444;
  --bad-light: #f87171;
  --bad-soft: rgba(239,68,68,0.14);
  --disabled: #4b5563;
  --text-primary: #f8fafc;
  --text-secondary: #a9afbc;
  --text-muted: #9ca3af;
  --sidebar-bg: #0d0e11;
  --sidebar-text: #9ca3af;
  --sidebar-active-bg: rgba(225,29,72,0.12);
  --sidebar-active-text: #ffffff;
  --font-stack: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --mono-stack: 'SF Mono', Consolas, monospace;
  /* Radius hierarchy: sm for tight inline chips, md for the controls a user
     directly operates (buttons/inputs/menu items), lg for cards/panels, xl
     for full-screen containers like modals and the mobile bottom sheet.
     Badges/switches intentionally stay pill-shaped (999px) as the one
     deliberate exception for status/toggle controls, not part of this scale. */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  /* Elevation shadows stay neutral/restrained (not colored) so they read as
     depth rather than decoration; the one deliberate exception is the small
     red-tinted glow added to .btn-primary:hover below, kept to that single
     spot per the "restrained glow where appropriate" constraint. */
  --shadow-1: 0 1px 2px rgba(0,0,0,.4), 0 1px 3px 1px rgba(0,0,0,.3);
  --shadow-2: 0 1px 2px rgba(0,0,0,.5), 0 3px 8px 1px rgba(0,0,0,.4);
}
* { box-sizing: border-box; }
html, body { height: 100%; }
html { color-scheme: dark; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body {
  margin: 0; min-height: 100vh; background: var(--bg-page);
  font-family: var(--font-stack); color: var(--text-primary); font-size: clamp(13px, 1.1vw + 11px, 14px);
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  -webkit-tap-highlight-color: transparent; overscroll-behavior-y: none;
}
/* Thin scrollbars on the browsers that support each API — Firefox via the
   standard property, Chrome/Safari/Edge via the older webkit pseudo-element. */
* { scrollbar-width: thin; }
.table-wrap::-webkit-scrollbar, .modal-card::-webkit-scrollbar { height: 6px; width: 6px; }
.table-wrap::-webkit-scrollbar-thumb, .modal-card::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
a { color: inherit; }
.card {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-1);
}
.btn-primary {
  background: var(--accent); border: 1px solid var(--accent); color: #fff; padding: 10px 20px; border-radius: var(--radius-md);
  font-weight: 600; cursor: pointer; font-size: 13px; line-height: 1.4; transition: background .1s, border-color .1s, box-shadow .15s ease;
  box-shadow: var(--shadow-1); position: relative; overflow: hidden;
}
/* The one deliberate colored glow in this system (see the --shadow-1/2
   comment above) — a restrained red-tinted lift on the primary action's
   hover, not applied to any other component. */
.btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); box-shadow: var(--shadow-2), 0 0 0 1px rgba(225,29,72,.25), 0 4px 16px rgba(225,29,72,.28); }
.btn-primary:active { background: var(--accent-active); border-color: var(--accent-active); box-shadow: var(--shadow-1); }
.btn-secondary {
  background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary);
  padding: 9px 16px; border-radius: var(--radius-md); cursor: pointer; font-size: 13px; font-weight: 500; line-height: 1.4;
  transition: background .1s, border-color .1s, color .1s;
  position: relative; overflow: hidden;
}
.btn-secondary:hover { color: var(--accent-light); border-color: var(--accent-hover); background: var(--accent-soft); }
.btn-secondary:active { color: var(--accent-active); border-color: var(--accent-active); }
.btn-danger { background: var(--bad); border-color: var(--bad); color: #fff; font-weight: 600; }
.btn-danger:hover { background: var(--bad-light); border-color: var(--bad-light); color: #fff; }
.btn-danger:active { background: var(--bad); border-color: var(--bad); }
.btn-icon {
  background: transparent; border: none; color: var(--text-muted); cursor: pointer;
  /* Fluid across the full 320px–3840px+ range: bigger near mobile widths
     (better tap target), settles to a compact desktop size by ~1024px,
     then holds flat on larger screens instead of shrinking further. */
  font-size: clamp(13px, calc(16px - 0.35vw), 16px);
  width: clamp(32px, calc(40px - 1.2vw), 40px); height: clamp(32px, calc(40px - 1.2vw), 40px);
  border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  transition: background .15s ease, color .15s ease, transform .15s cubic-bezier(.34,1.56,.64,1);
  position: relative; overflow: hidden;
}
.btn-icon:hover { background: var(--accent-soft); color: var(--accent); transform: translateY(-2px) scale(1.08); }
.btn-icon:active { transform: translateY(0) scale(.94); transition-duration: .08s; }
/* Inline SVG icons (Heroicons outline) replace the old emoji glyphs. They
   inherit color via currentColor/stroke, so every .icon-* hue rule and
   hover state below applies to them the same way it did to text glyphs —
   no separate color logic needed. Sized to roughly match cap-height of the
   emoji they replaced, fluidly via clamp() so they scale with the button. */
.ui-icon {
  width: clamp(15px, calc(18px - 0.35vw), 18px); height: clamp(15px, calc(18px - 0.35vw), 18px);
  stroke: currentColor; fill: none; flex-shrink: 0; display: block;
}
.nav-icon .ui-icon { width: 17px; height: 17px; }
.menu-icon .ui-icon { width: clamp(18px, 4.4vw, 22px); height: clamp(18px, 4.4vw, 22px); }
.empty-state-icon .ui-icon { width: clamp(26px, 7vw, 32px); height: clamp(26px, 7vw, 32px); margin: 0 auto; }
/* Dedicated wrapper for table sort indicator icons — separate from .nav-icon,
   which is scoped to .sidebar-link and shouldn't be reused elsewhere. */
.sort-icon {
  display: inline-flex;
  vertical-align: middle;
}
/* Purpose-colored icon accents — each action gets its own hue so the row
   actions read at a glance instead of sitting in flat neutral gray. Resting
   state is the full hue (vibrant, not washed out); hover/focus deepens it
   with a tinted background for feedback. */
/* Plain-color fallback first (older Safari/Firefox without color-mix()
   support just get the flat hue at rest), then color-mix() overrides it
   with a near-full-strength tint on browsers that support it — mixed
   mostly with itself and only a touch of --text-muted so it stays vivid
   instead of fading toward gray. Cascade order, not @supports, keeps this
   terse across six repeated icon variants. */
.btn-icon.icon-link { color: var(--accent); color: color-mix(in srgb, var(--accent) 95%, var(--text-muted)); }
.btn-icon.icon-link:hover { background: var(--accent-soft); color: var(--accent); }
.btn-icon.icon-open { color: var(--good); color: color-mix(in srgb, var(--good) 95%, var(--text-muted)); }
.btn-icon.icon-open:hover { background: var(--good-soft); color: var(--good); }
.btn-icon.icon-merge { color: #a78bfa; color: color-mix(in srgb, #a78bfa 95%, var(--text-muted)); }
.btn-icon.icon-merge:hover { background: rgba(167,139,250,0.16); color: #a78bfa; }
.btn-icon.icon-edit { color: #f0a020; color: color-mix(in srgb, #f0a020 95%, var(--text-muted)); }
.btn-icon.icon-edit:hover { background: rgba(240,160,32,0.16); color: #f0a020; }
.btn-icon.icon-delete { color: var(--bad); color: color-mix(in srgb, var(--bad) 95%, var(--text-muted)); }
.btn-icon.icon-delete:hover { background: var(--bad-soft); color: var(--bad); transform: translateY(-2px) scale(1.08) rotate(-6deg); }
input, textarea, select {
  width: 100%; background: var(--bg-surface); border: 1px solid var(--border);
  color: var(--text-primary); padding: 10px 12px; border-radius: var(--radius-md); font-size: 13px; font-family: inherit;
  transition: border-color .1s, box-shadow .1s;
}
input:focus, textarea:focus, select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
/* Consistent keyboard-focus ring across every interactive element, so
   tabbing through the panel never relies on the browser's inconsistent
   default outline. Mouse/touch clicks don't trigger :focus-visible, so
   this never shows up as an unwanted ring on click. */
button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}
/* Disabled state: consistent across every button/input variant so a
   disabled control is unambiguous at a glance (Doherty Threshold — no
   guessing whether a click is pending or blocked) rather than relying on
   the browser's inconsistent default disabled look. */
button:disabled, .btn-primary:disabled, .btn-secondary:disabled, .btn-danger:disabled {
  background: var(--bg-surface-raised); border-color: var(--border); color: var(--disabled);
  cursor: not-allowed; box-shadow: none; transform: none;
}
input:disabled, textarea:disabled, select:disabled {
  background: var(--bg-surface-raised); color: var(--disabled); cursor: not-allowed; border-color: var(--border);
}
.login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
.login-card { width: 100%; max-width: 380px; padding: 36px 32px; text-align: center; }
.logo-glow { margin-bottom: 8px; width: clamp(48px, 14vw, 64px); height: clamp(48px, 14vw, 64px); border-radius: var(--radius-lg); }
.brand { font-weight: 700; font-size: clamp(17px, 1.6vw + 13px, 20px); letter-spacing: -.01em; margin-bottom: 4px; }
.brand-sub { color: var(--text-secondary); font-size: 13px; margin-bottom: 24px; }

/* --- App shell: sidebar + topbar, 3x-ui style --- */
.app-shell { display: flex; min-height: 100vh; }
.sidebar {
  width: 220px; flex-shrink: 0; background: var(--sidebar-bg); border-right: 1px solid rgba(0,0,0,.2);
  display: flex; flex-direction: column; padding: 16px 12px;
}
.sidebar-brand { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-2) var(--space-5); }
.sidebar-brand .avatar {
  width: 30px; height: 30px; border-radius: var(--radius-md); background: var(--accent);
  display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; color: #fff;
  object-fit: cover;
}
.sidebar-brand .brand { color: var(--accent-light); }
/* Active/hover state stays a subtle red-tinted fill (not a solid red block)
   plus a left accent bar, per the "avoid excessive red" constraint — Von
   Restorff distinction without turning navigation into a red banner. */
.sidebar-link {
  display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); margin-bottom: 2px;
  color: var(--sidebar-text); cursor: pointer; font-size: 13px; font-weight: 500; text-decoration: none;
  transition: background .15s ease, color .15s ease, transform .15s ease, border-color .15s ease;
  position: relative; overflow: hidden; border-left: 3px solid transparent;
}
.sidebar-link:hover { background: var(--bg-surface-raised); color: var(--sidebar-active-text); transform: translateX(2px); }
.sidebar-link.active { background: var(--sidebar-active-bg); color: var(--sidebar-active-text); border-left-color: var(--accent); }
.sidebar-link .nav-icon { display: inline-flex; transition: transform .2s cubic-bezier(.34,1.56,.64,1), color .15s ease; }
.sidebar-link.active .nav-icon { color: var(--accent); transform: scale(1.15); }
.sidebar-link:hover .nav-icon { transform: scale(1.15) rotate(-4deg); }
.sidebar-footer { margin-top: auto; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.08); display: flex; flex-direction: column; gap: 6px; }
.main { flex: 1; min-width: 0; }
/* Off-canvas sidebar controls — hidden on desktop, switched on for narrow
   viewports in the @media block below. Sized to a 40px touch target
   (below WCAG's 44px minimum only by a hair, kept for visual balance with
   the 28px btn-icon set) rather than the visual icon's own dimensions. */
.menu-toggle-btn {
  display: none; align-items: center; justify-content: center;
  background: var(--bg-page); border: 1px solid var(--border); color: var(--text-primary);
  width: clamp(38px, 9vw, 44px); height: clamp(38px, 9vw, 44px); border-radius: var(--radius-md);
  font-size: clamp(16px, 4vw, 20px); line-height: 1; cursor: pointer; flex-shrink: 0;
  transition: background .15s ease, color .15s ease, border-color .15s ease, transform .2s ease;
}
.menu-toggle-btn:hover { background: var(--accent-soft); color: var(--accent); }
.menu-toggle-btn:active { transform: scale(.92); }
.menu-toggle-btn .menu-icon { display: inline-block; transition: transform .25s ease; }
.menu-toggle-btn.is-open .menu-icon { transform: rotate(90deg); }
.sidebar-backdrop {
  display: none; position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 39;
  opacity: 0; pointer-events: none; transition: opacity .2s ease;
}
.sidebar-backdrop.visible { opacity: 1; pointer-events: auto; }
.topbar {
  display: flex; align-items: center; justify-content: space-between; padding: 16px 28px;
  border-bottom: 1px solid var(--border); background: var(--bg-surface); gap: var(--space-3);
}
.topbar h1 {
  font-size: clamp(16px, 1.4vw + 12px, 20px); margin: 0; font-weight: 700; letter-spacing: -.01em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46vw;
}
.topbar-sub {
  color: var(--text-secondary); font-size: clamp(11px, .5vw + 10px, 12px); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46vw;
}
.container { max-width: 1180px; margin: 0 auto; padding: 24px 28px 60px; }

/* --- Stat cards --- */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-5); }
.stat-card { padding: 18px 20px; }
.stat-card-label { font-size: clamp(11px, .5vw + 10px, 12px); color: var(--text-muted); margin-bottom: 8px; }
.stat-card-num { font-size: clamp(20px, 2.4vw + 13px, 28px); font-weight: 700; letter-spacing: -.01em; }
.section-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); margin: 0 0 12px; }
.activity-list { padding: 4px 0; }
.activity-row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 20px; border-bottom: 1px solid var(--border); font-size: 13px; }
.activity-row:last-child { border-bottom: none; }
.activity-time { color: var(--text-muted); font-size: 12px; white-space: nowrap; }
.status-row { display: flex; align-items: center; gap: 8px; padding: 10px 20px; font-size: 13px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--good); box-shadow: 0 0 0 3px var(--good-soft); animation: status-pulse 2.4s ease-in-out infinite; }
@keyframes status-pulse {
  0%, 100% { box-shadow: 0 0 0 3px var(--good-soft); }
  50% { box-shadow: 0 0 0 6px transparent; }
}

/* --- Toolbar / search / table --- */
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.toolbar-left { display: flex; align-items: center; gap: var(--space-3); flex: 1; min-width: 200px; }
/* Mobile floating action button — the primary "+ New X" action becomes a
   thumb-reachable FAB pinned to the bottom-right on phones (Digikala/most
   native apps put primary creation actions here rather than in a toolbar
   that scrolls out of reach). Hidden on desktop, where the toolbar button
   next to search is already convenient with a mouse. */
.mobile-fab {
  display: none; position: fixed; z-index: 30; align-items: center; justify-content: center;
  background: var(--accent); color: #fff; border: none; border-radius: 50%; cursor: pointer; overflow: hidden;
  width: 56px; height: 56px; box-shadow: var(--shadow-2);
  transition: transform .15s cubic-bezier(.34,1.56,.64,1), background .15s ease;
}
.mobile-fab:hover { background: var(--accent-light); transform: scale(1.06); }
.mobile-fab:active { transform: scale(.92); }
.mobile-fab .ui-icon { width: 24px; height: 24px; }
.search-input { max-width: 280px; }
.breadcrumb {
  display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 13px; margin-bottom: 4px;
  white-space: nowrap; overflow: hidden;
}
.breadcrumb span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.breadcrumb a { cursor: pointer; }
.breadcrumb a:hover { color: var(--accent); }
.table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th {
  text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted);
  padding: 10px 16px; border-bottom: 1px solid var(--border); cursor: pointer; user-select: none; white-space: nowrap;
}
.data-table th:hover { color: var(--text-primary); }
.data-table td { padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: clamp(12px, .5vw + 11px, 13px); vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.data-table tr.row-hover:hover { background: var(--accent-soft); }
.data-table tbody tr { animation: row-in .3s ease both; }
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
.row-name:hover { color: var(--accent); }
.row-actions { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: nowrap; }
.badge-row { display: flex; gap: 6px; flex-wrap: wrap; }
.badge {
  font-size: 11px; padding: 3px 9px; border-radius: 999px; background: var(--accent-soft); color: var(--accent);
  font-weight: 600; letter-spacing: .02em; border: 1px solid transparent; display: inline-flex; align-items: center;
  white-space: nowrap;
}
.switch { position: relative; overflow: hidden; width: clamp(34px, 8vw, 40px); height: clamp(19px, 4.4vw, 22px); border-radius: 999px; border: none; background: var(--border); cursor: pointer; padding: 0; flex-shrink: 0; transition: background .15s ease; }
.switch.on { background: var(--accent); }
.switch.pending { cursor: default; pointer-events: none; }
.switch-knob { position: absolute; top: 2px; left: 2px; width: calc(clamp(19px, 4.4vw, 22px) - 4px); height: calc(clamp(19px, 4.4vw, 22px) - 4px); border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .15s ease; }
.switch.on .switch-knob { transform: translateX(calc(clamp(34px, 8vw, 40px) - clamp(19px, 4.4vw, 22px))); }
/* Cloudflare-style spinner: a partial ring that rotates. Used on buttons
   (and inline next to a row's name for actions with no persistent button,
   like create/duplicate) while a save is in flight, replacing the old
   "saving…" text badge. */
.spinner { display: inline-block; width: clamp(13px, 3vw, 15px); height: clamp(13px, 3vw, 15px); border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; vertical-align: middle; flex-shrink: 0; }
.switch-spinner { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: calc(clamp(19px, 4.4vw, 22px) - 8px); height: calc(clamp(19px, 4.4vw, 22px) - 8px); border-width: 2px; }
@keyframes spin { to { transform: rotate(360deg); } }
/* Material ink-ripple: a JS-spawned span expands from the pointer-down
   point and fades out, giving click feedback the way Material components
   do. Color/opacity is picked per-element in client-script.js (light ink
   on colored surfaces like .btn-primary/.mobile-fab, dark ink everywhere
   else) since a single fixed color wouldn't read on both. The host element
   needs position:relative + overflow:hidden (set alongside each component
   above) so the ripple is clipped to its shape, rounded corners included. */
.ripple-ink {
  position: absolute; border-radius: 50%; transform: scale(0); pointer-events: none;
  animation: ripple-anim .5s cubic-bezier(.4,0,.2,1) forwards;
}
@keyframes ripple-anim {
  to { transform: scale(1); opacity: 0; }
}
.format-menu { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--space-2); }
.format-menu-item { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 12px 14px; font-size: 13px; font-weight: 600; color: var(--text-primary); background: var(--bg-surface-raised); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; transition: background .15s ease, border-color .15s ease, box-shadow .15s ease; box-shadow: var(--shadow-1); position: relative; overflow: hidden; }
.format-menu-item:hover { background: var(--accent-soft); border-color: var(--accent); box-shadow: var(--shadow-2); }
.format-menu-arrow { color: var(--text-muted); font-size: clamp(14px, 3.4vw, 16px); }
.badge.green { background: var(--good-soft); color: var(--good); }
.timestamp { color: var(--text-muted); font-size: 12px; }
.empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.empty-state-icon {
  font-size: clamp(22px, 6vw, 28px); margin-bottom: 10px; opacity: .85; color: var(--accent);
  display: inline-block; animation: empty-float 3s ease-in-out infinite;
}
@keyframes empty-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
/* --- Skeleton screens: shimmer bars sized/positioned to match the real
   content they stand in for, so nothing jumps once data arrives --- */
.skel {
  display: block; background: var(--bg-page); border-radius: 4px;
  position: relative; overflow: hidden;
}
.skel::after {
  content: ""; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, var(--accent-soft), transparent);
  animation: skel-shimmer 1.4s ease-in-out infinite;
}
@keyframes skel-shimmer { 100% { transform: translateX(100%); } }
.skel-row-actions { display: flex; gap: 6px; justify-content: flex-end; }

/* --- Modals / confirm dialog / toasts --- */
@keyframes modal-overlay-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes modal-card-in { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center;
  padding: 20px; z-index: 50; animation: modal-overlay-in .18s ease both;
}
.modal-card { width: 100%; max-width: 520px; padding: 24px; max-height: 85vh; overflow-y: auto; animation: modal-card-in .22s cubic-bezier(.2,.8,.3,1) both; }
.modal-card.small { max-width: 400px; }
.modal-title { font-size: clamp(14px, 1vw + 11px, 16px); font-weight: 700; margin-bottom: var(--space-4); }
.field-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); margin-bottom: 6px; display: block; }
.field-group { margin-bottom: 16px; }
/* Source repeater rows in the userEditor modal — one textarea + remove
   button per row, reusing .field-group/.helper-text/.btn-icon rather than
   inventing a parallel set of classes. */
.source-repeater { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-2); }
.source-row { display: flex; gap: var(--space-2); align-items: flex-start; }
.source-row-input { flex: 1; font-family: var(--mono-stack); font-size: 12px; resize: vertical; }
.source-row .btn-icon { flex-shrink: 0; margin-top: 2px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.stat-row { display: flex; gap: var(--space-3); margin-bottom: var(--space-4); flex-wrap: wrap; }
.stat-box { flex: 1; min-width: 100px; text-align: center; padding: var(--space-4); background: var(--bg-page); border-radius: var(--radius-md); border: 1px solid var(--border); box-shadow: var(--shadow-1); }
.stat-num { font-size: clamp(18px, 1.6vw + 12px, 22px); font-weight: 700; }
.stat-label { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.qr-box { background: #fff; border-radius: var(--radius-lg); padding: var(--space-4); display: flex; align-items: center; justify-content: center; margin: var(--space-4) 0; }
.qr-box svg { width: clamp(140px, 45vw, 180px); height: clamp(140px, 45vw, 180px); }
.link-row { display: flex; gap: 8px; align-items: center; }
.link-row input { font-family: var(--mono-stack); font-size: 12px; }
@keyframes toast-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.toast {
  position: fixed; bottom: 24px; right: 24px; max-width: min(340px, calc(100vw - 48px));
  background: var(--bg-surface-raised); border: 1px solid var(--good-soft); color: var(--good);
  padding: 10px 20px; border-radius: var(--radius-md); font-size: clamp(12px, 2.2vw, 13px); z-index: 100; box-shadow: var(--shadow-2);
  animation: toast-in .2s cubic-bezier(.2,.8,.3,1) both;
}
.toast.error { border-color: var(--bad-soft); color: var(--bad); }
.version-badge {
  position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%);
  background: var(--bg-surface-raised); border: 1px solid var(--border);
  color: var(--text-muted); font-family: var(--mono-stack); font-size: 11px;
  letter-spacing: .02em; padding: 4px 12px; border-radius: 20px;
  z-index: 20; cursor: pointer; text-decoration: none; display: inline-block;
}
.version-badge:hover { color: var(--text-primary); border-color: var(--accent, var(--border)); }
.error-text { color: var(--bad); font-size: 13px; margin-top: 10px; min-height: 16px; }
.helper-text { color: var(--text-muted); font-size: 12px; margin-top: 6px; }
/* --- Setup steps list (D1 setup guide) — reuses existing surface/spacing/
   radius tokens to give an ordered how-to list the same card-like visual
   language as the rest of the app, instead of a bare browser <ol>. Each
   step is its own small raised surface with a numbered accent marker;
   no new colors/fonts/shadows/radii are introduced, only existing tokens
   already used elsewhere (--bg-surface-raised, --border, --radius-md,
   --accent-soft, --accent, the --space-* scale). Intentionally lighter
   than a full .card (no box-shadow) so the setup page stays visually
   simple, per its own minimal/prerequisite purpose. */
.setup-steps { list-style: none; margin: 0 0 var(--space-5); padding: 0; display: flex; flex-direction: column; gap: var(--space-2); counter-reset: setup-step; }
.setup-steps li {
  counter-increment: setup-step;
  display: flex; align-items: flex-start; gap: var(--space-3);
  background: var(--bg-surface-raised); border: 1px solid var(--border); border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4); line-height: 1.55;
}
.setup-steps li::before {
  content: counter(setup-step);
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
  background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 12px;
  display: flex; align-items: center; justify-content: center; margin-top: 1px;
}
/* --- Responsive tiers ---
   Icons (.btn-icon, .switch, .spinner, .menu-toggle-btn,
   .logo-glow, .empty-state-icon, .format-menu-arrow, .qr-box svg) size
   themselves fluidly via clamp()/calc() tied to viewport width, so they
   scale smoothly at any width from 320px up through 4K+ rather than
   jumping at fixed breakpoints — bigger near mobile widths (better tap
   target), settling to a compact size by ~1024px and holding flat beyond
   that. Layout still uses discrete tiers below for things that need to
   actually restructure (columns, sidebar, modal shape):
   1024px: tablet — sidebar narrows, content margins tighten.
   780px:  mobile — sidebar goes off-canvas behind the hamburger + backdrop,
           tables/modals adapt, inputs bump to 16px (stops iOS Safari's
           auto-zoom-on-focus), tap targets grow toward the 44px minimum.
   480px:  small phones — stat grid and toolbar collapse to one column. */
@media (max-width: 1024px) {
  .sidebar { width: 188px; }
  .container { padding: var(--space-5) var(--space-4) 60px; }
}
@media (max-width: 780px) {
  .menu-toggle-btn { display: flex; }
  .sidebar-backdrop { display: block; }
  .sidebar {
    position: fixed; z-index: 40; top: 0; left: 0; height: 100vh; width: 250px;
    transform: translateX(-100%); transition: transform .2s ease;
  }
  .sidebar.open { transform: translateX(0); }
  .topbar { padding: var(--space-3) var(--space-4); }
  .container { padding: var(--space-4) var(--space-4) 60px; }
  .modal-card { max-width: 100%; }
  /* iOS Safari zooms the page in on focus of any input under 16px; this is
     the single fix for that without changing how text looks anywhere else. */
  input, textarea, select { font-size: 16px; }
  .stat-grid { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
  .desktop-only-action { display: none; }
  .mobile-fab {
    display: flex; right: max(18px, env(safe-area-inset-right));
    bottom: max(18px, env(safe-area-inset-bottom, 0px) + 18px);
  }

  /* --- Table → card transform ---
     Below 780px a <table> can never look native (it either overflows and
     forces horizontal scroll, or squashes columns into unreadable slivers).
     Instead of fighting that, the table is restructured purely with CSS:
     header row is hidden, each <tr> becomes a self-contained rounded card,
     and each <td> becomes a label/value line using its data-label attribute.
     No horizontal scroll is possible because nothing is ever wider than the
     viewport — every cell stacks vertically instead. */
  .table-wrap { overflow-x: hidden; }
  .data-table, .data-table tbody, .data-table tr, .data-table td { display: block; width: 100%; }
  .data-table thead { display: none; }
  .data-table tr {
    border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: var(--space-3);
    padding: var(--space-3) var(--space-4); background: var(--bg-surface-raised);
  }
  .data-table tr:last-child { margin-bottom: 0; }
  .data-table td {
    border-bottom: none; padding: 7px 0; display: flex; align-items: center;
    justify-content: space-between; gap: var(--space-3); white-space: normal;
  }
  .data-table td:not([data-label=""])::before {
    content: attr(data-label); font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .04em; color: var(--text-muted); flex-shrink: 0;
  }
  .data-table td[data-label=""] { justify-content: flex-end; padding-top: var(--space-2); margin-top: 4px; border-top: 1px solid var(--border); }
  .data-table td[data-label="Name"] { padding-top: 0; }
  .data-table td[data-label="Name"] .row-name { max-width: 62vw; }
  .row-actions { gap: 2px; }
  .card { border-radius: var(--radius-lg); }
  /* Belt-and-suspenders: nothing on the page should ever be able to force
     the viewport to scroll sideways on a phone, no matter what content or
     third-party string ends up inside a cell, badge, or modal. */
  html, body { overflow-x: hidden; max-width: 100vw; }
}
@media (max-width: 480px) {
  .stat-grid { grid-template-columns: 1fr 1fr; }
  .toolbar { flex-direction: column; align-items: stretch; }
  .toolbar-left, .search-input { max-width: none; width: 100%; }
  .login-card { padding: var(--space-5) var(--space-4); }
  .stat-row { flex-direction: column; }
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal-card { max-height: 92vh; border-radius: var(--radius-xl) var(--radius-xl) 0 0; padding: 14px 18px 20px; position: relative; }
  .modal-card::before {
    content: ""; position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
    width: 36px; height: 4px; border-radius: 999px; background: var(--border);
  }
  .modal-title { margin-top: 10px; }
  /* Bottom-sheet buttons go full-width and stack, largest/primary action on
     top — mirrors how Digikala's mobile sheets present a single dominant
     thumb-reach action instead of two small buttons squeezed to one corner. */
  .modal-footer { flex-direction: column-reverse; gap: var(--space-2); }
  .modal-footer button { width: 100%; padding: 12px 15px; }
  .card { border-radius: var(--radius-md); }
  .data-table tr { border-radius: var(--radius-md); padding: var(--space-3); }
  .stat-box { border-radius: var(--radius-sm); }
  .badge, .switch { border-radius: 999px; }
  /* Names and badges keep their single-line ellipsis truncation down to the
     smallest phones instead of ever breaking to a second line. */
  .topbar h1, .breadcrumb, .stat-card-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
/* Devices that support hover (mouse/trackpad) get the hover states above;
   touch-only devices skip them by re-asserting each button's own base
   (non-hover) look, so a tap doesn't leave it visually "stuck" in its
   hover color until an unrelated tap elsewhere clears it. */
@media (hover: none) {
  .btn-primary:hover { background: var(--accent); border-color: var(--accent); }
  .btn-secondary:hover { background: var(--bg-surface); border-color: var(--border); color: var(--text-primary); }
  .btn-danger:hover, .btn-danger.btn-secondary:hover { background: var(--bad); border-color: var(--bad); color: #fff; }
  .btn-icon:hover { background: transparent; color: var(--text-muted); }
  .data-table tr.row-hover:hover { background: transparent; }
}
/* iPhone/Android notch and home-indicator safe areas, for elements pinned
   to a screen edge. Falls back to the existing fixed value on browsers
   without env() support (older Android/desktop). */
.toast { padding-bottom: max(10px, env(safe-area-inset-bottom)); right: max(16px, env(safe-area-inset-right)); }
.version-badge { bottom: max(10px, env(safe-area-inset-bottom)); }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;
