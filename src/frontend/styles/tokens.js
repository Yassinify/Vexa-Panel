export const TOKENS_CSS = `:root {
  /* --- Color Palette (reference/reference.html :root) --- */
  --color-primary: #E11D48;
  --color-primary-hover: #BE123C;
  --color-bg: #080B0F;
  --color-surface: #111317;
  --color-surface-alt: #0D1015;
  --color-border: #1F1F24;
  --color-border-input: #223041;
  --color-text: #F8FAFC;
  --color-muted: #9CA3AF;
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;
  --color-disabled: #4B5563;

  /* Soft fills (not in the reference :root): low-opacity versions of the
     palette colors above, used by badges and icon tiles. */
  --color-primary-soft: rgba(225, 29, 72, 0.16);
  --color-success-soft: rgba(16, 185, 129, 0.12);
  --color-warning-soft: rgba(245, 158, 11, 0.14);
  --color-error-soft: rgba(239, 68, 68, 0.12);
  /* Fainter primary fill (half the alpha of --color-primary-soft) for the Dashboard stat-card and Logs icon tiles. */
  --color-primary-faint: rgba(225, 29, 72, 0.08);

  /* --- Spacing Scale (project scale, not in the reference :root:
     xs 4 / sm 8 / md 12 / lg 16 / xl 24 / xxl 32) --- */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-xxl: 32px;

  /* --- Border Radius (reference --r1 to --r4: sm 4 / md 8 / lg 12 / xl 16) --- */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* --- Typography (project scale, not in the reference :root:
     H1 32/700, H2 24/600, H3 18/600, Body Large 16/400, Body 14/400,
     Caption 12/400; the font stack matches the reference body) --- */
  --font-stack: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
  --text-h1: 32px;
  --text-h2: 24px;
  --text-h3: 18px;
  --text-body-lg: 16px;
  --text-body: 14px;
  --text-caption: 12px;

  /* --- Motion: spring curves (a damped spring sampled into linear() easing), taken from
     interactive-day-night-toggle by Hamzeh (MIT). Used by the theme toggle and the view change. --- */
  --spring-soft: linear(0, 0.0454, 0.1554, 0.2976, 0.4484, 0.592, 0.7189, 0.8242, 0.9067, 0.9677, 1.0096, 1.0358, 1.0495, 1.0542, 1.0526, 1.0471, 1.0396, 1.0314, 1.0235, 1.0164, 1.0105, 1.0058, 1.0023, 0.9998, 0.9983, 0.9974, 0.9971, 0.9971, 0.9974, 0.9978, 0.9982, 0.9986, 0.999, 0.9994, 0.9996, 0.9998, 1, 1.0001, 1.0001, 1.0002, 1);
  --spring-bouncy: linear(0, 0.0563, 0.1961, 0.3793, 0.5734, 0.7545, 0.9073, 1.024, 1.1031, 1.1475, 1.1628, 1.1562, 1.135, 1.1058, 1.0742, 1.0441, 1.0184, 0.9985, 0.9847, 0.9767, 0.9736, 0.9742, 0.9774, 0.982, 0.9872, 0.9921, 0.9964, 0.9998, 1.0022, 1.0037, 1.0043, 1.0043, 1.0038, 1.0031, 1.0022, 1.0014, 1.0007, 1.0001, 0.9997, 0.9994, 1);
}

/* Light theme (reference :root[data-theme="light"]); the other tokens are shared. */
:root[data-theme="light"] {
  --color-bg: #F1F5F9;
  --color-surface: #FFFFFF;
  --color-surface-alt: #F8FAFC;
  --color-border: #E2E8F0;
  --color-border-input: #CBD5E1;
  --color-text: #0F172A;
  --color-muted: #64748B;
  color-scheme: light;
}`;
