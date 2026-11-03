import { describe, expect, it } from "vitest";
import { onStage } from "../../src/client/guest/on-stage";
import type { FinaleKind, GuestFinales, PhotoWin, QuizWin } from "../../src/shared/finale";
import type { PhotoId, PlayerId } from "../../src/shared/model";

const quizWin: QuizWin[] = [{ id: "p-astrid" as PlayerId, name: "Astrid", score: 1000 }];
const photoWin: PhotoWin = { photo: "ph-1" as PhotoId, thumb: "ph-2" as PhotoId, owner: "p-olle" as PlayerId, name: "Olle", votes: 2 };

const finales = (quiz: GuestFinales["quiz"], photo: GuestFinales["photo"]): GuestFinales => ({ quiz, photo });
const left = (...kinds: FinaleKind[]) => new Set(kinds);

describe("what covers the guest app", () => {
  it("is nothing while both finales are off or back in the app", () => {
    expect(onStage(finales({ stage: "off" }, { stage: "off" }), left())).toBeNull();
    expect(onStage(finales({ stage: "done", win: quizWin }, { stage: "done", win: photoWin }), left())).toBeNull();
  });

  it("is a suspense page, even over a reveal this phone hasn't left", () => {
    const quizReveal = { stage: "reveal", win: quizWin, backInMs: 50_000 } as const;
    expect(onStage(finales({ stage: "suspense" }, { stage: "off" }), left())).toEqual({ kind: "quiz", view: { stage: "suspense" } });
    expect(onStage(finales(quizReveal, { stage: "suspense" }), left())).toEqual({ kind: "photo", view: { stage: "suspense" } });
    expect(onStage(finales({ stage: "done", win: quizWin }, { stage: "suspense" }), left("photo")), "leaving the reveal doesn't skip the suspense page").toEqual({
      kind: "photo",
      view: { stage: "suspense" },
    });
  });

  it("is a reveal until this phone leaves it", () => {
    const reveal = { stage: "reveal", win: photoWin, backInMs: 40_000 } as const;
    expect(onStage(finales({ stage: "off" }, reveal), left())).toEqual({ kind: "photo", view: reveal });
    expect(onStage(finales({ stage: "off" }, reveal), left("photo"))).toBeNull();
    expect(onStage(finales({ stage: "off" }, reveal), left("quiz")), "leaving the other finale changes nothing").toEqual({ kind: "photo", view: reveal });
  });

  it("is the later of two reveals, then the other until the phone leaves that too", () => {
    const quizReveal = { stage: "reveal", win: quizWin, backInMs: 10_000 } as const;
    const photoReveal = { stage: "reveal", win: null, backInMs: 55_000 } as const;
    expect(onStage(finales(quizReveal, photoReveal), left())).toEqual({ kind: "photo", view: photoReveal });
    expect(onStage(finales(quizReveal, photoReveal), left("photo"))).toEqual({ kind: "quiz", view: quizReveal });
    expect(onStage(finales(quizReveal, photoReveal), left("photo", "quiz"))).toBeNull();
  });
});
