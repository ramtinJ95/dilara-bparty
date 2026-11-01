import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { formatJoinCode } from "../../shared/join-code";
import type { AdminCmd, AdminState } from "../../shared/protocol";
import { useDeadline } from "../clock";
import { useLive } from "../live";
import "../theme.css";
import "./admin.css";
import { Contest } from "./contest";
import { FinaleControls, PartyEnd } from "./finale";
import { LandingPhoto } from "./landing-photo";
import { Players } from "./players";
import { Qr } from "./qr";
import { Questions } from "./questions";
import { QuizControls } from "./quiz-controls";

function Admin() {
  const [error, setError] = useState<string | null>(null);
  const { state, heartbeat, status, send } = useLive<AdminState>("/ws/admin", (msg) => msg.t === "error" && setError(msg.message));
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);
  const stage = state?.quiz.stage;
  const deadline = useDeadline(state, stage?.phase === "open" ? stage.endsInMs : null);

  const live = status.kind === "open";
  const sendCmd = (cmd: AdminCmd) => void send(JSON.stringify(cmd));
  const joinUrl = state ? `${location.origin}/j/${state.join.secret}` : "";

  return (
    <div class="admin">
      <header>
        <h1>Party admin</h1>
        {heartbeat && (
          <div class="toggle" title="For the quiz: the server ticks every 4 s instead of 30 s, so phones reconnect within about 11 s instead of 70 s.">
            <span class={heartbeat === "fast" ? "state open" : "state"}>Fast heartbeat {heartbeat === "fast" ? "on" : "off"}</span>
            <button class={heartbeat === "fast" ? "btn small secondary" : "btn small"} type="button" disabled={!live} onClick={() => sendCmd({ t: "liveMode", on: heartbeat !== "fast" })}>
              {heartbeat === "fast" ? "Turn off" : "Turn on"}
            </button>
          </div>
        )}
        <span class={live ? "status on" : "status"}>{live ? "Live" : state ? "Reconnecting…" : "Connecting…"}</span>
      </header>
      {error && (
        <div class="toast" role="alert">
          {error}
        </div>
      )}
      {state && (
        <div class="grid">
          <section class="card join-card" aria-labelledby="join-title">
            <h2 id="join-title">Scan to join</h2>
            <Qr text={joinUrl} label="QR code for the join link" />
            <p class="code-label muted">or go to the site and type the code</p>
            <p class="code">{formatJoinCode(state.join.code)}</p>
            <p class="url muted">{joinUrl}</p>
          </section>
          <div class="side">
            <QuizControls quiz={state.quiz} deadline={deadline} send={sendCmd} live={live} frozen={state.finale.stage !== "off"} />
            <FinaleControls finale={state.finale} quiz={state.quiz} tally={state.contest.tally} send={sendCmd} live={live} />
            <Players players={state.players} send={sendCmd} live={live} />
          </div>
          <Questions questions={state.quiz.questions} played={state.quiz.played} send={sendCmd} live={live} />
          <LandingPhoto photo={state.landingPhoto} />
          <Contest contest={state.contest} send={sendCmd} live={live} />
          <PartyEnd joins={state.finale.joins} entrants={state.contest.entrants} send={sendCmd} live={live} />
        </div>
      )}
    </div>
  );
}

render(<Admin />, document.getElementById("app")!);
