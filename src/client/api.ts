import type { PhotoId } from "../shared/model";

export const photoUrl = (id: PhotoId) => `/photos/${id}`;

export type Posted<T> = { ok: true; data: T } | { ok: false; error: string };

export async function postJson<T>(path: string, body: unknown): Promise<Posted<T>> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: data as T };
    const error = (data as { error?: unknown } | null)?.error;
    return { ok: false, error: typeof error === "string" ? error : "Något gick fel. Försök igen." };
  } catch {
    return { ok: false, error: "Ingen kontakt just nu. Försök igen." };
  }
}
