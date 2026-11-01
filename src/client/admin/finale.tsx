import { useState } from "preact/hooks";
import { FINALE_ORDER, nextStep, type AdminFinale, type FinaleStage, type FinaleStep } from "../../shared/finale";
import type { AdminCmd, AdminEntrant, TallyRow } from "../../shared/protocol";
import type { AdminQuiz } from "../../shared/quiz";
import { DownloadAll } from "./contest";
import { photoUrl } from "../api";

type Send = (cmd: AdminCmd) => void;
type Props = { finale: AdminFinale; quiz: AdminQuiz; tally: TallyRow[]; send: Send; live: boolean };

const STAGE_LABEL: Record<FinaleStage, string> = {
  off: "Not started",
  suspense: "Suspense page on phones",
  photo: "Photo winner on phones",
  quiz: "Quiz winner on phones",
};

const STEP_LABEL: Record<FinaleStep, (quiz: AdminQuiz) => string> = {
  suspense: () => "Open suspense page",
  photo: () => "Reveal photo winner",
  quiz: (quiz) => (quiz.winners.length > 1 ? "Reveal quiz winners" : "Reveal quiz winner"),
};

const STEPS = FINALE_ORDER.filter((s): s is FinaleStep => s !== "off");

function blocker(step: FinaleStep, { finale, quiz }: Props): string | null {
  if (step === "suspense" && quiz.stage.phase !== "ended") return "End the quiz first.";
  if (step === "photo" && finale.tied.length > 1 && !finale.tied.includes(finale.pick!)) return "Photos are tied for first. Pick the winner below.";
  return null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function FinaleControls(props: Props) {
  const { finale, quiz, tally, send, live } = props;
  const [confirming, setConfirming] = useState(false);
  const next = nextStep(finale.stage);
  const blocked = next && blocker(next, props);
  const done = (step: FinaleStep) => FINALE_ORDER.indexOf(step) <= FINALE_ORDER.indexOf(finale.stage);

  function press(step: FinaleStep) {
    if (step === "suspense" && !confirming) return setConfirming(true);
    setConfirming(false);
    send({ t: "finale", step });
  }

  return (
    <section class="card finale" aria-labelledby="finale-title">
      <h2 id="finale-title">
        Finale <span class={`phase ${finale.stage}`}>{STAGE_LABEL[finale.stage]}</span>
      </h2>
      <ol class="finale-steps">
        {STEPS.map((step) => (
          <li key={step} class={done(step) ? "done" : step === next ? "next" : undefined}>
            {STEP_LABEL[step](quiz)}
          </li>
        ))}
      </ol>
      {next && !confirming && (
        <button class="btn finale-next" type="button" disabled={!live || blocked !== null} onClick={() => press(next)}>
          {STEP_LABEL[next](quiz)}
        </button>
      )}
      {blocked && <p class="muted">{blocked}</p>}
      {confirming && (
        <div class="confirm">
          <p class="warning">Open the finale? Voting closes and every phone moves to the suspense page. The quiz can't change after this.</p>
          <div class="row">
            <button class="btn small" type="button" disabled={!live} onClick={() => press("suspense")}>
              Yes, open suspense page
            </button>
            <button class="btn small secondary" type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {finale.tied.length > 1 && (finale.stage === "off" || finale.stage === "suspense") && (
        <TiePicker rows={tally.filter((r) => finale.tied.includes(r.photo))} pick={finale.pick} send={send} live={live} />
      )}
      <Revealed finale={finale} />
    </section>
  );
}

function TiePicker({ rows, pick, send, live }: { rows: TallyRow[]; pick: AdminFinale["pick"]; send: Send; live: boolean }) {
  return (
    <div class="tie">
      <h3>
        Tie for first, {plural(rows[0]?.votes ?? 0, "vote", "votes")} each. Pick the winner.
      </h3>
      <ul class="tie-photos">
        {rows.map((r) => (
          <li key={r.photo} class={r.photo === pick ? "picked" : undefined}>
            <img src={photoUrl(r.thumb)} alt={`${r.name}'s photo`} />
            <span class="name">{r.name}</span>
            <button
              class={r.photo === pick ? "btn small" : "btn small secondary"}
              type="button"
              disabled={!live}
              aria-pressed={r.photo === pick}
              onClick={() => send({ t: "pick-photo", photo: r.photo })}
            >
              {r.photo === pick ? "Winner ✓" : "Pick as winner"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Revealed({ finale }: { finale: AdminFinale }) {
  if (finale.stage !== "photo" && finale.stage !== "quiz") return null;
  return (
    <dl class="revealed">
      <dt>Best photo</dt>
      <dd>
        {finale.photo ? (
          <>
            <img src={photoUrl(finale.photo.thumb)} alt="" />
            <b>{finale.photo.name}</b> · {plural(finale.photo.votes, "vote", "votes")}
          </>
        ) : (
          "No photos in the contest"
        )}
      </dd>
      {finale.stage === "quiz" && (
        <>
          <dt>{finale.quiz.length > 1 ? "Quiz winners" : "Quiz winner"}</dt>
          <dd>{finale.quiz.length > 0 ? <b>{finale.quiz.map((w) => w.name).join(" & ")}</b> : "Nobody scored"}</dd>
        </>
      )}
    </dl>
  );
}

type Ending = { kind: "idle" } | { kind: "end" } | { kind: "wipe" } | { kind: "wiping" } | { kind: "failed"; error: string };

export function PartyEnd({ joins, entrants, send, live }: { joins: boolean; entrants: AdminEntrant[]; send: Send; live: boolean }) {
  const [ending, setEnding] = useState<Ending>({ kind: "idle" });

  async function wipe() {
    setEnding({ kind: "wiping" });
    const res = await fetch("/api/admin/party", { method: "DELETE" }).catch(() => null);
    if (res?.ok) return setEnding({ kind: "idle" });
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    setEnding({ kind: "failed", error: body?.error ?? "No connection. Try again." });
  }

  return (
    <section class="card party-end" aria-labelledby="party-end-title">
      <h2 id="party-end-title">End of the party</h2>
      <p class={joins ? "state open" : "state"}>{joins ? "New guests can join." : "The party has ended. New guests can't join."}</p>
      {ending.kind === "end" ? (
        <div class="confirm">
          <p class="warning">End the party? New guests can't join. Guests already here keep their app, and can still get back in with their name.</p>
          <div class="row">
            <button
              class="btn small danger"
              type="button"
              disabled={!live}
              onClick={() => {
                send({ t: "joins", open: false });
                setEnding({ kind: "idle" });
              }}
            >
              Yes, end the party
            </button>
            <button class="btn small secondary" type="button" onClick={() => setEnding({ kind: "idle" })}>
              Cancel
            </button>
          </div>
        </div>
      ) : ending.kind === "wipe" || ending.kind === "wiping" ? (
        <div class="confirm">
          <p class="warning">
            Download the photos first! Wiping deletes every player, answer, vote and photo, the landing photo and the questions. It can't be undone.
          </p>
          <DownloadAll entrants={entrants} />
          <div class="row">
            <button class="btn small danger" type="button" disabled={ending.kind === "wiping"} onClick={() => void wipe()}>
              {ending.kind === "wiping" ? "Wiping…" : "Yes, wipe everything"}
            </button>
            <button class="btn small secondary" type="button" onClick={() => setEnding({ kind: "idle" })}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div class="row">
          {joins ? (
            <button class="btn small danger" type="button" disabled={!live} onClick={() => setEnding({ kind: "end" })}>
              End the party
            </button>
          ) : (
            <>
              <button class="btn small secondary" type="button" disabled={!live} onClick={() => send({ t: "joins", open: true })}>
                Reopen joins
              </button>
              <button class="btn small danger" type="button" onClick={() => setEnding({ kind: "wipe" })}>
                Wipe all data…
              </button>
            </>
          )}
        </div>
      )}
      {ending.kind === "failed" && (
        <p class="error" role="alert">
          Wipe failed: {ending.error}
        </p>
      )}
      {joins && <p class="muted">End the party before you wipe its data.</p>}
    </section>
  );
}
