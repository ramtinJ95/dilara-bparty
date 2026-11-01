import { describe, expect, it } from "vitest";
import { PHOTO_MAX_BYTES } from "../src/worker/photo-store";
import { ADMIN_SECRET, adminCookie, call, cookieOf, JOIN_SECRET, joinedCookie, ORIGIN, uploadLanding } from "./support/worker";

const landingMeta = /<meta name="landing-photo" content="([\w-]+)">/;
const landingPhotoOnPage = async () => (await (await call(`/j/${JOIN_SECRET}`)).text()).match(landingMeta)?.[1];

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

  it("refuses the admin page, APIs and socket without the admin cookie", async () => {
    const guest = await joinedCookie("Astrid");
    for (const cookie of [undefined, guest, "admin=forged", `admin=${(await adminCookie()).slice(6, -1)}`]) {
      const requests: [string, RequestInit][] = [
        ["/admin", {}],
        ["/api/admin/landing-photo", { method: "PUT", headers: { "Content-Type": "image/png" }, body: new Uint8Array([1]) }],
        ["/api/admin/landing-photo", { method: "DELETE" }],
        ["/api/admin/party", { method: "DELETE" }],
        ["/api/admin/question-photo", { method: "PUT", headers: { "Content-Type": "image/png" }, body: new Uint8Array([1]) }],
        ["/ws/admin", { headers: { Upgrade: "websocket", Origin: ORIGIN } }],
      ];
      for (const [path, init] of requests) {
        expect((await call(path, { ...init, cookie })).status, `${init.method ?? "GET"} ${path} with ${cookie}`).toBe(404);
      }
    }
  });
});

describe("landing photo upload", () => {
  it("puts a new photo id on the landing page and keeps the old URL serving the old bytes", async () => {
    expect(await landingPhotoOnPage()).toBeUndefined();

    const first = (await (await uploadLanding(new Uint8Array([1, 1, 1]))).json()) as { id: string };
    expect(await landingPhotoOnPage()).toBe(first.id);

    const second = (await (await uploadLanding(new Uint8Array([2, 2]), "image/webp")).json()) as { id: string };
    expect(second.id).not.toBe(first.id);
    expect(await landingPhotoOnPage()).toBe(second.id);

    const old = await call(`/j/${JOIN_SECRET}/photos/${first.id}`);
    expect(new Uint8Array(await old.arrayBuffer())).toEqual(new Uint8Array([1, 1, 1]));
    const current = await call(`/j/${JOIN_SECRET}/photos/${second.id}`);
    expect(current.headers.get("Content-Type")).toBe("image/webp");
    expect(new Uint8Array(await current.arrayBuffer())).toEqual(new Uint8Array([2, 2]));
  });

  it("removes the photo from the landing page", async () => {
    await uploadLanding(new Uint8Array([1]));
    const res = await call("/api/admin/landing-photo", { method: "DELETE", cookie: await adminCookie() });
    expect(res.status).toBe(204);
    expect(await landingPhotoOnPage()).toBeUndefined();
  });

  it("accepts a photo at the size limit and refuses one byte more with 413", async () => {
    expect((await uploadLanding(new Uint8Array(PHOTO_MAX_BYTES))).status).toBe(200);
    expect((await uploadLanding(new Uint8Array(PHOTO_MAX_BYTES + 1))).status).toBe(413);
    expect(PHOTO_MAX_BYTES).toBeLessThanOrEqual(2_000_000);
  });

  it("counts the bytes of a body sent without Content-Length", async () => {
    const chunk = new Uint8Array(500_000);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 5; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    const res = await call("/api/admin/landing-photo", {
      method: "PUT",
      cookie: await adminCookie(),
      headers: { "Content-Type": "image/jpeg" },
      body,
    });
    expect(res.status).toBe(413);
  });

  it("refuses types other than JPEG, PNG and WebP", async () => {
    expect((await uploadLanding(new Uint8Array([1]), "image/gif")).status).toBe(415);
    expect((await uploadLanding(new Uint8Array([1]), "text/html")).status).toBe(415);
  });
});
