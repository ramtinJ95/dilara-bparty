import type { ComponentType } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { GuestCmd, GuestState } from "../../shared/protocol";
import { useDeadline } from "../clock";
import { CameraIcon, GalleryIcon, LockIcon, QuizIcon } from "../icons";
import { useLive } from "../live";
import { heldAnswer, roundKey, settleAnswer } from "./answer-clock";
import { Finale } from "./finale";
import { GalleryPanel } from "./gallery";
import { MyPhotoPanel } from "./my-photo";
import { Quiz } from "./quiz";
import { UnlockPopup, useUnlockNotice } from "./unlock";
import { useUploader, type Uploader } from "./use-upload";

type PanelProps = {
  state: GuestState;
  live: boolean;
  send: (cmd: GuestCmd) => boolean;
  upload: Uploader;
  go: (id: TabId) => void;
  deadline: number | null;
};
type TabId = "quiz" | "mitt-foto" | "galleri";
type Tab = { id: TabId; label: string; Icon: ComponentType; Panel: ComponentType<PanelProps> };

const QuizPanel = ({ state, live, send, deadline }: PanelProps) =>
  state.quiz.phase === "locked" ? (
    <section class="panel card" aria-labelledby="panel-title">
      <LockIcon />
      <h2 id="panel-title">Quizet är inte öppet än</h2>
      <p>Vi säger till när det är dags!</p>
    </section>
  ) : (
    <Quiz quiz={state.quiz} deadline={deadline} send={send} live={live} />
  );

const TABS: readonly Tab[] = [
  { id: "quiz", label: "Quiz", Icon: LockIcon, Panel: QuizPanel },
  { id: "mitt-foto", label: "Mitt foto", Icon: CameraIcon, Panel: (p) => <MyPhotoPanel contest={p.state.contest} upload={p.upload} live={p.live} send={p.send} /> },
  { id: "galleri", label: "Galleri", Icon: GalleryIcon, Panel: (p) => <GalleryPanel contest={p.state.contest} live={p.live} send={p.send} toMyPhoto={() => p.go("mitt-foto")} /> },
];
const QUIZ_TAB = TABS[0]!;

const tabFromHash = () => TABS.find((t) => `#${t.id}` === location.hash) ?? QUIZ_TAB;

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

// Lives in the shell, not the quiz view, so a held answer is resent even if the guest left the Quiz tab.
// It waits for the first snapshot after a reconnect, so it never answers from a state the server has moved past.
function useResendHeld(state: GuestState | null, live: boolean, send: (cmd: GuestCmd) => boolean) {
  const reconnected = useRef(false);
  useEffect(() => {
    if (!live) reconnected.current = true;
  }, [live]);
  useEffect(() => {
    const quiz = state?.quiz;
    if (quiz?.phase !== "open") return;
    const key = roundKey(quiz.unlockedAt, quiz.question.id);
    if (quiz.pick !== null) return settleAnswer(key);
    if (!live || !reconnected.current) return;
    reconnected.current = false;
    const held = heldAnswer(key);
    if (held) send(held);
  }, [state]);
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
  const sendCmd = (cmd: GuestCmd) => send(JSON.stringify(cmd)) || (showToast("Ingen kontakt just nu. Försök igen."), false);

  useResendHeld(state, live, sendCmd);
  const quiz = state?.quiz ?? null;
  const onQuizTab = tab.id === "quiz";
  const unlocked = quiz !== null && quiz.phase !== "locked";
  const deadline = useDeadline(state, quiz?.phase === "open" ? quiz.endsInMs : null);
  const unlock = useUnlockNotice(quiz && quiz.phase !== "locked" && quiz.phase !== "ended" ? quiz.unlockedAt : null, onQuizTab);
  const waitingForYou = quiz?.phase === "open" && quiz.pick === null && !onQuizTab;
  const finale = state?.finale;

  if (state && finale && finale.stage !== "off") {
    return (
      <div class="shell finale-shell">
        {pill && (
          <div class="pill" role="status">
            {pill}
          </div>
        )}
        <Finale finale={finale} you={state.you.id} />
      </div>
    );
  }

  return (
    <div class="shell">
      {pill && (
        <div class="pill" role="status">
          {pill}
        </div>
      )}
      <header class={onQuizTab && unlocked ? "compact" : undefined}>
        <h1>{state ? `Hej, ${state.you.name}!` : "Hej!"}</h1>
        {state && <p class="online">{state.online === 1 ? "1 gäst här just nu" : `${state.online} gäster här just nu`}</p>}
      </header>
      <main>
        {state && (
          <tab.Panel state={state} live={live} send={sendCmd} upload={upload} go={(id) => select(TABS.find((t) => t.id === id)!)} deadline={deadline} />
        )}
      </main>
      {toast && (
        <div class="toast" role="alert">
          {toast}
        </div>
      )}
      <nav class="tabs" aria-label="Flikar">
        {TABS.map((t) => {
          const Icon = t.id === "quiz" && unlocked ? QuizIcon : t.Icon;
          return (
            <button key={t.id} type="button" aria-current={t.id === tab.id ? "page" : undefined} onClick={() => select(t)}>
              <Icon />
              {t.label}
              {t.id === "quiz" && waitingForYou && <span class="tab-dot" aria-label="En fråga väntar" />}
            </button>
          );
        })}
      </nav>
      {unlock.show && (
        <UnlockPopup
          onGo={() => {
            unlock.markSeen();
            select(QUIZ_TAB);
          }}
          onLater={unlock.markSeen}
        />
      )}
    </div>
  );
}
