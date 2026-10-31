import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { formatJoinCode } from "../../shared/join-code";
import type { AdminState } from "../../shared/protocol";
import { useLive } from "../live";
import "../theme.css";
import "./admin.css";
import { LandingPhoto } from "./landing-photo";
import { Players } from "./players";
import { Qr } from "./qr";

function Admin() {
  const [error, setError] = useState<string | null>(null);
  const { state, status, send } = useLive<AdminState>("/ws/admin", (msg) => msg.t === "error" && setError(msg.message));
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const live = status.kind === "open";
  const joinUrl = state ? `${location.origin}/j/${state.join.secret}` : "";

  return (
    <div class="admin">
      <header>
        <h1>Party admin</h1>
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
            <Players players={state.players} send={(cmd) => send(JSON.stringify(cmd))} live={live} />
            <LandingPhoto photo={state.landingPhoto} />
          </div>
        </div>
      )}
    </div>
  );
}

render(<Admin />, document.getElementById("app")!);
