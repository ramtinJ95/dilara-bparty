import type { PlayerId, QuestionId } from "../shared/model";
import { POINTS, type BoardRow, type QuestionBody, type RoundResult } from "../shared/quiz";

export type Timed = { pick: number; ms: number };
export type Named = { name: string; pick: number };
export type Scored = { player: PlayerId; q: QuestionId; points: number };

export const clampMs = (reported: number, elapsed: number, windowMs: number) =>
  Math.round(Math.max(0, Math.min(reported, elapsed, windowMs)));

const speed = (ms: number, windowMs: number) => Math.round(POINTS.best - ((POINTS.best - POINTS.slowest) * ms) / windowMs);

type Rules<Q extends QuestionBody> = {
  accepts: (q: Q, pick: number) => boolean;
  points: (q: Q, answers: readonly Timed[], windowMs: number) => number[];
  result: (q: Q, answers: readonly Named[]) => RoundResult;
};

type NumberQ = Extract<QuestionBody, { kind: "number" }>;
const distance = (q: NumberQ, pick: number) => Math.abs(pick - q.answer);
const closest = (q: NumberQ, answers: readonly { pick: number }[]) => Math.min(...answers.map((a) => distance(q, a.pick)));

const rules: { [K in QuestionBody["kind"]]: Rules<Extract<QuestionBody, { kind: K }>> } = {
  choice: {
    accepts: (q, pick) => Number.isInteger(pick) && pick >= 0 && pick < q.options.length,
    points: (q, answers, windowMs) => answers.map((a) => (a.pick === q.correct ? speed(a.ms, windowMs) : 0)),
    result: (q, answers) => ({
      kind: "choice",
      correct: q.correct,
      counts: q.options.map((_, i) => answers.filter((a) => a.pick === i).length),
    }),
  },
  number: {
    accepts: () => true,
    points: (q, answers) => {
      const best = closest(q, answers);
      return answers.map((a) => (distance(q, a.pick) === best ? POINTS.best : 0));
    },
    result: (q, answers) => {
      const best = closest(q, answers);
      const winners = answers.filter((a) => distance(q, a.pick) === best);
      return { kind: "number", answer: q.answer, closest: winners.map((a) => ({ name: a.name, value: a.pick })), guesses: answers.length };
    },
  },
};

const rulesOf = (q: QuestionBody) => rules[q.kind] as Rules<QuestionBody>;

export const accepts = (q: QuestionBody, pick: number) => rulesOf(q).accepts(q, pick);
export const roundPoints = (q: QuestionBody, answers: readonly Timed[], windowMs: number) => rulesOf(q).points(q, answers, windowMs);
export const roundResult = (q: QuestionBody, answers: readonly Named[]) => rulesOf(q).result(q, answers);

const competitionRank = (scores: readonly number[], score: number) => 1 + scores.filter((s) => s > score).length;

export function board(players: readonly { id: PlayerId; name: string }[], scored: readonly Scored[], last: QuestionId | null): BoardRow[] {
  const now = new Map<PlayerId, number>();
  const before = new Map<PlayerId, number>();
  for (const s of scored) {
    now.set(s.player, (now.get(s.player) ?? 0) + s.points);
    if (s.q !== last) before.set(s.player, (before.get(s.player) ?? 0) + s.points);
  }
  const scores = players.map((p) => now.get(p.id) ?? 0);
  const previous = players.map((p) => before.get(p.id) ?? 0);
  return players
    .map((p, i) => ({ id: p.id, name: p.name, score: scores[i]!, rank: competitionRank(scores, scores[i]!), prev: competitionRank(previous, previous[i]!) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "sv"));
}
