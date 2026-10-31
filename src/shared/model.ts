declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type PlayerId = Brand<string, "PlayerId">;
export type PlayerName = Brand<string, "PlayerName">;
export type NameKey = Brand<string, "NameKey">;

export const PLAYER_NAME_MAX = 30;

const RANDOM_ID = /^[A-Za-z0-9_-]{22}$/;

export function parsePlayerId(raw: unknown): PlayerId | null {
  return typeof raw === "string" && RANDOM_ID.test(raw) ? (raw as PlayerId) : null;
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
