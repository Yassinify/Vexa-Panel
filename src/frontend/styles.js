import { TOKENS_CSS } from './styles/tokens.js';
import { BASE_CSS } from './styles/base.js';
import { CARD_CSS } from './styles/card.js';
import { BUTTONS_CSS } from './styles/buttons.js';
import { TABLES_CSS } from './styles/tables.js';
import { TOOLBAR_CSS } from './styles/toolbar.js';
import { DASHBOARD_CSS } from './styles/dashboard.js';
import { MODALS_CSS } from './styles/modals.js';
import { BADGES_CSS } from './styles/badges.js';
import { TIMESTAMP_CSS } from "./styles/timestamp.js";
import { SETUP_STEPS_CSS } from "./styles/setup-steps.js";
import { ACTIVITY_CSS } from "./styles/activity.js";
import { LOGIN_CSS } from "./styles/login.js";
import { APP_SHELL_CSS } from "./styles/app-shell.js";
import { SUBSCRIPTION_SUMMARY_CSS } from "./styles/subscription-summary.js";
import { TOAST_CSS } from "./styles/toast.js";
import { ERROR_HELPER_TEXT_CSS } from "./styles/error-helper-text.js";
import { FIELD_LABEL_CSS } from "./styles/field-label.js";
import { ICONS_CSS } from "./styles/icons.js";
import { INPUTS_CSS } from "./styles/inputs.js";
import { REDUCED_MOTION_CSS } from "./styles/reduced-motion.js";
import { SETTINGS_CSS } from "./styles/settings.js";

export const STYLES = `
/* =====================================================================
   VEXA — visual design system, following reference/reference.html
   (palette, radii, layout and component styles). Class names / element
   ids referenced by client-script.js and the standalone pages
   (d1-setup.js, sub-page.js) are kept so no
   selector, DOM id, or inline handler needs to change.
   ===================================================================== */
${TOKENS_CSS}

${BASE_CSS}

${CARD_CSS}

${BUTTONS_CSS}

${ICONS_CSS}

${INPUTS_CSS}

${LOGIN_CSS}

${APP_SHELL_CSS}

${DASHBOARD_CSS}
${ACTIVITY_CSS}

/* --- Toolbar / search / table --- */
${TOOLBAR_CSS}
${TABLES_CSS}

${BADGES_CSS}

${TIMESTAMP_CSS}

/* --- Modals / confirm dialog / toasts --- */
${MODALS_CSS}
${FIELD_LABEL_CSS}
${SUBSCRIPTION_SUMMARY_CSS}
${TOAST_CSS}
${ERROR_HELPER_TEXT_CSS}
${SETTINGS_CSS}

${SETUP_STEPS_CSS}

/* --- Responsive: the sidebar becomes a fixed bottom tab bar below 760px
   (styles/app-shell.js); wide tables scroll inside their .table-wrap. --- */
${REDUCED_MOTION_CSS}
`;
