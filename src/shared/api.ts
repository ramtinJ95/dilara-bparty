import type { PhotoId } from "./model";

export type CodeResponse = { ok: true; path: string };

export type JoinResponse = { status: "joined" } | { status: "exists"; name: string };

export type PhotoUploadResponse = { id: PhotoId };

export const CONTEST_UPLOAD_PATH = "/api/photo";
export const UPLOAD_FIELDS = { photo: "photo", thumb: "thumb", key: "key" } as const;
