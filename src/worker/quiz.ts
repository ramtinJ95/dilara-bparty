import type { PhotoId, PlayerId, QuestionId } from "../shared/model";
import type { GuestCmdOf } from "../shared/protocol";
import {
  GRACE_MS,
  guestQuestion,
  stepAllowed,
  type AdminQuiz,
  type AdminStage,
  type BoardRow,
  type GuestQuestion,
  type GuestQuiz,
  type Phase,
  type Question,
  type QuestionBody,
  type QuizStep,
  type RoundResult,
  type Tally,
} from "../shared/quiz";
import { newQuestionId } from "./auth";
import type { Roster } from "./players";
import { accepts, board, clampMs, roundPoints, roundResult } from "./scoring";

const PHASE_KEY = "quiz_phase";
const UNLOCKED_KEY = "quiz_unlocked_at";
const TOP = 5;

const MISSING = "That question no longer exists.";
const PLAYED = "This question has already been played. Reset the quiz to change it.";
const LATE = "Svaret kom för sent.";
const INVALID = "Svaret gick inte att läsa.";

const ROUND_PHASES = ["open", "closed", "reveal", "leaderboard"] as const;
type RoundPhase = (typeof ROUND_PHASES)[number];
type IdlePhase = Exclude<Phase, RoundPhase>;
const inRound = (phase: Phase): phase is RoundPhase => (ROUND_PHASES as readonly Phase[]).includes(phase);

type RoundRow = { question_id: QuestionId; n: number; started_at: number; deadline: number; revealed: number };
type AnswerRow = { question_id: QuestionId; player_id: PlayerId; pick: number; ms: number; points: number | null };
type Stage = { phase: IdlePhase } | { phase: RoundPhase; round: RoundRow };

export type QuizView = { admin: AdminQuiz; guest: (player: PlayerId) => GuestQuiz };

const closesAt = (round: RoundRow) => round.deadline + GRACE_MS;

export class Quiz {
  private readonly sql: SqlStorage;
  private readonly kv: SyncKvStorage;

  constructor(storage: DurableObjectStorage) {
    this.sql = storage.sql;
    this.kv = storage.kv;
  }

  private readonly steps: { [K in QuizStep]: { to: Phase; run?: (now: number) => string | void } } = {
    unlock: { to: "lobby", run: (now) => this.kv.put(UNLOCKED_KEY, Math.max(now, (this.kv.get<number>(UNLOCKED_KEY) ?? 0) + 1)) },
    start: { to: "open", run: (now) => this.startNext(now) },
    reveal: { to: "reveal", run: () => this.writePoints() },
    leaderboard: { to: "leaderboard" },
    end: { to: "ended" },
    reset: { to: "locked", run: () => this.clear() },
  };

  step(step: QuizStep, now: number): string | null {
    const { phase } = this.stage();
    if (!stepAllowed(step, phase)) return `"${step}" isn't possible while the quiz is ${phase}.`;
    const { to, run } = this.steps[step];
    const error = run?.(now);
    if (error) return error;
    this.kv.put(PHASE_KEY, to);
    return null;
  }

  save(id: QuestionId | null, body: QuestionBody): string | null {
    if (id === null) {
      this.sql.exec(
        "INSERT INTO questions (id, position, body) VALUES (?, (SELECT coalesce(max(position) + 1, 0) FROM questions), ?)",
        newQuestionId(),
        JSON.stringify(body),
      );
      return null;
    }
    const refusal = this.refuseEdit(id);
    if (!refusal) this.sql.exec("UPDATE questions SET body = ? WHERE id = ?", JSON.stringify(body), id);
    return refusal;
  }

  remove(id: QuestionId): string | null {
    const refusal = this.refuseEdit(id);
    if (!refusal) this.sql.exec("DELETE FROM questions WHERE id = ?", id);
    return refusal;
  }

  move(id: QuestionId, to: number): string | null {
    const ids = this.questions().map((q) => q.id);
    const from = ids.indexOf(id);
    if (from < 0) return MISSING;
    ids.splice(from, 1);
    ids.splice(Math.max(0, Math.min(to, ids.length)), 0, id);
    ids.forEach((qid, position) => this.sql.exec("UPDATE questions SET position = ? WHERE id = ?", position, qid));
    return null;
  }

  answer(player: PlayerId, { q, pick, ms, run }: GuestCmdOf<"answer">, now: number, roster: Roster): string | null {
    const stage = this.stage();
    // A reset replays the same question ids, so the run tells an answer sent before a reset from one sent after it.
    const stale = run !== this.kv.get<number>(UNLOCKED_KEY);
    if (stage.phase !== "open" || stage.round.question_id !== q || stale || now > closesAt(stage.round)) return LATE;
    if (!accepts(this.question(q), pick)) return INVALID;
    const { round } = stage;
    // Rows stay under the id that wrote them, so a merged player's earlier answer and first delivery live under another id.
    const ours = <R extends { player_id: PlayerId }>(rows: R[]) => rows.filter((r) => roster.rootOf(r.player_id)?.id === player);
    if (ours(this.sql.exec<{ player_id: PlayerId }>("SELECT player_id FROM answers WHERE question_id = ?", q).toArray()).length > 0) return null;
    const sent = ours(this.sql.exec<{ player_id: PlayerId; sent_at: number }>("SELECT player_id, sent_at FROM deliveries WHERE question_id = ?", q).toArray());
    const firstSent = sent.length > 0 ? Math.min(...sent.map((d) => d.sent_at)) : round.started_at;
    const elapsed = now - firstSent;
    this.sql.exec(
      "INSERT INTO answers (question_id, player_id, pick, ms, answered_at) VALUES (?, ?, ?, ?, ?)",
      q,
      player,
      pick,
      clampMs(ms, elapsed, round.deadline - round.started_at),
      now,
    );
    return null;
  }

  // Every snapshot passes through here, so this is where an open round closes once it is due and where each
  // phone's first sight of the open question is recorded for timing its answer.
  publish(roster: Roster, online: ReadonlySet<PlayerId>, now: number): QuizView {
    let stage = this.stage();
    if (stage.phase === "open" && this.due(stage.round, roster, online, now)) {
      this.kv.put(PHASE_KEY, "closed");
      stage = { phase: "closed", round: stage.round };
    }
    if (stage.phase === "open") {
      this.sql.exec(
        "INSERT OR IGNORE INTO deliveries (question_id, player_id, sent_at) SELECT ?, value, ? FROM json_each(?)",
        stage.round.question_id,
        now,
        JSON.stringify([...online]),
      );
    }
    return view({
      stage,
      unlockedAt: this.kv.get<number>(UNLOCKED_KEY) ?? 0,
      questions: this.questions(),
      rounds: this.sql.exec<RoundRow>("SELECT * FROM rounds ORDER BY n").toArray(),
      answers: this.sql.exec<AnswerRow>("SELECT * FROM answers ORDER BY answered_at").toArray(),
      roster,
      online,
      now,
    });
  }

  // A question photo is secret until its question has started in this run; a reset hides it again.
  photoStarted(photo: PhotoId): boolean {
    return (
      this.sql
        .exec("SELECT 1 FROM rounds JOIN questions ON questions.id = rounds.question_id WHERE json_extract(questions.body, '$.photo') = ?", photo)
        .toArray().length > 0
    );
  }

  // When the Durable Object must wake to close the open round, which no message may arrive to trigger.
  wakeAt(): number | null {
    const stage = this.stage();
    return stage.phase === "open" ? closesAt(stage.round) : null;
  }

  private stage(): Stage {
    const phase = this.kv.get<Phase>(PHASE_KEY) ?? "locked";
    return inRound(phase) ? { phase, round: this.latestRound() } : { phase };
  }

  private latestRound(): RoundRow {
    return this.sql.exec<RoundRow>("SELECT * FROM rounds ORDER BY n DESC LIMIT 1").one();
  }

  private questions(): Question[] {
    return this.sql
      .exec<{ id: QuestionId; body: string }>("SELECT id, body FROM questions ORDER BY position, id")
      .toArray()
      .map((row) => ({ ...(JSON.parse(row.body) as QuestionBody), id: row.id }));
  }

  private question(id: QuestionId): QuestionBody {
    return JSON.parse(this.sql.exec<{ body: string }>("SELECT body FROM questions WHERE id = ?", id).one().body) as QuestionBody;
  }

  private refuseEdit(id: QuestionId): string | null {
    const [row] = this.sql
      .exec<{ played: number }>("SELECT EXISTS (SELECT 1 FROM rounds WHERE question_id = ?1) AS played FROM questions WHERE id = ?1", id)
      .toArray();
    return !row ? MISSING : row.played ? PLAYED : null;
  }

  private startNext(now: number): string | void {
    const [next] = this.sql
      .exec<{ id: QuestionId; body: string }>(
        "SELECT id, body FROM questions WHERE id NOT IN (SELECT question_id FROM rounds) ORDER BY position, id LIMIT 1",
      )
      .toArray();
    if (!next) return "There are no more questions.";
    const deadline = now + (JSON.parse(next.body) as QuestionBody).seconds * 1000;
    this.sql.exec(
      "INSERT INTO rounds (question_id, n, started_at, deadline) VALUES (?, (SELECT count(*) + 1 FROM rounds), ?, ?)",
      next.id,
      now,
      deadline,
    );
  }

  private writePoints(): void {
    const round = this.latestRound();
    const answers = this.sql
      .exec<AnswerRow>("SELECT * FROM answers WHERE question_id = ?", round.question_id)
      .toArray();
    const points = roundPoints(this.question(round.question_id), answers, round.deadline - round.started_at);
    answers.forEach((a, i) =>
      this.sql.exec("UPDATE answers SET points = ? WHERE question_id = ? AND player_id = ?", points[i]!, a.question_id, a.player_id),
    );
    this.sql.exec("UPDATE rounds SET revealed = 1 WHERE question_id = ?", round.question_id);
  }

  private clear(): void {
    this.sql.exec("DELETE FROM answers; DELETE FROM deliveries; DELETE FROM rounds;");
  }

  private due(round: RoundRow, roster: Roster, online: ReadonlySet<PlayerId>, now: number): boolean {
    if (now >= closesAt(round)) return true;
    if (online.size === 0) return false;
    const answered = new Set(
      this.sql
        .exec<{ player_id: PlayerId }>("SELECT player_id FROM answers WHERE question_id = ?", round.question_id)
        .toArray()
        .map((a) => roster.rootOf(a.player_id)?.id),
    );
    return [...online].every((p) => answered.has(p));
  }
}

type ViewInput = {
  stage: Stage;
  unlockedAt: number;
  questions: Question[];
  rounds: RoundRow[];
  answers: AnswerRow[];
  roster: Roster;
  online: ReadonlySet<PlayerId>;
  now: number;
};

type Counted = AnswerRow & { player: PlayerId; name: string };

type Current = {
  unlockedAt: number;
  n: number;
  total: number;
  endsInMs: number;
  question: GuestQuestion;
  mine: Map<PlayerId, Counted>;
  tally: Tally;
  result: RoundResult;
  board: BoardRow[];
  rows: Map<PlayerId, BoardRow>;
};

const idleGuests: { [P in IdlePhase]: (unlockedAt: number) => GuestQuiz } = {
  locked: () => ({ phase: "locked" }),
  lobby: (unlockedAt) => ({ phase: "lobby", unlockedAt }),
  ended: (unlockedAt) => ({ phase: "ended", unlockedAt }),
};

const asked = (c: Current, player: PlayerId) => ({
  unlockedAt: c.unlockedAt,
  n: c.n,
  total: c.total,
  question: c.question,
  pick: c.mine.get(player)?.pick ?? null,
});

const roundGuests: { [P in RoundPhase]: (c: Current, player: PlayerId) => GuestQuiz } = {
  open: (c, p) => ({ phase: "open", endsInMs: c.endsInMs, ...asked(c, p) }),
  closed: (c, p) => ({ phase: "closed", ...asked(c, p) }),
  reveal: (c, p) => ({
    phase: "reveal",
    ...asked(c, p),
    points: c.mine.get(p)?.points ?? 0,
    score: c.rows.get(p)?.score ?? 0,
    result: c.result,
  }),
  leaderboard: (c, p) => ({
    phase: "leaderboard",
    unlockedAt: c.unlockedAt,
    n: c.n,
    total: c.total,
    top: c.board.slice(0, TOP),
    you: c.rows.get(p) ?? null,
  }),
};

const adminStages: { [P in RoundPhase]: (c: Current) => AdminStage } = {
  open: (c) => ({ phase: "open", endsInMs: c.endsInMs, ...c.tally }),
  closed: (c) => ({ phase: "closed", ...c.tally }),
  reveal: (c) => ({ phase: "reveal", result: c.result, ...c.tally }),
  leaderboard: (c) => ({ phase: "leaderboard", result: c.result, ...c.tally }),
};

function view({ stage, unlockedAt, questions, rounds, answers, roster, online, now }: ViewInput): QuizView {
  const played = rounds.map((r) => r.question_id);
  const upcoming = questions.find((q) => !played.includes(q.id)) ?? null;
  // A merged player may have answered from both ids; the answer that counts is the best one, else the first.
  const counted = new Map<string, Counted>();
  for (const a of answers) {
    const root = roster.rootOf(a.player_id);
    if (!root) continue;
    const key = `${root.id} ${a.question_id}`;
    const seen = counted.get(key);
    if (!seen || (a.points ?? -1) > (seen.points ?? -1)) counted.set(key, { ...a, player: root.id, name: root.name });
  }
  const lastRevealed = rounds.findLast((r) => r.revealed)?.question_id ?? null;
  const rows = board(
    roster.roots,
    [...counted.values()].flatMap((a) => (a.points === null ? [] : [{ player: a.player, q: a.question_id, points: a.points }])),
    lastRevealed,
  );
  const common = {
    questions,
    played,
    next: upcoming?.id ?? null,
    board: rows,
    winners: stage.phase === "ended" ? rows.filter((r) => r.rank === 1 && r.score > 0).map((r) => r.id) : [],
  };

  if (!("round" in stage)) {
    const guest = idleGuests[stage.phase](unlockedAt);
    return { admin: { stage: { phase: stage.phase }, ...common }, guest: () => guest };
  }

  const { round } = stage;
  const question = questions.find((q) => q.id === round.question_id)!;
  const mine = new Map([...counted.values()].filter((a) => a.question_id === round.question_id).map((a) => [a.player, a]));
  const current: Current = {
    unlockedAt,
    n: round.n,
    total: questions.length,
    endsInMs: Math.max(0, round.deadline - now),
    question: guestQuestion(question),
    mine,
    tally: { q: round.question_id, n: round.n, answered: mine.size, expected: new Set([...online, ...mine.keys()]).size },
    result: roundResult(question, [...mine.values()]),
    board: rows,
    rows: new Map(rows.map((r) => [r.id, r])),
  };
  return { admin: { stage: adminStages[stage.phase](current), ...common }, guest: (p) => roundGuests[stage.phase](current, p) };
}
