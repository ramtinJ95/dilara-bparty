import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { PhotoId } from "../src/shared/model";
import { PhotoStore } from "../src/worker/photo-store";
import { adminCookie, call, JOIN_SECRET, joinedCookie, uploadLanding } from "./support/worker";

const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

async function landingPhoto(): Promise<PhotoId> {
  return ((await (await uploadLanding(bytes)).json()) as { id: PhotoId }).id;
}

const unknownId = "AAAAAAAAAAAAAAAAAAAAAA";

describe("/photos/<id>", () => {
  it("refuses requests without a valid pid or admin cookie with an empty 401", async () => {
    const id = await landingPhoto();
    const cookie = await joinedCookie("Astrid");
    for (const bad of [undefined, `${cookie.slice(0, -2)}xx`, "pid=AAAAAAAAAAAAAAAAAAAAAA.forged", "admin=forged"]) {
      const res = await call(`/photos/${id}`, { cookie: bad });
      expect(res.status, String(bad)).toBe(401);
      expect(await res.text()).toBe("");
    }
  });

  it("serves the bytes to a joined guest with immutable caching", async () => {
    const id = await landingPhoto();
    const res = await call(`/photos/${id}`, { cookie: await joinedCookie("Astrid") });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(res.headers.get("ETag")).toBe(`"${id}"`);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it("serves the bytes to the admin", async () => {
    const id = await landingPhoto();
    const res = await call(`/photos/${id}`, { cookie: await adminCookie() });
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it("answers a request carrying the ETag with an empty 304, for a guest and the admin", async () => {
    const id = await landingPhoto();
    for (const cookie of [await joinedCookie("Astrid"), await adminCookie()]) {
      const res = await call(`/photos/${id}`, { cookie, headers: { "If-None-Match": `"${id}"` } });
      expect(res.status).toBe(304);
      expect(res.headers.get("ETag")).toBe(`"${id}"`);
      expect(res.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
      expect(await res.text()).toBe("");
    }
  });

  it("answers an unknown or malformed id with 404", async () => {
    const cookie = await joinedCookie("Astrid");
    for (const id of [unknownId, "not-an-id", "..%2Fsettings"]) {
      expect((await call(`/photos/${id}`, { cookie })).status, id).toBe(404);
      expect((await call(`/photos/${id}`, { cookie, headers: { "If-None-Match": `"${id}"` } })).status, id).toBe(404);
    }
  });

  it("leaves the blob in the Durable Object when the viewer already holds the photo", async () => {
    const id = await landingPhoto();
    const stub = env.PARTY.getByName("party");
    expect(await stub.photo(id, true)).toEqual({ kind: "landing", mime: "image/png", bytes: null });
    expect(new Uint8Array((await stub.photo(id, false))!.bytes!)).toEqual(bytes);
  });
});

describe("/j/<secret>/photos/<id>", () => {
  it("serves landing photos to anyone holding the join link", async () => {
    const id = await landingPhoto();
    const res = await call(`/j/${JOIN_SECRET}/photos/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it("answers a request carrying the ETag with an empty 304", async () => {
    const id = await landingPhoto();
    const res = await call(`/j/${JOIN_SECRET}/photos/${id}`, { headers: { "If-None-Match": `"${id}"` } });
    expect(res.status).toBe(304);
    expect(res.headers.get("ETag")).toBe(`"${id}"`);
    expect(await res.text()).toBe("");
  });

  it("refuses a wrong secret and an unknown id", async () => {
    const id = await landingPhoto();
    expect((await call(`/j/not-the-secret/photos/${id}`)).status).toBe(404);
    expect((await call(`/j/${JOIN_SECRET}/photos/${unknownId}`)).status).toBe(404);
  });

  it("refuses photos of any other kind, as /photos does for a contest photo outside the gallery", async () => {
    const stub = env.PARTY.getByName("party");
    const id = await runInDurableObject(stub, (_, state) =>
      new PhotoStore(state.storage.sql).put({ kind: "contest", owner: null, mime: "image/jpeg", bytes: bytes.buffer }),
    );
    expect((await call(`/j/${JOIN_SECRET}/photos/${id}`)).status).toBe(404);
    expect((await call(`/photos/${id}`, { cookie: await joinedCookie("Astrid") })).status).toBe(404);
    expect((await call(`/photos/${id}`, { cookie: await adminCookie() })).status).toBe(200);
    const cached = { headers: { "If-None-Match": `"${id}"` } };
    expect((await call(`/j/${JOIN_SECRET}/photos/${id}`, cached)).status).toBe(404);
    expect((await call(`/photos/${id}`, { ...cached, cookie: await joinedCookie("Bertil") })).status).toBe(404);
  });
});
