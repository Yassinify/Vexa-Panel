export const APP_SHELL_CSS = `
/* --- App shell: sidebar + header (reference/reference.html) --- */
.app-shell { display: flex; min-height: 100vh; }
/* The sidebar is fixed to the viewport; .main is offset by its width. The
   z-index keeps the Sign out tooltip, which reaches into the content area,
   above the page content. */
.sidebar {
  position: fixed; z-index: 6; inset: 0 auto 0 0; width: 232px; background: var(--color-surface-alt); border-right: 1px solid var(--color-border);
  display: flex; flex-direction: column; gap: 6px; padding: 20px 14px;
}
.sidebar-brand { display: flex; align-items: center; justify-content: space-around; gap: 10px; padding: 0 8px 18px; }
/* The logo, title and version never wrap or shrink, so the title stays on one line. */
.sidebar-brand .logo-mark, .topbar-brand .logo-mark { flex: none; }
.sidebar-brand .brand, .topbar-brand .brand { color: var(--color-text); font-size: 17px; margin-bottom: 0; font-weight: 500; white-space: nowrap; }
/* Panel version (v + VEXA_VERSION) beside the title: a small muted label, pulled 4px closer to the title. */
.sidebar-brand .brand-version, .topbar-brand .brand-version {
  flex: none; white-space: nowrap; margin-left: -4px; padding: 2px 6px; border: 1px solid var(--color-border); border-radius: 999px;
  color: var(--color-muted); font-size: 10px; font-weight: 500; line-height: 1.4;
}
/* The version label is a link to the project's GitHub page. Hovering or focusing it opens a small popup
   with the GitHub mark and the project name; the popup is CSS only and hidden until then. */
.brand-version { position: relative; text-decoration: none; cursor: pointer; transition: color .15s ease, border-color .15s ease; }
.brand-version:hover { color: var(--color-text); border-color: var(--color-muted); }
.brand-version:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
/* The popup looks and behaves like the date tooltip (.date-tip, styles/tables.js): the same surface, 12px radius,
   padding, caption font in normal weight, 10px arrow and 12px gap to the label. It waits 500 ms before it opens
   (the same as DATE_TIP_DELAY_MS in client/users/users-view.js), then fades in while sliding 6px, as the other
   popups do; closing is instant. The wait is an animation delay with a backwards fill, so the popup stays invisible
   until then. Reduced motion keeps the wait but plays no motion. */
.version-pop {
  display: none; align-items: center; gap: var(--space-sm); position: absolute; z-index: 10; top: calc(100% + 12px); left: 50%;
  padding: var(--space-sm) var(--space-md); white-space: nowrap; pointer-events: none;
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  color: var(--color-text); font-size: var(--text-caption); font-weight: 400; line-height: 1.5; font-variant-numeric: tabular-nums;
  transform: translateX(-50%);
}
.brand-version:hover .version-pop, .brand-version:focus-visible .version-pop {
  display: flex; animation: version-pop-in .16s ease-out .5s backwards;
}
/* Like account-menu-in, but keeps the popup centered under the label (translateX(-50%)). */
@keyframes version-pop-in {
  from { opacity: 0; transform: translate(-50%, -6px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
@keyframes version-pop-wait { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .brand-version:hover .version-pop, .brand-version:focus-visible .version-pop { animation: version-pop-wait 0s linear .5s backwards; }
}
.version-pop-logo { flex: none; }
/* Arrow pointing up at the version label. */
.version-pop::before {
  content: ""; position: absolute; top: -6px; left: 50%; width: 10px; height: 10px;
  background: var(--color-surface); border: solid var(--color-border); border-width: 1px 0 0 1px;
  transform: translateX(-50%) rotate(45deg);
}
/* Nav items are real buttons, so the button defaults are reset here. */
.sidebar-link {
  display: flex; align-items: center; gap: var(--space-md); min-height: 44px; padding: 0 14px;
  border: 0; background: none; text-align: left;
  border-radius: var(--radius-lg);
  color: var(--color-muted); cursor: pointer; font-size: var(--text-body); font-weight: 400; text-decoration: none;
  transition: background .15s ease, color .15s ease;
}
.sidebar-link:hover { background: var(--color-surface-alt); color: var(--color-text); }
.sidebar-link.active { background: var(--color-primary-hover); color: #fff; }
.sidebar-link .nav-icon { display: inline-flex; }
.sidebar-link.active .nav-icon { color: #fff; }
.sidebar-footer { margin-top: auto; }
/* More menu: only used by the compact bottom bar; hidden on desktop, where
   Logs and Settings are normal sidebar links. */
.more-wrap { display: none; position: relative; min-width: 56px; }
.more-wrap .sidebar-link { flex: 1; }
/* Tooltip-style popup above the More button; .open is toggled by script. */
.more-menu {
  display: none; position: absolute; right: 0; bottom: calc(100% + 12px); min-width: 168px;
  flex-direction: column; gap: 2px; padding: 6px;
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
/* The More popup looks and animates like the account popups: it opens and closes with the same fade and slide (--account-menu-shift is set here), above its blur backdrop. */
.more-menu { z-index: 10; --account-menu-shift: 6px; }
.more-menu.open { display: flex; animation: account-menu-in .16s ease-out; }
/* .closing is set by script while the exit animation plays, then removed. */
.more-menu.closing { display: flex; animation: account-menu-out .16s ease-in forwards; }
/* Arrow centered over the 56px-wide More button (56 / 2 - 5 = 23px from the right edge). */
.more-menu::after {
  content: ""; position: absolute; bottom: -6px; right: 23px; width: 10px; height: 10px;
  background: var(--color-surface); border: solid var(--color-border); border-width: 0 1px 1px 0;
  transform: rotate(45deg);
}
.more-item {
  display: flex; align-items: center; gap: var(--space-md); min-height: 44px; padding: 0 var(--space-md);
  border: 0; background: none; text-align: left; border-radius: var(--radius-md);
  color: var(--color-muted); cursor: pointer; font-size: var(--text-body);
}
.more-item:hover { background: var(--color-surface-alt); color: var(--color-text); }
.more-item.active { background: var(--color-primary-hover); color: #fff; }
.more-item .nav-icon { display: inline-flex; }
/* Admin card at the bottom of the sidebar: a button that opens the Sign out
   tooltip, so the button defaults are reset here. */
.sidebar-me {
  display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px;
  border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  background: none; color: var(--color-text); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
}
.sidebar-me:hover { background: var(--color-surface); }
/* Avatar letters are always white: the gradient is dark in both themes. */
.sidebar-me-avatar {
  width: 34px; height: 34px; border-radius: 50%; flex: none;
  background: linear-gradient(135deg, var(--color-primary), #6b1030); color: #fff;
  display: grid; place-items: center; font-weight: 600; font-size: 13px;
}
.sidebar-me-text small { display: block; color: var(--color-muted); font-size: 11px; }
/* Three vertical dots at the right edge of the card: the "more" icon turned 90deg. */
.sidebar-me-dots { margin-left: auto; display: inline-flex; color: var(--color-muted); transform: rotate(90deg); }
/* Account menus: a small Sign out popup, styled like the More menu. The
   sidebar one opens above the Admin card and is as wide as the card; the
   header one opens below the avatar; .open is toggled by script. */
.account-wrap { position: relative; }
.account-menu {
  display: none; position: absolute; z-index: 10; min-width: 188px;
  flex-direction: column; gap: 2px; padding: 6px;
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
/* The popup fades in while sliding 6px away from its anchor (--account-menu-shift is set per placement). */
.account-menu.open { display: flex; animation: account-menu-in .16s ease-out; }
/* Closing plays the same motion backwards; .closing is set by script while it runs, then removed. */
.account-menu.closing { display: flex; animation: account-menu-out .16s ease-in forwards; }
@keyframes account-menu-in {
  from { opacity: 0; transform: translateY(var(--account-menu-shift, 6px)); }
  to { opacity: 1; transform: none; }
}
@keyframes account-menu-out {
  from { opacity: 1; transform: none; }
  to { opacity: 0; transform: translateY(var(--account-menu-shift, 6px)); }
}
/* While a popup is open, everything behind it is softly blurred with a very
   light veil in the page background color (works in both themes). The
   backdrop sits just below the popup and a click on it closes the menu.
   The More popup uses the same look through .more-backdrop. */
.account-backdrop, .more-backdrop {
  display: none; position: fixed; inset: 0; z-index: 9;
  background: color-mix(in srgb, var(--color-bg) 20%, transparent);
  -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
}
.account-menu.open ~ .account-backdrop, .more-menu.open ~ .more-backdrop { display: block; animation: account-backdrop-in .16s ease-out; }
.account-menu.closing ~ .account-backdrop, .more-menu.closing ~ .more-backdrop { display: block; animation: account-backdrop-out .16s ease-in forwards; }
@keyframes account-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes account-backdrop-out { from { opacity: 1; } to { opacity: 0; } }
/* Reduced motion: no animation at all (the script then hides a closing menu at once). */
@media (prefers-reduced-motion: reduce) {
  .account-menu.open, .account-menu.closing, .more-menu.open, .more-menu.closing,
  .account-menu.open ~ .account-backdrop, .account-menu.closing ~ .account-backdrop,
  .more-menu.open ~ .more-backdrop, .more-menu.closing ~ .more-backdrop { animation: none; }
}
/* Sign out button: full width, 44px tap target, icon and label in the error
   color with a soft error fill on hover. */
.account-signout {
  display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 0 var(--space-md);
  border: 0; background: none; border-radius: var(--radius-md);
  color: var(--color-error); font: inherit; font-size: var(--text-body); font-weight: 500; text-align: left; cursor: pointer;
  transition: background .15s ease;
}
.account-signout:hover { background: var(--color-error-soft); }
.account-signout:focus-visible { outline: 2px solid var(--color-error); outline-offset: -2px; }
.account-signout .ui-icon { flex: none; }
.account-menu::after {
  content: ""; position: absolute; width: 10px; height: 10px;
  background: var(--color-surface); border: solid var(--color-border);
  transform: rotate(45deg);
}
/* Sidebar popup: above the Admin card, same width; the arrow points down at the three dots. */
.account-wrap-sidebar .account-menu {
  left: 0; right: 0; bottom: calc(100% + 10px); min-width: 0;
  --account-menu-shift: 6px;
}
.account-wrap-sidebar .account-menu::after { bottom: -6px; right: 15px; border-width: 0 1px 1px 0; }
.account-wrap-top .account-menu { right: 0; top: calc(100% + 12px); --account-menu-shift: -6px; }
.account-wrap-top .account-menu::after { top: -6px; right: 12px; border-width: 1px 0 0 1px; }
/* Content area: full width, the header and the view share the side padding. */
.main { flex: 1; min-width: 0; margin-left: 232px; padding: 0 28px 32px; }
/* Header: search, Theme and avatar; no background or border. */
.topbar { display: flex; align-items: center; gap: 14px; height: 72px; }
.topbar-search { max-width: 420px; }
/* The same brand as the sidebar's, at the left of the header; shown only on the compact layout (760px block). */
.topbar-brand { display: none; align-items: center; gap: 10px; }
/* The header avatar (a button that opens the Sign out tooltip) is shown only
   on the compact layout: its wrapper is hidden here and shown in the 760px block. */
.account-wrap-top { display: none; }
.topbar-avatar {
  width: 34px; height: 34px; border-radius: 50%; flex: none; padding: 0; border: 0; cursor: pointer;
  background: linear-gradient(135deg, var(--color-primary), #6b1030); color: #fff; font-family: inherit;
  display: grid; place-items: center; font-weight: 600; font-size: 13px;
}
/* Below 760px the sidebar becomes a bottom tab bar. The shell is exactly one screen tall and
   only .main scrolls, so the bar is always in view. It is a normal flex item, not position: fixed,
   because phone browsers can place a fixed bar below the visible area until the page is scrolled.
   dvh follows the browser's toolbars (the vh line is the fallback for older browsers); the safe-area
   insets are already added by the root padding (base.js), so they are taken off the height here. */
@media (max-width: 760px) {
  .app-shell {
    flex-direction: column; min-height: 0; overflow: hidden;
    height: calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  }
  .sidebar {
    position: static; order: 2; flex: none; width: auto; flex-direction: row; justify-content: space-around;
    padding: 6px 8px;
    border-right: 0; border-top: 1px solid var(--color-border);
  }
  .sidebar-brand, .sidebar-footer { display: none; }
  .sidebar-link { flex-direction: column; gap: 2px; min-height: 48px; padding: 8px; font-size: 11px; }
  .main { flex: 1 1 auto; min-height: 0; overflow-y: auto; margin-left: 0; padding: 0 16px 32px; }
  .topbar-search { display: none; }
  .topbar-brand { display: flex; }
  .account-wrap-top { display: block; }
  /* Logs and Settings move into the More menu. */
  .sidebar-link-extra { display: none; }
  .more-wrap { display: flex; }
}
`;
