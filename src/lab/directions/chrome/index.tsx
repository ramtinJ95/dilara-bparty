import "@fontsource/bagel-fat-one/400.css";
import "@fontsource-variable/nunito";
import "./chrome.css";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { CameraIcon, GalleryIcon, QuizIcon, Sparkle, Snowflake, Tiara } from "../../../client/icons";
import { fixture, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";

const Chr = ({ text, class: cls = "" }: { text: string; class?: string }) => (
  <span class={`chr ${cls}`} data-t={text}>
    {text}
  </span>
);

const FLOATERS = [
  { x: 8, y: 6, s: 46, d: 0 },
  { x: 82, y: 12, s: 28, d: 1.2 },
  { x: 90, y: 46, s: 54, d: 0.6 },
  { x: -4, y: 58, s: 38, d: 1.8 },
  { x: 70, y: 84, s: 34, d: 0.9 },
  { x: 18, y: 92, s: 22, d: 2.4 },
];

function Ground() {
  return (
    <div class="ground" aria-hidden="true">
      <span class="blob b1" />
      <span class="blob b2" />
      {FLOATERS.map((f, i) => (
        <span key={i} class="bub" style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.s}px`, height: `${f.s}px`, animationDelay: `${f.d}s` }} />
      ))}
      <Sparkle class="star s1" />
      <Sparkle class="star s2" />
      <Sparkle class="star s3" />
    </div>
  );
}

const TAB_ICONS = [QuizIcon, CameraIcon, GalleryIcon];

function Shell({ tab, children }: { tab: number; children: ComponentChildren }) {
  return (
    <div class="d-chrome shell">
      <Ground />
      <header class="top">
        <span class="hello">{fixture.shell.hello}</span>
        <span class="online">
          <i aria-hidden="true" />
          {fixture.shell.online}
        </span>
      </header>
      <main class="body">{children}</main>
      <nav class="dock" aria-label="Flikar">
        {fixture.shell.tabs.map((name, i) => {
          const Icon = TAB_ICONS[i]!;
          return (
            <a key={name} href="#" class={i === tab ? "tab on" : "tab"} aria-current={i === tab ? "page" : undefined} onClick={(e) => e.preventDefault()}>
              <Icon />
              <span>{name}</span>
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
    <div class="d-chrome landing">
      <Ground />
      <h1 class="title" aria-label={l.title}>
        <Chr text="Dilara" class="l1" />{" "}
        <Chr text="fyller 3!" class="l2" />
      </h1>
      <p class="sub">{l.subtitle}</p>
      <div class="portrait">
        <span class="ring" aria-hidden="true" />
        <img src={l.photo} alt={l.photoAlt} />
        <span class="badge3" aria-hidden="true">
          3
        </span>
      </div>
      <form class="join" onSubmit={(e) => e.preventDefault()}>
        <label for="chrome-name">{l.label}</label>
        <input id="chrome-name" class="field" placeholder={l.placeholder} autocomplete="given-name" />
        <button class="jelly big" type="submit">
          {l.button}
        </button>
      </form>
    </div>
  );
}

function Quiz() {
  const q = fixture.quiz;
  const [pick, setPick] = useState<number>(q.pick);
  const { left, total } = useCountdown();
  return (
    <Shell tab={0}>
      <div class="quiz">
        <div class="qhead">
          <span class="progress">
            {q.progress}
            <span class="dots" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <i key={i} class={i < 3 ? "on" : ""} />
              ))}
            </span>
          </span>
        </div>
        <div class="stage">
          <img class="qphoto" src={q.photo} alt="" />
          <div class="clock" style={{ "--p": left / total }} role="timer" aria-label={q.secondsLabel(left)}>
            <span key={left} class="num">
              {left}
            </span>
          </div>
        </div>
        <h2 class="qtext">{q.text}</h2>
        <div class="opts">
          {q.options.map((o, i) => (
            <button key={o} type="button" class={i === pick ? "opt on" : "opt"} aria-pressed={i === pick} style={{ "--i": i }} onClick={() => setPick(i)}>
              <span class="letter">{q.letters[i]}</span>
              <span class="otext">{o}</span>
            </button>
          ))}
        </div>
      </div>
    </Shell>
  );
}

function Row({ r, slot }: { r: BoardRow; slot: number }) {
  return (
    <li class={`row${r.rank === 1 ? " first" : ""}${r.you ? " you" : ""}`} style={{ "--from": r.prev - r.rank, "--i": slot }}>
      <span class="rank">
        {r.rank === 1 && <Tiara />}
        {r.rank}
      </span>
      <span class="name">
        {r.name}
        {r.you && <b class="youtag">{fixture.board.youTag}</b>}
      </span>
      <span class="score">{fixture.board.score(r.score)}</span>
    </li>
  );
}

function Reveal() {
  const r = fixture.reveal;
  const b = fixture.board;
  const q = fixture.quiz;
  const replay = useReplay(6000);
  const max = Math.max(...r.counts);
  return (
    <Shell tab={0}>
      <div class="reveal">
        <section class="verdict">
          <Sparkle class="vs v1" />
          <Sparkle class="vs v2" />
          <h2>
            <Chr text={r.verdict} class="big" />
          </h2>
          <div class="pills">
            <span class="pill pink">{r.points}</span>
            <span class="pill">{r.total}</span>
          </div>
        </section>
        <section class="spread">
          <h3>{r.spread}</h3>
          <ul>
            {r.counts.map((n, i) => (
              <li key={i} class={i === r.correct ? "right" : ""} style={{ "--w": n / max, "--i": i }}>
                <span class="letter">{q.letters[i]}</span>
                <span class="bar">
                  <span class="fill" />
                  <span class="lab">
                    {q.options[i]}
                    {i === r.correct && <em> · {r.rightAnswer}</em>}
                    {i === q.pick && <em> · {r.yourGuess}</em>}
                  </span>
                </span>
                <span class="n">{n}</span>
              </li>
            ))}
          </ul>
        </section>
        <section class="board" key={replay}>
          <h3>
            {b.title} <small>{b.progress}</small>
          </h3>
          <ol>
            {b.top.map((row, i) => (
              <Row key={row.name} r={row} slot={i} />
            ))}
          </ol>
          <p class="mine-h">{b.yourPlace}</p>
          <ol class="mine">
            <Row r={b.me} slot={5} />
          </ol>
        </section>
      </div>
    </Shell>
  );
}

function Card({ p, v, tap, onVote, onUnvote }: { p: GalleryPhoto; v: ReturnType<typeof useVotes>; tap: number; onVote: () => void; onUnvote: () => void }) {
  const g = fixture.gallery;
  const bump = v.last === p.id ? tap : 0;
  return (
    <li class={`card${p.mine > 0 ? " voted" : ""}${p.own ? " own" : ""}`}>
      <div class="pic">
        <img src={p.src} alt="" />
        {p.own && <span class="sticker">{g.own}</span>}
        {p.mine > 0 && (
          <span key={bump} class="hearts" aria-hidden="true">
            {Array.from({ length: p.mine }, (_, i) => (
              <Sparkle key={i} />
            ))}
          </span>
        )}
      </div>
      {!p.own && (
        <div class="ctl">
          <button type="button" class={p.mine === 0 ? "round minus off" : "round minus"} aria-label={g.unvote} onClick={onUnvote}>
            −
          </button>
          <span key={bump} class="count">
            {g.mine(p.mine)}
          </span>
          <button type="button" class={v.votesLeft === 0 ? "round plus off" : "round plus"} aria-label={g.vote} onClick={onVote}>
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
  const [tap, setTap] = useState(0);
  const cards = (list: GalleryPhoto[]) => (
    <ul class="grid">
      {list.map((p) => (
        <Card
          key={p.id}
          p={p}
          v={v}
          tap={tap}
          onVote={() => {
            setTap(tap + 1);
            v.vote(p.id);
          }}
          onUnvote={() => {
            setTap(tap + 1);
            v.unvote(p.id);
          }}
        />
      ))}
    </ul>
  );
  return (
    <Shell tab={2}>
      <div class="gallery">
        <h2 class="gtitle">
          <Chr text={g.title} />
        </h2>
        <div class="status">
          <span class="pips" aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => (
              <i key={i} class={i < v.votesLeft ? "on" : ""} />
            ))}
          </span>
          <span>
            <strong>{g.left(v.votesLeft)}</strong>
            <small>{g.hint(v.votesLeft)}</small>
          </span>
        </div>
        {cards(v.current)}
        <h2 class="gtitle fame">
          <Chr text={g.fameTitle} />
        </h2>
        <p class="fametext">{g.fameText}</p>
        {cards(v.fame)}
      </div>
    </Shell>
  );
}

const BURST = Array.from({ length: 22 }, (_, i) => ({
  a: (i / 22) * 360 + (i % 3) * 7,
  r: 130 + (i % 4) * 30,
  kind: ["star", "bub", "flake", "dot"][i % 4]!,
  s: 18 + (i % 5) * 6,
}));

function Finale() {
  const f = fixture.finale;
  const replay = useReplay(7000);
  return (
    <div class="d-chrome finale" key={replay}>
      <Ground />
      <div class="suspense" aria-hidden="true">
        <Chr text={f.suspense} class="sus" />
        <p>{f.suspenseSub}</p>
        <span class="wobble">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div class="win">
        <div class="burst" aria-hidden="true">
          {BURST.map((b, i) => (
            <span key={i} class={`p ${b.kind}`} style={{ "--a": `${b.a}deg`, "--r": `${b.r}px`, width: `${b.s}px`, height: `${b.s}px` }}>
              {b.kind === "star" && <Sparkle />}
              {b.kind === "flake" && <Snowflake />}
            </span>
          ))}
        </div>
        <span class="kicker pill pink">{f.kicker}</span>
        <div class="crown">
          <Tiara />
        </div>
        <h1 class="winner">
          <Chr text={f.winner} />
        </h1>
        <span class="pill pts">{f.points}</span>
        <figure class="best">
          <img src={f.photo} alt={f.photoAlt} />
          <figcaption>
            <small>{f.photoKicker}</small>
            <strong>{f.photoWinner}</strong>
            <span>{f.photoSub}</span>
          </figcaption>
        </figure>
      </div>
    </div>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
