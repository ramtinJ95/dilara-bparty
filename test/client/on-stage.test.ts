import { describe, expect, it } from "vitest";
import { onStage } from "../../src/client/guest/on-stage";
import type { GuestFinales, PhotoWin, QuizWin } from "../../src/shared/finale";
import type { PhotoId, PlayerId } from "../../src/shared/model";

const quizWin: QuizWin[] = [{ id: "p-astrid" as PlayerId, name: "Astrid", score: 1000 }];
const photoWin: PhotoWin = { photo: "ph-1" as PhotoId, thumb: "ph-2" as PhotoId, owner: "p-olle" as PlayerId, name: "Olle", votes: 2 };

const finales = (quiz: GuestFinales["quiz"], photo: GuestFinales["photo"]): GuestFinales => ({ quiz, photo });
const T = 1_800_000_000_000;

describe("what covers the guest app", () => {
  it("is nothing while both finales are off or back in the app", () => {
    expect(onStage(finales({ stage: "off" }, { stage: "off" }), null)).toBeNull();
    expect(onStage(finales({ stage: "done", win: quizWin }, { stage: "done", win: photoWin }), null)).toBeNull();
  });

  it("is a suspense page, even over a reveal this phone hasn't left", () => {
    const quizReveal = { stage: "reveal", win: quizWin, backInMs: 50_000, at: T } as const;
    expect(onStage(finales({ stage: "suspense" }, { stage: "off" }), null)).toEqual({ kind: "quiz", view: { stage: "suspense" } });
    expect(onStage(finales(quizReveal, { stage: "suspense" }), null)).toEqual({ kind: "photo", view: { stage: "suspense" } });
    expect(onStage(finales({ stage: "done", win: quizWin }, { stage: "suspense" }), T), "leaving a reveal doesn't skip the suspense page").toEqual({
      kind: "photo",
      view: { stage: "suspense" },
    });
  });

  it("is a reveal until this phone leaves it", () => {
    const reveal = { stage: "reveal", win: photoWin, backInMs: 40_000, at: T } as const;
    expect(onStage(finales({ stage: "off" }, reveal), null)).toEqual({ kind: "photo", view: reveal });
    expect(onStage(finales({ stage: "off" }, reveal), T)).toBeNull();
    expect(onStage(finales({ stage: "off" }, reveal), T - 1), "leaving an earlier reveal changes nothing").toEqual({ kind: "photo", view: reveal });
  });

  it("gives way to a quiz the host starts during a reveal, but not a suspense page", () => {
    const reveal = { stage: "reveal", win: photoWin, backInMs: 40_000, at: T } as const;
    expect(onStage(finales({ stage: "off" }, reveal), null, true)).toBeNull();
    expect(onStage(finales({ stage: "off" }, { stage: "suspense" }), null, true)).toEqual({ kind: "photo", view: { stage: "suspense" } });
  });

  it("is the later of two reveals, and leaving it leaves the earlier one too, in either order", () => {
    const early = 5_000;
    const late = 50_000;
    for (const [quizAt, photoAt] of [
      [T + early, T + late],
      [T + late, T + early],
    ] as const) {
      const quiz = { stage: "reveal", win: quizWin, backInMs: 10_000, at: quizAt } as const;
      const photo = { stage: "reveal", win: null, backInMs: 55_000, at: photoAt } as const;
      const latest = quizAt > photoAt ? { kind: "quiz", view: quiz } : { kind: "photo", view: photo };
      expect(onStage(finales(quiz, photo), null)).toEqual(latest);
      expect(onStage(finales(quiz, photo), T + early), "leaving the earlier one leaves the later one on").toEqual(latest);
      expect(onStage(finales(quiz, photo), T + late)).toBeNull();
    }
  });
});
