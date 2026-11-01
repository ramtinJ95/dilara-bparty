import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTEST_UPLOAD_PATH } from "../../src/shared/api";
import { MAX_ATTEMPTS, retryPlan, STALL_MS, startUpload, type Upload, type UploadPhase } from "../../src/client/upload";

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
let net: { onLine: boolean };
let doc: { visibilityState: "visible" | "hidden"; addEventListener: typeof addEventListener; removeEventListener: typeof removeEventListener };

const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn());
const last = () => phases.at(-1)!;
const retryDelay = () => {
  const phase = last();
  if (phase.phase !== "waiting" || phase.retryAt === null) throw new Error(`expected a timed wait, got ${JSON.stringify(phase)}`);
  return phase.retryAt - Date.now();
};
const keys = () => new Set(FakeXhr.all.map((x) => x.body!.get("key")));

beforeEach(() => {
  vi.useFakeTimers();
  FakeXhr.all = [];
  listeners = new Map();
  vi.spyOn(Math, "random").mockReturnValue(1);
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("addEventListener", (type: string, fn: () => void) => void listeners.set(type, (listeners.get(type) ?? new Set()).add(fn)));
  vi.stubGlobal("removeEventListener", (type: string, fn: () => void) => void listeners.get(type)?.delete(fn));
  net = { onLine: true };
  vi.stubGlobal("navigator", net);
  doc = { visibilityState: "visible", addEventListener, removeEventListener };
  vi.stubGlobal("document", doc);
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

  it("retries network errors and 5xx with growing delays and the same key, then stops after a few tries", () => {
    const delays: number[] = [];
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      if (i % 2) FakeXhr.latest().onerror!();
      else FakeXhr.latest().respond(503, "busy");
      delays.push(retryDelay());
      vi.advanceTimersByTime(retryDelay() - 1);
      expect(FakeXhr.all, "no retry before the advertised time").toHaveLength(i);
      vi.advanceTimersByTime(1);
      expect(FakeXhr.all, "retries at the advertised time").toHaveLength(i + 1);
    }
    expect(delays).toEqual([1000, 2000, 4000]);
    FakeXhr.latest().onerror!();
    expect(last()).toEqual({ phase: "stuck" });
    vi.advanceTimersByTime(10 * 60_000);
    fire("online");
    fire("visibilitychange");
    upload.resume();
    expect(FakeXhr.all, "nothing retries on its own once stuck").toHaveLength(MAX_ATTEMPTS);
    expect(keys().size).toBe(1);
  });

  it("starts a new round of tries with the same key when the guest taps retry", () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      FakeXhr.latest().onerror!();
      vi.runOnlyPendingTimers();
    }
    expect(last()).toEqual({ phase: "stuck" });
    upload.retry();
    expect(FakeXhr.all).toHaveLength(MAX_ATTEMPTS + 1);
    expect(last().phase).toBe("sending");
    upload.retry();
    expect(FakeXhr.all, "a tap while sending does not start another request").toHaveLength(MAX_ATTEMPTS + 1);
    FakeXhr.latest().onerror!();
    expect(retryDelay(), "the backoff starts over").toBe(1000);
    upload.retry();
    expect(FakeXhr.all, "a tap while waiting sends at once").toHaveLength(MAX_ATTEMPTS + 2);
    FakeXhr.latest().respond(200, { id: ID });
    upload.retry();
    expect(FakeXhr.all, "a tap after it is done does nothing").toHaveLength(MAX_ATTEMPTS + 2);
    expect(keys().size).toBe(1);
  });

  it("gives up on a request that stops making progress, within the stall window", () => {
    const xhr = FakeXhr.latest();
    xhr.upload.onprogress!({ loaded: 100 });
    vi.advanceTimersByTime(STALL_MS - 1);
    expect(last().phase).toBe("sending");
    vi.advanceTimersByTime(1);
    expect(xhr.aborted).toBe(true);
    expect(last()).toEqual({ phase: "waiting", retryAt: Date.now() + 1000 });
    expect(STALL_MS).toBeLessThanOrEqual(10_000);
  });

  it("lets a slow upload that keeps making progress run as long as it needs", () => {
    const xhr = FakeXhr.latest();
    for (let loaded = 10; loaded <= 400; loaded += 10) {
      vi.advanceTimersByTime(STALL_MS - 1);
      xhr.upload.onprogress!({ loaded });
    }
    expect(xhr.aborted, `${(40 * (STALL_MS - 1)) / 1000} s in`).toBe(false);
    expect(last()).toEqual({ phase: "sending", sent: 400, total: 400 });
    vi.advanceTimersByTime(STALL_MS);
    expect(xhr.aborted, "every byte sent but no response is a stall too").toBe(true);
  });

  it("waits for the network instead of a timer while the phone is offline", () => {
    net.onLine = false;
    FakeXhr.latest().onerror!();
    expect(last()).toEqual({ phase: "waiting", retryAt: null });
    vi.advanceTimersByTime(10 * 60_000);
    expect(FakeXhr.all, "no request while offline, however long").toHaveLength(1);
    net.onLine = true;
    fire("online");
    expect(FakeXhr.all).toHaveLength(2);
    expect(keys().size).toBe(1);
  });

  it("does not use up a try when the phone goes offline during the backoff", () => {
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      FakeXhr.latest().onerror!();
      if (i < MAX_ATTEMPTS - 1) vi.runOnlyPendingTimers();
    }
    net.onLine = false;
    vi.runOnlyPendingTimers();
    expect(FakeXhr.all).toHaveLength(MAX_ATTEMPTS - 1);
    expect(last()).toEqual({ phase: "waiting", retryAt: null });
    net.onLine = true;
    fire("online");
    expect(FakeXhr.all, "the last automatic try goes out when the network is back").toHaveLength(MAX_ATTEMPTS);
    FakeXhr.latest().respond(200, { id: ID });
    expect(last()).toEqual({ phase: "done", id: ID });
  });

  it("retries at once when the page comes back to the foreground or the live socket reconnects", () => {
    FakeXhr.latest().onerror!();
    doc.visibilityState = "hidden";
    fire("visibilitychange");
    expect(FakeXhr.all, "going to the background does not retry").toHaveLength(1);
    doc.visibilityState = "visible";
    fire("visibilitychange");
    expect(FakeXhr.all).toHaveLength(2);
    FakeXhr.latest().onerror!();
    upload.resume();
    expect(FakeXhr.all).toHaveLength(3);
    upload.resume();
    expect(FakeXhr.all, "resume while sending does not restart").toHaveLength(3);
  });

  it("does not use up tries when the page comes back to the foreground while still offline", () => {
    net.onLine = false;
    FakeXhr.latest().onerror!();
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
      doc.visibilityState = "hidden";
      fire("visibilitychange");
      doc.visibilityState = "visible";
      fire("visibilitychange");
      upload.resume();
    }
    expect(FakeXhr.all, "no request while offline").toHaveLength(1);
    expect(last()).toEqual({ phase: "waiting", retryAt: null });
    net.onLine = true;
    fire("online");
    expect(FakeXhr.all).toHaveLength(2);
    FakeXhr.latest().respond(200, { id: ID });
    expect(last()).toEqual({ phase: "done", id: ID });
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
    fire("visibilitychange");
    upload.resume();
    upload.retry();
    expect(FakeXhr.all).toHaveLength(1);
  });
});

describe("retryPlan", () => {
  it("backs off on a timer while online, waits for the network while offline, and stops at the cap", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    expect([1, 2, 3].map((n) => retryPlan(n, true))).toEqual([1000, 2000, 4000].map((delayMs) => ({ kind: "timer", delayMs })));
    expect(retryPlan(1, false)).toEqual({ kind: "network" });
    expect(retryPlan(MAX_ATTEMPTS, true)).toEqual({ kind: "stop" });
    expect(retryPlan(MAX_ATTEMPTS, false)).toEqual({ kind: "stop" });
  });
});
