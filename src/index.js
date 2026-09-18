import { json } from "./http.js";
import { route } from "./router.js";

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
