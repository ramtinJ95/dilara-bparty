import { afterEach, describe, expect, it, vi } from "vitest";
import { putAdminPhoto } from "../../src/client/admin/photo-upload";
import { prepare } from "../../src/client/photo-prep";

vi.mock("../../src/client/photo-prep", () => ({ prepare: vi.fn() }));

const ID = "AAAAAAAAAAAAAAAAAAAAAA";
const PATH = "/api/admin/question-photo";
const shrunk = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

function serve(respond: () => Response | Promise<Response>) {
  const fetch = vi.fn(async (_path: string, _init: RequestInit) => respond());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function prepares(ok = true) {
  vi.mocked(prepare).mockImplementation(async () => {
    if (!ok) throw new Error("decode failed");
    return { photo: shrunk, thumb: new Blob() };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(prepare).mockReset();
});

describe("putAdminPhoto", () => {
  it("PUTs the shrunk JPEG to the path and returns the id the server sent", async () => {
    prepares();
    const fetch = serve(() => Response.json({ id: ID }));
    expect(await putAdminPhoto(PATH, new Blob())).toEqual({ ok: true, value: ID });
    const [path, init] = fetch.mock.calls[0]!;
    expect(path).toBe(PATH);
    expect(init).toMatchObject({ method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: shrunk });
  });

  it.each([
    ["a malformed id", () => Response.json({ id: "../not-an-id" })],
    ["no id", () => Response.json({})],
    ["a body that is not JSON", () => new Response("<html>")],
  ])("reports an upload error, not a photo, when a 200 carries %s", async (_, respond) => {
    prepares();
    serve(respond);
    expect(await putAdminPhoto(PATH, new Blob())).toEqual({ ok: false, error: "Upload failed. Try again." });
  });

  it.each([
    [413, "That photo is still too large after shrinking."],
    [415, "Use a JPEG, PNG or WebP photo."],
    [500, "Upload failed (HTTP 500)."],
  ])("explains HTTP %i", async (status, error) => {
    prepares();
    serve(() => new Response(null, { status }));
    expect(await putAdminPhoto(PATH, new Blob())).toEqual({ ok: false, error });
  });

  it("reports a network error", async () => {
    prepares();
    serve(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await putAdminPhoto(PATH, new Blob())).toEqual({ ok: false, error: "Network error. Try again." });
  });

  it("sends nothing when the image can't be read", async () => {
    prepares(false);
    const fetch = serve(() => Response.json({ id: ID }));
    expect(await putAdminPhoto(PATH, new Blob())).toEqual({ ok: false, error: "Couldn't read that image." });
    expect(fetch).not.toHaveBeenCalled();
  });
});
