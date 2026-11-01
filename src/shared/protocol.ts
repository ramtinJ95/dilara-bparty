import { isFinaleStep, type AdminFinale, type FinaleStep, type GuestFinale } from "./finale";
import { parsePhotoId, parsePlayerId, parseQuestionId, type PhotoId, type PlayerId, type QuestionId } from "./model";
import { parseQuestionBody, QUIZ_STEPS, type AdminQuiz, type GuestQuiz, type QuestionBody, type QuizStep } from "./quiz";

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
export type GuestState = { you: { id: PlayerId; name: string }; online: number; contest: GuestContest; quiz: GuestQuiz; finale: GuestFinale };

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
  quiz: AdminQuiz;
  finale: AdminFinale;
};

export type Heartbeat = "fast" | "slow";

// Phones never ping. The server's alarm sends every socket a tick, one request for all of them since outgoing messages are free,
// and a phone that hears nothing for silentMs reconnects. Fast while the quiz is open; slow the rest of the day, so the radio can idle.
export const HEARTBEATS: Record<Heartbeat, { tickMs: number; silentMs: number }> = {
  fast: { tickMs: 4_000, silentMs: 11_000 },
  slow: { tickMs: 30_000, silentMs: 70_000 },
};

export type ServerMsg<S> = { t: "state"; state: S; heartbeat: Heartbeat } | { t: "error"; message: string } | { t: "gone" };

export type AdminCmd =
  | { t: "rename"; id: PlayerId; name: string }
  | { t: "merge"; from: PlayerId; into: PlayerId }
  | { t: "uploads"; open: boolean }
  | { t: "voting"; open: boolean }
  | { t: "hide"; photo: PhotoId; hidden: boolean }
  | { t: "save-question"; id: QuestionId | null; body: QuestionBody }
  | { t: "delete-question"; id: QuestionId }
  | { t: "move-question"; id: QuestionId; to: number }
  | { t: "quiz"; step: QuizStep }
  | { t: "finale"; step: FinaleStep }
  | { t: "pick-photo"; photo: PhotoId }
  | { t: "joins"; open: boolean }
  | { t: "liveMode"; on: boolean };
export type AdminCmdOf<K extends AdminCmd["t"]> = Extract<AdminCmd, { t: K }>;

export type GuestCmd =
  | { t: "vote"; photo: PhotoId }
  | { t: "unvote"; photo: PhotoId }
  | { t: "remove"; photo: PhotoId }
  | { t: "answer"; q: QuestionId; pick: number; ms: number; run: number };
export type GuestCmdOf<K extends GuestCmd["t"]> = Extract<GuestCmd, { t: K }>;

export const TICK = "tick";
// A phone checking its socket sends a ping, and the Durable Object answers with a pong without waking up.
// The pong is not a tick, so the phone can tell a reply to its own ping from the server's steady ticks.
export const PING = "ping";
export const PONG = "pong";

type Fields = Record<string, unknown>;
type Parsers<C extends { t: string }> = { [K in C["t"]]: (m: Fields) => Extract<C, { t: K }> | null };

const toggle =
  <K extends "uploads" | "voting" | "joins">(t: K) =>
  (m: Fields) =>
    typeof m.open === "boolean" ? ({ t, open: m.open } as AdminCmdOf<K>) : null;

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

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
  "save-question": (m) => {
    const id = m.id === null ? null : parseQuestionId(m.id);
    const body = parseQuestionBody(m.body);
    return (id || m.id === null) && body.ok ? { t: "save-question", id, body: body.value } : null;
  },
  "delete-question": (m) => {
    const id = parseQuestionId(m.id);
    return id ? { t: "delete-question", id } : null;
  },
  "move-question": (m) => {
    const id = parseQuestionId(m.id);
    return id && Number.isInteger(m.to) ? { t: "move-question", id, to: m.to as number } : null;
  },
  finale: (m) => (isFinaleStep(m.step) ? { t: "finale", step: m.step } : null),
  "pick-photo": (m) => {
    const photo = parsePhotoId(m.photo);
    return photo ? { t: "pick-photo", photo } : null;
  },
  joins: toggle("joins"),
  quiz: (m) => (typeof m.step === "string" && Object.hasOwn(QUIZ_STEPS, m.step) ? { t: "quiz", step: m.step as QuizStep } : null),
  liveMode: (m) => (typeof m.on === "boolean" ? { t: "liveMode", on: m.on } : null),
};

const guestCmdParsers: Parsers<GuestCmd> = {
  vote: onPhoto("vote"),
  unvote: onPhoto("unvote"),
  remove: onPhoto("remove"),
  answer: (m) => {
    const q = parseQuestionId(m.q);
    return q && finite(m.pick) && finite(m.ms) && finite(m.run) ? { t: "answer", q, pick: m.pick, ms: m.ms, run: m.run } : null;
  },
};

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
