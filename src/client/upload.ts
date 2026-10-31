import { CONTEST_UPLOAD_PATH, UPLOAD_FIELDS } from "../shared/api";
import { parsePhotoId, type PhotoId, type UploadKey } from "../shared/model";
import type { Prepared } from "./photo-prep";

export type UploadPhase =
  | { phase: "sending"; sent: number; total: number }
  | { phase: "waiting"; retryAt: number }
  | { phase: "done"; id: PhotoId }
  | { phase: "failed"; error: string };

export type Upload = { cancel: () => void };

const BACKOFF_FIRST_MS = 1_000;
const BACKOFF_MAX_MS = 15_000;
const STALL_MS = 30_000;
const RETRYABLE = new Set([0, 408, 429]);
const FALLBACK_ERRORS: Record<number, string> = {
  413: "Bilden är för stor. Prova en annan.",
  415: "Den bilden gick inte att läsa. Prova en annan.",
};
const GENERIC_ERROR = "Något gick fel. Försök igen.";

export function newUploadKey(): UploadKey {
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

/** Sends one prepared photo, retrying network trouble with the same key so the server never stores it twice. */
export function startUpload(prepared: Prepared, onPhase: (phase: UploadPhase) => void, key = newUploadKey()): Upload {
  const total = prepared.photo.size + prepared.thumb.size;
  let failures = 0;
  let xhr: XMLHttpRequest | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let waiting = false;

  const finish = (phase: UploadPhase) => {
    stop();
    onPhase(phase);
  };

  const stall = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(retryLater, STALL_MS);
  };

  function send() {
    clearTimeout(retryTimer);
    waiting = false;
    const body = new FormData();
    body.append(UPLOAD_FIELDS.key, key);
    body.append(UPLOAD_FIELDS.photo, prepared.photo, "photo.jpg");
    body.append(UPLOAD_FIELDS.thumb, prepared.thumb, "thumb.jpg");
    const req = new XMLHttpRequest();
    xhr = req;
    req.open("POST", CONTEST_UPLOAD_PATH);
    req.upload.onprogress = (e) => {
      stall();
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
    stall();
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
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_FIRST_MS * 2 ** failures++) * (0.5 + Math.random() / 2);
    waiting = true;
    onPhase({ phase: "waiting", retryAt: Date.now() + delay });
    retryTimer = setTimeout(send, delay);
  }

  const online = () => waiting && send();

  function stop() {
    clearTimeout(retryTimer);
    waiting = false;
    drop();
    removeEventListener("online", online);
  }

  addEventListener("online", online);
  send();
  return { cancel: stop };
}
