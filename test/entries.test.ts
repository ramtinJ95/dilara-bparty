import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

const get = (path: string) => exports.default.fetch(`https://party.test${path}`);

it("serves HTML entries only through Worker routes", async () => {
  for (const path of ["/", "/j/abc", "/admin"]) {
    const res = await get(path);
    expect(res.status, path).toBe(200);
    expect(await res.text(), path).toContain("<!doctype html>");
  }
  for (const path of ["/neutral.html", "/guest.html", "/admin.html", "/guest"]) {
    expect((await get(path)).status, path).toBe(404);
  }
});
