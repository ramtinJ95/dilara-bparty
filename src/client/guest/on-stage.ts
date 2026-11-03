import { FINALE_KINDS, type FinaleKind, type GuestFinales } from "../../shared/finale";

type Covering<V> = Extract<V, { stage: "suspense" | "reveal" }>;
export type OnStage = { [K in FinaleKind]: { kind: K; view: Covering<GuestFinales[K]> } }[FinaleKind];

// What covers the app: a suspense page, else the latest reveal this phone hasn't left, else nothing.
export function onStage(finales: GuestFinales, dismissed: ReadonlySet<FinaleKind>): OnStage | null {
  const shown = FINALE_KINDS.map((kind) => ({ kind, view: finales[kind] }) as OnStage | { kind: FinaleKind; view: { stage: "off" | "done" } });
  const covering = shown.filter((s): s is OnStage => s.view.stage === "suspense" || (s.view.stage === "reveal" && !dismissed.has(s.kind)));
  const order = (s: OnStage) => (s.view.stage === "suspense" ? Infinity : s.view.backInMs);
  return covering.sort((a, b) => order(b) - order(a))[0] ?? null;
}
