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

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function readBody(req: Request, maxBytes: number): Promise<ArrayBuffer | null> {
  if (Number(req.headers.get("Content-Length") ?? 0) > maxBytes) return null;
  const bytes = await req.arrayBuffer();
  return bytes.byteLength > maxBytes ? null : bytes;
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
