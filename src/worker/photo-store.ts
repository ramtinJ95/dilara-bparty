import type { PhotoId, PhotoKind, PhotoMime, PlayerId } from "../shared/model";
import { newPhotoId } from "./auth";

const SQLITE_ROW_MAX_BYTES = 2_000_000;
export const PHOTO_MAX_BYTES = SQLITE_ROW_MAX_BYTES - 10_000;

export type PhotoUpload = { mime: PhotoMime; bytes: ArrayBuffer };
export type StoredPhoto = { kind: PhotoKind; mime: PhotoMime; bytes: ArrayBuffer };

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

  get(id: PhotoId): StoredPhoto | null {
    const [row] = this.sql.exec<StoredPhoto>("SELECT kind, mime, bytes FROM photos WHERE id = ?", id).toArray();
    return row ?? null;
  }
}
