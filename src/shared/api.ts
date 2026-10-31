import type { PhotoId } from "./model";

export type CodeRequest = { code: string };
export type CodeResponse = { ok: true; path: string };

export type JoinRequest = { secret: string; name: string; reclaim?: boolean };
export type JoinResponse = { status: "joined" } | { status: "exists"; name: string };

export type ApiError = { error: string };

export type PhotoUploadResponse = { id: PhotoId };
