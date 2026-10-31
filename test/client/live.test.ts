import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectLive, type Live, type LiveStatus } from "../../src/client/live";

class FakeSocket {
  static all: FakeSocket[] = [];
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  static latest(): FakeSocket {
    return FakeSocket.all.at(-1)!;
  }
}

function eventTarget() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener: (type: string, fn: () => void) => void listeners.set(type, (listeners.get(type) ?? new Set()).add(fn)),
    removeEventListener: (type: string, fn: () => void) => void listeners.get(type)?.delete(fn),
    fire: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
  };
}

let win: ReturnType<typeof eventTarget>;
let doc: ReturnType<typeof eventTarget> & { visibilityState: string };
let statuses: LiveStatus[];
let live: Live;

const retryDelay = () => {
  const status = statuses.at(-1)!;
  if (status.kind !== "waiting") throw new Error(`expected waiting, got ${status.kind}`);
  return status.retryAt - Date.now();
};

const dropAfter = (ms: number) => {
  const socket = FakeSocket.latest();
  socket.onopen!();
  vi.advanceTimersByTime(ms);
  socket.onclose!();
  return retryDelay();
};

const waitOutRetry = () => {
  const sockets = FakeSocket.all.length;
  vi.advanceTimersByTime(retryDelay() - 1);
  expect(FakeSocket.all, "no reconnect before the advertised delay").toHaveLength(sockets);
  vi.advanceTimersByTime(1);
  expect(FakeSocket.all, "reconnects at the advertised delay").toHaveLength(sockets + 1);
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.all = [];
  win = eventTarget();
  doc = { ...eventTarget(), visibilityState: "visible" };
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("location", { href: "https://party.test/app" });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("addEventListener", win.addEventListener);
  vi.stubGlobal("removeEventListener", win.removeEventListener);
  statuses = [];
  live = connectLive("/ws", { onMessage: () => {}, onStatus: (s) => statuses.push(s) });
});

afterEach(() => {
  live.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("connectLive", () => {
  it("connects over wss to the given path", () => {
    expect(FakeSocket.latest().url).toBe("wss://party.test/ws");
  });

  it("backs off further on each connection that opens and drops at once", () => {
    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      delays.push(dropAfter(200));
      waitOutRetry();
    }
    expect(delays).toEqual([375, 750, 1500, 3000, 6000, 7500]);
    expect(FakeSocket.all).toHaveLength(7);
  });

  it("starts backoff over after a connection that stayed up", () => {
    dropAfter(200);
    waitOutRetry();
    dropAfter(200);
    waitOutRetry();
    expect(dropAfter(10_500)).toBe(375);
  });

  it("pings every 5 s while open and reconnects 11 s after the server goes silent", () => {
    const socket = FakeSocket.latest();
    socket.onopen!();
    vi.advanceTimersByTime(5_000);
    expect(socket.sent).toEqual(["ping"]);
    socket.onmessage!({ data: "pong" });
    vi.advanceTimersByTime(10_999);
    expect(socket.sent).toEqual(["ping", "ping", "ping"]);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(socket.closed).toBe(true);
    waitOutRetry();
  });

  it("keeps a socket that answers its pings", () => {
    const socket = FakeSocket.latest();
    socket.onopen!();
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(5_000);
      socket.onmessage!({ data: "pong" });
    }
    expect(socket.closed).toBe(false);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it("reconnects at once when the phone comes online or back to the foreground", () => {
    dropAfter(200);
    win.fire("online");
    expect(FakeSocket.all).toHaveLength(2);
    dropAfter(200);
    doc.fire("visibilitychange");
    expect(FakeSocket.all).toHaveLength(3);
  });

  it("replaces an open socket that went quiet while the phone slept, and keeps a live one", () => {
    const socket = FakeSocket.latest();
    socket.onopen!();
    socket.onmessage!({ data: "pong" });
    vi.advanceTimersByTime(10_000);
    doc.fire("visibilitychange");
    win.fire("online");
    expect(FakeSocket.all).toHaveLength(1);
    vi.setSystemTime(Date.now() + 1_001);
    doc.fire("visibilitychange");
    expect(socket.closed).toBe(true);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("stops retrying and listening after stop", () => {
    dropAfter(200);
    live.stop();
    vi.advanceTimersByTime(60_000);
    win.fire("online");
    doc.fire("visibilitychange");
    expect(FakeSocket.all).toHaveLength(1);
  });
});
