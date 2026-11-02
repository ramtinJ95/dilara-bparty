import type { BrowserContext, Page, WebSocketRoute } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { profiles, shapeNetwork, type ProfileName } from "../e2e/phone-network";

type End = { message(m: string): void; close(code: number, reason: string): void };

function end(name: string, log: string[]): { route: WebSocketRoute; peer: End } {
  const peer = {} as End;
  const route = {
    send: (m: string) => void log.push(`${name} got ${m}`),
    close: async ({ code }: { code?: number } = {}) => void log.push(`${name} closed ${code}`),
    onMessage: (h: End["message"]) => void (peer.message = h),
    onClose: (h: End["close"]) => void (peer.close = h),
  };
  return { route: route as unknown as WebSocketRoute, peer };
}

// The phone side of shapeNetwork with fake routes for both ends of one party socket, so the relay's order is observable.
async function shapedLink(profile: ProfileName) {
  const log: string[] = [];
  const page = end("page", log);
  const server = end("server", log);
  let open: ((ws: WebSocketRoute) => void) | undefined;
  const fakePage = { routeWebSocket: async (_: RegExp, handler: typeof open) => void (open = handler), route: async () => {} } as unknown as Page;
  const context = { browser: () => null, setOffline: async () => {} } as unknown as BrowserContext;
  const line = await shapeNetwork(context, fakePage, profile);
  open!(Object.assign(page.route, { connectToServer: () => server.route }));
  // The phone opens another socket, as it does to reconnect, and the result says whether the route connected it to the server.
  const reconnect = (name: string) => {
    let reached = false;
    open!(Object.assign(end(name, log).route, { connectToServer: () => ((reached = true), end(`${name}'s server`, log).route) }));
    return reached;
  };
  return { log, line, reconnect, page: page.peer, server: server.peer, settled: () => new Promise((r) => setTimeout(r, profiles[profile].latencyMs * 3 + 50)) };
}

describe("a shaped party socket", () => {
  it.each(Object.keys(profiles) as ProfileName[])("on %s delivers the server's last frames before its close", async (profile) => {
    const link = await shapedLink(profile);
    link.server.message('{"t":"gone"}');
    link.server.close(4004, "gone");
    await link.settled();
    expect(link.log).toEqual(['page got {"t":"gone"}', "page closed 4004"]);
  });

  it.each(Object.keys(profiles) as ProfileName[])("on %s drops what was still draining when the line is cut", async (profile) => {
    const link = await shapedLink(profile);
    link.server.message('{"t":"gone"}');
    link.server.close(4004, "gone");
    await link.line.cut("silent");
    await link.settled();
    expect(link.log).toEqual([]);
  });

  it.each(["clean", "silent"] as const)("refuses a socket opened during a %s cut, and connects the next one once the line is back", async (outage) => {
    const link = await shapedLink("good");
    await link.line.cut(outage);
    expect(link.reconnect("retry")).toBe(false);
    expect(link.log).toContain("retry closed 1006");
    await link.line.restore();
    expect(link.reconnect("after restore")).toBe(true);
  });

  it.each(Object.keys(profiles) as ProfileName[])("on %s delivers the phone's last frames before its close", async (profile) => {
    const link = await shapedLink(profile);
    link.page.message('{"t":"vote"}');
    link.page.close(1000, "");
    await link.settled();
    expect(link.log).toEqual(['server got {"t":"vote"}', "server closed 1000"]);
  });
});
