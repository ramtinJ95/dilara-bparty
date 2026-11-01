import { useRef, useState } from "preact/hooks";
import type { PhotoId } from "../../shared/model";
import { photoUrl } from "../api";
import { putAdminPhoto } from "./photo-upload";

export function LandingPhoto({ photo }: { photo: PhotoId | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const result = await putAdminPhoto("/api/admin/landing-photo", file);
    if (!result.ok) setError(result.error);
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/landing-photo", { method: "DELETE" });
      if (!res.ok) setError(`Failed (HTTP ${res.status}).`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card landing-photo" aria-labelledby="landing-title">
      <h2 id="landing-title">Landing photo</h2>
      <div class="preview">{photo ? <img src={photoUrl(photo)} alt="Current landing photo" /> : <span class="muted">No photo yet</span>}</div>
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
          <button class="btn small secondary" type="button" disabled={busy} onClick={() => void remove()}>
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
