import type { DirectionId } from "./directions";
import type { Direction } from "./types";

export const LOADERS: Record<DirectionId, () => Promise<{ direction: Direction }>> = {
  brutal: () => import("./directions/brutal"),
  "brutal-ice": () => import("./directions/brutal-ice"),
  "brutal-stickers": () => import("./directions/brutal-stickers"),
  storybook: () => import("./directions/storybook"),
  "storybook-globe": () => import("./directions/storybook-globe"),
  "storybook-papercut": () => import("./directions/storybook-papercut"),
  luxe: () => import("./directions/luxe"),
  "luxe-couture": () => import("./directions/luxe-couture"),
  "luxe-ballet": () => import("./directions/luxe-ballet"),
};
