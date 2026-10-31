import { parsePhotoId, type PhotoId, type PlayerId, type QuestionId, type Result } from "./model";

export const SECONDS = { min: 5, max: 120, default: 20 } as const;
export const GRACE_MS = 2000;
export const OPTIONS = { min: 2, max: 4 } as const;
export const TEXT_MAX = 200;
export const OPTION_MAX = 60;
export const POINTS = { best: 1000, slowest: 500 } as const;

type Common = { text: string; photo: PhotoId | null; seconds: number };
export type ChoiceBody = Common & { kind: "choice"; options: string[]; correct: number };
export type NumberBody = Common & { kind: "number"; answer: number };
export type QuestionBody = ChoiceBody | NumberBody;
export type QuestionKind = QuestionBody["kind"];
export type Question = QuestionBody & { id: QuestionId };

export type GuestQuestion = Common & { id: QuestionId } & ({ kind: "choice"; options: string[] } | { kind: "number" });

export type Phase = "locked" | "lobby" | "open" | "closed" | "reveal" | "leaderboard" | "ended";

export const QUIZ_STEPS = {
  unlock: ["locked"],
  start: ["lobby", "reveal", "leaderboard"],
  reveal: ["closed"],
  leaderboard: ["reveal"],
  end: ["lobby", "reveal", "leaderboard"],
  reset: ["lobby", "open", "closed", "reveal", "leaderboard", "ended"],
} as const satisfies Record<string, readonly Phase[]>;
export type QuizStep = keyof typeof QUIZ_STEPS;

export const stepAllowed = (step: QuizStep, phase: Phase) => (QUIZ_STEPS[step] as readonly Phase[]).includes(phase);

export type ChoiceResult = { kind: "choice"; correct: number; counts: number[] };
export type NumberResult = { kind: "number"; answer: number; closest: { name: string; value: number }[]; guesses: number };
export type RoundResult = ChoiceResult | NumberResult;

export type BoardRow = { id: PlayerId; name: string; score: number; rank: number; prev: number };

type Unlocked = { unlockedAt: number };
type Round = Unlocked & { n: number; total: number };
type Asked = Round & { question: GuestQuestion; pick: number | null };
type Preload = { next: PhotoId | null };

export type GuestQuiz =
  | { phase: "locked" }
  | ({ phase: "lobby" } & Unlocked & Preload)
  | ({ phase: "open"; endsInMs: number } & Asked)
  | ({ phase: "closed" } & Asked & Preload)
  | ({ phase: "reveal"; points: number; score: number; result: RoundResult } & Asked & Preload)
  | ({ phase: "leaderboard"; top: BoardRow[]; you: BoardRow | null } & Round & Preload)
  | ({ phase: "ended" } & Unlocked);

type Tally = { q: QuestionId; n: number; answered: number; expected: number };

export type AdminStage =
  | { phase: "locked" | "lobby" | "ended" }
  | ({ phase: "open"; endsInMs: number } & Tally)
  | ({ phase: "closed" } & Tally)
  | ({ phase: "reveal" | "leaderboard"; result: RoundResult } & Tally);

export type AdminQuiz = {
  stage: AdminStage;
  questions: Question[];
  played: QuestionId[];
  next: QuestionId | null;
  board: BoardRow[];
  winners: PlayerId[];
};

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
const trimmed = (s: unknown) => (typeof s === "string" ? s.trim().replace(/\s+/gu, " ") : "");

export function parseQuestionBody(raw: unknown): Result<QuestionBody, string> {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Question is missing." };
  const m = raw as Record<string, unknown>;
  const text = trimmed(m.text);
  if (text === "") return { ok: false, error: "Write the question." };
  if ([...text].length > TEXT_MAX) return { ok: false, error: `Question is too long (max ${TEXT_MAX} characters).` };
  if (!isInt(m.seconds) || m.seconds < SECONDS.min || m.seconds > SECONDS.max) {
    return { ok: false, error: `Time must be ${SECONDS.min} to ${SECONDS.max} seconds.` };
  }
  const photo = m.photo === null || m.photo === undefined ? null : parsePhotoId(m.photo);
  if (photo === null && m.photo != null) return { ok: false, error: "Photo is invalid." };
  const common = { text, photo, seconds: m.seconds };

  if (m.kind === "number") {
    if (typeof m.answer !== "number" || !Number.isFinite(m.answer)) return { ok: false, error: "Enter the correct number." };
    return { ok: true, value: { kind: "number", ...common, answer: m.answer } };
  }
  if (m.kind !== "choice") return { ok: false, error: "Unknown question type." };
  if (!Array.isArray(m.options)) return { ok: false, error: "Options are missing." };
  const options = m.options.map(trimmed);
  if (options.length < OPTIONS.min || options.length > OPTIONS.max) {
    return { ok: false, error: `Give ${OPTIONS.min} to ${OPTIONS.max} options.` };
  }
  if (options.some((o) => o === "")) return { ok: false, error: "Fill in every option." };
  if (options.some((o) => [...o].length > OPTION_MAX)) return { ok: false, error: `Options are at most ${OPTION_MAX} characters.` };
  if (!isInt(m.correct) || m.correct < 0 || m.correct >= options.length) return { ok: false, error: "Mark the correct option." };
  return { ok: true, value: { kind: "choice", ...common, options, correct: m.correct } };
}

export function guestQuestion(q: Question): GuestQuestion {
  const common = { id: q.id, text: q.text, photo: q.photo, seconds: q.seconds };
  return q.kind === "choice" ? { ...common, kind: "choice", options: q.options } : { ...common, kind: "number" };
}
