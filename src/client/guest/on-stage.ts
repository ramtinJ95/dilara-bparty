import { FINALE_KINDS, type FinaleKind, type GuestFinales } from "../../shared/finale";

type Covering<V> = Extract<V, { stage: "suspense" | "reveal" }>;
export type OnStage = { [K in FinaleKind]: { kind: K; view: Covering<GuestFinales[K]> } }[FinaleKind];

// What covers the app: a suspense page, else the latest reveal this phone hasn't left, else nothing. A quiz the host starts
// during a reveal's minute takes the phones at once, so no question runs out unseen.
export function onStage(finales: GuestFinales, dismissed: ReadonlySet<FinaleKind>, quizRunning = false): OnStage | null {
  const shown = FINALE_KINDS.map((kind) => ({ kind, view: finales[kind] }) as OnStage | { kind: FinaleKind; view: { stage: "off" | "done" } });
  const covering = shown.filter((s): s is OnStage => s.view.stage === "suspense" || (s.view.stage === "reveal" && !quizRunning && !dismissed.has(s.kind)));
  const order = (s: OnStage) => (s.view.stage === "suspense" ? Infinity : s.view.backInMs);
  return covering.sort((a, b) => order(b) - order(a))[0] ?? null;
}
