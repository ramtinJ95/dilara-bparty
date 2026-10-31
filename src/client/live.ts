import { useEffect, useRef, useState } from "preact/hooks";
import { PING, PONG, type ServerMsg } from "../shared/protocol";

export type LiveStatus = { kind: "connecting" } | { kind: "open" } | { kind: "waiting"; retryAt: number };
export type SideMsg<S> = Exclude<ServerMsg<S>, { t: "state" }>;

const PING_EVERY_MS = 25_000;
const SILENCE_LIMIT_MS = 40_000;
const BACKOFF_FIRST_MS = 500;
const BACKOFF_MAX_MS = 10_000;
const STABLE_AFTER_MS = 10_000;

type Handlers<S> = { onMessage: (msg: ServerMsg<S>) => void; onStatus: (status: LiveStatus) => void };
export type Live = { send: (data: string) => boolean; stop: () => void };

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
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;

  const enter = (next: LiveStatus) => {
    status = next;
    onStatus(next);
  };

  const heard = () => {
    lastHeard = Date.now();
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(retryLater, SILENCE_LIMIT_MS);
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
    enter({ kind: "connecting" });
    const ws = new WebSocket(socketUrl(path));
    socket = ws;
    heard();
    ws.onopen = () => {
      openedAt = Date.now();
      heard();
      enter({ kind: "open" });
    };
    ws.onmessage = (event: MessageEvent<string>) => {
      heard();
      if (event.data !== PONG) onMessage(JSON.parse(event.data) as ServerMsg<S>);
    };
    ws.onclose = retryLater;
  }

  function retryLater() {
    if (openedAt && Date.now() - openedAt >= STABLE_AFTER_MS) failures = 0;
    openedAt = 0;
    drop();
    clearTimeout(silenceTimer);
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_FIRST_MS * 2 ** failures++) * (0.5 + Math.random() / 2);
    enter({ kind: "waiting", retryAt: Date.now() + delay });
    retryTimer = setTimeout(open, delay);
  }

  const wake = () => {
    const stale = status.kind === "open" && Date.now() - lastHeard > PING_EVERY_MS;
    if (status.kind === "waiting" || stale) open();
  };
  const onVisibility = () => document.visibilityState === "visible" && wake();
  const pinger = setInterval(() => status.kind === "open" && socket?.send(PING), PING_EVERY_MS);

  addEventListener("online", wake);
  document.addEventListener("visibilitychange", onVisibility);
  open();

  return {
    send: (data) => {
      if (status.kind !== "open" || !socket) return false;
      socket.send(data);
      return true;
    },
    stop: () => {
      clearInterval(pinger);
      clearTimeout(retryTimer);
      clearTimeout(silenceTimer);
      removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onVisibility);
      drop();
    },
  };
}

export function useLive<S>(path: string, onSide: (msg: SideMsg<S>) => void) {
  const [state, setState] = useState<S | null>(null);
  const [status, setStatus] = useState<LiveStatus>({ kind: "connecting" });
  const live = useRef<Live | null>(null);
  const side = useRef(onSide);
  side.current = onSide;

  useEffect(() => {
    live.current = connectLive<S>(path, {
      onMessage: (msg) => (msg.t === "state" ? setState(msg.state) : side.current(msg)),
      onStatus: setStatus,
    });
    return () => live.current?.stop();
  }, [path]);

  return { state, status, send: (data: string) => live.current?.send(data) ?? false };
}
