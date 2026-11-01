import "@fontsource/bungee/400.css";
import "@fontsource-variable/rubik";
import "./gameshow.css";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { CheckIcon, Snowflake, Sparkle, Tiara } from "../../../client/icons";
import { fixture, VOTES_PER_GUEST, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";

type Tab = 0 | 1 | 2;

function Stage({ class: cls, children }: { class: string; children: ComponentChildren }) {
  return (
    <div class={`d-gameshow ${cls}`}>
      <div class="rays" aria-hidden="true" />
      {children}
    </div>
  );
}

/** A lit marquee frame: bulbs around the edge that chase. */
function Marquee({ class: cls = "", children }: { class?: string; children: ComponentChildren }) {
  return (
    <div class={`marquee ${cls}`}>
      <span class="bulbs a" aria-hidden="true" />
      <span class="bulbs b" aria-hidden="true" />
      <div class="marquee-in">{children}</div>
    </div>
  );
}

function Shell({ tab, children }: { tab: Tab; children: ComponentChildren }) {
  const { hello, online, tabs } = fixture.shell;
  return (
    <Stage class="shell">
      <header class="top">
        <Marquee class="sign">
          <p class="hello">{hello}</p>
          <p class="online">
            <span class="led" aria-hidden="true" />
            {online}
          </p>
        </Marquee>
        <nav class="tabs" aria-label="Meny">
          {tabs.map((label, i) => (
            <a key={label} href="#" class={i === tab ? "tab on" : "tab"} aria-current={i === tab ? "page" : undefined}>
              {label}
            </a>
          ))}
        </nav>
      </header>
      <main class="body">{children}</main>
    </Stage>
  );
}

function Landing() {
  const l = fixture.landing;
  return (
    <Stage class="landing">
      <p class="on-air in" aria-hidden="true">
        <Sparkle class="spk" /> Kalas <Sparkle class="spk" />
      </p>
      <Marquee class="hero in">
        <img src={l.photo} alt={l.photoAlt} />
      </Marquee>
      <h1 class="title in">
        <span class="t1">Dilara</span>
        <span class="t2">
          fyller <span class="t3">3!</span>
        </span>
      </h1>
      <p class="sub in">{l.subtitle}</p>
      <form class="join in" onSubmit={(e) => e.preventDefault()}>
        <label for="gs-name">{l.label}</label>
        <input id="gs-name" name="name" placeholder={l.placeholder} autocomplete="nickname" />
        <button class="go" type="submit">
          {l.button}
        </button>
      </form>
    </Stage>
  );
}

function Dial({ left, total }: { left: number; total: number }) {
  return (
    <div class={left <= 5 ? "dial low" : "dial"} role="timer" aria-label={fixture.quiz.secondsLabel(left)}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} class={i < left ? "seg lit" : "seg"} style={{ transform: `rotate(${(i * 360) / total}deg)` }} />
      ))}
      <span class="dial-face">
        <span class="dial-num" key={left}>
          {left}
        </span>
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
      <div class="screen in">
        <Marquee class="qphoto">
          <img src={q.photo} alt="" />
        </Marquee>
        <span class="progress">{q.progress}</span>
        <Dial left={left} total={total} />
      </div>
      <h2 class="question in">{q.text}</h2>
      <div class="tiles">
        {q.options.map((o, i) => (
          <button
            key={o}
            type="button"
            class={`tile c${i}${pick === i ? " picked" : ""}`}
            style={{ animationDelay: `${0.25 + i * 0.09}s` }}
            aria-pressed={pick === i}
            onClick={() => setPick(i)}
          >
            <span class="badge">{q.letters[i]}</span>
            <span class="tile-text">{o}</span>
            {pick === i && (
              <span class="tick" aria-hidden="true">
                <CheckIcon />
              </span>
            )}
          </button>
        ))}
      </div>
    </Shell>
  );
}

/** Split-flap digits: every character gets its own tile and flips in after the one before it. */
function Flip({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <span class="flip" aria-label={text}>
      {[...text].map((ch, i) =>
        ch.trim() ? (
          <span key={i} class="flap" style={{ animationDelay: `${delay + i * 0.04}s` }} aria-hidden="true">
            {ch}
          </span>
        ) : (
          <span key={i} class="flap-gap" aria-hidden="true" />
        ),
      )}
    </span>
  );
}

function ScoreRow({ row, i }: { row: BoardRow; i: number }) {
  return (
    <li class={`slot${row.rank === 1 ? " first" : ""}${row.you ? " you" : ""}`} style={{ "--from": row.prev - row.rank, animationDelay: `${0.3 + i * 0.03}s` }}>
      <span class="rank-flip" aria-label={`${row.rank}`}>
        <span class="old" aria-hidden="true">
          {row.prev}
        </span>
        <span class="new" aria-hidden="true">
          {row.rank}
        </span>
      </span>
      <span class="who">
        {row.rank === 1 && (
          <span class="crown">
            <Tiara />
          </span>
        )}
        {row.name}
        {row.you && <span class="you-tag">{fixture.board.youTag}</span>}
      </span>
      <Flip text={fixture.board.score(row.score)} delay={0.45 + i * 0.03} />
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
      <section class="verdict in">
        <span class="star" aria-hidden="true" />
        <div class="verdict-in">
          <p class="verdict-word">{r.verdict}</p>
          <p class="verdict-pts">{r.points}</p>
          <p class="verdict-total">{r.total}</p>
        </div>
      </section>
      <section class="spread in">
        <h2 class="label">{r.spread}</h2>
        <ul class="cols">
          {fixture.quiz.options.map((o, i) => (
            <li key={o} class={`col c${i}${i === r.correct ? " right" : ""}`}>
              <span class="col-count">{r.counts[i]}</span>
              <span class="col-bar" style={{ "--h": r.counts[i]! / max, animationDelay: `${0.35 + i * 0.08}s` }} />
              <span class="badge sm">{fixture.quiz.letters[i]}</span>
              <span class="col-name">{o}</span>
              {i === r.correct && <span class="right-tag">{r.rightAnswer}</span>}
            </li>
          ))}
        </ul>
      </section>
      <section class="board in" key={replay}>
        <div class="board-head">
          <h2 class="board-title">{b.title}</h2>
          <span class="board-sub">{b.progress}</span>
        </div>
        <ol class="slots">
          {b.top.map((row, i) => (
            <ScoreRow key={row.name} row={row} i={i} />
          ))}
        </ol>
        <h3 class="label me-label">{b.yourPlace}</h3>
        <ol class="slots">
          <ScoreRow row={b.me} i={5} />
        </ol>
      </section>
    </Shell>
  );
}

function useTaps() {
  const v = useVotes();
  const [taps, setTaps] = useState(0);
  return {
    ...v,
    taps,
    vote: (id: string) => (v.vote(id), setTaps((n) => n + 1)),
    unvote: (id: string) => (v.unvote(id), setTaps((n) => n + 1)),
  };
}

function Entry({ p, v, n }: { p: GalleryPhoto; v: ReturnType<typeof useTaps>; n: number }) {
  const g = fixture.gallery;
  const hit = v.last === p.id;
  return (
    <li class={`entry${p.own ? " own" : ""}${p.mine > 0 ? " voted" : ""}`}>
      <div class="pic" key={hit ? `${p.id}-${v.taps}` : p.id}>
        {p.mine > 0 ? (
          <Marquee class="pic-lit">
            <img src={p.src} alt={`Bild ${n}`} />
          </Marquee>
        ) : (
          <img src={p.src} alt={`Bild ${n}`} />
        )}
        {p.own && <span class="own-tag">{g.own}</span>}
        {p.mine > 0 && <span class="votes-led">{p.mine}</span>}
        {hit && <span class="flash" aria-hidden="true" />}
      </div>
      {!p.own && (
        <div class="pad">
          <button type="button" class="arcade minus" aria-label={g.unvote} aria-disabled={p.mine === 0} onClick={() => v.unvote(p.id)}>
            −
          </button>
          <span class="mine" key={hit ? v.taps : 0}>
            {g.mine(p.mine)}
          </span>
          <button type="button" class={v.votesLeft === 0 ? "arcade plus spent" : "arcade plus"} aria-label={g.vote} onClick={() => v.vote(p.id)}>
            +
          </button>
        </div>
      )}
    </li>
  );
}

function Gallery() {
  const g = fixture.gallery;
  const v = useTaps();
  return (
    <Shell tab={2}>
      <div class="gal-head in">
        <h2 class="gal-title">{g.title}</h2>
        <div class="credits">
          <span class="tokens" aria-hidden="true">
            {Array.from({ length: VOTES_PER_GUEST }, (_, i) => (
              <span key={i} class={i < v.votesLeft ? "token on" : "token"}>
                <Snowflake />
              </span>
            ))}
          </span>
          <div>
            <p class="credits-left">{g.left(v.votesLeft)}</p>
            <p class="credits-hint">{g.hint(v.votesLeft)}</p>
          </div>
        </div>
      </div>
      <ul class="wall">
        {v.current.map((p, i) => (
          <Entry key={p.id} p={p} v={v} n={i + 1} />
        ))}
      </ul>
      <section class="fame">
        <h2 class="fame-title">
          <Sparkle class="spk" />
          {g.fameTitle}
          <Sparkle class="spk" />
        </h2>
        <p class="fame-text">{g.fameText}</p>
        <ul class="wall">
          {v.fame.map((p, i) => (
            <Entry key={p.id} p={p} v={v} n={v.current.length + i + 1} />
          ))}
        </ul>
      </section>
    </Shell>
  );
}

/** Confetti from two cannons: [side, spread x px, peak y px, colour, shape, delay s, spin deg]. */
const CONFETTI = Array.from({ length: 80 }, (_, i) => {
  const side = i % 2 === 0 ? 1 : -1;
  return {
    side,
    x: side * (60 + ((i * 53) % 260)),
    y: -(260 + ((i * 97) % 480)),
    c: i % 5,
    shape: i % 3,
    delay: ((i * 7) % 10) * 0.025,
    spin: 360 + ((i * 131) % 720),
  };
});

function Finale() {
  const f = fixture.finale;
  const replay = useReplay(7000);
  return (
    <Stage class="finale" key={replay}>
      <div class="suspense" aria-hidden="true">
        <span class="beam l" />
        <span class="beam r" />
        <p class="suspense-word">{f.suspense}</p>
        <p class="suspense-sub">{f.suspenseSub}</p>
        <span class="drum">
          <span />
          <span />
          <span />
        </span>
      </div>
      <span class="whiteout" aria-hidden="true" />
      <div class="cannons" aria-hidden="true">
        {CONFETTI.map((p, i) => (
          <span
            key={i}
            class={`conf k${p.c} s${p.shape} ${p.side > 0 ? "from-l" : "from-r"}`}
            style={{ "--x": `${p.x}px`, "--y": `${p.y}px`, "--spin": `${p.spin}deg`, animationDelay: `${1.2 + p.delay}s` }}
          />
        ))}
      </div>
      <div class="win">
        <span class="halo" aria-hidden="true" />
        <p class="kicker">{f.kicker}</p>
        <span class="crown-big">
          <Tiara />
        </span>
        <h1 class="winner">{f.winner}</h1>
        <p class="pts">
          <Flip text={f.points} delay={1.6} />
        </p>
        <Marquee class="prize">
          <img src={f.photo} alt={f.photoAlt} />
          <div>
            <p class="prize-kicker">{f.photoKicker}</p>
            <p class="prize-name">{f.photoWinner}</p>
            <p class="prize-sub">{f.photoSub}</p>
          </div>
        </Marquee>
      </div>
    </Stage>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
