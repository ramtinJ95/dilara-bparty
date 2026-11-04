import { FINALE_KINDS, type FinaleKind, type GuestFinales } from "../../shared/finale";

type Covering<V> = Extract<V, { stage: "suspense" | "reveal" }>;
export type OnStage = { [K in FinaleKind]: { kind: K; view: Covering<GuestFinales[K]> } }[FinaleKind];

const LEFT_KEY = "reveal-left";

// The time of the latest reveal this phone left. Back leaves that reveal and every earlier one, and it survives a reload,
// so only a newer reveal covers the app again.
export function readLeft(): number | null {
  try {
    const raw = localStorage.getItem(LEFT_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

export function writeLeft(at: number): void {
  try {
    localStorage.setItem(LEFT_KEY, String(at));
  } catch {}
}

// What covers the app: a suspense page, else the latest reveal newer than the one this phone left, else nothing. A quiz the host
// starts during a reveal's minute takes the phones at once, so no question runs out unseen.
export function onStage(finales: GuestFinales, left: number | null, quizRunning = false): OnStage | null {
  const shown = FINALE_KINDS.map((kind) => ({ kind, view: finales[kind] }) as OnStage | { kind: FinaleKind; view: { stage: "off" | "done" } });
  const covering = shown.filter(
    (s): s is OnStage => s.view.stage === "suspense" || (s.view.stage === "reveal" && !quizRunning && (left === null || s.view.at > left)),
  );
  const order = (s: OnStage) => (s.view.stage === "suspense" ? Infinity : s.view.at);
  return covering.sort((a, b) => order(b) - order(a))[0] ?? null;
}
