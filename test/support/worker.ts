import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { expect } from "vitest";
import type { JoinResponse } from "../../src/shared/api";
import type { AdminCmd, AdminState, GuestState, ServerMsg } from "../../src/shared/protocol";

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
      this.inbox.push(JSON.parse(e.data as string));
      this.waiter?.();
    });
    ws.addEventListener("close", () => {
      this.closed = true;
      this.waiter?.();
    });
  }

  async next(accept: (msg: ServerMsg<S>) => boolean = () => true): Promise<ServerMsg<S>> {
    const deadline = Date.now() + 2000;
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

  async state(accept: (state: S) => boolean = () => true): Promise<S> {
    const msg = await this.next((m) => m.t === "state" && accept(m.state));
    return (msg as { t: "state"; state: S }).state;
  }

  send(cmd: AdminCmd): void {
    this.ws.send(JSON.stringify(cmd));
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
