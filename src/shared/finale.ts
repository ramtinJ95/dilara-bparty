import type { PhotoId, PlayerId } from "./model";
import type { Phase } from "./quiz";

export const FINALE_KINDS = ["quiz", "photo"] as const;
export type FinaleKind = (typeof FINALE_KINDS)[number];
// The host's steps of each finale, in order.
export const FINALE_STEPS = ["suspense", "reveal"] as const;
export type FinaleStep = (typeof FINALE_STEPS)[number];
// Phones show a reveal this long, then go back to the party on their own.
export const REVEAL_SHOW_MS = 60_000;

export const isFinaleKind = (raw: unknown): raw is FinaleKind => FINALE_KINDS.includes(raw as FinaleKind);
export const isFinaleStep = (raw: unknown): raw is FinaleStep => FINALE_STEPS.includes(raw as FinaleStep);

export type PhotoWin = { photo: PhotoId; thumb: PhotoId; owner: PlayerId; name: string; votes: number };
export type QuizWin = { id: PlayerId; name: string; score: number };
export type Winner = { quiz: QuizWin[]; photo: PhotoWin | null };

export type FinaleView<W> =
  | { stage: "off" }
  | { stage: "suspense" }
  // The celebration on the phones, until backInMs from this snapshot.
  | { stage: "reveal"; win: W; backInMs: number }
  // Back in the app, with the winner kept.
  | { stage: "done"; win: W };
export type FinaleStage = FinaleView<unknown>["stage"];
export type GuestFinales = { [K in FinaleKind]: FinaleView<Winner[K]> };
export type AdminFinales = GuestFinales & { tied: PhotoId[]; pick: PhotoId | null; joins: boolean };

export const winOf = <W>(view: FinaleView<W>): W | null => (view.stage === "reveal" || view.stage === "done" ? view.win : null);

const STAGE_STEP: Record<FinaleStage, number> = { off: 0, suspense: 1, reveal: 2, done: 2 };
export const nextStep = (stage: FinaleStage): FinaleStep | null => FINALE_STEPS[STAGE_STEP[stage]] ?? null;
// A step at or behind the stage has been taken; only the one right after it can be taken now.
export const stepTaken = (step: FinaleStep, stage: FinaleStage) => FINALE_STEPS.indexOf(step) < STAGE_STEP[stage];

export type FinaleGate = { quizPhase: Phase; quiz: FinaleStage; photo: FinaleStage; tied: readonly PhotoId[]; pick: PhotoId | null };

const quizRunning = (phase: Phase) => phase !== "locked" && phase !== "ended";

// Shared with the admin view, so a disabled button says what the server would answer. At most one suspense page is on the phones.
export const FINALE_BLOCKERS = {
  quiz: {
    suspense: ({ quizPhase, photo }) =>
      quizPhase !== "ended" ? "End the quiz before you open the quiz finale." : photo === "suspense" ? "The photo finale is on the phones. Reveal it first." : null,
    reveal: () => null,
  },
  photo: {
    suspense: ({ quizPhase, quiz }) =>
      quizRunning(quizPhase)
        ? "The quiz is running. End it before you open the photo finale."
        : quiz === "suspense"
          ? "The quiz finale is on the phones. Reveal it first."
          : null,
    reveal: ({ tied, pick }) => (tied.length > 1 && !(pick && tied.includes(pick)) ? "Photos are tied for first. Pick the winner before you reveal it." : null),
  },
} satisfies { [K in FinaleKind]: { [S in FinaleStep]: (gate: FinaleGate) => string | null } };

export const finaleBlocker = (kind: FinaleKind, step: FinaleStep, gate: FinaleGate): string | null => FINALE_BLOCKERS[kind][step](gate);

// The quiz can't change once its finale has started, nor while the photo finale's suspense page covers the phones.
export const quizLock = ({ quiz, photo }: { quiz: FinaleStage; photo: FinaleStage }): string | null =>
  quiz !== "off" ? "The quiz finale has started, so the quiz can't change." : photo === "suspense" ? "The photo finale is on the phones." : null;
