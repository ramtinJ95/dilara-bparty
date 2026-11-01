import { useEffect, useMemo, useState } from "preact/hooks";

// The server sends time left, not a wall-clock deadline, so phone clock skew never matters.
// The deadline is fixed when the message arrives; `msg` is the snapshot that carried endsInMs.
export function useDeadline(msg: object | null, endsInMs: number | null): number | null {
  return useMemo(() => (endsInMs === null ? null : performance.now() + endsInMs), [msg]);
}

const secondsLeft = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

// Wakes only when the shown second changes, so a phone renders the question card once a second.
// Chrome truncates a fractional delay, so round up to land after the second, and read the clock once per wake:
// a wake that lands a hair early and reads again past the boundary would skip a second.
export function watchSeconds(deadline: number, shown: number, onChange: (left: number) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wake = () => {
    const ms = deadline - performance.now();
    const left = secondsLeft(ms);
    if (left !== shown) onChange((shown = left));
    if (left > 0) timer = setTimeout(wake, Math.ceil(ms % 1000) || 1000);
  };
  wake();
  return () => clearTimeout(timer);
}

export function useSecondsLeft(deadline: number | null): number | null {
  const [, tick] = useState(0);
  const left = deadline === null ? null : secondsLeft(deadline - performance.now());
  useEffect(() => (deadline === null || left === null ? undefined : watchSeconds(deadline, left, () => tick((n) => n + 1))), [deadline]);
  return left;
}
