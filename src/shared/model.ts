declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type PlayerId = Brand<string, "PlayerId">;
export type PlayerName = Brand<string, "PlayerName">;
export type NameKey = Brand<string, "NameKey">;
export type PhotoId = Brand<string, "PhotoId">;
export type QuestionId = Brand<string, "QuestionId">;

export type PhotoKind = "landing" | "contest" | "thumb" | "question";
export const PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoMime = (typeof PHOTO_MIMES)[number];

export const PLAYER_NAME_MAX = 30;
export const VOTES_PER_GUEST = 3;

const RANDOM_ID = /^[A-Za-z0-9_-]{22}$/;

const parseRandomId =
  <T extends string>() =>
  (raw: unknown): T | null =>
    typeof raw === "string" && RANDOM_ID.test(raw) ? (raw as T) : null;

export const parsePlayerId = parseRandomId<PlayerId>();
export const parsePhotoId = parseRandomId<PhotoId>();
export const parseQuestionId = parseRandomId<QuestionId>();

export type UploadKey = Brand<string, "UploadKey">;
export const parseUploadKey = parseRandomId<UploadKey>();

export function parsePhotoMime(raw: string | null): PhotoMime | null {
  const mime = raw?.split(";")[0]?.trim().toLowerCase();
  return PHOTO_MIMES.find((m) => m === mime) ?? null;
}

export type NameError = "empty" | "control-chars" | "too-long";

export function parsePlayerName(raw: unknown): Result<PlayerName, NameError> {
  if (typeof raw !== "string") return { ok: false, error: "empty" };
  const name = raw.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (name === "") return { ok: false, error: "empty" };
  if (/\p{Cc}/u.test(name)) return { ok: false, error: "control-chars" };
  if ([...name].length > PLAYER_NAME_MAX) return { ok: false, error: "too-long" };
  return { ok: true, value: name as PlayerName };
}

export function nameKey(name: PlayerName): NameKey {
  return name.toLocaleLowerCase("sv") as NameKey;
}
