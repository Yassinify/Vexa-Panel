import { ICONS_SCRIPT } from "./icons.js";
import { STATE_SCRIPT } from "./client/state.js";
import { API_SCRIPT } from "./client/api.js";
import { HELPERS_SCRIPT } from "./client/helpers.js";
import { AUTH_SCRIPT } from "./client/auth.js";
import { SHELL_SCRIPT } from "./client/shell.js";
import { USER_GROWTH_SCRIPT } from "./client/user-growth.js";
import { RECENT_ACTIVITY_SCRIPT } from "./client/recent-activity.js";
import { STAT_CARD_SCRIPT } from "./client/stat-card.js";
import { DASHBOARD_SCRIPT } from "./client/dashboard.js";
import { LOG_VIEW_SCRIPT } from "./client/activity/activity-view.js";
import { USERS_VIEW_SCRIPT } from "./client/users/users-view.js";
import { USER_EDITOR_SCRIPT } from "./client/users/user-editor.js";
import { USER_ACTIONS_SCRIPT } from "./client/users/user-actions.js";
import { USER_LINKS_SCRIPT } from "./client/users/user-links.js";
import { NODES_VIEW_SCRIPT } from "./client/nodes/nodes-view.js";
import { NODE_ACTIONS_SCRIPT } from "./client/nodes/node-actions.js";
import { NODE_PICKER_SCRIPT } from "./client/nodes/node-picker.js";
import { MODALS_SCRIPT } from "./client/modals/modals.js";
import { ROOT_RENDER_SCRIPT } from "./client/app/root-render.js";
import { INIT_SCRIPT } from "./client/app/init.js";

export const CLIENT_SCRIPT = `
${ICONS_SCRIPT}${STATE_SCRIPT}${API_SCRIPT}${HELPERS_SCRIPT}${AUTH_SCRIPT}${SHELL_SCRIPT}${USER_GROWTH_SCRIPT}${RECENT_ACTIVITY_SCRIPT}${STAT_CARD_SCRIPT}${DASHBOARD_SCRIPT}
${LOG_VIEW_SCRIPT}${USERS_VIEW_SCRIPT}${USER_EDITOR_SCRIPT}${USER_ACTIONS_SCRIPT}${USER_LINKS_SCRIPT}
${NODES_VIEW_SCRIPT}${NODE_ACTIONS_SCRIPT}${NODE_PICKER_SCRIPT}
${MODALS_SCRIPT}${ROOT_RENDER_SCRIPT}
${INIT_SCRIPT}
`;
