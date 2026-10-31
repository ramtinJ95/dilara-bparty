import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTEST_UPLOAD_PATH } from "../../src/shared/api";
import { startUpload, type Upload, type UploadPhase } from "../../src/client/upload";

class FakeXhr {
  static all: FakeXhr[] = [];
  method = "";
  url = "";
  body: FormData | null = null;
  aborted = false;
  status = 0;
  responseText = "";
  upload: { onprogress: ((e: { loaded: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeXhr.all.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = typeof body === "string" ? body : JSON.stringify(body);
    this.onload!();
  }
  static latest(): FakeXhr {
    return FakeXhr.all.at(-1)!;
  }
}

const ID = "AAAAAAAAAAAAAAAAAAAAAA";
const prepared = { photo: new Blob([new Uint8Array(300)]), thumb: new Blob([new Uint8Array(100)]) };

let listeners: Map<string, Set<() => void>>;
let phases: UploadPhase[];
let upload: Upload;

const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn());
const last = () => phases.at(-1)!;
const retryDelay = () => {
  const phase = last();
  if (phase.phase !== "waiting") throw new Error(`expected waiting, got ${phase.phase}`);
  return phase.retryAt - Date.now();
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeXhr.all = [];
  listeners = new Map();
  vi.spyOn(Math, "random").mockReturnValue(1);
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("addEventListener", (type: string, fn: () => void) => void listeners.set(type, (listeners.get(type) ?? new Set()).add(fn)));
  vi.stubGlobal("removeEventListener", (type: string, fn: () => void) => void listeners.get(type)?.delete(fn));
  phases = [];
  upload = startUpload(prepared, (p) => phases.push(p));
});

afterEach(() => {
  upload.cancel();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("startUpload", () => {
  it("posts the photo, thumb and a random key as multipart and reports progress", () => {
    const xhr = FakeXhr.latest();
    expect([xhr.method, xhr.url]).toEqual(["POST", CONTEST_UPLOAD_PATH]);
    expect(xhr.body!.get("key")).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(xhr.body!.get("photo")).toBeInstanceOf(Blob);
    expect(xhr.body!.get("thumb")).toBeInstanceOf(Blob);
    expect(last()).toEqual({ phase: "sending", sent: 0, total: 400 });
    xhr.upload.onprogress!({ loaded: 200 });
    expect(last()).toEqual({ phase: "sending", sent: 200, total: 400 });
    xhr.respond(200, { id: ID });
    expect(last()).toEqual({ phase: "done", id: ID });
  });

  it("retries network errors and 5xx with growing delays and the same key", () => {
    const key = FakeXhr.latest().body!.get("key");
    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      if (i % 2) FakeXhr.latest().respond(503, "busy");
      else FakeXhr.latest().onerror!();
      delays.push(retryDelay());
      vi.advanceTimersByTime(retryDelay() - 1);
      expect(FakeXhr.all, "no retry before the advertised time").toHaveLength(i + 1);
      vi.advanceTimersByTime(1);
      expect(FakeXhr.all, "retries at the advertised time").toHaveLength(i + 2);
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
    expect(new Set(FakeXhr.all.map((x) => x.body!.get("key")))).toEqual(new Set([key]));
  });

  it("gives up on a request that stops making progress and tries again", () => {
    const xhr = FakeXhr.latest();
    vi.advanceTimersByTime(20_000);
    xhr.upload.onprogress!({ loaded: 100 });
    vi.advanceTimersByTime(29_999);
    expect(last().phase).toBe("sending");
    vi.advanceTimersByTime(1);
    expect(xhr.aborted).toBe(true);
    expect(last().phase).toBe("waiting");
  });

  it("retries at once when the phone comes back online", () => {
    FakeXhr.latest().onerror!();
    fire("online");
    expect(FakeXhr.all).toHaveLength(2);
    expect(last().phase).toBe("sending");
    vi.advanceTimersByTime(5_000);
    expect(FakeXhr.all, "the pending retry timer is gone").toHaveLength(2);
    fire("online");
    expect(FakeXhr.all, "online while sending does not restart").toHaveLength(2);
  });

  it("fails with the server's message on a 4xx and stops retrying", () => {
    FakeXhr.latest().respond(403, { error: "Uppladdningen är stängd." });
    expect(last()).toEqual({ phase: "failed", error: "Uppladdningen är stängd." });
    vi.advanceTimersByTime(60_000);
    fire("online");
    expect(FakeXhr.all).toHaveLength(1);
  });

  it("falls back to a Swedish message when a 4xx has no JSON body", () => {
    FakeXhr.latest().respond(413, "Payload Too Large");
    expect(last()).toEqual({ phase: "failed", error: "Bilden är för stor. Prova en annan." });
  });

  it("stops everything on cancel", () => {
    FakeXhr.latest().onerror!();
    upload.cancel();
    vi.advanceTimersByTime(60_000);
    fire("online");
    expect(FakeXhr.all).toHaveLength(1);
  });
});
