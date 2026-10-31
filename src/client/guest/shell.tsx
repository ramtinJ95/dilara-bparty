import type { ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { GuestCmd, GuestState } from "../../shared/protocol";
import { CameraIcon, GalleryIcon, LockIcon } from "../icons";
import { useLive } from "../live";
import { GalleryPanel } from "./gallery";
import { MyPhotoPanel } from "./my-photo";
import { useUploader, type Uploader } from "./use-upload";

type PanelProps = { state: GuestState; live: boolean; send: (cmd: GuestCmd) => void; upload: Uploader; go: (id: TabId) => void };
type TabId = "quiz" | "mitt-foto" | "galleri";
type Tab = { id: TabId; label: string; Icon: ComponentType; Panel: ComponentType<PanelProps> };

const Quiz = () => (
  <section class="panel card" aria-labelledby="panel-title">
    <LockIcon />
    <h2 id="panel-title">Quizet är inte öppet än</h2>
    <p>Vi säger till när det är dags!</p>
  </section>
);

const TABS: readonly Tab[] = [
  { id: "quiz", label: "Quiz", Icon: LockIcon, Panel: Quiz },
  { id: "mitt-foto", label: "Mitt foto", Icon: CameraIcon, Panel: (p) => <MyPhotoPanel contest={p.state.contest} upload={p.upload} live={p.live} send={p.send} /> },
  { id: "galleri", label: "Galleri", Icon: GalleryIcon, Panel: (p) => <GalleryPanel contest={p.state.contest} live={p.live} send={p.send} toMyPhoto={() => p.go("mitt-foto")} /> },
];

const tabFromHash = () => TABS.find((t) => `#${t.id}` === location.hash) ?? TABS[0]!;

function useHashTab(): [Tab, (tab: Tab) => void] {
  const [tab, setTab] = useState(tabFromHash);
  useEffect(() => {
    const sync = () => setTab(tabFromHash());
    addEventListener("hashchange", sync);
    return () => removeEventListener("hashchange", sync);
  }, []);
  return [
    tab,
    (next) => {
      history.replaceState(null, "", `#${next.id}`);
      setTab(next);
    },
  ];
}

function useToast(): [string | null, (message: string) => void] {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  return [toast, setToast];
}

export function Shell() {
  const [tab, select] = useHashTab();
  const [toast, showToast] = useToast();
  const { state, status, send } = useLive<GuestState>("/ws", (msg) =>
    msg.t === "gone" ? location.replace("/") : msg.t === "error" && showToast(msg.message),
  );
  const upload = useUploader(state?.contest.mine?.id ?? null);
  const live = status.kind === "open";
  const pill = live ? null : state ? "Återansluter…" : "Ansluter…";
  const sendCmd = (cmd: GuestCmd) => void (send(JSON.stringify(cmd)) || showToast("Ingen kontakt just nu. Försök igen."));

  return (
    <div class="shell">
      {pill && (
        <div class="pill" role="status">
          {pill}
        </div>
      )}
      <header>
        <h1>{state ? `Hej, ${state.you.name}!` : "Hej!"}</h1>
        {state && <p class="online">{state.online === 1 ? "1 gäst här just nu" : `${state.online} gäster här just nu`}</p>}
      </header>
      <main>
        {state && <tab.Panel state={state} live={live} send={sendCmd} upload={upload} go={(id) => select(TABS.find((t) => t.id === id)!)} />}
      </main>
      {toast && (
        <div class="toast" role="alert">
          {toast}
        </div>
      )}
      <nav class="tabs" aria-label="Flikar">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={t.id === tab.id ? "page" : undefined} onClick={() => select(t)}>
            <t.Icon />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
