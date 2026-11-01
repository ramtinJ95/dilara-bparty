import { parsePhotoId, type PhotoId, type Result } from "../../shared/model";
import { prepare } from "../photo-prep";

const UPLOAD_ERRORS: Record<number, string> = {
  413: "That photo is still too large after shrinking.",
  415: "Use a JPEG, PNG or WebP photo.",
};

/** Shrinks the file and PUTs it to an admin photo route, returning the stored photo's id. */
export async function putAdminPhoto(path: string, file: Blob): Promise<Result<PhotoId, string>> {
  const body = await prepare(file).then((p) => p.photo, () => null);
  if (!body) return { ok: false, error: "Couldn't read that image." };
  try {
    const res = await fetch(path, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body });
    if (!res.ok) return { ok: false, error: UPLOAD_ERRORS[res.status] ?? `Upload failed (HTTP ${res.status}).` };
    const id = parsePhotoId(((await res.json().catch(() => null)) as { id?: unknown } | null)?.id);
    return id ? { ok: true, value: id } : { ok: false, error: "Upload failed. Try again." };
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
}
