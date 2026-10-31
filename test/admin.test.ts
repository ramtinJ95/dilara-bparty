import { describe, expect, it } from "vitest";
import { ADMIN_SECRET, adminCookie, call, cookieOf, joinedCookie, ORIGIN } from "./support/worker";

describe("admin auth", () => {
  it("answers a wrong admin secret with 404 and no cookie", async () => {
    const res = await call("/admin/not-the-secret");
    expect(res.status).toBe(404);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("sets an HttpOnly admin cookie for the right secret", async () => {
    const res = await call(`/admin/${ADMIN_SECRET}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin");
    expect(res.headers.getSetCookie()[0]).toMatch(/^admin=[\w-]+; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=604800$/);
    const page = await call("/admin", { cookie: cookieOf(res, "admin") });
    expect(page.status).toBe(200);
    expect(page.headers.get("Content-Type")).toContain("text/html");
  });

  it("refuses the admin page and socket without the admin cookie", async () => {
    const guest = await joinedCookie("Astrid");
    for (const cookie of [undefined, guest, "admin=forged", `admin=${(await adminCookie()).slice(6, -1)}`]) {
      const requests: [string, RequestInit][] = [
        ["/admin", {}],
        ["/ws/admin", { headers: { Upgrade: "websocket", Origin: ORIGIN } }],
      ];
      for (const [path, init] of requests) {
        expect((await call(path, { ...init, cookie })).status, `${init.method ?? "GET"} ${path} with ${cookie}`).toBe(404);
      }
    }
  });
});
