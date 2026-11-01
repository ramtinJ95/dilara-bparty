import type { PhotoId, PhotoKind, PhotoMime, PlayerId } from "../shared/model";
import { newPhotoId } from "./auth";

const SQLITE_ROW_MAX_BYTES = 2_000_000;
export const PHOTO_MAX_BYTES = SQLITE_ROW_MAX_BYTES - 10_000;

export type PhotoUpload = { mime: PhotoMime; bytes: ArrayBuffer };
// bytes is null when the viewer already holds the photo and gets a 304.
export type StoredPhoto = { kind: PhotoKind; mime: PhotoMime; bytes: ArrayBuffer | null };

export class PhotoStore {
  constructor(private readonly sql: SqlStorage) {}

  put({ kind, owner, mime, bytes }: PhotoUpload & { kind: PhotoKind; owner: PlayerId | null }): PhotoId {
    const id = newPhotoId();
    this.sql.exec(
      "INSERT INTO photos (id, kind, owner, mime, size, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id, kind, owner, mime, bytes.byteLength, bytes, Date.now(),
    );
    return id;
  }

  get(id: PhotoId, withBytes: boolean): StoredPhoto | null {
    const columns = withBytes ? "kind, mime, bytes" : "kind, mime, NULL AS bytes";
    const [row] = this.sql.exec<StoredPhoto>(`SELECT ${columns} FROM photos WHERE id = ?`, id).toArray();
    return row ?? null;
  }
}
