import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { call, JOIN_SECRET, joinedCookie, postJson } from "./support/worker";

const assetPaths = (html: string) => [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]!);

describe("privacy", () => {
  it("serves a robots.txt that blocks everything", async () => {
    const res = await env.ASSETS.fetch("https://party.test/robots.txt");
    expect(await res.text()).toBe("User-agent: *\nDisallow: /\n");
  });

  it("marks every Worker response noindex and no-referrer", async () => {
    const responses = [
      await call("/"),
      await call(`/j/${JOIN_SECRET}`),
      await call("/app"),
      await call("/nothing-here"),
      await postJson("/api/code", { code: "nope" }),
    ];
    for (const res of responses) {
      expect(res.headers.get("X-Robots-Tag"), res.url).toBe("noindex, nofollow, noarchive");
      expect(res.headers.get("Referrer-Policy"), res.url).toBe("no-referrer");
    }
  });

  it("asks robots not to index any HTML entry", async () => {
    const cookie = await joinedCookie("Astrid");
    for (const page of [await call("/"), await call(`/j/${JOIN_SECRET}`), await call("/app", { cookie })]) {
      expect(await page.text()).toContain('<meta name="robots" content="noindex, nofollow" />');
    }
  });

  it("refuses direct requests for the HTML entry files", async () => {
    for (const path of ["/neutral.html", "/guest.html", "/admin.html", "/guest", "/admin.html?x=1"]) {
      expect((await call(path)).status, path).toBe(404);
    }
  });

  it("keeps the bare page and everything it loads free of party details, even for a joined guest", async () => {
    const cookie = await joinedCookie("Astrid");
    for (const res of [await call("/"), await call("/", { cookie })]) {
      expect(res.status).toBe(200);
      const html = await res.text();
      const assets = assetPaths(html);
      expect(assets.length).toBeGreaterThan(0);
      for (const body of [html, ...(await Promise.all(assets.map(async (p) => (await env.ASSETS.fetch(`https://party.test${p}`)).text())))]) {
        expect(body).not.toMatch(/dilara|fyller|kalas/i);
      }
    }
  });
});
