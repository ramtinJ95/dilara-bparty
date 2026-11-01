import type { DirectionId } from "./directions";
import type { Direction } from "./types";

export const LOADERS: Record<DirectionId, () => Promise<{ direction: Direction }>> = {
  aurora: () => import("./directions/aurora"),
  pearl: () => import("./directions/pearl"),
  chrome: () => import("./directions/chrome"),
  clay: () => import("./directions/clay"),
  brutal: () => import("./directions/brutal"),
  luxe: () => import("./directions/luxe"),
  gameshow: () => import("./directions/gameshow"),
  crystal: () => import("./directions/crystal"),
  storybook: () => import("./directions/storybook"),
  bento: () => import("./directions/bento"),
};
