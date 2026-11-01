import type { ComponentType } from "preact";

export const SCREENS = [
  { id: "landing", title: "Landing" },
  { id: "quiz", title: "Quiz question" },
  { id: "reveal", title: "Answer and leaderboard" },
  { id: "gallery", title: "Galleri" },
  { id: "finale", title: "Finale" },
] as const;

export type ScreenId = (typeof SCREENS)[number]["id"];

/** A direction is its own five screens. Each screen renders a full 390x844 phone viewport from the shared fixture. */
export type Direction = Record<ScreenId, ComponentType>;
