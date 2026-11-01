import type { QuestionId } from "../../shared/model";
import type { GuestCmdOf } from "../../shared/protocol";

// Module state, not component state: the view unmounts on a tab switch, and a reconnect
// replaces the snapshot, but the answer time still counts from the first moment on screen.
// The key names the run as well as the question, because a reset quiz replays the same question ids.
export const roundKey = (unlockedAt: number, q: QuestionId) => `${unlockedAt}:${q}`;

let shown: { key: string; at: number } | null = null;

export function markShown(key: string, at = performance.now()) {
  if (shown?.key !== key) shown = { key, at };
}

export function elapsedMs(key: string, at = performance.now()): number {
  return shown?.key === key ? Math.max(0, Math.round(at - shown.at)) : 0;
}

// An answer stays held until a snapshot carries it back, so the shell can send one lost with a dropped socket again.
let held: { key: string; cmd: GuestCmdOf<"answer"> } | null = null;

export function holdAnswer(key: string, cmd: GuestCmdOf<"answer">) {
  held = { key, cmd };
}

export function heldAnswer(key: string): GuestCmdOf<"answer"> | null {
  return held?.key === key ? held.cmd : null;
}

export function settleAnswer(key: string) {
  if (held?.key === key) held = null;
}
