import { useRef, useState } from "preact/hooks";
import type { PhotoId } from "../../shared/model";
import { prepare } from "../photo-prep";

export const uploadErrors: Record<number, string> = {
  413: "That photo is still too large after shrinking.",
  415: "Use a JPEG, PNG or WebP photo.",
};

export function LandingPhoto({ photo }: { photo: PhotoId | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function request(init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/landing-photo", init);
      if (!res.ok) setError(uploadErrors[res.status] ?? `Failed (HTTP ${res.status}).`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    let body: Blob;
    try {
      body = (await prepare(file)).photo;
    } catch {
      return setError("Couldn't read that image.");
    }
    await request({ method: "PUT", headers: { "Content-Type": "image/jpeg" }, body });
  }

  return (
    <section class="card landing-photo" aria-labelledby="landing-title">
      <h2 id="landing-title">Landing photo</h2>
      <div class="preview">{photo ? <img src={`/photos/${photo}`} alt="Current landing photo" /> : <span class="muted">No photo yet</span>}</div>
      <div class="row">
        <button class="btn small" type="button" disabled={busy} onClick={() => picker.current?.click()}>
          {busy ? "Working…" : photo ? "Replace photo" : "Upload photo"}
        </button>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (file) void upload(file);
          }}
        />
        {photo && (
          <button class="btn small secondary" type="button" disabled={busy} onClick={() => void request({ method: "DELETE" })}>
            Remove
          </button>
        )}
      </div>
      <p class="muted hint">Shown on the join page. Shrunk to a small JPEG before upload.</p>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
