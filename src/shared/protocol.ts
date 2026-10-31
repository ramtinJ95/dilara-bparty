import { parsePhotoId, parsePlayerId, type PhotoId, type PlayerId } from "./model";

export type GalleryPhoto = { id: PhotoId; thumb: PhotoId; fame: boolean; own: boolean; mine: number };
export type MyPhoto = { id: PhotoId; thumb: PhotoId; votes: number; hidden: boolean };
export type GuestContest = {
  uploads: boolean;
  voting: boolean;
  votesLeft: number;
  mine: MyPhoto | null;
  inFame: number;
  gallery: GalleryPhoto[];
};
export type GuestState = { you: { id: PlayerId; name: string }; online: number; contest: GuestContest };

export type EntryStatus = "current" | "replaced" | "removed";
export type AdminVersion = {
  id: PhotoId;
  thumb: PhotoId;
  status: EntryStatus;
  hidden: boolean;
  inGallery: boolean;
  votes: number;
  createdAt: number;
};
export type AdminEntrant = { player: PlayerId; name: string; versions: AdminVersion[] };
export type TallyRow = { photo: PhotoId; thumb: PhotoId; player: PlayerId; name: string; votes: number; rank: number; fame: boolean };
export type AdminContest = { uploads: boolean; voting: boolean; tally: TallyRow[]; entrants: AdminEntrant[] };

export type AdminPlayer = { id: PlayerId; name: string; online: boolean; createdAt: number };
export type AdminState = {
  players: AdminPlayer[];
  join: { secret: string; code: string };
  landingPhoto: PhotoId | null;
  contest: AdminContest;
};

export type ServerMsg<S> = { t: "state"; state: S } | { t: "error"; message: string } | { t: "gone" };

export type AdminCmd =
  | { t: "rename"; id: PlayerId; name: string }
  | { t: "merge"; from: PlayerId; into: PlayerId }
  | { t: "uploads"; open: boolean }
  | { t: "voting"; open: boolean }
  | { t: "hide"; photo: PhotoId; hidden: boolean };
export type AdminCmdOf<K extends AdminCmd["t"]> = Extract<AdminCmd, { t: K }>;

export type GuestCmd = { t: "vote"; photo: PhotoId } | { t: "unvote"; photo: PhotoId } | { t: "remove"; photo: PhotoId };
export type GuestCmdOf<K extends GuestCmd["t"]> = Extract<GuestCmd, { t: K }>;

export const PING = "ping";
export const PONG = "pong";

type Fields = Record<string, unknown>;
type Parsers<C extends { t: string }> = { [K in C["t"]]: (m: Fields) => Extract<C, { t: K }> | null };

const toggle =
  <K extends "uploads" | "voting">(t: K) =>
  (m: Fields) =>
    typeof m.open === "boolean" ? ({ t, open: m.open } as AdminCmdOf<K>) : null;

const onPhoto =
  <K extends GuestCmd["t"]>(t: K) =>
  (m: Fields) => {
    const photo = parsePhotoId(m.photo);
    return photo ? ({ t, photo } as GuestCmdOf<K>) : null;
  };

const adminCmdParsers: Parsers<AdminCmd> = {
  rename: (m) => {
    const id = parsePlayerId(m.id);
    return id && typeof m.name === "string" ? { t: "rename", id, name: m.name } : null;
  },
  merge: (m) => {
    const from = parsePlayerId(m.from);
    const into = parsePlayerId(m.into);
    return from && into ? { t: "merge", from, into } : null;
  },
  uploads: toggle("uploads"),
  voting: toggle("voting"),
  hide: (m) => {
    const photo = parsePhotoId(m.photo);
    return photo && typeof m.hidden === "boolean" ? { t: "hide", photo, hidden: m.hidden } : null;
  },
};

const guestCmdParsers: Parsers<GuestCmd> = { vote: onPhoto("vote"), unvote: onPhoto("unvote"), remove: onPhoto("remove") };

function parseWith<C extends { t: string }>(parsers: Parsers<C>, raw: string): C | null {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof msg !== "object" || msg === null || !("t" in msg) || !Object.hasOwn(parsers, msg.t as string)) return null;
  return (parsers[msg.t as C["t"]] as (m: Fields) => C | null)(msg as Fields);
}

export const parseAdminCmd = (raw: string) => parseWith(adminCmdParsers, raw);
export const parseGuestCmd = (raw: string) => parseWith(guestCmdParsers, raw);
