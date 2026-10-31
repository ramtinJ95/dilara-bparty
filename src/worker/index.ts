import { DurableObject } from "cloudflare:workers";

export class Party extends DurableObject<Env> {
  async hello() { return "hi"; }
}

const entry = (env: Env, req: Request, name: string) => env.ASSETS.fetch(new URL(`/${name}.html`, req.url));

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname === "/") return entry(env, req, "neutral");
    if (pathname.startsWith("/j/")) return entry(env, req, "guest");
    if (pathname === "/admin") return entry(env, req, "admin");
    if (pathname === "/rpc") return new Response(await env.PARTY.get(env.PARTY.idFromName("party")).hello());
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
