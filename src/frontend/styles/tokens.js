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
