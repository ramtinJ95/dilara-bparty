import type { ComponentChildren, JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { PhotoId } from "../../shared/model";
import type { GuestCmd } from "../../shared/protocol";
import type { GuestQuestion, GuestQuiz, Phase, RoundResult } from "../../shared/quiz";
import { formatSv as fmt, LETTERS, parseNumber } from "../answers";
import { useSecondsLeft } from "../clock";
import { CheckIcon, Snowflake, Sparkle, Tiara } from "../icons";
import { elapsedMs, heldAnswer, holdAnswer, markShown, roundKey } from "./answer-clock";
import { Leaderboard } from "./board";
import "./quiz.css";

type LiveQuiz = Exclude<GuestQuiz, { phase: "locked" }>;
type Of<P extends Phase> = Extract<GuestQuiz, { phase: P }>;
type Shared = { deadline: number | null; send: (cmd: GuestCmd) => boolean; live: boolean };
export type ViewProps<P extends LiveQuiz["phase"]> = Shared & { quiz: Of<P> };

export const photoUrl = (id: PhotoId) => `/photos/${id}`;

const VIEWS: { [P in LiveQuiz["phase"]]: (props: ViewProps<P>) => JSX.Element } = {
  lobby: Lobby,
  open: Open,
  closed: Closed,
  reveal: Reveal,
  leaderboard: Leaderboard,
  ended: Ended,
};

export function Quiz(props: Shared & { quiz: LiveQuiz }) {
  const View = VIEWS[props.quiz.phase] as (p: typeof props) => JSX.Element;
  const key = "question" in props.quiz ? `${props.quiz.phase}:${roundKey(props.quiz.unlockedAt, props.quiz.question.id)}` : props.quiz.phase;
  return <View key={key} {...props} />;
}

function Calm({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="panel card calm" aria-labelledby="quiz-title">
      <Tiara />
      <h2 id="quiz-title">{title}</h2>
      {children}
      <Sparkle class="sparkle a" />
      <Sparkle class="sparkle b" />
    </section>
  );
}

function Lobby() {
  return (
    <Calm title="Quizet börjar snart!">
      <p>Första frågan kommer alldeles strax.</p>
    </Calm>
  );
}

function Ended() {
  return (
    <Calm title="Quizet är slut!">
      <p>Tack för att du var med! Vem som vann får ni veta alldeles snart …</p>
    </Calm>
  );
}

function Progress({ n, total }: { n: number; total: number }) {
  return (
    <p class="q-progress">
      Fråga {n} av {total}
    </p>
  );
}

type PhotoState = "loading" | "shown" | "none";

// The question waits for its photo so the answer timer starts with everything on screen.
function usePhoto(photo: PhotoId | null): PhotoState {
  const [done, setDone] = useState<{ photo: PhotoId; ok: boolean } | null>(null);
  useEffect(() => {
    if (!photo) return;
    let current = true;
    const img = new Image();
    img.onload = () => current && setDone({ photo, ok: true });
    img.onerror = () => current && setDone({ photo, ok: false });
    img.src = photoUrl(photo);
    return () => {
      current = false;
    };
  }, [photo]);
  if (!photo) return "none";
  if (done?.photo !== photo) return "loading";
  return done.ok ? "shown" : "none";
}

function Open({ quiz, deadline, send, live }: ViewProps<"open">) {
  const q = quiz.question;
  const clock = roundKey(quiz.unlockedAt, q.id);
  const photo = usePhoto(q.photo);
  const ready = photo !== "loading";
  const left = useSecondsLeft(deadline);
  const [held, setHeld] = useState(() => heldAnswer(clock));
  useEffect(() => {
    if (ready) markShown(clock);
  }, [ready, clock]);

  const confirmed = quiz.pick !== null;
  const pick = quiz.pick ?? held?.pick ?? null;
  const timeUp = left === 0;
  const locked = pick !== null || timeUp;
  const answer = (value: number) => {
    if (locked) return;
    const cmd = { t: "answer", q: q.id, pick: value, ms: elapsedMs(clock), run: quiz.unlockedAt } as const;
    holdAnswer(clock, cmd);
    setHeld(cmd);
    if (live) send(cmd);
  };

  return (
    <section class="quiz-card card" aria-labelledby="quiz-title">
      <div class="quiz-top">
        <Progress n={quiz.n} total={quiz.total} />
        <Countdown deadline={deadline} seconds={q.seconds} left={left} />
      </div>
      {!ready ? (
        <div class="loading" role="status">
          <Snowflake />
          <p>Laddar frågan …</p>
        </div>
      ) : (
        <>
          {photo === "shown" && q.photo && <img class="q-photo" src={photoUrl(q.photo)} alt="" />}
          <h2 id="quiz-title" class="q-text">
            {q.text}
          </h2>
          {q.kind === "choice" ? (
            <div class="choices">
              {q.options.map((o, i) => (
                <button key={i} type="button" class={pick === i ? "choice picked" : "choice"} disabled={locked} aria-pressed={pick === i} onClick={() => answer(i)}>
                  <span class="letter">{LETTERS[i]}</span>
                  <span>{o}</span>
                </button>
              ))}
            </div>
          ) : pick === null ? (
            <Guess disabled={timeUp} onSend={answer} />
          ) : (
            <p class="your-guess">
              Din gissning: <b>{fmt(pick)}</b>
            </p>
          )}
          {confirmed ? (
            <p class="answer-note sent" role="status">
              <CheckIcon /> Svar skickat!
            </p>
          ) : pick !== null ? (
            <p class="answer-note sending" role="status">
              Skickar svaret …
            </p>
          ) : (
            timeUp && (
              <p class="answer-note late" role="status">
                Tiden är ute!
              </p>
            )
          )}
        </>
      )}
    </section>
  );
}

function Countdown({ deadline, seconds, left }: { deadline: number | null; seconds: number; left: number | null }) {
  const [bar] = useState(() => {
    const ms = deadline === null ? 0 : Math.max(0, deadline - performance.now());
    return { ms, from: Math.min(1, ms / (seconds * 1000)) };
  });
  return (
    <div class="countdown">
      <div class="track" aria-hidden="true">
        <i style={{ animationDuration: `${bar.ms}ms`, "--from": bar.from }} />
      </div>
      <span class="secs" aria-label={`${left ?? 0} sekunder kvar`}>
        {left ?? 0}
      </span>
    </div>
  );
}

function Guess({ disabled, onSend }: { disabled: boolean; onSend: (n: number) => void }) {
  const [value, setValue] = useState("");
  const n = parseNumber(value);
  return (
    <form
      class="guess"
      onSubmit={(e) => {
        e.preventDefault();
        if (Number.isFinite(n)) onSend(n);
      }}
    >
      <input
        class="field"
        inputMode="decimal"
        enterKeyHint="send"
        placeholder="Din gissning"
        aria-label="Din gissning"
        value={value}
        disabled={disabled}
        onInput={(e) => setValue(e.currentTarget.value)}
      />
      <button class="btn" type="submit" disabled={disabled || !Number.isFinite(n)}>
        Skicka
      </button>
    </form>
  );
}

function pickText(q: GuestQuestion, pick: number) {
  return q.kind === "choice" ? `${LETTERS[pick]}. ${q.options[pick] ?? ""}` : fmt(pick);
}

function Closed({ quiz }: ViewProps<"closed">) {
  return (
    <section class="quiz-card card" aria-labelledby="quiz-title">
      <Progress n={quiz.n} total={quiz.total} />
      <h2 id="quiz-title" class="q-text small">
        {quiz.question.text}
      </h2>
      <p class="your-guess">
        {quiz.pick === null ? (
          "Du hann inte svara den här gången."
        ) : (
          <>
            {quiz.question.kind === "choice" ? "Ditt svar" : "Din gissning"}: <b>{pickText(quiz.question, quiz.pick)}</b>
          </>
        )}
      </p>
      <div class="loading" role="status">
        <Snowflake />
        <p>Väntar på rätt svar …</p>
      </div>
    </section>
  );
}

type Outcome = "right" | "wrong" | "none";
const VERDICT: Record<RoundResult["kind"], Record<Outcome, string>> = {
  choice: { right: "Rätt!", wrong: "Tyvärr fel", none: "Inget svar" },
  number: { right: "Närmast!", wrong: "Inte närmast den här gången", none: "Inget svar" },
};

function Reveal({ quiz }: ViewProps<"reveal">) {
  const outcome: Outcome = quiz.pick === null ? "none" : quiz.points > 0 ? "right" : "wrong";
  return (
    <section class="quiz-card card" aria-labelledby="quiz-title">
      <Progress n={quiz.n} total={quiz.total} />
      <div class={`verdict ${outcome}`}>
        {outcome === "right" && (
          <>
            <Sparkle class="sparkle a" />
            <Sparkle class="sparkle b" />
            <Sparkle class="sparkle c" />
          </>
        )}
        <h2 id="quiz-title">{VERDICT[quiz.result.kind][outcome]}</h2>
        <p class="points">+{fmt(quiz.points)} poäng</p>
        <p class="total">Totalt {fmt(quiz.score)} poäng</p>
      </div>
      <p class="q-text small">{quiz.question.text}</p>
      {quiz.result.kind === "choice" && quiz.question.kind === "choice" ? (
        <RoomChoice options={quiz.question.options} result={quiz.result} pick={quiz.pick} />
      ) : (
        quiz.result.kind === "number" && <RoomNumber result={quiz.result} pick={quiz.pick} />
      )}
    </section>
  );
}

function RoomChoice({ options, result, pick }: { options: string[]; result: Extract<RoundResult, { kind: "choice" }>; pick: number | null }) {
  const most = Math.max(1, ...result.counts);
  return (
    <div class="room">
      <h3>Så svarade alla</h3>
      <ul class="tally">
        {options.map((o, i) => (
          <li key={i} class={i === result.correct ? "correct" : undefined}>
            <span class="label">
              <span class="letter">{LETTERS[i]}</span>
              {o}
              {i === result.correct && <CheckIcon />}
              {i === pick && <span class="tag">Ditt svar</span>}
            </span>
            <span class="bar">
              <i style={{ transform: `scaleX(${(result.counts[i] ?? 0) / most})` }} />
            </span>
            <b>{result.counts[i] ?? 0}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoomNumber({ result, pick }: { result: Extract<RoundResult, { kind: "number" }>; pick: number | null }) {
  return (
    <div class="room">
      <h3>Så svarade alla</h3>
      <dl class="facts">
        <dt>Rätt svar</dt>
        <dd>{fmt(result.answer)}</dd>
        <dt>Närmast</dt>
        <dd>{result.closest.length === 0 ? "Ingen gissade" : result.closest.map((c) => `${c.name} (${fmt(c.value)})`).join(", ")}</dd>
        <dt>Din gissning</dt>
        <dd>{pick === null ? "–" : fmt(pick)}</dd>
      </dl>
    </div>
  );
}
