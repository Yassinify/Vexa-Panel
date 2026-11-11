export const LOGIN_CSS = `
/* --- Login card (reference #login) --- */
.login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
/* The crimson glow is shared by the login screen and the standalone pages
   (D1 guide, change password, subscription) that reuse .login-wrap. */
.login-wrap { background: radial-gradient(900px 500px at 15% 110%, rgba(225,29,72,.35), transparent 60%), var(--color-bg); }
/* Only the heading and subtitle are centered; labels and fields stay left aligned. */
.login-card { width: 100%; max-width: 380px; padding: var(--space-xxl); }
/* Logo mark inline with the product name, then the h1 and subtitle. */
.login-logo { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 20px; font-weight: 500; }
.login-card h1 { font-size: var(--text-h3); text-align: center; margin-top: 22px; }
.brand { font-weight: 500; font-size: 20px; text-align: center; }
.brand-sub { color: var(--color-muted); font-size: 13px; text-align: center; margin-bottom: 22px; }
`;
