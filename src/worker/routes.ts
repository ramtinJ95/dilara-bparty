import type { CodeResponse, JoinResponse } from "../shared/api";
import { parsePlayerName, type NameError } from "../shared/model";
import { adminCookieValue, isAdminCookie, joinCodeMatches, pidCookieValue, playerFromCookie, secretMatches } from "./auth";
import { notFound, readCookie, readJson, redirect, sameOrigin, setCookie, status } from "./http";
import { SOCKET_ROLE_HEADER, type SocketRole } from "./party";

type Ctx = { req: Request; env: Env; params: Record<string, string | undefined> };
type Route = { method: string; pattern: URLPattern; handler: (ctx: Ctx) => Promise<Response> | Response };

const guestNameErrors: Record<NameError, string> = {
  empty: "Skriv ditt namn först.",
  "control-chars": "Namnet innehåller tecken som inte fungerar.",
  "too-long": "Namnet får vara högst 30 tecken.",
};

const party = (env: Env) => env.PARTY.getByName("party");

const guest = (ctx: Ctx) => playerFromCookie(readCookie(ctx.req, "pid"), ctx.env.JOIN_SECRET);

const isAdmin = (ctx: Ctx) => isAdminCookie(readCookie(ctx.req, "admin"), ctx.env.ADMIN_SECRET);

const joinSecretMatches = (ctx: Ctx, given: unknown) => typeof given === "string" && secretMatches(given, ctx.env.JOIN_SECRET);

type Entry = "neutral" | "guest" | "admin";

async function entry({ req, env }: Ctx, name: Entry): Promise<Response> {
  const asset = await env.ASSETS.fetch(new URL(`/${name}.html`, req.url));
  const res = new Response(asset.body, asset);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

async function socket(ctx: Ctx, role: SocketRole): Promise<Response> {
  if (ctx.req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return status(426);
  if (!sameOrigin(ctx.req)) return status(403);
  const headers = { Upgrade: "websocket", [SOCKET_ROLE_HEADER]: JSON.stringify(role) };
  return party(ctx.env).fetch(new Request("https://party/ws", { headers }));
}

const route = (method: string, pathname: string, handler: Route["handler"]): Route => ({
  method,
  pattern: new URLPattern({ pathname }),
  handler,
});

export const routes: Route[] = [
  route("GET", "/", (ctx) => entry(ctx, "neutral")),

  route("POST", "/api/code", async (ctx) => {
    const { code } = await readJson(ctx.req);
    if (typeof code !== "string" || !(await joinCodeMatches(code, ctx.env.JOIN_SECRET))) {
      return Response.json({ error: "Fel kod, försök igen." }, { status: 403 });
    }
    return Response.json({ ok: true, path: `/j/${ctx.env.JOIN_SECRET}` } satisfies CodeResponse);
  }),

  route("GET", "/j/:secret", async (ctx) => {
    if (!joinSecretMatches(ctx, ctx.params.secret)) return notFound();
    const id = await guest(ctx);
    if (id && (await party(ctx.env).playerExists(id))) return redirect("/app");
    return entry(ctx, "guest");
  }),

  route("POST", "/api/join", async (ctx) => {
    const body = await readJson(ctx.req);
    if (!joinSecretMatches(ctx, body.secret)) return Response.json({ error: "Länken fungerar inte längre." }, { status: 403 });
    const name = parsePlayerName(body.name);
    if (!name.ok) return Response.json({ error: guestNameErrors[name.error] }, { status: 400 });
    const result = await party(ctx.env).join(name.value, body.reclaim === true);
    if (result.status === "exists") return Response.json(result satisfies JoinResponse);
    const cookie = setCookie("pid", await pidCookieValue(result.id, ctx.env.JOIN_SECRET));
    return Response.json({ status: "joined" } satisfies JoinResponse, { headers: { "Set-Cookie": cookie } });
  }),

  route("GET", "/app", async (ctx) => ((await guest(ctx)) ? entry(ctx, "guest") : redirect("/"))),

  route("GET", "/ws", async (ctx) => {
    const playerId = await guest(ctx);
    return playerId ? socket(ctx, { role: "guest", playerId }) : status(401);
  }),

  route("GET", "/admin/:secret", async (ctx) => {
    if (!secretMatches(ctx.params.secret ?? "", ctx.env.ADMIN_SECRET)) return notFound();
    return redirect("/admin", setCookie("admin", await adminCookieValue(ctx.env.ADMIN_SECRET)));
  }),

  route("GET", "/admin", async (ctx) => ((await isAdmin(ctx)) ? entry(ctx, "admin") : notFound())),

  route("GET", "/ws/admin", async (ctx) => ((await isAdmin(ctx)) ? socket(ctx, { role: "admin" }) : notFound())),
];

export function match(req: Request): { route: Route; params: Ctx["params"] } | null {
  const method = req.method === "HEAD" ? "GET" : req.method;
  for (const route of routes) {
    if (route.method !== method) continue;
    const found = route.pattern.exec(req.url);
    if (found) return { route, params: found.pathname.groups };
  }
  return null;
}
