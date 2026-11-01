import type { PhotoId, PlayerId } from "./model";
import type { Phase } from "./quiz";

export const FINALE_ORDER = ["off", "suspense", "photo", "quiz"] as const;
export type FinaleStage = (typeof FINALE_ORDER)[number];
export type FinaleStep = Exclude<FinaleStage, "off">;

export const isFinaleStep = (raw: unknown): raw is FinaleStep => raw !== "off" && FINALE_ORDER.includes(raw as FinaleStage);
export const nextStep = (stage: FinaleStage) => (FINALE_ORDER[FINALE_ORDER.indexOf(stage) + 1] ?? null) as FinaleStep | null;

export type FinaleGate = { quizPhase: Phase; tied: readonly PhotoId[]; pick: PhotoId | null };

export const FINALE_BLOCKERS = {
  suspense: ({ quizPhase }: Pick<FinaleGate, "quizPhase">) => (quizPhase === "ended" ? null : "End the quiz before you open the finale."),
  photo: ({ tied, pick }: Pick<FinaleGate, "tied" | "pick">) =>
    tied.length > 1 && !(pick && tied.includes(pick)) ? "Photos are tied for first. Pick the winner before you reveal it." : null,
  quiz: () => null,
} satisfies { [S in FinaleStep]: (gate: FinaleGate) => string | null };

export const finaleBlocker = (step: FinaleStep, gate: FinaleGate): string | null => FINALE_BLOCKERS[step](gate);

export type PhotoWin = { photo: PhotoId; thumb: PhotoId; owner: PlayerId; name: string; votes: number };
export type QuizWin = { id: PlayerId; name: string; score: number };

export type GuestFinale =
  | { stage: "off" }
  | { stage: "suspense" }
  | { stage: "photo"; photo: PhotoWin | null }
  | { stage: "quiz"; photo: PhotoWin | null; quiz: QuizWin[] };

export type AdminFinale = GuestFinale & { tied: PhotoId[]; pick: PhotoId | null; joins: boolean };
