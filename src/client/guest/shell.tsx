import type { ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { GuestState } from "../../shared/protocol";
import { CameraIcon, GalleryIcon, LockIcon } from "../icons";
import { useLive } from "../live";

type Tab = { id: string; label: string; Icon: ComponentType; title: string; text: string };

const TABS: readonly Tab[] = [
  { id: "quiz", label: "Quiz", Icon: LockIcon, title: "Quizet är inte öppet än", text: "Vi säger till när det är dags!" },
  { id: "mitt-foto", label: "Mitt foto", Icon: CameraIcon, title: "Mitt foto", text: "Snart kan du ladda upp din finaste bild med Dilara här." },
  { id: "galleri", label: "Galleri", Icon: GalleryIcon, title: "Galleri", text: "Här visas alla bilder när fototävlingen har börjat." },
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


export function Shell() {
  const [tab, select] = useHashTab();
  const { state, status } = useLive<GuestState>("/ws", (msg) => msg.t === "gone" && location.replace("/"));
  const pill = status.kind === "open" ? null : state ? "Återansluter…" : "Ansluter…";

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
        <section class="panel card" aria-labelledby="panel-title">
          <tab.Icon />
          <h2 id="panel-title">{tab.title}</h2>
          <p>{tab.text}</p>
        </section>
      </main>
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
