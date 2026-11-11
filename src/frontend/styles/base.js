export const BASE_CSS = `/* Safe-area insets keep content clear of notches on phones. */
:root {
  box-sizing: border-box;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
* { box-sizing: border-box; margin: 0; }
html { height: 100%; color-scheme: dark; scroll-padding-top: env(safe-area-inset-top, 0px); }
body {
  min-height: 100%;
  background: var(--color-bg);
  font-family: var(--font-stack); color: var(--color-text);
  font-size: var(--text-body); line-height: 1.5;
}
/* Form controls use the page font and text color instead of browser defaults. */
button, input, select { font: inherit; color: inherit; }
/* Page title (reference h2): 24px, weight 600. Other headings keep the browser defaults. */
h2 { font-size: var(--text-h2); font-weight: 600; line-height: 1.2; }
/* Muted line under a page title (reference .lead). */
.lead { color: var(--color-muted); margin: 4px 0 22px; }
/* Scrollbars use the theme tokens: standard properties first, then a WebKit/Blink fallback. */
* { scrollbar-width: thin; scrollbar-color: var(--color-border-input) transparent; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--color-border-input); border-radius: var(--radius-lg);
  border: 2px solid transparent; background-clip: padding-box;
}
::-webkit-scrollbar-thumb:hover { background: var(--color-muted); background-clip: padding-box; }
::-webkit-scrollbar-corner { background: transparent; }`;
