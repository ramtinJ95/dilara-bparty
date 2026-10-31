import { parsePlayerId, type PlayerId } from "./model";

export type GuestState = { you: { id: PlayerId; name: string }; online: number };

export type AdminPlayer = { id: PlayerId; name: string; online: boolean; createdAt: number };
export type AdminState = { players: AdminPlayer[]; join: { secret: string; code: string } };

export type ServerMsg<S> = { t: "state"; state: S } | { t: "error"; message: string } | { t: "gone" };

export type AdminCmd = { t: "rename"; id: PlayerId; name: string } | { t: "merge"; from: PlayerId; into: PlayerId };
export type AdminCmdOf<K extends AdminCmd["t"]> = Extract<AdminCmd, { t: K }>;

export const PING = "ping";
export const PONG = "pong";

type Fields = Record<string, unknown>;

const adminCmdParsers: { [K in AdminCmd["t"]]: (m: Fields) => AdminCmdOf<K> | null } = {
  rename: (m) => {
    const id = parsePlayerId(m.id);
    return id && typeof m.name === "string" ? { t: "rename", id, name: m.name } : null;
  },
  merge: (m) => {
    const from = parsePlayerId(m.from);
    const into = parsePlayerId(m.into);
    return from && into ? { t: "merge", from, into } : null;
  },
};

export function parseAdminCmd(raw: string): AdminCmd | null {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof msg !== "object" || msg === null || !("t" in msg) || !Object.hasOwn(adminCmdParsers, msg.t as string)) return null;
  return adminCmdParsers[msg.t as AdminCmd["t"]](msg as Fields);
}
