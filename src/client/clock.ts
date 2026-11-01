import { useEffect, useMemo, useState } from "preact/hooks";

// The server sends time left, not a wall-clock deadline, so phone clock skew never matters.
// The deadline is fixed when the message arrives; `msg` is the snapshot that carried endsInMs.
export function useDeadline(msg: object | null, endsInMs: number | null): number | null {
  return useMemo(() => (endsInMs === null ? null : performance.now() + endsInMs), [msg]);
}

export function useSecondsLeft(deadline: number | null): number | null {
  const [, tick] = useState(0);
  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => {
      tick((n) => n + 1);
      if (performance.now() >= deadline) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
}
