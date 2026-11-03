import { CONTEST_UPLOAD_PATH, UPLOAD_FIELDS, type CodeResponse, type JoinResponse, type PhotoUploadResponse } from "../shared/api";
import { parsePhotoId, parsePhotoMime, parsePlayerName, parseUploadKey, PLAYER_NAME_MAX, type NameError, type PhotoId, type PhotoKind } from "../shared/model";
import { adminCookieValue, isAdminCookie, joinCodeMatches, pidCookieValue, playerFromCookie, secretMatches } from "./auth";
import { notFound, readBody, readCookie, readJson, redirect, sameOrigin, setCookie, status } from "./http";
import { SOCKET_ROLE_HEADER, type ContestUpload, type PhotoViewer, type SocketRole } from "./party";
import { PHOTO_MAX_BYTES, type PhotoUpload, type StoredPhoto } from "./photo-store";

type Ctx = { req: Request; env: Env; params: Record<string, string | undefined> };
type Route = { method: string; pattern: URLPattern; handler: (ctx: Ctx) => Promise<Response> | Response };

const guestNameErrors: Record<NameError, string> = {
  empty: "Skriv ditt namn först.",
  "control-chars": "Namnet innehåller tecken som inte fungerar.",
  "too-long": `Namnet får vara högst ${PLAYER_NAME_MAX} tecken.`,
};

const party = (env: Env) => env.PARTY.getByName("party");

const guest = (ctx: Ctx) => playerFromCookie(readCookie(ctx.req, "pid"), ctx.env.JOIN_SECRET);

const joined = async (ctx: Ctx) => {
  const id = await guest(ctx);
  return id !== null && (await party(ctx.env).isPlayer(id));
};

const isAdmin = (ctx: Ctx) => isAdminCookie(readCookie(ctx.req, "admin"), ctx.env.ADMIN_SECRET);

const adminOnly = (handler: Route["handler"]): Route["handler"] => async (ctx) => ((await isAdmin(ctx)) ? handler(ctx) : notFound());

const joinSecretMatches = (ctx: Ctx, given: unknown) => typeof given === "string" && secretMatches(given, ctx.env.JOIN_SECRET);

async function photoViewer(ctx: Ctx): Promise<PhotoViewer | null> {
  if (await isAdmin(ctx)) return { role: "admin" };
  const playerId = await guest(ctx);
  return playerId ? { role: "guest", playerId } : null;
}

type Page = "neutral" | "guest" | "admin";

const page = ({ req, env }: Ctx, name: Page) => env.ASSETS.fetch(new URL(`/${name}.html`, req.url));

const entry = async (ctx: Ctx, name: Page) => pageResponse(await page(ctx, name));

// Meta values are ids and signatures, base64url and dots only, so they need no escaping.
function pageResponse(asset: Response, meta: Record<string, string> = {}): Response {
  const res = new Response(asset.body, asset);
  res.headers.set("Cache-Control", "no-store");
  const tags = Object.entries(meta).map(([name, content]) => `<meta name="${name}" content="${content}">`);
  if (tags.length === 0) return res;
  return new HTMLRewriter().on("head", { element: (head) => void head.append(tags.join(""), { html: true }) }).transform(res);
}

const IMMUTABLE = "private, max-age=31536000, immutable";
// A guest may see a question photo only while its question has started in this run, so every view asks again.
const photoCaching: Record<PhotoKind, string> = { landing: IMMUTABLE, contest: IMMUTABLE, thumb: IMMUTABLE, question: "private, no-cache" };

const etag = (id: PhotoId) => `"${id}"`;

const clientHas = (req: Request, id: PhotoId) => req.headers.get("If-None-Match") === etag(id);

function photoResponse(id: PhotoId, photo: StoredPhoto | null): Response {
  if (!photo) return notFound();
  const headers = { "Cache-Control": photoCaching[photo.kind], ETag: etag(id) };
  if (photo.bytes === null) return new Response(null, { status: 304, headers });
  return new Response(photo.bytes, { headers: { ...headers, "Content-Type": photo.mime } });
}

const CONTEST_BODY_MAX_BYTES = 2 * PHOTO_MAX_BYTES + 64 * 1024;

async function photoPart(form: FormData, field: string): Promise<PhotoUpload | Response> {
  const part = form.get(field);
  if (!(part instanceof File)) return status(400);
  if (part.size > PHOTO_MAX_BYTES) return status(413);
  const mime = parsePhotoMime(part.type);
  if (!mime || part.size === 0) return status(415);
  return { mime, bytes: await part.arrayBuffer() };
}

const uploadResponses: { [S in ContestUpload["status"]]: (result: Extract<ContestUpload, { status: S }>) => Response } = {
  created: ({ id }) => Response.json({ id } satisfies PhotoUploadResponse),
  replayed: ({ id }) => Response.json({ id } satisfies PhotoUploadResponse),
  closed: () => Response.json({ error: "Uppladdningen är stängd." }, { status: 403 }),
  conflict: () => status(409),
  "no-player": () => status(401),
};

async function uploadContest(ctx: Ctx): Promise<Response> {
  const playerId = await guest(ctx);
  if (!playerId) return status(401);
  const bytes = await readBody(ctx.req, CONTEST_BODY_MAX_BYTES);
  if (!bytes) return status(413);
  let form: FormData;
  try {
    form = await new Response(bytes, { headers: { "Content-Type": ctx.req.headers.get("Content-Type") ?? "" } }).formData();
  } catch {
    return status(400);
  }
  const key = parseUploadKey(form.get(UPLOAD_FIELDS.key));
  if (!key) return status(400);
  const photo = await photoPart(form, UPLOAD_FIELDS.photo);
  if (photo instanceof Response) return photo;
  const thumb = await photoPart(form, UPLOAD_FIELDS.thumb);
  if (thumb instanceof Response) return thumb;
  const result = await party(ctx.env).uploadContest(playerId, key, photo, thumb);
  return (uploadResponses[result.status] as (r: ContestUpload) => Response)(result);
}

async function adminPhoto(ctx: Ctx, store: (upload: PhotoUpload) => Promise<PhotoId>): Promise<Response> {
  const mime = parsePhotoMime(ctx.req.headers.get("Content-Type"));
  if (!mime) return status(415);
  const bytes = await readBody(ctx.req, PHOTO_MAX_BYTES);
  if (!bytes) return status(413);
  if (bytes.byteLength === 0) return status(415);
  return Response.json({ id: await store({ mime, bytes }) } satisfies PhotoUploadResponse);
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
  route("GET", "/", async (ctx) => ((await joined(ctx)) ? redirect("/app") : entry(ctx, "neutral"))),

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
    const [asset, entered] = await Promise.all([page(ctx, "guest"), party(ctx.env).guestEntry(id)]);
    if (!entered.joined) return pageResponse(asset, entered.landingPhoto ? { "landing-photo": entered.landingPhoto } : {});
    await asset.body?.cancel();
    return redirect("/app");
  }),

  route("GET", "/j/:secret/photos/:id", async (ctx) => {
    const id = parsePhotoId(ctx.params.id);
    if (!joinSecretMatches(ctx, ctx.params.secret) || !id) return notFound();
    return photoResponse(id, await party(ctx.env).photo({ role: "anonymous" }, id, clientHas(ctx.req, id)));
  }),

  route("POST", "/api/join", async (ctx) => {
    const body = await readJson(ctx.req);
    if (!joinSecretMatches(ctx, body.secret)) return Response.json({ error: "Länken fungerar inte längre." }, { status: 403 });
    const name = parsePlayerName(body.name);
    if (!name.ok) return Response.json({ error: guestNameErrors[name.error] }, { status: 400 });
    const result = await party(ctx.env).join(name.value, body.reclaim === true);
    if (result.status === "closed") return Response.json({ error: "Kalaset är slut. Tack för att du var med!" }, { status: 403 });
    if (result.status === "exists") return Response.json(result satisfies JoinResponse);
    const cookie = setCookie("pid", await pidCookieValue(result.id, ctx.env.JOIN_SECRET));
    return Response.json({ status: "joined" } satisfies JoinResponse, { headers: { "Set-Cookie": cookie } });
  }),

  // The page hands the guest a copy of their signed identity, for /api/restore when Safari loses the cookie.
  route("GET", "/app", async (ctx) => {
    const pid = readCookie(ctx.req, "pid");
    return (await guest(ctx)) ? pageResponse(await page(ctx, "guest"), { pid: pid! }) : redirect("/");
  }),

  // Restores only a player who still exists, so a phone is never signed back in to a player a reset or a wipe deleted.
  // Joins that closed at the end of the party stop new guests only.
  route("POST", "/api/restore", async (ctx) => {
    const { pid } = await readJson(ctx.req);
    const id = sameOrigin(ctx.req) && typeof pid === "string" ? await playerFromCookie(pid, ctx.env.JOIN_SECRET) : null;
    if (!id || !(await party(ctx.env).isPlayer(id))) return status(403);
    return new Response(null, { status: 204, headers: { "Set-Cookie": setCookie("pid", pid as string) } });
  }),

  route("GET", "/ws", async (ctx) => {
    const playerId = await guest(ctx);
    return playerId ? socket(ctx, { role: "guest", playerId }) : status(401);
  }),

  route("GET", "/admin/:secret", async (ctx) => {
    if (!secretMatches(ctx.params.secret ?? "", ctx.env.ADMIN_SECRET)) return notFound();
    return redirect("/admin", setCookie("admin", await adminCookieValue(ctx.env.ADMIN_SECRET)));
  }),

  route("GET", "/admin", adminOnly((ctx) => entry(ctx, "admin"))),

  route("GET", "/ws/admin", adminOnly((ctx) => socket(ctx, { role: "admin" }))),

  route("PUT", "/api/admin/landing-photo", adminOnly((ctx) => adminPhoto(ctx, (upload) => party(ctx.env).setLandingPhoto(upload)))),

  route("DELETE", "/api/admin/landing-photo", adminOnly(async (ctx) => {
    await party(ctx.env).clearLandingPhoto();
    return status(204);
  })),

  route("DELETE", "/api/admin/party", adminOnly(async (ctx) => {
    const error = await party(ctx.env).wipe();
    return error ? Response.json({ error }, { status: 409 }) : status(204);
  })),

  // A form on a sibling subdomain could post here with the Lax admin cookie, so only this origin may.
  route("POST", "/api/admin/party/reset", adminOnly(async (ctx) => {
    if (!sameOrigin(ctx.req)) return status(403);
    await party(ctx.env).resetParty();
    return status(204);
  })),

  route("POST", CONTEST_UPLOAD_PATH, uploadContest),

  route("PUT", "/api/admin/question-photo", adminOnly((ctx) => adminPhoto(ctx, (upload) => party(ctx.env).addQuestionPhoto(upload)))),

  route("GET", "/photos/:id", async (ctx) => {
    const viewer = await photoViewer(ctx);
    if (!viewer) return status(401);
    const id = parsePhotoId(ctx.params.id);
    if (!id) return notFound();
    return photoResponse(id, await party(ctx.env).photo(viewer, id, clientHas(ctx.req, id)));
  }),
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
