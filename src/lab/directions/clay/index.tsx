import "@fontsource-variable/fredoka";
import "./clay.css";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { CameraIcon, GalleryIcon, QuizIcon, Snowflake, Sparkle, Tiara } from "../../../client/icons";
import { fixture, VOTES_PER_GUEST, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";

type Tab = 0 | 1 | 2;
const TAB_ICONS = [QuizIcon, CameraIcon, GalleryIcon];

/** Clay pebbles and snowflakes floating behind every screen: [left %, top %, size px, kind]. */
const PEBBLES: [number, number, number, "ball" | "lilac" | "flake"][] = [
  [-6, 6, 90, "ball"],
  [82, 3, 64, "lilac"],
  [88, 40, 46, "flake"],
  [-4, 58, 52, "flake"],
  [78, 84, 96, "ball"],
  [6, 90, 40, "lilac"],
];

function Backdrop() {
  return (
    <div class="bg" aria-hidden="true">
      {PEBBLES.map(([x, y, s, kind], i) => (
        <span key={i} class={`pebble ${kind}`} style={{ left: `${x}%`, top: `${y}%`, width: `${s}px`, height: `${s}px`, animationDelay: `${i * -1.3}s` }}>
          {kind === "flake" && <Snowflake />}
        </span>
      ))}
    </div>
  );
}

function Shell({ tab, children }: { tab: Tab; children: ComponentChildren }) {
  const { hello, online, tabs } = fixture.shell;
  return (
    <div class="d-clay shell">
      <Backdrop />
      <header class="top">
        <span class="avatar" aria-hidden="true">
          O
        </span>
        <div>
          <p class="hello">{hello}</p>
          <p class="online">
            <span class="dot" aria-hidden="true" />
            {online}
          </p>
        </div>
      </header>
      <main class="body">{children}</main>
      <nav class="tabs" aria-label="Meny">
        {tabs.map((label, i) => {
          const Icon = TAB_ICONS[i]!;
          return (
            <a key={label} href="#" class={i === tab ? "tab on" : "tab"} aria-current={i === tab ? "page" : undefined}>
              <span class="tab-icon">
                <Icon />
              </span>
              {label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

function Landing() {
  const l = fixture.landing;
  return (
    <div class="d-clay landing">
      <Backdrop />
      <div class="hero pop">
        <div class="frame">
          <img src={l.photo} alt={l.photoAlt} />
        </div>
        <span class="three" aria-hidden="true">
          3
        </span>
        <span class="crown-blob" aria-hidden="true">
          <Tiara />
        </span>
      </div>
      <h1 class="title pop" style={{ animationDelay: "0.12s" }}>
        {l.title}
      </h1>
      <p class="sub pop" style={{ animationDelay: "0.2s" }}>
        {l.subtitle}
      </p>
      <form class="card join pop" style={{ animationDelay: "0.28s" }} onSubmit={(e) => e.preventDefault()}>
        <label for="clay-name">{l.label}</label>
        <input id="clay-name" class="well" name="name" placeholder={l.placeholder} autocomplete="nickname" />
        <button class="puff lilac" type="submit">
          {l.button}
          <Sparkle class="btn-spark" />
        </button>
      </form>
    </div>
  );
}

function Ring({ left, total }: { left: number; total: number }) {
  return (
    <div class="ring" style={{ "--p": left / total }} role="timer" aria-label={fixture.quiz.secondsLabel(left)}>
      <span class="ring-num" key={left}>
        {left}
      </span>
    </div>
  );
}

function Quiz() {
  const q = fixture.quiz;
  const { left, total } = useCountdown();
  const [pick, setPick] = useState(q.pick);
  return (
    <Shell tab={0}>
      <div class="quiz-head pop">
        <span class="chip">{q.progress}</span>
        <Ring left={left} total={total} />
      </div>
      <div class="card qcard pop" style={{ animationDelay: "0.1s" }}>
        <img src={q.photo} alt="" />
        <h2 class="question">{q.text}</h2>
      </div>
      <div class="options">
        {q.options.map((o, i) => (
          <button
            key={o}
            type="button"
            class={`opt c${i}${pick === i ? " picked" : ""} pop`}
            style={{ animationDelay: `${0.2 + i * 0.08}s` }}
            aria-pressed={pick === i}
            onClick={() => setPick(i)}
          >
            <span class="letter">{q.letters[i]}</span>
            <span class="opt-text">{o}</span>
          </button>
        ))}
      </div>
    </Shell>
  );
}

function BoardLine({ row }: { row: BoardRow }) {
  const shift = row.prev - row.rank;
  return (
    <li class={`row${row.rank === 1 ? " first" : ""}${row.you ? " you" : ""}`} style={{ "--from": Math.max(-3, Math.min(3, shift)) }}>
      <span class="rank">{row.rank === 1 ? <Tiara /> : row.rank}</span>
      <span class="name">
        {row.name}
        {row.you && <span class="you-tag">{fixture.board.youTag}</span>}
      </span>
      {shift !== 0 && (
        <span class={shift > 0 ? "move up" : "move down"} aria-hidden="true">
          {shift > 0 ? "▲" : "▼"}
          {Math.abs(shift)}
        </span>
      )}
      <span class="score">{fixture.board.score(row.score)}</span>
    </li>
  );
}

function Reveal() {
  const r = fixture.reveal;
  const b = fixture.board;
  const replay = useReplay(6000);
  const max = Math.max(...r.counts);
  return (
    <Shell tab={0}>
      <section class="card verdict pop">
        <span class="check" aria-hidden="true">
          ✓
        </span>
        <div>
          <p class="verdict-word">{r.verdict}</p>
          <p class="verdict-pts">
            <strong>{r.points}</strong> · {r.total}
          </p>
        </div>
      </section>
      <section class="card spread pop" style={{ animationDelay: "0.1s" }}>
        <h2 class="mini">{r.spread}</h2>
        <ul>
          {fixture.quiz.options.map((o, i) => (
            <li key={o} class={i === r.correct ? "bar right" : "bar"}>
              <span class="letter sm">{fixture.quiz.letters[i]}</span>
              <span class="bar-name">
                {o}
                {i === r.correct && <span class="tag">{r.rightAnswer}</span>}
              </span>
              <span class="tube">
                <span class="fill" style={{ "--w": r.counts[i]! / max, animationDelay: `${0.3 + i * 0.08}s` }} />
              </span>
              <span class="count">{r.counts[i]}</span>
            </li>
          ))}
        </ul>
      </section>
      <section class="board pop" style={{ animationDelay: "0.2s" }} key={replay}>
        <div class="board-head">
          <h2 class="mini">{b.title}</h2>
          <span class="chip sm">{b.progress}</span>
        </div>
        <ol class="rows">
          {b.top.map((row) => (
            <BoardLine key={row.name} row={row} />
          ))}
        </ol>
        <h3 class="mini me-head">{b.yourPlace}</h3>
        <ol class="rows" start={b.me.rank}>
          <BoardLine row={b.me} />
        </ol>
      </section>
    </Shell>
  );
}

function useTapKey() {
  const v = useVotes();
  const [taps, setTaps] = useState(0);
  return {
    ...v,
    taps,
    vote: (id: string) => (v.vote(id), setTaps((n) => n + 1)),
    unvote: (id: string) => (v.unvote(id), setTaps((n) => n + 1)),
  };
}

function PhotoCard({ p, v, n }: { p: GalleryPhoto; v: ReturnType<typeof useTapKey>; n: number }) {
  const g = fixture.gallery;
  const hit = v.last === p.id;
  return (
    <li class={`photo${p.own ? " own" : ""}${p.mine > 0 ? " voted" : ""}`}>
      <div class="frame-sq" key={hit ? `${p.id}-${v.taps}` : p.id}>
        <img src={p.src} alt={`Bild ${n}`} />
        {p.mine > 0 && (
          <span class="vote-badge" aria-hidden="true">
            <Snowflake />
            {p.mine}
          </span>
        )}
        {hit && <span class="squish-ring" aria-hidden="true" />}
      </div>
      {p.own ? (
        <p class="own-tag">{g.own}</p>
      ) : (
        <div class="voter">
          <button type="button" class="knob" aria-label={g.unvote} aria-disabled={p.mine === 0} onClick={() => v.unvote(p.id)}>
            −
          </button>
          <span class="mine" key={hit ? v.taps : 0}>
            {g.mine(p.mine)}
          </span>
          <button type="button" class={v.votesLeft === 0 ? "knob plus spent" : "knob plus"} aria-label={g.vote} onClick={() => v.vote(p.id)}>
            +
          </button>
        </div>
      )}
    </li>
  );
}

function Gallery() {
  const g = fixture.gallery;
  const v = useTapKey();
  return (
    <Shell tab={2}>
      <div class="gal-head pop">
        <h2 class="big">{g.title}</h2>
        <div class="card status">
          <span class="pips" aria-hidden="true">
            {Array.from({ length: VOTES_PER_GUEST }, (_, i) => (
              <span key={i} class={i < v.votesLeft ? "pip full" : "pip"} />
            ))}
          </span>
          <div>
            <p class="status-left">{g.left(v.votesLeft)}</p>
            <p class="status-hint">{g.hint(v.votesLeft)}</p>
          </div>
        </div>
      </div>
      <ul class="grid">
        {v.current.map((p, i) => (
          <PhotoCard key={p.id} p={p} v={v} n={i + 1} />
        ))}
      </ul>
      <section class="card fame">
        <h2 class="mini">
          <Sparkle class="inline-spark" />
          {g.fameTitle}
        </h2>
        <p class="fame-text">{g.fameText}</p>
        <ul class="grid">
          {v.fame.map((p, i) => (
            <PhotoCard key={p.id} p={p} v={v} n={v.current.length + i + 1} />
          ))}
        </ul>
      </section>
    </Shell>
  );
}

/** Clay confetti: [angle deg, distance px, size px, colour index, delay s]. */
const BURST = Array.from({ length: 28 }, (_, i) => [i * (360 / 28) + (i % 3) * 7, 130 + ((i * 37) % 80), 14 + ((i * 11) % 16), i % 4, (i % 5) * 0.03] as const);

function Finale() {
  const f = fixture.finale;
  const replay = useReplay(7000);
  return (
    <div class="d-clay finale" key={replay}>
      <Backdrop />
      <div class="suspense" aria-hidden="true">
        <span class="wobble">
          <Snowflake />
        </span>
        <p class="suspense-word">{f.suspense}</p>
        <p class="suspense-sub">{f.suspenseSub}</p>
      </div>
      <div class="reveal">
        <div class="burst" aria-hidden="true">
          {BURST.map(([a, d, s, c, delay], i) => (
            <span key={i} class={`bit k${c}`} style={{ "--a": `${a}deg`, "--d": `${d}px`, width: `${s}px`, height: `${s}px`, animationDelay: `${1.25 + delay}s` }} />
          ))}
        </div>
        <span class="crown-big">
          <Tiara />
        </span>
        <p class="kicker">{f.kicker}</p>
        <h1 class="winner">{f.winner}</h1>
        <p class="points-pill">{f.points}</p>
        <section class="card recap">
          <img src={f.photo} alt={f.photoAlt} />
          <div>
            <p class="recap-kicker">{f.photoKicker}</p>
            <p class="recap-name">{f.photoWinner}</p>
            <p class="recap-sub">{f.photoSub}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
