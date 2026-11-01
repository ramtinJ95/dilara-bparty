import { CONTEST_UPLOAD_PATH, UPLOAD_FIELDS } from "../shared/api";
import { parsePhotoId, type PhotoId, type UploadKey } from "../shared/model";
import { backoffMs } from "./live";
import type { Prepared } from "./photo-prep";

export type UploadPhase =
  | { phase: "sending"; sent: number; total: number }
  // retryAt is null while the phone is offline: the next try waits for the network instead of a timer.
  | { phase: "waiting"; retryAt: number | null }
  | { phase: "stuck" }
  | { phase: "done"; id: PhotoId }
  | { phase: "failed"; error: string };

export type Upload = { cancel: () => void; retry: () => void; resume: () => void };

const BACKOFF_FIRST_MS = 1_000;
const BACKOFF_MAX_MS = 15_000;
// No upload progress and no response for this long means the connection is gone. A slow upload on bad 3G still reports progress every few hundred ms.
export const STALL_MS = 8_000;
export const MAX_ATTEMPTS = 4;
const RETRYABLE = new Set([0, 408, 429]);
const FALLBACK_ERRORS: Record<number, string> = {
  413: "Bilden är för stor. Prova en annan.",
  415: "Den bilden gick inte att läsa. Prova en annan.",
};
const GENERIC_ERROR = "Något gick fel. Försök igen.";

function newUploadKey(): UploadKey {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") as UploadKey;
}

function serverError(xhr: XMLHttpRequest): string {
  try {
    const error: unknown = JSON.parse(xhr.responseText)?.error;
    if (typeof error === "string") return error;
  } catch {}
  return FALLBACK_ERRORS[xhr.status] ?? GENERIC_ERROR;
}

function uploadedId(xhr: XMLHttpRequest): PhotoId | null {
  try {
    return parsePhotoId(JSON.parse(xhr.responseText)?.id);
  } catch {
    return null;
  }
}

export type RetryPlan = { kind: "timer"; delayMs: number } | { kind: "network" } | { kind: "stop" };

// Every try is a request against the daily allowance, so automatic tries stop at MAX_ATTEMPTS; only the guest's own tap starts a new round.
export function retryPlan(attempts: number, online: boolean): RetryPlan {
  if (attempts >= MAX_ATTEMPTS) return { kind: "stop" };
  return online ? { kind: "timer", delayMs: backoffMs(attempts - 1, BACKOFF_FIRST_MS, BACKOFF_MAX_MS) } : { kind: "network" };
}

/** Sends one prepared photo, retrying network trouble with the same key so the server never stores it twice. */
export function startUpload(prepared: Prepared, onPhase: (phase: UploadPhase) => void): Upload {
  const key = newUploadKey();
  const total = prepared.photo.size + prepared.thumb.size;
  let attempts = 0;
  let xhr: XMLHttpRequest | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let waiting = false;
  let over = false;

  const finish = (phase: UploadPhase) => {
    stop();
    onPhase(phase);
  };

  const watch = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(retryLater, STALL_MS);
  };

  function send() {
    clearTimeout(retryTimer);
    waiting = false;
    attempts++;
    const body = new FormData();
    body.append(UPLOAD_FIELDS.key, key);
    body.append(UPLOAD_FIELDS.photo, prepared.photo, "photo.jpg");
    body.append(UPLOAD_FIELDS.thumb, prepared.thumb, "thumb.jpg");
    const req = new XMLHttpRequest();
    xhr = req;
    req.open("POST", CONTEST_UPLOAD_PATH);
    req.upload.onprogress = (e) => {
      watch();
      onPhase({ phase: "sending", sent: Math.min(e.loaded, total), total });
    };
    req.onload = () => {
      if (req.status >= 200 && req.status < 300) {
        const id = uploadedId(req);
        return finish(id ? { phase: "done", id } : { phase: "failed", error: GENERIC_ERROR });
      }
      if (req.status >= 500 || RETRYABLE.has(req.status)) return retryLater();
      finish({ phase: "failed", error: serverError(req) });
    };
    req.onerror = retryLater;
    onPhase({ phase: "sending", sent: 0, total });
    watch();
    req.send(body);
  }

  function drop() {
    clearTimeout(stallTimer);
    if (!xhr) return;
    xhr.upload.onprogress = xhr.onload = xhr.onerror = null;
    xhr.abort();
    xhr = null;
  }

  function retryLater() {
    drop();
    const plan = retryPlan(attempts, navigator.onLine);
    waiting = plan.kind !== "stop";
    if (plan.kind === "stop") return onPhase({ phase: "stuck" });
    if (plan.kind === "network") return onPhase({ phase: "waiting", retryAt: null });
    onPhase({ phase: "waiting", retryAt: Date.now() + plan.delayMs });
    retryTimer = setTimeout(retryNow, plan.delayMs);
  }

  // A try while the phone is offline would only use up an attempt, whether the backoff ended or the page came back to the foreground.
  function retryNow() {
    if (navigator.onLine) return send();
    onPhase({ phase: "waiting", retryAt: null });
  }

  // The network may be back: an online event, the page coming to the foreground, or the live socket reconnecting.
  const resume = () => waiting && retryNow();
  const onVisibility = () => document.visibilityState === "visible" && resume();

  function stop() {
    over = true;
    clearTimeout(retryTimer);
    waiting = false;
    drop();
    removeEventListener("online", resume);
    document.removeEventListener("visibilitychange", onVisibility);
  }

  addEventListener("online", resume);
  document.addEventListener("visibilitychange", onVisibility);
  send();
  return {
    cancel: stop,
    resume,
    retry() {
      if (over || xhr) return;
      attempts = 0;
      send();
    },
  };
}
