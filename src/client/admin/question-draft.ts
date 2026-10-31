import type { PhotoId, Result } from "../../shared/model";
import { parseNumber } from "../answers";
import { OPTIONS, parseQuestionBody, SECONDS, type Question, type QuestionBody, type QuestionKind } from "../../shared/quiz";

type Common = { text: string; seconds: string; photo: PhotoId | null };
export type Draft = Common & ({ kind: "choice"; options: string[]; correct: number | null } | { kind: "number"; answer: string });
export type ChoiceDraft = Extract<Draft, { kind: "choice" }>;

export const blankDraft: Record<QuestionKind, () => Draft> = {
  choice: () => ({ kind: "choice", text: "", seconds: String(SECONDS.default), photo: null, options: Array(OPTIONS.min).fill(""), correct: null }),
  number: () => ({ kind: "number", text: "", seconds: String(SECONDS.default), photo: null, answer: "" }),
};

export function draftOf(q: Question): Draft {
  const common = { text: q.text, seconds: String(q.seconds), photo: q.photo };
  return q.kind === "choice"
    ? { ...common, kind: "choice", options: [...q.options], correct: q.correct }
    : { ...common, kind: "number", answer: String(q.answer) };
}

export function parseDraft(d: Draft): Result<QuestionBody, string> {
  const common = { text: d.text, seconds: parseNumber(d.seconds), photo: d.photo };
  return parseQuestionBody(
    d.kind === "choice"
      ? { ...common, kind: "choice", options: d.options, correct: d.correct ?? undefined }
      : { ...common, kind: "number", answer: parseNumber(d.answer) },
  );
}

export function removeOption(d: ChoiceDraft, at: number): ChoiceDraft {
  const correct = d.correct === null || d.correct === at ? null : d.correct > at ? d.correct - 1 : d.correct;
  return { ...d, options: d.options.filter((_, i) => i !== at), correct };
}
