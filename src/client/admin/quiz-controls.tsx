import { useState } from "preact/hooks";
import type { AdminCmd } from "../../shared/protocol";
import { QUIZ_STEPS, stepAllowed, type AdminQuiz, type BoardRow, type Phase, type Question, type QuizStep, type RoundResult } from "../../shared/quiz";
import { LETTERS } from "../answers";
import { useSecondsLeft } from "../clock";
import { plural } from "./format";

const PHASE_LABEL: Record<Phase, string> = {
  locked: "Locked",
  lobby: "Unlocked, waiting for the first question",
  open: "Question open",
  closed: "Answers closed",
  reveal: "Answer revealed",
  leaderboard: "Leaderboard on phones",
  ended: "Quiz ended",
};

const STEPS = Object.keys(QUIZ_STEPS) as QuizStep[];

const STEP_LABEL: Record<QuizStep, (quiz: AdminQuiz) => string> = {
  unlock: () => "Unlock quiz",
  start: (quiz) => (quiz.stage.phase === "lobby" ? `Start question ${quiz.played.length + 1}` : "Next question"),
  reveal: () => "Reveal answer",
  leaderboard: () => "Show leaderboard",
  end: () => "End quiz",
  reset: () => "Reset quiz",
};


const CONFIRM: Partial<Record<QuizStep, (quiz: AdminQuiz) => string | null>> = {
  reset: () => "Reset the quiz? Every answer and score is wiped. The questions stay.",
  end: (quiz) => {
    const left = quiz.questions.length - quiz.played.length;
    return left > 0 ? `End the quiz now? ${plural(left, "question hasn't", "questions haven't")} been played.` : null;
  },
};

const fmt = (n: number) => n.toLocaleString("en-GB");

type Props = { quiz: AdminQuiz; deadline: number | null; send: (cmd: AdminCmd) => void; live: boolean; frozen: boolean };

export function QuizControls({ quiz, deadline, send, live, frozen }: Props) {
  const { stage } = quiz;
  const [confirm, setConfirm] = useState<{ step: QuizStep; warning: string } | null>(null);
  const current = "q" in stage ? (quiz.questions.find((q) => q.id === stage.q) ?? null) : null;
  const upNext = quiz.questions.find((q) => q.id === quiz.next) ?? null;
  const enabled = (step: QuizStep) => live && !frozen && stepAllowed(step, stage.phase) && (step !== "start" || quiz.next !== null);

  function run(step: QuizStep) {
    const warning = CONFIRM[step]?.(quiz);
    if (warning) return setConfirm({ step, warning });
    send({ t: "quiz", step });
  }

  return (
    <section class="card quiz" aria-labelledby="quiz-title">
      <h2 id="quiz-title">
        Quiz <span class={`phase ${stage.phase}`}>{PHASE_LABEL[stage.phase]}</span>
      </h2>

      {"q" in stage && (
        <div class="current">
          <p class="muted">
            Question {stage.n} of {quiz.questions.length}
          </p>
          <p class="current-text">{current?.text}</p>
          <div class="answered">
            <span>
              <b>{stage.answered}</b> of {stage.expected} answered
            </span>
            {stage.phase === "open" && <Countdown deadline={deadline} />}
          </div>
          <div class="meter" aria-hidden="true">
            <i style={{ width: `${(stage.answered / Math.max(1, stage.expected)) * 100}%` }} />
          </div>
          {"result" in stage && <Result result={stage.result} question={current} />}
        </div>
      )}

      <div class="steps">
        {STEPS.map((step) => (
          <button
            key={step}
            class={step === "reset" || step === "end" ? "btn small secondary" : "btn small"}
            type="button"
            disabled={!enabled(step)}
            onClick={() => run(step)}
          >
            {STEP_LABEL[step](quiz)}
          </button>
        ))}
      </div>
      {confirm && (
        <div class="confirm">
          <p class="warning">{confirm.warning}</p>
          <div class="row">
            <button
              class="btn small danger"
              type="button"
              disabled={!enabled(confirm.step)}
              onClick={() => {
                send({ t: "quiz", step: confirm.step });
                setConfirm(null);
              }}
            >
              Yes, {STEP_LABEL[confirm.step](quiz).toLowerCase()}
            </button>
            <button class="btn small secondary" type="button" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {stage.phase !== "ended" && (
        <p class="muted next-up">
          {upNext
            ? `Up next: question ${quiz.played.length + 1}, “${upNext.text}”`
            : quiz.questions.length === 0
              ? "Add questions below before you start."
              : "Every question has been played."}
        </p>
      )}

      {stage.phase === "ended" && <Winners board={quiz.board} winners={quiz.winners} />}
      {quiz.board.some((r) => r.score > 0) && <Board rows={quiz.board} />}
    </section>
  );
}

function Countdown({ deadline }: { deadline: number | null }) {
  const left = useSecondsLeft(deadline);
  return <span class="countdown">{left === null || left > 0 ? `${left ?? "–"} s left` : "Time's up"}</span>;
}

function Result({ result, question }: { result: RoundResult; question: Question | null }) {
  if (result.kind === "number") {
    const closest = result.closest.map((c) => `${c.name} (${fmt(c.value)})`).join(", ");
    return (
      <div class="result">
        <p>
          Answer <b>{fmt(result.answer)}</b> · {plural(result.guesses, "guess", "guesses")}
        </p>
        <p>Closest: {closest || "nobody guessed"}</p>
      </div>
    );
  }
  const options = question?.kind === "choice" ? question.options : [];
  const most = Math.max(1, ...result.counts);
  return (
    <ul class="result bars">
      {result.counts.map((count, i) => (
        <li key={i} class={i === result.correct ? "correct" : undefined}>
          <span class="label">
            {LETTERS[i]}. {options[i] ?? ""}
            {i === result.correct && " ✓"}
          </span>
          <span class="bar">
            <i style={{ width: `${(count / most) * 100}%` }} />
          </span>
          <b>{count}</b>
        </li>
      ))}
    </ul>
  );
}

function Winners({ board, winners }: { board: BoardRow[]; winners: AdminQuiz["winners"] }) {
  const names = winners.map((id) => board.find((r) => r.id === id)?.name ?? "Unknown player");
  if (names.length === 0) return <p class="winners">No winner: nobody scored.</p>;
  return (
    <p class="winners">
      {names.length === 1 ? "Winner" : "Joint winners"}: <b>{names.join(" & ")}</b>
    </p>
  );
}

function Board({ rows }: { rows: BoardRow[] }) {
  return (
    <ol class="board" aria-label="Scores">
      {rows.map((r) => (
        <li key={r.id}>
          <span class="rank">{r.rank}</span>
          <span class="name">{r.name}</span>
          <span class="score">{fmt(r.score)}</span>
        </li>
      ))}
    </ol>
  );
}
