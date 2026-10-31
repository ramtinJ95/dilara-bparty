import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, normalizeJoinCode } from "../shared/join-code";
import { parsePlayerId, type PlayerId } from "../shared/model";

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    keys.set(secret, key);
  }
  return key;
}

async function sign(secret: string, message: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(message)));
}

async function verify(secret: string, message: string, signature: string): Promise<boolean> {
  return secretMatches(signature, toBase64Url(await sign(secret, message)));
}

function toBase64Url(bytes: Uint8Array): string {
  return bytes.toBase64({ alphabet: "base64url", omitPadding: true });
}

export function secretMatches(given: string, secret: string): boolean {
  const a = encoder.encode(given);
  const b = encoder.encode(secret);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

const randomId = () => toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
export const newPlayerId = () => randomId() as PlayerId;

export async function joinCode(joinSecret: string): Promise<string> {
  const bytes = await sign(joinSecret, "join-code");
  return Array.from(bytes.subarray(0, JOIN_CODE_LENGTH), (b) => JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length]).join("");
}

export async function joinCodeMatches(typed: string, joinSecret: string): Promise<boolean> {
  return secretMatches(normalizeJoinCode(typed), await joinCode(joinSecret));
}

export async function pidCookieValue(id: PlayerId, joinSecret: string): Promise<string> {
  return `${id}.${toBase64Url(await sign(joinSecret, `pid:${id}`))}`;
}

export async function playerFromCookie(value: string | undefined, joinSecret: string): Promise<PlayerId | null> {
  const [rawId, signature, ...rest] = value?.split(".") ?? [];
  const id = parsePlayerId(rawId);
  if (!id || signature === undefined || rest.length > 0) return null;
  return (await verify(joinSecret, `pid:${id}`, signature)) ? id : null;
}

export async function adminCookieValue(adminSecret: string): Promise<string> {
  return toBase64Url(await sign(adminSecret, "admin"));
}

export async function isAdminCookie(value: string | undefined, adminSecret: string): Promise<boolean> {
  return value !== undefined && verify(adminSecret, "admin", value);
}
