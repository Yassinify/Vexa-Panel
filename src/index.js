// =====================================================================
// VEXA — ENTRY POINT: Cloudflare Worker fetch handler
// =====================================================================

import { json } from "./http.js";
import { route } from "./router.js";

// Durable Object class must be re-exported from the entry module so
// Cloudflare can find it in the bundled worker.js (see wrangler.jsonc's
// durable_objects binding and src/index-coordinator.js).
export { IndexCoordinator } from "./index-coordinator.js";

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      console.error(err);
      return json({ error: "internal_error" }, 500);
    }
  },
};
