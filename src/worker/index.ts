import { notFound, withPrivacyHeaders } from "./http";
import { match } from "./routes";

export { Party } from "./party";

export default {
  async fetch(req, env) {
    const found = match(req);
    const res = found ? await found.route.handler({ req, env, params: found.params }) : notFound();
    return withPrivacyHeaders(res);
  },
} satisfies ExportedHandler<Env>;
