import type { BoardRow } from "../../shared/quiz";
import { formatSv as fmt } from "../answers";
import { Sparkle, Tiara } from "../icons";
import type { ViewProps } from "./quiz";

// FLIP without measuring: every row has the same height, so a row that moved from
// `prev` to `rank` starts (prev - rank) rows away and slides home with a transform.
function Row({ row, you, outside }: { row: BoardRow; you: boolean; outside: boolean }) {
  const shift = row.prev - row.rank;
  const cls = ["row", outside ? "arrive" : shift > 0 ? "up" : shift < 0 ? "down" : "", row.rank === 1 ? "first" : "", you ? "you" : ""];
  return (
    <li class={cls.filter(Boolean).join(" ")} style={outside ? undefined : { "--shift": shift }}>
      <span class="rank">
        {row.rank === 1 && <Tiara />}
        {row.rank}
      </span>
      <span class="who">
        {row.name}
        {you && <span class="tag">Du</span>}
      </span>
      <span class="score">{fmt(row.score)}</span>
      {row.rank === 1 && (
        <>
          <Sparkle class="sparkle a" />
          <Sparkle class="sparkle b" />
          <Sparkle class="sparkle c" />
        </>
      )}
    </li>
  );
}

export function Leaderboard({ quiz }: ViewProps<"leaderboard">) {
  const { top, you } = quiz;
  const fromOutside = (r: BoardRow) => r.prev > top.length;
  const youBelow = you !== null && !top.some((r) => r.id === you.id);
  return (
    <section class="quiz-card card board-card" aria-labelledby="quiz-title">
      <h2 id="quiz-title" class="board-title">
        Topplistan
      </h2>
      <p class="q-progress">
        Efter fråga {quiz.n} av {quiz.total}
      </p>
      <ol class="lb">
        {top.map((r) => (
          <Row key={r.id} row={r} you={r.id === you?.id} outside={fromOutside(r)} />
        ))}
      </ol>
      {youBelow && (
        <ol class="lb mine" aria-label="Din plats">
          <Row row={you} you outside />
        </ol>
      )}
    </section>
  );
}
