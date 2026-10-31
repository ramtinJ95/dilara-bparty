export const PRIVACY_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
} as const;

const COOKIE_ATTRIBUTES = "HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800";

export function withPrivacyHeaders(res: Response): Response {
  if (res.webSocket) return res;
  const out = new Response(res.body, res);
  for (const [name, value] of Object.entries(PRIVACY_HEADERS)) out.headers.set(name, value);
  return out;
}

export const notFound = () => new Response("Not found", { status: 404 });

export const status = (code: number) => new Response(null, { status: code });

export function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location });
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export const setCookie = (name: string, value: string) => `${name}=${value}; ${COOKIE_ATTRIBUTES}`;

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of req.headers.get("Cookie")?.split(";") ?? []) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

const JSON_MAX_BYTES = 4096;

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const bytes = await readBody(req, JSON_MAX_BYTES);
  if (!bytes) return {};
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function readBody(req: Request, maxBytes: number): Promise<ArrayBuffer | null> {
  if (Number(req.headers.get("Content-Length") ?? 0) > maxBytes) return null;
  if (!req.body) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of req.body) {
    size += chunk.byteLength;
    if (size > maxBytes) return null;
    chunks.push(chunk);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out.buffer;
}

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("Origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
