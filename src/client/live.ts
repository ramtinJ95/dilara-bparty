import { useEffect, useRef, useState } from "preact/hooks";
import { HEARTBEATS, PING, PONG, TICK, type Heartbeat, type ServerMsg } from "../shared/protocol";

export type LiveStatus = { kind: "connecting" } | { kind: "open" } | { kind: "waiting"; retryAt: number };
type Delivered<S> = Exclude<ServerMsg<S>, { t: "ack" }>;
export type SideMsg<S> = Exclude<Delivered<S>, { t: "state" }>;

const BACKOFF_FIRST_MS = 500;
const BACKOFF_MAX_MS = 10_000;
const STABLE_AFTER_MS = 10_000;
// The server answers each command with an ack or an error, and each check ping with a pong, to this socket alone.
// Each must come within 5 s. Ticks and state broadcasts don't count: they keep coming when the phone's own messages don't get through.
// In slow mode the phone checks its socket when the guest looks or acts, at most every 15 s.
const REPLY_WITHIN_MS = 5_000;
const PROBE_GAP_MS = 15_000;

type Handlers<S> = { onMessage: (msg: Delivered<S>) => void; onStatus: (status: LiveStatus) => void };

// Jitter spreads the retries of phones that lost the same network at once.
export const backoffMs = (failures: number, firstMs: number, maxMs: number) => Math.min(maxMs, firstMs * 2 ** failures) * (0.5 + Math.random() / 2);

export type Live = { send: (data: string) => boolean; check: () => void; stop: () => void };

function socketUrl(path: string): string {
  const url = new URL(path, location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

export function connectLive<S>(path: string, { onMessage, onStatus }: Handlers<S>): Live {
  let status: LiveStatus = { kind: "connecting" };
  let socket: WebSocket | null = null;
  let failures = 0;
  let openedAt = 0;
  let lastHeard = 0;
  let lastProbe = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  let deferredCheck: ReturnType<typeof setTimeout> | undefined;
  let replyTimer: ReturnType<typeof setTimeout> | undefined;
  let pending = 0;
  let heartbeat: Heartbeat = "fast";

  const enter = (next: LiveStatus) => {
    status = next;
    onStatus(next);
  };

  const heard = () => {
    lastHeard = Date.now();
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(retryLater, HEARTBEATS[heartbeat].silentMs);
  };

  const awaitReply = () => {
    clearTimeout(replyTimer);
    replyTimer = pending > 0 ? setTimeout(retryLater, REPLY_WITHIN_MS) : undefined;
  };

  const expectReply = () => {
    pending++;
    if (pending === 1) awaitReply();
  };

  const replied = () => {
    pending = Math.max(0, pending - 1);
    awaitReply();
  };

  const forgetReplies = () => {
    pending = 0;
    awaitReply();
  };

  const drop = () => {
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onclose = null;
    socket.close();
    socket = null;
  };

  function open() {
    clearTimeout(retryTimer);
    drop();
    forgetReplies();
    enter({ kind: "connecting" });
    // Fast until this socket's first snapshot says otherwise, so a stalled connect mid-quiz never waits out the slow limit.
    heartbeat = "fast";
    const ws = new WebSocket(socketUrl(path));
    socket = ws;
    heard();
    ws.onopen = () => {
      openedAt = Date.now();
      heard();
      enter({ kind: "open" });
    };
    ws.onmessage = (event: MessageEvent<string>) => {
      const msg = event.data === TICK || event.data === PONG ? null : (JSON.parse(event.data) as ServerMsg<S>);
      if (msg?.t === "state") heartbeat = msg.heartbeat;
      if (event.data === PONG || msg?.t === "ack" || msg?.t === "error") replied();
      heard();
      if (msg && msg.t !== "ack") onMessage(msg);
    };
    ws.onclose = retryLater;
  }

  function retryLater() {
    if (openedAt && Date.now() - openedAt >= STABLE_AFTER_MS) failures = 0;
    openedAt = 0;
    drop();
    forgetReplies();
    clearTimeout(silenceTimer);
    const delay = backoffMs(failures++, BACKOFF_FIRST_MS, BACKOFF_MAX_MS);
    enter({ kind: "waiting", retryAt: Date.now() + delay });
    retryTimer = setTimeout(open, delay);
  }

  const check = () => {
    clearTimeout(deferredCheck);
    if (status.kind === "waiting") return open();
    if (status.kind !== "open" || !socket) return;
    if (Date.now() - lastHeard > HEARTBEATS[heartbeat].silentMs) return open();
    if (heartbeat === "fast") return;
    const wait = lastProbe + PROBE_GAP_MS - Date.now();
    if (wait > 0) return void (deferredCheck = setTimeout(check, wait));
    lastProbe = Date.now();
    socket.send(PING);
    expectReply();
  };
  const onVisibility = () => document.visibilityState === "visible" && check();

  addEventListener("online", check);
  document.addEventListener("visibilitychange", onVisibility);
  open();

  return {
    send: (data) => {
      if (status.kind !== "open" || !socket) return false;
      socket.send(data);
      expectReply();
      return true;
    },
    check,
    stop: () => {
      clearTimeout(deferredCheck);
      clearTimeout(retryTimer);
      clearTimeout(silenceTimer);
      forgetReplies();
      removeEventListener("online", check);
      document.removeEventListener("visibilitychange", onVisibility);
      drop();
    },
  };
}

export function useLive<S>(path: string, onSide: (msg: SideMsg<S>) => void) {
  const [state, setState] = useState<{ state: S; heartbeat: Heartbeat } | null>(null);
  const [status, setStatus] = useState<LiveStatus>({ kind: "connecting" });
  const live = useRef<Live | null>(null);
  const side = useRef(onSide);
  side.current = onSide;

  useEffect(() => {
    live.current = connectLive<S>(path, {
      onMessage: (msg) => (msg.t === "state" ? setState({ state: msg.state, heartbeat: msg.heartbeat }) : side.current(msg)),
      onStatus: setStatus,
    });
    return () => live.current?.stop();
  }, [path]);

  return {
    state: state?.state ?? null,
    heartbeat: state?.heartbeat ?? null,
    status,
    send: (data: string) => live.current?.send(data) ?? false,
    check: () => live.current?.check(),
  };
}
