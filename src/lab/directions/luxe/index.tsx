import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/fraunces/full-italic.css";
import "@fontsource-variable/instrument-sans";
import "./luxe.css";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Snowflake, Sparkle, Tiara } from "../../../client/icons";
import { fixture, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";

const two = (n: number) => String(n).padStart(2, "0");

function Shell({ tab, children }: { tab: number; children: ComponentChildren }) {
  return (
    <div class="d-luxe shell">
      <header class="mast">
        <span class="hello">{fixture.shell.hello}</span>
        <span class="online">
          <i aria-hidden="true" />
          {fixture.shell.online}
        </span>
      </header>
      <nav class="tabs" aria-label="Flikar">
        {fixture.shell.tabs.map((name, i) => (
          <a key={name} href="#" class={i === tab ? "tab on" : "tab"} aria-current={i === tab ? "page" : undefined} onClick={(e) => e.preventDefault()}>
            <span class="no" aria-hidden="true">
              {two(i + 1)}
            </span>
            {name}
          </a>
        ))}
      </nav>
      <main class="page">{children}</main>
    </div>
  );
}

function Landing() {
  const l = fixture.landing;
  return (
    <div class="d-luxe landing">
      <header class="cover-top">
        <span class="kick">N° 3</span>
        <span class="flake" aria-hidden="true">
          <Snowflake />
        </span>
        <span class="kick">7.11</span>
      </header>
      <h1 class="cover-title">
        <span class="mask">
          <span class="ln a">Dilara</span>
        </span>{" "}
        <span class="mask">
          <span class="ln b">fyller 3!</span>
        </span>
      </h1>
      <div class="cover-grid">
        <p class="deck">{l.subtitle}</p>
        <figure class="arch">
          <img src={l.photo} alt={l.photoAlt} />
        </figure>
        <span class="ghost" aria-hidden="true">
          3
        </span>
      </div>
      <form class="join" onSubmit={(e) => e.preventDefault()}>
        <label for="luxe-name">{l.label}</label>
        <input id="luxe-name" class="field" placeholder={l.placeholder} autocomplete="given-name" />
        <button class="cta" type="submit">
          <span>{l.button}</span>
          <span class="arrow" aria-hidden="true">
            →
          </span>
        </button>
      </form>
    </div>
  );
}

function Quiz() {
  const q = fixture.quiz;
  const [pick, setPick] = useState<number>(q.pick);
  const { left, total } = useCountdown();
  const [at = 0, of = 0] = (q.progress.match(/\d+/g) ?? []).map(Number);
  return (
    <Shell tab={0}>
      <section class="quiz">
        <div class="qtop">
          <div class="qno">
            <span class="kick">{q.progress}</span>
            <span class="big" aria-hidden="true">
              {two(at)}
              <small>/{two(of)}</small>
            </span>
          </div>
          <div class="clock" role="timer" aria-label={q.secondsLabel(left)}>
            <span key={left} class="secs">
              {two(left)}
            </span>
            <span class="kick" aria-hidden="true">
              {q.secondsLabel(left).replace(/^\d+ /, "")}
            </span>
          </div>
        </div>
        <div class="meter" aria-hidden="true">
          <span style={{ transform: `scaleX(${left / total})` }} />
        </div>
        <figure class="crop">
          <img src={q.photo} alt="" />
        </figure>
        <h2 class="qtext">{q.text}</h2>
        <ol class="opts">
          {q.options.map((o, i) => (
            <li key={o} style={{ "--i": i }}>
              <button type="button" class={i === pick ? "opt on" : "opt"} aria-pressed={i === pick} onClick={() => setPick(i)}>
                <span class="letter">{q.letters[i]}</span>
                <span class="otext">{o}</span>
                <span class="mark" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      </section>
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
      <span class="lead" aria-hidden="true" />
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
      <section class="reveal">
        <div class="verdict">
          <h2 class="word">{r.verdict}</h2>
          <dl class="tally">
            <dt class="kick">{r.points}</dt>
            <dd>{r.total}</dd>
          </dl>
        </div>
        <section class="spread">
          <h3>
            <span class="num">I.</span> {r.spread}
          </h3>
          <ul>
            {r.counts.map((n, i) => (
              <li key={i} class={i === r.correct ? "right" : ""} style={{ "--w": n / max, "--i": i }}>
                <span class="letter">{q.letters[i]}</span>
                <span class="otext">
                  {q.options[i]}
                  {(i === r.correct || i === q.pick) && (
                    <span class="notes">
                      {i === r.correct && <em>{r.rightAnswer}</em>}
                      {i === q.pick && <em>{r.yourGuess}</em>}
                    </span>
                  )}
                </span>
                <span class="line">
                  <span />
                </span>
                <span class="n">{n}</span>
              </li>
            ))}
          </ul>
        </section>
        <section class="board" key={replay}>
          <h3>
            <span class="num">II.</span> {b.title}
            <small class="kick">{b.progress}</small>
          </h3>
          <ol>
            {b.top.map((row, i) => (
              <Row key={row.name} r={row} slot={i} />
            ))}
          </ol>
          <p class="kick place">{b.yourPlace}</p>
          <ol>
            <Row r={b.me} slot={5} />
          </ol>
        </section>
      </section>
    </Shell>
  );
}

function Plate({ p, n, last, tap, onVote, onUnvote, left }: { p: GalleryPhoto; n: number; last: string | null; tap: number; onVote: () => void; onUnvote: () => void; left: number }) {
  const g = fixture.gallery;
  const bump = last === p.id ? tap : 0;
  return (
    <li class={`plate${p.mine > 0 ? " voted" : ""}${p.own ? " own" : ""}`} style={{ "--i": n }}>
      <figure>
        <div class="frame">
          <img src={p.src} alt="" />
          {p.mine > 0 && (
            <span key={bump} class="tag" aria-hidden="true">
              ×{p.mine}
            </span>
          )}
        </div>
        <figcaption>
          <span class="kick">Fig. {two(n + 1)}</span>
          {p.own ? <span class="ownlabel">{g.own}</span> : <span key={bump} class="mine">{g.mine(p.mine)}</span>}
        </figcaption>
      </figure>
      {!p.own && (
        <div class="ctl">
          <button type="button" class={p.mine === 0 ? "circ minus off" : "circ minus"} aria-label={g.unvote} onClick={onUnvote}>
            −
          </button>
          <span class="ticks" aria-hidden="true">
            {Array.from({ length: p.mine }, (_, i) => (
              <i key={i} />
            ))}
          </span>
          <button type="button" class={left === 0 ? "circ plus off" : "circ plus"} aria-label={g.vote} onClick={onVote}>
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
  const plates = (list: GalleryPhoto[], offset: number) => (
    <ul class="plates">
      {list.map((p, i) => (
        <Plate
          key={p.id}
          p={p}
          n={offset + i}
          last={v.last}
          tap={tap}
          left={v.votesLeft}
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
      <section class="gallery">
        <h2 class="ghead">
          <span class="num">III.</span>
          {g.title}
        </h2>
        <div class="status">
          <span class="pips" aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => (
              <i key={i} class={i < v.votesLeft ? "on" : ""} />
            ))}
          </span>
          <div>
            <p class="kick">{g.left(v.votesLeft)}</p>
            <p class="hint">{g.hint(v.votesLeft)}</p>
          </div>
        </div>
        {plates(v.current, 0)}
        <h2 class="ghead fame">
          <span class="num">IV.</span>
          {g.fameTitle}
        </h2>
        <p class="hint fametext">{g.fameText}</p>
        {plates(v.fame, v.current.length)}
      </section>
    </Shell>
  );
}

const FALL = Array.from({ length: 26 }, (_, i) => ({
  x: (i * 37) % 100,
  y: (i * 53) % 70,
  d: ((i * 7) % 10) / 10,
  kind: ["strip", "spark", "strip", "flake", "dot"][i % 5]!,
  hue: ["#a3b1c0", "#8cb8e0", "#d9a3bd", "#c3ccd6"][i % 4]!,
  rot: (i * 47) % 180,
}));

function Finale() {
  const f = fixture.finale;
  const replay = useReplay(7000);
  return (
    <div class="d-luxe finale" key={replay}>
      <div class="suspense" aria-hidden="true">
        <p class="sus">{f.suspense}</p>
        <span class="rule" />
        <p class="kick">{f.suspenseSub}</p>
      </div>
      <div class="fall" aria-hidden="true">
        {FALL.map((c, i) => (
          <span key={i} class={`c ${c.kind}`} style={{ left: `${c.x}%`, top: `${c.y}%`, "--d": `${c.d}s`, "--rot": `${c.rot}deg`, color: c.hue, background: c.kind === "strip" || c.kind === "dot" ? c.hue : undefined }}>
            {c.kind === "spark" && <Sparkle />}
            {c.kind === "flake" && <Snowflake />}
          </span>
        ))}
      </div>
      <section class="win">
        <p class="kick k1">{f.kicker}</p>
        <Tiara />
        <h1 class="winner" aria-label={f.winner}>
          {[...f.winner].map((ch, i) => (
            <span key={i} class="mask">
              <span class="ch" style={{ "--i": i }}>
                {ch}
              </span>
            </span>
          ))}
        </h1>
        <p class="pts">
          <span class="hair" aria-hidden="true" />
          {f.points}
          <span class="hair" aria-hidden="true" />
        </p>
        <figure class="best">
          <div class="arch">
            <img src={f.photo} alt={f.photoAlt} />
          </div>
          <figcaption>
            <span class="kick">{f.photoKicker}</span>
            <strong>{f.photoWinner}</strong>
            <span class="sub">{f.photoSub}</span>
          </figcaption>
        </figure>
      </section>
    </div>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
