import { useEffect, useState } from "preact/hooks";
import { FINALE_STEPS, finaleBlocker, nextStep, stepTaken, winOf, type AdminFinales, type FinaleKind, type FinaleStage, type FinaleStep, type PhotoWin, type QuizWin } from "../../shared/finale";
import type { AdminCmd, AdminEntrant, TallyRow } from "../../shared/protocol";
import type { AdminQuiz } from "../../shared/quiz";
import { photoUrl } from "../api";
import { DownloadAll } from "./contest";
import { plural } from "./format";

type Send = (cmd: AdminCmd) => void;
type Props = { kind: FinaleKind; finale: AdminFinales; quiz: AdminQuiz; tally: TallyRow[]; send: Send; live: boolean };

const STAGE_LABEL: Record<FinaleStage, string> = {
  off: "Not started",
  suspense: "Suspense page on phones",
  reveal: "Winner on phones",
  done: "Revealed",
};

type Card = { title: string; steps: Record<FinaleStep, (quiz: AdminQuiz) => string>; confirm: string };

const CARDS: Record<FinaleKind, Card> = {
  quiz: {
    title: "Quiz finale",
    steps: { suspense: () => "Open suspense page", reveal: (quiz) => (quiz.winners.length > 1 ? "Reveal quiz winners" : "Reveal quiz winner") },
    confirm: "Open the quiz finale? Every phone moves to the quiz suspense page. The quiz can't change after this.",
  },
  photo: {
    title: "Photo finale",
    steps: { suspense: () => "Open suspense page", reveal: () => "Reveal photo winner" },
    confirm: "Open the photo finale? Uploads and voting close and every phone moves to the photo suspense page.",
  },
};

export function FinaleCard({ kind, finale, quiz, tally, send, live }: Props) {
  const [confirming, setConfirming] = useState(false);
  const card = CARDS[kind];
  const { stage } = finale[kind];
  const next = nextStep(stage);
  const gate = { quizPhase: quiz.stage.phase, quiz: finale.quiz.stage, photo: finale.photo.stage, tied: finale.tied, pick: finale.pick };
  const blocked = next && finaleBlocker(kind, next, gate);

  // Another admin view can open the suspense page while this one asks, and the question must then go rather than come back after a reset.
  useEffect(() => {
    if (confirming && next !== "suspense") setConfirming(false);
  }, [confirming, next]);

  function press(step: FinaleStep) {
    if (step === "suspense" && !confirming) return setConfirming(true);
    setConfirming(false);
    send({ t: "finale", kind, step });
  }

  return (
    <section class={`card finale ${kind}-finale`} aria-labelledby={`${kind}-finale-title`}>
      <h2 id={`${kind}-finale-title`}>
        {card.title} <span class={`phase ${stage}`}>{STAGE_LABEL[stage]}</span>
      </h2>
      <ol class="finale-steps">
        {FINALE_STEPS.map((step) => (
          <li key={step} class={stepTaken(step, stage) ? "done" : step === next ? "next" : undefined}>
            {card.steps[step](quiz)}
          </li>
        ))}
      </ol>
      {next && !confirming && (
        <button class="btn finale-next" type="button" disabled={!live || blocked !== null} onClick={() => press(next)}>
          {card.steps[next](quiz)}
        </button>
      )}
      {blocked && <p class="muted">{blocked}</p>}
      {confirming && (
        <div class="confirm">
          <p class="warning">{card.confirm}</p>
          <div class="row">
            <button class="btn small" type="button" disabled={!live || blocked !== null} onClick={() => press("suspense")}>
              Yes, open suspense page
            </button>
            <button class="btn small secondary" type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {kind === "photo" && next && finale.tied.length > 1 && (
        <TiePicker rows={tally.filter((r) => finale.tied.includes(r.photo))} pick={finale.pick} send={send} live={live} />
      )}
      {stage === "reveal" && <p class="muted auto-next">Phones go back to the party on their own in a minute.</p>}
      {stepTaken("reveal", stage) && (kind === "quiz" ? <QuizRevealed winners={winOf(finale.quiz) ?? []} /> : <PhotoRevealed photo={winOf(finale.photo)} />)}
    </section>
  );
}

function TiePicker({ rows, pick, send, live }: { rows: TallyRow[]; pick: AdminFinales["pick"]; send: Send; live: boolean }) {
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

const QuizRevealed = ({ winners }: { winners: QuizWin[] }) => (
  <dl class="revealed">
    <dt>{winners.length > 1 ? "Quiz winners" : "Quiz winner"}</dt>
    <dd>{winners.length > 0 ? <b>{winners.map((w) => w.name).join(" & ")}</b> : "Nobody scored"}</dd>
  </dl>
);

const PhotoRevealed = ({ photo }: { photo: PhotoWin | null }) => (
  <dl class="revealed">
    <dt>Best photo</dt>
    <dd>
      {photo ? (
        <>
          <img src={photoUrl(photo.thumb)} alt="" />
          <b>{photo.name}</b> · {plural(photo.votes, "vote", "votes")}
        </>
      ) : (
        "No photos in the contest"
      )}
    </dd>
  </dl>
);

type Ending =
  | { kind: "idle" }
  | { kind: "end" }
  | { kind: "wipe" }
  | { kind: "wiping" }
  | { kind: "reset"; typed: string }
  | { kind: "resetting" }
  | { kind: "failed"; what: "Wipe" | "Reset"; error: string };

const RESET_WORD = "RESET";

async function request(path: string, method: string): Promise<string | null> {
  const res = await fetch(path, { method }).catch(() => null);
  if (res?.ok) return null;
  const body = (await res?.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "No connection. Try again.";
}

export function PartyEnd({ joins, entrants, send, live }: { joins: boolean; entrants: AdminEntrant[]; send: Send; live: boolean }) {
  const [ending, setEnding] = useState<Ending>({ kind: "idle" });

  async function wipe() {
    setEnding({ kind: "wiping" });
    const error = await request("/api/admin/party", "DELETE");
    setEnding(error ? { kind: "failed", what: "Wipe", error } : { kind: "idle" });
  }

  async function reset() {
    setEnding({ kind: "resetting" });
    const error = await request("/api/admin/party/reset", "POST");
    setEnding(error ? { kind: "failed", what: "Reset", error } : { kind: "idle" });
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
      ) : ending.kind === "reset" || ending.kind === "resetting" ? (
        <div class="confirm">
          <p class="warning">
            Reset the party? Every guest leaves, and their names, contest photos, votes, quiz answers and scores and both finales are cleared.
            New guests can join again. The questions, their photos and the landing photo stay. It can't be undone.
          </p>
          <DownloadAll entrants={entrants} />
          <label class="stack">
            <span>Type {RESET_WORD} to confirm</span>
            <input
              class="field"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck={false}
              value={ending.kind === "reset" ? ending.typed : RESET_WORD}
              disabled={ending.kind === "resetting"}
              onInput={(e) => setEnding({ kind: "reset", typed: e.currentTarget.value })}
            />
          </label>
          <div class="row">
            <button
              class="btn small danger"
              type="button"
              disabled={ending.kind === "resetting" || ending.typed !== RESET_WORD}
              onClick={() => void reset()}
            >
              {ending.kind === "resetting" ? "Resetting…" : "Yes, reset the party"}
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
          <button class="btn small secondary" type="button" onClick={() => setEnding({ kind: "reset", typed: "" })}>
            Reset party…
          </button>
        </div>
      )}
      {ending.kind === "failed" && (
        <p class="error" role="alert">
          {ending.what} failed: {ending.error}
        </p>
      )}
      {joins && <p class="muted">End the party before you wipe its data.</p>}
    </section>
  );
}
