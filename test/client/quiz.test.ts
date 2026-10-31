import { describe, expect, it } from "vitest";
import { blankDraft, draftOf, parseDraft, removeOption, type ChoiceDraft, type Draft } from "../../src/client/admin/question-draft";
import { elapsedMs, markShown } from "../../src/client/guest/answer-clock";
import type { QuestionId } from "../../src/shared/model";
import type { Question } from "../../src/shared/quiz";

const choice = (patch: Partial<ChoiceDraft>): Draft => ({ ...(blankDraft.choice() as ChoiceDraft), text: "Vilken färg har snö?", ...patch });
const number = (answer: string): Draft => ({ kind: "number", text: "Hur många ballonger?", seconds: "20", photo: null, answer });

describe("question editor draft", () => {
  it("starts a new question at the default time and asks for the text first", () => {
    const draft = blankDraft.choice();
    expect(draft.seconds).toBe("20");
    expect(parseDraft(draft)).toEqual({ ok: false, error: "Write the question." });
  });

  it("saves a choice question once every option is filled and one is marked correct", () => {
    expect(parseDraft(choice({ options: ["Vit", ""], correct: 0 }))).toEqual({ ok: false, error: "Fill in every option." });
    expect(parseDraft(choice({ options: ["Vit", "Blå"], correct: null }))).toEqual({ ok: false, error: "Mark the correct option." });
    expect(parseDraft(choice({ options: ["Vit", "Blå"], correct: 1, seconds: "15" }))).toEqual({
      ok: true,
      value: { kind: "choice", text: "Vilken färg har snö?", seconds: 15, photo: null, options: ["Vit", "Blå"], correct: 1 },
    });
  });

  it("reads a Swedish decimal comma and refuses an empty answer instead of saving zero", () => {
    expect(parseDraft(number("2,5"))).toMatchObject({ ok: true, value: { answer: 2.5 } });
    expect(parseDraft(number("1 200"))).toMatchObject({ ok: true, value: { answer: 1200 } });
    expect(parseDraft(number(""))).toEqual({ ok: false, error: "Enter the correct number." });
  });

  it("rejects a time outside the allowed range", () => {
    expect(parseDraft(choice({ options: ["Vit", "Blå"], correct: 0, seconds: "2" }))).toEqual({ ok: false, error: "Time must be 5 to 120 seconds." });
  });

  it("keeps the correct option pointing at the same text when another option is removed", () => {
    const draft = choice({ options: ["Vit", "Blå", "Grön"], correct: 2 }) as ChoiceDraft;
    expect(removeOption(draft, 0)).toMatchObject({ options: ["Blå", "Grön"], correct: 1 });
    expect(removeOption(draft, 2)).toMatchObject({ options: ["Vit", "Blå"], correct: null });
  });

  it("round-trips a saved question through the editor unchanged", () => {
    const saved: Question = { id: "q".repeat(22) as QuestionId, kind: "number", text: "Hur många ballonger?", photo: null, seconds: 30, answer: 42 };
    const { id: _, ...body } = saved;
    expect(parseDraft(draftOf(saved))).toEqual({ ok: true, value: body });
  });
});

describe("answer clock", () => {
  const q1 = `1:${"a".repeat(22)}`;
  const q2 = `1:${"b".repeat(22)}`;

  it("counts from the first moment a question was on screen, through remounts and reconnects", () => {
    markShown(q1, 1000);
    markShown(q1, 4000);
    expect(elapsedMs(q1, 6500)).toBe(5500);
  });

  it("starts over for the next question", () => {
    markShown(q1, 1000);
    markShown(q2, 9000);
    expect(elapsedMs(q2, 9750)).toBe(750);
    expect(elapsedMs(q1, 9750)).toBe(0);
  });

  it("starts over when a reset quiz replays the same question", () => {
    markShown(q1, 1000);
    const replay = `2:${"a".repeat(22)}`;
    markShown(replay, 30_000);
    expect(elapsedMs(replay, 30_400)).toBe(400);
  });
});
