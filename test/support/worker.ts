import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { expect } from "vitest";
import { CONTEST_UPLOAD_PATH, type JoinResponse } from "../../src/shared/api";
import { PING, PONG, type AdminCmd, type AdminState, type GuestCmd, type GuestState, type ServerMsg } from "../../src/shared/protocol";

export const ORIGIN = "https://party.test";
export const { JOIN_SECRET, ADMIN_SECRET } = env;

type Init = RequestInit & { cookie?: string | undefined };

export function call(path: string, { cookie, ...init }: Init = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  return exports.default.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers, redirect: "manual" }));
}

export function postJson(path: string, body: unknown, init: Init = {}): Promise<Response> {
  return call(path, { ...init, method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

export function cookieOf(res: Response, name: string): string | undefined {
  const header = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  return header?.split(";")[0];
}

export async function join(name: string, reclaim?: boolean): Promise<{ res: Response; body: JoinResponse; cookie: string | undefined }> {
  const res = await postJson("/api/join", { secret: JOIN_SECRET, name, reclaim });
  return { res, body: await res.json(), cookie: cookieOf(res, "pid") };
}

export async function joinedCookie(name: string): Promise<string> {
  const { body, cookie } = await join(name);
  expect(body).toEqual({ status: "joined" });
  return cookie!;
}

export async function adminCookie(): Promise<string> {
  return cookieOf(await call(`/admin/${ADMIN_SECRET}`), "admin")!;
}

export class TestSocket<S> {
  private readonly inbox: ServerMsg<S>[] = [];
  private waiter: (() => void) | undefined;
  closed = false;

  constructor(readonly ws: WebSocket) {
    ws.accept();
    ws.addEventListener("message", (e) => {
      if (e.data === PONG) return;
      this.inbox.push(JSON.parse(e.data as string));
      this.waiter?.();
    });
    ws.addEventListener("close", () => {
      this.closed = true;
      this.waiter?.();
    });
  }

  async next(accept: (msg: ServerMsg<S>) => boolean = () => true, waitMs = 2000): Promise<ServerMsg<S>> {
    const deadline = Date.now() + waitMs;
    for (;;) {
      const i = this.inbox.findIndex(accept);
      if (i >= 0) return this.inbox.splice(0, i + 1).at(-1)!;
      if (Date.now() > deadline) throw new Error(`no matching message; got ${JSON.stringify(this.inbox)}`);
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
        setTimeout(resolve, 50);
      });
    }
  }

  async state(accept: (state: S) => boolean = () => true, waitMs?: number): Promise<S> {
    const msg = await this.next((m) => m.t === "state" && accept(m.state), waitMs);
    return (msg as { t: "state"; state: S }).state;
  }

  send(cmd: AdminCmd | GuestCmd): void {
    this.ws.send(JSON.stringify(cmd));
  }

  ping(): void {
    this.ws.send(PING);
  }

  close(): void {
    if (!this.closed) this.ws.close(1000, "done");
  }
}

export async function connect<S>(path: string, cookie?: string): Promise<TestSocket<S>> {
  const res = await call(path, { cookie, headers: { Upgrade: "websocket", Origin: ORIGIN } });
  expect(res.status, `${path} upgrade`).toBe(101);
  return new TestSocket<S>(res.webSocket!);
}

export const connectGuest = (cookie: string) => connect<GuestState>("/ws", cookie);
export const connectAdmin = async () => connect<AdminState>("/ws/admin", await adminCookie());

export async function whoAmI(cookie: string): Promise<GuestState["you"]> {
  const socket = await connectGuest(cookie);
  try {
    return (await socket.state()).you;
  } finally {
    socket.close();
  }
}

export async function uploadLanding(bytes: Uint8Array, type = "image/png"): Promise<Response> {
  return call("/api/admin/landing-photo", { method: "PUT", cookie: await adminCookie(), headers: { "Content-Type": type }, body: bytes });
}

export const newUploadKey = () => crypto.getRandomValues(new Uint8Array(16)).toBase64({ alphabet: "base64url", omitPadding: true });

type ContestPart = { bytes: Uint8Array; type: string } | null;
type ContestUploadInit = { key?: string; photo?: ContestPart; thumb?: ContestPart };

export const jpeg = (...bytes: number[]) => ({ bytes: new Uint8Array([0xff, 0xd8, ...bytes]), type: "image/jpeg" });

export function uploadContest(cookie: string | undefined, init: ContestUploadInit = {}): Promise<Response> {
  const { key = newUploadKey(), photo = jpeg(1), thumb = jpeg(2) } = init;
  const form = new FormData();
  form.append("key", key);
  if (photo) form.append("photo", new File([photo.bytes], "photo.jpg", { type: photo.type }));
  if (thumb) form.append("thumb", new File([thumb.bytes], "thumb.jpg", { type: thumb.type }));
  return call(CONTEST_UPLOAD_PATH, { method: "POST", cookie, body: form });
}
