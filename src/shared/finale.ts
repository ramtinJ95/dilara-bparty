import type { PhotoId, PlayerId } from "./model";

export const FINALE_ORDER = ["off", "suspense", "photo", "quiz"] as const;
export type FinaleStage = (typeof FINALE_ORDER)[number];
export type FinaleStep = Exclude<FinaleStage, "off">;

export const isFinaleStep = (raw: unknown): raw is FinaleStep => raw !== "off" && FINALE_ORDER.includes(raw as FinaleStage);
export const nextStep = (stage: FinaleStage) => (FINALE_ORDER[FINALE_ORDER.indexOf(stage) + 1] ?? null) as FinaleStep | null;

export type PhotoWin = { photo: PhotoId; thumb: PhotoId; owner: PlayerId; name: string; votes: number };
export type QuizWin = { id: PlayerId; name: string; score: number };

export type GuestFinale =
  | { stage: "off" | "suspense" }
  | { stage: "photo"; photo: PhotoWin | null }
  | { stage: "quiz"; photo: PhotoWin | null; quiz: QuizWin[] };

export type AdminFinale = GuestFinale & { tied: PhotoId[]; pick: PhotoId | null; joins: boolean };
