import type { PhotoId } from "../../shared/model";
import type { AdminEntrant, AdminVersion } from "../../shared/protocol";
import { photoUrl } from "../api";
import { zipStore, type ZipEntry } from "./zip";

export type Badge = "current" | "replaced" | "removed" | "fame";

export const badgeOf = (v: AdminVersion): Badge => (v.status === "replaced" && v.inGallery ? "fame" : v.status);

export const BADGES: Record<Badge, { label: string; suffix: string }> = {
  current: { label: "current", suffix: "" },
  replaced: { label: "replaced", suffix: " (replaced)" },
  removed: { label: "removed", suffix: " (removed)" },
  fame: { label: "hall of fame", suffix: " (hall of fame)" },
};

export const oldestFirst = (versions: AdminVersion[]) => versions.toSorted((a, b) => a.createdAt - b.createdAt);

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const safeName = (name: string) =>
  name
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, 60) || "Guest";

export type ArchiveFile = { id: PhotoId; stem: string; createdAt: number };

/** One entry per stored version, named after the guest, e.g. "Astrid - 1 (replaced)". Stems are unique even when names sanitise alike. */
export function archiveFiles(entrants: AdminEntrant[]): ArchiveFile[] {
  const taken = new Set<string>();
  const unique = (stem: string) => {
    let candidate = stem;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})`;
    taken.add(candidate.toLowerCase());
    return candidate;
  };
  return entrants.flatMap((e) =>
    oldestFirst(e.versions).map((v, i) => ({
      id: v.id,
      stem: unique(`${safeName(e.name)} - ${i + 1}${BADGES[badgeOf(v)].suffix}${v.hidden ? " (hidden)" : ""}`),
      createdAt: v.createdAt,
    })),
  );
}

export async function buildArchive(files: ArchiveFile[], onProgress: (done: number) => void): Promise<Blob> {
  const entries: ZipEntry[] = [];
  for (const file of files) {
    const res = await fetch(photoUrl(file.id));
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${file.stem}`);
    const ext = EXTENSIONS[res.headers.get("Content-Type") ?? ""] ?? "jpg";
    entries.push({ name: `${file.stem}.${ext}`, data: new Uint8Array(await res.arrayBuffer()), modified: new Date(file.createdAt) });
    onProgress(entries.length);
  }
  return zipStore(entries);
}
