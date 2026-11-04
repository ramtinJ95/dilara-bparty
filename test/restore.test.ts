import { describe, expect, it } from "vitest";
import { adminCookie, call, connectAdmin, cookieOf, joinedCookie, ORIGIN } from "./support/worker";

const restore = (pid: unknown, origin = ORIGIN) =>
  call("/api/restore", { method: "POST", body: JSON.stringify({ pid }), headers: { "Content-Type": "application/json", Origin: origin } });

const valueOf = (cookie: string) => cookie.slice("pid=".length);

const resetParty = async () =>
  expect((await call("/api/admin/party/reset", { method: "POST", cookie: await adminCookie(), headers: { Origin: ORIGIN } })).status).toBe(204);

const pageMeta = async (res: Response, name: string) => {
  const html = await res.text();
  return new RegExp(`<meta name="${name}" content="([^"]*)">`).exec(html)?.[1];
};

describe("staying signed in", () => {
  it("sends a joined guest from / straight to /app, and anyone else gets the neutral page", async () => {
    const cookie = await joinedCookie("Astrid");
    const joined = await call("/", { cookie });
    expect(joined.status).toBe(302);
    expect(joined.headers.get("Location")).toBe("/app");

    expect((await call("/")).status).toBe(200);
    expect((await call("/", { cookie: "pid=garbage" })).status).toBe(200);
    await resetParty();
    const deleted = await call("/", { cookie });
    expect(deleted.status, "a deleted player's cookie is not a way back").toBe(200);
    expect(await deleted.text()).toContain('id="code-form"');
  });

  it("puts the signed identity, the same value as the cookie, in the /app page", async () => {
    const cookie = await joinedCookie("Astrid");
    expect(await pageMeta(await call("/app", { cookie }), "pid")).toBe(valueOf(cookie));
  });

  it("restores the cookie from a phone's saved copy, and the phone is back in the app", async () => {
    const cookie = await joinedCookie("Astrid");
    const res = await restore(valueOf(cookie));
    expect(res.status).toBe(204);
    expect(cookieOf(res, "pid")).toBe(cookie);
    for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=604800"]) expect(res.headers.getSetCookie()[0]).toContain(attribute);
    expect((await call("/app", { cookie: cookieOf(res, "pid") })).status).toBe(200);
  });

  it("refuses a tampered, malformed or missing copy, and a request from another origin", async () => {
    const [id, sig] = valueOf(await joinedCookie("Astrid")).split(".");
    const other = valueOf(await joinedCookie("Olle")).split(".")[0];
    const flipped = sig!.slice(0, -1) + (sig!.endsWith("A") ? "B" : "A");
    for (const bad of [`${id}.${flipped}`, `${other}.${sig}`, id, "garbage", "", undefined, 42]) {
      const res = await restore(bad);
      expect(res.status, String(bad)).toBe(403);
      expect(res.headers.getSetCookie()).toEqual([]);
    }
    expect((await restore(`${id}.${sig}`, "https://elsewhere.test")).status).toBe(403);
  });

  it("refuses the copy of a player that a reset or a wipe deleted", async () => {
    const beforeReset = valueOf(await joinedCookie("Astrid"));
    await resetParty();
    expect((await restore(beforeReset)).status).toBe(403);

    const beforeWipe = valueOf(await joinedCookie("Olle"));
    const admin = await connectAdmin();
    admin.send({ t: "joins", open: false });
    await admin.state((s) => !s.finale.joins);
    expect((await call("/api/admin/party", { method: "DELETE", cookie: await adminCookie() })).status).toBe(204);
    expect((await restore(beforeWipe)).status).toBe(403);
    admin.close();
  });

  it("restores a guest who joined before the party ended, since joins close only for new guests", async () => {
    const pid = valueOf(await joinedCookie("Astrid"));
    const admin = await connectAdmin();
    admin.send({ t: "joins", open: false });
    await admin.state((s) => !s.finale.joins);
    const res = await restore(pid);
    expect(res.status).toBe(204);
    expect(cookieOf(res, "pid")).toBe(`pid=${pid}`);
    admin.close();
  });
});
