import type { BrowserContext, CDPSession, Page, WebSocketRoute } from "@playwright/test";

export type ProfileName = "good" | "slow-4g" | "bad-3g" | "flaky";
export type NetworkProfile = { latencyMs: number; downKbps: number; upKbps: number };

export const profiles: Record<ProfileName, NetworkProfile> = {
  good: { latencyMs: 30, downKbps: 20_000, upKbps: 10_000 },
  "slow-4g": { latencyMs: 150, downKbps: 1_600, upKbps: 750 },
  "bad-3g": { latencyMs: 400, downKbps: 400, upKbps: 200 },
  flaky: { latencyMs: 250, downKbps: 1_000, upKbps: 500 },
};

// clean: the phone closes its socket, as Chrome does on a network change, so the server sees the phone leave.
// silent: the socket stays open on both ends but carries nothing, as in a tunnel; only the phone's heartbeat can notice.
export type Outage = "clean" | "silent";

export type Line = {
  profile: ProfileName;
  cut(outage: Outage): Promise<void>;
  restore(): Promise<void>;
  // Chromium only: Page.setWebLifecycleState freezes the page the way a phone freezes a background tab.
  // The server end of the party socket lives in the page, so cut before freezing or the server only hears the close on resume.
  lifecycle: { freeze(): Promise<void>; resume(): Promise<void> } | null;
};

const PARTY_SOCKET = /\/ws(\/admin)?$/;

type Link = { page: WebSocketRoute; server: WebSocketRoute; dead: boolean };

// One direction of a link: frames leave in order, each after the bytes ahead of it have gone through, then the latency.
function pipe(latencyMs: number, kbps: number) {
  let busyUntil = 0;
  return (link: Link, size: number, deliver: () => void) => {
    const now = Date.now();
    busyUntil = Math.max(now, busyUntil) + (size * 8) / kbps;
    setTimeout(() => link.dead || deliver(), busyUntil - now + latencyMs);
  };
}

// CDP network emulation throttles HTTP but not WebSocket frames, so the party socket goes through a Playwright route that delays its frames.
async function routeSocket(page: Page, profile: NetworkProfile, links: Set<Link>): Promise<void> {
  const up = pipe(profile.latencyMs, profile.upKbps);
  const down = pipe(profile.latencyMs, profile.downKbps);
  await page.routeWebSocket(PARTY_SOCKET, (ws) => {
    const link: Link = { page: ws, server: ws.connectToServer(), dead: false };
    links.add(link);
    ws.onMessage((m) => up(link, m.length, () => link.server.send(m)));
    link.server.onMessage((m) => down(link, m.length, () => ws.send(m)));
    ws.onClose((code, reason) => {
      links.delete(link);
      if (!link.dead) void link.server.close({ code, reason });
    });
    link.server.onClose((code, reason) => {
      links.delete(link);
      if (!link.dead) void ws.close({ code, reason });
    });
  });
}

// The CDP conditions override Playwright's own offline flag for the page, so on Chromium the session that throttles must also go offline.
async function throttleHttp(page: Page, profile: NetworkProfile, cdp: CDPSession | null): Promise<(offline: boolean) => Promise<void>> {
  if (cdp) {
    const apply = async (offline: boolean) => {
      await cdp.send("Network.emulateNetworkConditions", {
        offline,
        latency: profile.latencyMs,
        downloadThroughput: (profile.downKbps * 1000) / 8,
        uploadThroughput: (profile.upKbps * 1000) / 8,
      });
    };
    await cdp.send("Network.enable");
    await apply(false);
    return apply;
  }
  await page.route("**/*", async (route) => {
    await new Promise((r) => setTimeout(r, profile.latencyMs));
    await route.fallback();
  });
  return async () => {};
}

export async function shapeNetwork(context: BrowserContext, page: Page, name: ProfileName): Promise<Line> {
  const profile = profiles[name];
  const cdp = context.browser()?.browserType().name() === "chromium" ? await context.newCDPSession(page) : null;
  const links = new Set<Link>();
  // Silently cut links keep their server end open until the network is back, when the dead connection finally resets.
  const silenced: Link[] = [];
  await routeSocket(page, profile, links);
  const setOffline = await throttleHttp(page, profile, cdp);
  return {
    profile: name,
    async cut(outage) {
      await context.setOffline(true);
      await setOffline(true);
      for (const link of links) {
        link.dead = true;
        if (outage === "clean") await Promise.all([link.page.close({ code: 1006 }), link.server.close({ code: 1000 })]);
        else silenced.push(link);
      }
      links.clear();
    },
    async restore() {
      await context.setOffline(false);
      await setOffline(false);
      await Promise.all(silenced.splice(0).map((link) => link.server.close({ code: 1000 })));
    },
    lifecycle: cdp && {
      async freeze() {
        await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
      },
      async resume() {
        await cdp.send("Page.setWebLifecycleState", { state: "active" });
      },
    },
  };
}
