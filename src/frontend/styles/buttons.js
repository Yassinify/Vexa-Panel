export const BUTTONS_CSS = `/* --- Buttons (reference board: Primary Button filled + arrow accent,
   Secondary Button outlined/muted, Danger Button filled red-error) --- */
.btn-primary {
  background: var(--color-primary); border: 1px solid transparent; color: #fff;
  min-height: 40px; padding: 0 18px; border-radius: var(--radius-lg);
  font-weight: 600; font-size: var(--text-body); line-height: 1.4; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-sm);
  transition: background .15s, opacity 700ms cubic-bezier(.22, 1, .36, 1);
}
.btn-primary:hover { background: var(--color-primary-hover); }
.btn-secondary {
  background: var(--color-surface-alt); border: 1px solid var(--color-border); color: var(--color-muted);
  min-height: 40px; padding: 0 18px; border-radius: var(--radius-lg);
  font-weight: 600; font-size: var(--text-body); line-height: 1.4; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-sm);
  transition: background .12s ease, border-color .12s ease, color .12s ease, opacity 700ms cubic-bezier(.22, 1, .36, 1);
}
.btn-secondary:hover { color: var(--color-text); }
.btn-danger { background: transparent; border-color: var(--color-primary); color: var(--color-primary); font-weight: 600; }
.btn-danger:hover { background: rgba(225,29,72,.12); border-color: var(--color-primary); color: var(--color-primary); }
.btn-sm { min-height: 34px; padding: 0 14px; border-radius: var(--radius-md); }
.btn-full { width: 100%; }
/* Press motion of the theme toggle (styles/theme-toggle.js): a pressed button scales to .96 in 120ms and springs back
   over 350ms on --spring-soft. Disabled buttons do not move. The spring curve is a linear() list, so a browser without
   it keeps the transitions above, and the motion is off under reduced motion. The opacity transition (700ms, the
   curve of the switch colors) makes a button that becomes enabled or disabled blend instead of snapping. */
@supports (transition-timing-function: linear(0, 1)) {
  @media (prefers-reduced-motion: no-preference) {
    .btn-primary { transition: background .15s, opacity 700ms cubic-bezier(.22, 1, .36, 1), transform 350ms var(--spring-soft); }
    .btn-secondary { transition: background .12s ease, border-color .12s ease, color .12s ease, opacity 700ms cubic-bezier(.22, 1, .36, 1), transform 350ms var(--spring-soft); }
    .btn-primary:not(:disabled):active, .btn-secondary:not(:disabled):active, .btn-danger:not(:disabled):active {
      transform: scale(.96); transition-duration: 120ms;
    }
  }
}`;
