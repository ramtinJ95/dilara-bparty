import "@fontsource-variable/unbounded";
import "@fontsource-variable/dm-sans";
import "./pearl.css";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { CameraIcon, CheckIcon, GalleryIcon, QuizIcon, Snowflake, Sparkle, Tiara } from "../../../client/icons";
import { fixture, VOTES_PER_GUEST, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";

const TAB_ICONS = [QuizIcon, CameraIcon, GalleryIcon];

function Screen({ children, class: extra = "" }: { children: ComponentChildren; class?: string }) {
  return (
    <div class={`d-pearl pl-screen ${extra}`}>
      <div class="pl-bg" aria-hidden="true">
        <i class="pl-blob pl-blob-a" />
        <i class="pl-blob pl-blob-b" />
        <i class="pl-blob pl-blob-c" />
        <i class="pl-grain" />
      </div>
      {children}
    </div>
  );
}

function Shell({ tab, children }: { tab: number; children: ComponentChildren }) {
  return (
    <Screen class="pl-shelled">
      <header class="pl-top">
        <p class="pl-hello">
          <span class="pl-avatar" aria-hidden="true">
            {fixture.you[0]}
          </span>
          {fixture.shell.hello}
        </p>
        <p class="pl-online">
          <i aria-hidden="true" />
          {fixture.shell.online}
        </p>
      </header>
      <main class="pl-main">{children}</main>
      <nav class="pl-tabs" aria-label="Meny">
        {fixture.shell.tabs.map((name, i) => {
          const Icon = TAB_ICONS[i]!;
          return (
            <a key={name} href="#" class="pl-tab" aria-current={i === tab ? "page" : undefined}>
              <Icon />
              <span>{name}</span>
            </a>
          );
        })}
      </nav>
    </Screen>
  );
}

function Landing() {
  const l = fixture.landing;
  return (
    <Screen class="pl-landing">
      <div class="pl-landing-photo pl-enter" style={{ "--d": "0ms" }}>
        <div class="pl-foil-ring">
          <img src={l.photo} alt={l.photoAlt} />
        </div>
        <span class="pl-sticker" aria-hidden="true">
          3
        </span>
        <span class="pl-orbit" aria-hidden="true">
          <Sparkle class="pl-s1" />
          <Sparkle class="pl-s2" />
          <Sparkle class="pl-s3" />
        </span>
      </div>
      <h1 class="pl-chrome pl-title pl-enter" style={{ "--d": "180ms" }}>
        {l.title}
      </h1>
      <p class="pl-sub pl-enter" style={{ "--d": "300ms" }}>
        {l.subtitle}
      </p>
      <form class="pl-join pl-enter" style={{ "--d": "420ms" }} onSubmit={(e) => e.preventDefault()}>
        <label for="pl-name">{l.label}</label>
        <div class="pl-field">
          <input id="pl-name" name="name" autocomplete="given-name" placeholder={l.placeholder} />
        </div>
        <button type="submit" class="pl-btn">
          <span>{l.button}</span>
          <Snowflake />
        </button>
      </form>
    </Screen>
  );
}

function Countdown() {
  const { left, total } = useCountdown();
  return (
    <div class="pl-clock" role="timer" aria-label={fixture.quiz.secondsLabel(left)} style={{ "--p": left / total }}>
      <span key={left} class="pl-clock-n">
        {left}
      </span>
    </div>
  );
}

function Quiz() {
  const q = fixture.quiz;
  const [pick, setPick] = useState(q.pick);
  return (
    <Shell tab={0}>
      <div class="pl-quiz-head pl-enter" style={{ "--d": "0ms" }}>
        <div class="pl-progress">
          <span>{q.progress}</span>
          <span class="pl-dots" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} class={i < 3 ? "on" : ""} />
            ))}
          </span>
        </div>
        <Countdown />
      </div>
      <div class="pl-qphoto pl-enter" style={{ "--d": "120ms" }}>
        <img src={q.photo} alt="" />
      </div>
      <h2 class="pl-question pl-enter" style={{ "--d": "220ms" }}>
        {q.text}
      </h2>
      <ul class="pl-options">
        {q.options.map((text, i) => (
          <li key={text} class="pl-enter" style={{ "--d": `${300 + i * 80}ms` }}>
            <button type="button" class={`pl-option ${pick === i ? "is-picked" : ""}`} aria-pressed={pick === i} onClick={() => setPick(i)}>
              <span class="pl-letter">{q.letters[i]}</span>
              <span class="pl-option-text">{text}</span>
              <span class="pl-check">{pick === i && <CheckIcon />}</span>
            </button>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function BoardLine({ row, i }: { row: BoardRow; i: number }) {
  const b = fixture.board;
  const moved = row.prev - row.rank;
  return (
    <li class={`pl-row ${row.rank === 1 ? "is-first" : ""} ${row.you ? "is-you" : ""}`} style={{ "--from": `${moved * 46}px`, "--d": `${700 + i * 90}ms` }}>
      <span class="pl-rank">{row.rank === 1 ? <Tiara /> : row.rank}</span>
      <span class="pl-row-name">
        {row.name}
        {row.you && <em class="pl-you">{b.youTag}</em>}
      </span>
      <span class={`pl-move ${moved > 0 ? "up" : "down"}`} aria-hidden="true">
        {moved > 0 ? `▲${moved}` : `▼${-moved}`}
      </span>
      <span class="pl-score">{b.score(row.score)}</span>
    </li>
  );
}

function Reveal() {
  const r = fixture.reveal;
  const b = fixture.board;
  const q = fixture.quiz;
  const replay = useReplay(6000);
  const most = Math.max(...r.counts);
  return (
    <Shell tab={0}>
      <section class="pl-verdict pl-enter" style={{ "--d": "0ms" }}>
        <p class="pl-chrome pl-verdict-word">{r.verdict}</p>
        <div>
          <p class="pl-points">{r.points}</p>
          <p class="pl-total">{r.total}</p>
        </div>
      </section>
      <section class="pl-spread pl-enter" style={{ "--d": "150ms" }}>
        <h2 class="pl-h2">{r.spread}</h2>
        <ul>
          {q.options.map((text, i) => (
            <li key={text} class={i === r.correct ? "is-right" : ""}>
              <span class="pl-spread-label">
                <b>{q.letters[i]}</b> {text}
                {i === r.correct && <em class="pl-tag">{r.rightAnswer}</em>}
                {i === q.pick && <em class="pl-tag pl-tag-soft">{r.yourGuess}</em>}
              </span>
              <span class="pl-bar">
                <i style={{ "--w": r.counts[i]! / most, "--d": `${300 + i * 70}ms` }} />
              </span>
              <span class="pl-count">{r.counts[i]}</span>
            </li>
          ))}
        </ul>
      </section>
      <section class="pl-board" key={replay}>
        <div class="pl-board-head">
          <h2 class="pl-h2">{b.title}</h2>
          <span>{b.progress}</span>
        </div>
        <ol>
          {b.top.map((row, i) => (
            <BoardLine key={row.name} row={row} i={i} />
          ))}
        </ol>
        <p class="pl-yourplace">{b.yourPlace}</p>
        <ol>
          <BoardLine row={b.me} i={5} />
        </ol>
      </section>
    </Shell>
  );
}

function PhotoCard({ p, votes, tap, onVote, onUnvote, i }: { p: GalleryPhoto; votes: number; tap: number; onVote: () => void; onUnvote: () => void; i: number }) {
  const g = fixture.gallery;
  return (
    <li class={`pl-photo pl-enter ${p.own ? "is-own" : ""} ${votes > 0 ? "is-voted" : ""}`} style={{ "--d": `${200 + i * 80}ms` }}>
      <div class="pl-photo-frame">
        <img src={p.src} alt="" />
        {tap > 0 && (
          <span key={tap} class="pl-pop" aria-hidden="true">
            <Sparkle />
          </span>
        )}
        {votes > 0 && (
          <span class="pl-hearts" aria-hidden="true">
            {Array.from({ length: votes }, (_, k) => (
              <Snowflake key={k} />
            ))}
          </span>
        )}
      </div>
      {p.own ? (
        <p class="pl-own">{g.own}</p>
      ) : (
        <div class="pl-vote">
          <button type="button" class="pl-round" aria-label={g.unvote} aria-disabled={votes === 0} onClick={onUnvote}>
            −
          </button>
          <span key={`${votes}-${tap}`} class="pl-mine">
            {g.mine(votes)}
          </span>
          <button type="button" class="pl-round pl-plus" aria-label={g.vote} onClick={onVote}>
            +
          </button>
        </div>
      )}
    </li>
  );
}

function Gallery() {
  const g = fixture.gallery;
  const v = useVotes();
  const [taps, setTaps] = useState(0);
  const act = (fn: (id: string) => void, id: string) => () => {
    fn(id);
    setTaps(taps + 1);
  };
  const card = (p: GalleryPhoto, i: number) => (
    <PhotoCard key={p.id} p={p} i={i} votes={p.mine} tap={v.last === p.id ? taps : 0} onVote={act(v.vote, p.id)} onUnvote={act(v.unvote, p.id)} />
  );
  return (
    <Shell tab={2}>
      <h1 class="pl-chrome pl-gtitle pl-enter" style={{ "--d": "0ms" }}>
        {g.title}
      </h1>
      <section class="pl-status pl-enter" style={{ "--d": "100ms" }} aria-live="polite">
        <div class="pl-pips" aria-hidden="true">
          {Array.from({ length: VOTES_PER_GUEST }, (_, i) => (
            <i key={i} class={i < v.votesLeft ? "on" : ""} />
          ))}
        </div>
        <div>
          <p class="pl-left">{g.left(v.votesLeft)}</p>
          <p class="pl-hint">{g.hint(v.votesLeft)}</p>
        </div>
      </section>
      <ul class="pl-grid">{v.current.map(card)}</ul>
      <section class="pl-fame">
        <h2 class="pl-h2">
          <Sparkle /> {g.fameTitle}
        </h2>
        <p class="pl-hint">{g.fameText}</p>
        <ul class="pl-grid">{v.fame.map((p, i) => card(p, i + 4))}</ul>
      </section>
    </Shell>
  );
}

const BURST = Array.from({ length: 36 }, (_, i) => {
  const angle = (i / 36) * 360 + (i % 3) * 7;
  const dist = 130 + ((i * 37) % 70);
  return { angle, dist, kind: i % 4, delay: (i % 5) * 40 };
});

function Finale() {
  const f = fixture.finale;
  const replay = useReplay(7000);
  return (
    <Screen class="pl-finale" key={replay}>
      <div class="pl-suspense" aria-hidden="true">
        <div class="pl-orb" />
        <p class="pl-chrome pl-suspense-title">{f.suspense}</p>
        <p class="pl-sub">{f.suspenseSub}</p>
      </div>
      <div class="pl-stage">
        <i class="pl-glow" aria-hidden="true" />
        <i class="pl-halo" aria-hidden="true" />
        <div class="pl-burst" aria-hidden="true">
          {BURST.map((b, i) => (
            <i key={i} class={`k${b.kind}`} style={{ "--a": `${b.angle}deg`, "--r": `${b.dist}px`, "--d": `${1250 + b.delay}ms` }}>
              {b.kind === 0 ? <Snowflake /> : b.kind === 1 ? <Sparkle /> : null}
            </i>
          ))}
        </div>
        <p class="pl-kicker pl-show" style={{ "--d": "1250ms" }}>
          {f.kicker}
        </p>
        <div class="pl-crown pl-show" style={{ "--d": "1350ms" }}>
          <Tiara />
        </div>
        <h1 class="pl-chrome pl-winner pl-show" style={{ "--d": "1450ms" }}>
          {f.winner}
        </h1>
        <p class="pl-winpoints pl-show" style={{ "--d": "1600ms" }}>
          {f.points}
        </p>
        <section class="pl-recap pl-show" style={{ "--d": "1800ms" }}>
          <img src={f.photo} alt={f.photoAlt} />
          <div>
            <p class="pl-recap-kicker">{f.photoKicker}</p>
            <p class="pl-recap-name">{f.photoWinner}</p>
            <p class="pl-recap-sub">{f.photoSub}</p>
          </div>
        </section>
      </div>
    </Screen>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
