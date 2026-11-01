import "@fontsource-variable/shantell-sans";
import "@fontsource/parisienne/400.css";
import "./papercut.css";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Tiara } from "../../../client/icons";
import { fixture, VOTES_PER_GUEST, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";
import { Banner, BackPines, Castle, Doily, Drift, FarHills, FrontPines, Moon, Page, PaperFlake, PaperSnow, PaperStar, Scenery, STAR } from "./art";

const enter = (ms: number) => ({ "--d": `${ms}ms` });

function Shell({ tab, children }: { tab: number; children: ComponentChildren }) {
  return (
    <Page class="pc-shelled">
      <Scenery class="pc-shell-scene" />
      <PaperSnow />
      <header class="pc-top">
        <p class="pc-hello">{fixture.shell.hello}</p>
        <p class="pc-online">
          <i aria-hidden="true" />
          {fixture.shell.online}
        </p>
      </header>
      <nav class="pc-bunting" aria-label="Meny">
        <svg class="pc-string" viewBox="0 0 390 30" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-4 6 Q195 30 394 6" />
        </svg>
        {fixture.shell.tabs.map((name, i) => (
          <a key={name} href="#" class="pc-flag" aria-current={i === tab ? "page" : undefined} style={{ "--i": i }}>
            {name}
          </a>
        ))}
      </nav>
      <main class="pc-card pc-sheet">{children}</main>
    </Page>
  );
}

function Landing() {
  const l = fixture.landing;
  const name = l.title.slice(0, l.title.indexOf(" "));
  const rest = l.title.slice(l.title.indexOf(" ") + 1);
  return (
    <Page class="pc-landing">
      <Moon class="pc-landing-moon" />
      <Scenery class="pc-landing-scene" />
      <PaperSnow />
      <h1 class="pc-title pc-enter" style={enter(0)}>
        <span class="pc-title-tiara" aria-hidden="true">
          <Tiara />
        </span>
        <span class="pc-script">{name}</span> <span class="pc-title-rest">{rest}</span>
      </h1>
      <Banner class="pc-enter pc-sub" style={enter(150)}>
        {l.subtitle}
      </Banner>
      <figure class="pc-medallion pc-enter" style={enter(300)}>
        <Doily />
        <img src={l.photo} alt={l.photoAlt} />
        <PaperFlake size={34} class="pc-medallion-flake" />
      </figure>
      <form class="pc-card pc-join pc-enter" style={enter(500)} onSubmit={(e) => e.preventDefault()}>
        <label for="pc-name">{l.label}</label>
        <input id="pc-name" name="name" autocomplete="given-name" placeholder={l.placeholder} />
        <button type="submit" class="pc-btn">
          {l.button}
          <PaperFlake size={22} />
        </button>
      </form>
    </Page>
  );
}

function Countdown() {
  const { left, total } = useCountdown();
  return (
    <div class="pc-clock" role="timer" aria-label={fixture.quiz.secondsLabel(left)}>
      <svg viewBox="-34 -34 68 68" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <path key={i} class={i < left ? "on" : ""} transform={`rotate(${(i / total) * 360})`} d="M-3.4 -31 Q0 -34.5 3.4 -31 L2.2 -22 L-2.2 -22 Z" />
        ))}
      </svg>
      <span key={left} class="pc-clock-n">
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
      <div class="pc-quiz-head pc-enter" style={enter(100)}>
        <Banner class="pc-progress">{q.progress}</Banner>
        <Countdown />
      </div>
      <figure class="pc-photo pc-enter" style={enter(200)}>
        <img src={q.photo} alt="" />
      </figure>
      <h2 class="pc-question pc-enter" style={enter(320)}>
        {q.text}
      </h2>
      <ul class="pc-options">
        {q.options.map((text, i) => (
          <li key={text} class="pc-enter" style={enter(420 + i * 90)}>
            <button type="button" class={`pc-tile pc-option ${pick === i ? "is-picked" : ""}`} aria-pressed={pick === i} onClick={() => setPick(i)}>
              <span class="pc-letter">{q.letters[i]}</span>
              {text}
              {pick === i && <PaperStar size={28} class="pc-pin" />}
            </button>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function Line({ row, i }: { row: BoardRow; i: number }) {
  const b = fixture.board;
  return (
    <li class={`pc-line ${row.rank === 1 ? "is-first" : ""} ${row.you ? "is-you" : ""}`} style={{ "--from": `${(row.prev - row.rank) * 34}px`, "--d": `${600 + i * 110}ms` }}>
      <span class="pc-place">{row.rank}</span>
      <span class="pc-line-name">
        {row.name}
        {row.rank === 1 && (
          <span class="pc-line-tiara">
            <Tiara />
          </span>
        )}
        {row.you && <em class="pc-du">{b.youTag}</em>}
      </span>
      <span class="pc-dots" aria-hidden="true" />
      <span class="pc-line-score">{b.score(row.score)}</span>
    </li>
  );
}

function Reveal() {
  const r = fixture.reveal;
  const q = fixture.quiz;
  const b = fixture.board;
  const replay = useReplay(6000);
  const most = Math.max(...r.counts);
  return (
    <Shell tab={0}>
      <section class="pc-verdict pc-enter" style={enter(80)}>
        <div class="pc-rosette">
          <span class="pc-rosette-tails" aria-hidden="true" />
          <span class="pc-rosette-ruff" aria-hidden="true" />
          <p class="pc-verdict-word">{r.verdict}</p>
        </div>
        <div>
          <p class="pc-points">{r.points}</p>
          <p class="pc-total">{r.total}</p>
        </div>
      </section>
      <section class="pc-spread pc-enter" style={enter(220)}>
        <h2 class="pc-h2">{r.spread}</h2>
        <ul>
          {q.options.map((text, i) => (
            <li key={text} class={i === r.correct ? "is-right" : ""}>
              <span class="pc-col-n">{r.counts[i]}</span>
              <span class="pc-col" style={{ "--h": r.counts[i]! / most, "--d": `${400 + i * 90}ms` }} />
              <span class="pc-col-label">
                {q.letters[i]} {text}
              </span>
            </li>
          ))}
        </ul>
        <p class="pc-note">
          {r.rightAnswer}: {q.options[r.correct]} · {r.yourGuess}: {q.options[q.pick]}
        </p>
      </section>
      <section class="pc-tile pc-board pc-enter" style={enter(360)} key={replay}>
        <div class="pc-board-head">
          <h2 class="pc-h2">{b.title}</h2>
          <span>{b.progress}</span>
        </div>
        <ol>
          {b.top.map((row, i) => (
            <Line key={row.name} row={row} i={i} />
          ))}
        </ol>
        <p class="pc-yourplace">{b.yourPlace}</p>
        <ol>
          <Line row={b.me} i={5} />
        </ol>
      </section>
    </Shell>
  );
}

function Snap({ p, i, tap, onVote, onUnvote }: { p: GalleryPhoto; i: number; tap: number; onVote: () => void; onUnvote: () => void }) {
  const g = fixture.gallery;
  return (
    <li class={`pc-snap pc-enter ${p.own ? "is-own" : ""} ${p.mine > 0 ? "is-voted" : ""}`} style={enter(250 + i * 90)}>
      <div class="pc-tile pc-snap-paper">
        <div class="pc-snap-img">
          <img src={p.src} alt="" />
          {tap > 0 && (
            <span key={tap} class="pc-poof" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((k) => (
                <i key={k} style={{ "--a": `${k * 60}deg` }}>
                  <PaperFlake size={k % 2 ? 14 : 20} />
                </i>
              ))}
            </span>
          )}
        </div>
        {p.mine > 0 && (
          <span class="pc-badge" aria-hidden="true">
            <svg viewBox="-12 -12 24 24">
              <path d={STAR} />
            </svg>
            <b key={`${p.mine}-${tap}`}>{p.mine}</b>
          </span>
        )}
        {p.own ? (
          <p class="pc-own">{g.own}</p>
        ) : (
          <>
            <div class="pc-vote">
              <button type="button" class="pc-round" aria-label={g.unvote} aria-disabled={p.mine === 0} onClick={onUnvote}>
                −
              </button>
              <span key={`${p.mine}-${tap}`} class="pc-count" aria-hidden="true">
                {p.mine}
              </span>
              <button type="button" class="pc-round pc-plus" aria-label={g.vote} onClick={onVote}>
                +
              </button>
            </div>
            <p class="pc-mine">{g.mine(p.mine)}</p>
          </>
        )}
      </div>
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
  const snap = (p: GalleryPhoto, i: number) => <Snap key={p.id} p={p} i={i} tap={v.last === p.id ? taps : 0} onVote={act(v.vote, p.id)} onUnvote={act(v.unvote, p.id)} />;
  return (
    <Shell tab={2}>
      <h1 class="pc-gtitle pc-enter" style={enter(80)}>
        {g.title}
      </h1>
      <section class="pc-status pc-enter" style={enter(180)} aria-live="polite">
        <span class="pc-pips" aria-hidden="true">
          {Array.from({ length: VOTES_PER_GUEST }, (_, i) => (
            <span key={`${i}-${i < v.votesLeft}`} class={i < v.votesLeft ? "on" : ""}>
              <PaperFlake size={26} />
            </span>
          ))}
        </span>
        <div>
          <p class="pc-left">{g.left(v.votesLeft)}</p>
          <p class="pc-hint">{g.hint(v.votesLeft)}</p>
        </div>
      </section>
      <ul class="pc-album">{v.current.map(snap)}</ul>
      <section class="pc-fame">
        <Banner as="h2" class="pc-fame-title">
          {g.fameTitle}
        </Banner>
        <p class="pc-hint">{g.fameText}</p>
        <ul class="pc-album">{v.fame.map((p, i) => snap(p, i + 4))}</ul>
      </section>
    </Shell>
  );
}

const CONFETTI = Array.from({ length: 22 }, (_, i) => ({
  x: (i * 47 + 3) % 100,
  delay: 1300 + ((i * 89) % 800),
  fall: 3 + (i % 5) * 0.5,
  flake: i % 3 !== 2,
  s: 14 + (i % 3) * 6,
  spin: (i % 2 ? 1 : -1) * (160 + (i % 4) * 70),
}));

function Finale() {
  const f = fixture.finale;
  const replay = useReplay(7000);
  return (
    <Page class="pc-finale" key={replay}>
      <div class="pc-suspense" aria-hidden="true">
        <PaperFlake size={64} class="pc-suspense-flake" />
        <p class="pc-suspense-title">{f.suspense}</p>
        <p class="pc-suspense-sub">{f.suspenseSub}</p>
      </div>
      <Banner class="pc-kicker pc-pop" style={enter(1200)}>
        {f.kicker}
      </Banner>
      <div class="pc-book">
        <div class="pc-spread-floor" aria-hidden="true" />
        <div class="pc-piece pc-piece-back" style={enter(1150)} aria-hidden="true">
          <Moon class="pc-finale-moon" />
          <FarHills />
          <Castle />
        </div>
        <div class="pc-piece pc-piece-mid" style={enter(1230)} aria-hidden="true">
          <BackPines />
        </div>
        <div class="pc-piece pc-piece-front" style={enter(1310)} aria-hidden="true">
          <FrontPines />
        </div>
        <div class="pc-piece pc-piece-plaque" style={enter(1400)}>
          <div class="pc-card pc-plaque">
            <span class="pc-crown">
              <Tiara />
            </span>
            <h1 class="pc-winner">{f.winner}</h1>
            <p class="pc-winpoints">{f.points}</p>
          </div>
        </div>
        <div class="pc-piece pc-piece-near" style={enter(1480)} aria-hidden="true">
          <Drift />
        </div>
      </div>
      <section class="pc-card pc-recap pc-rise" style={enter(1700)}>
        <figure class="pc-photo pc-recap-photo">
          <img src={f.photo} alt={f.photoAlt} />
        </figure>
        <div>
          <p class="pc-recap-kicker">{f.photoKicker}</p>
          <p class="pc-recap-name">{f.photoWinner}</p>
          <p class="pc-recap-sub">{f.photoSub}</p>
        </div>
      </section>
      <div class="pc-confetti" aria-hidden="true">
        {CONFETTI.map((c, i) => (
          <i key={i} class={c.flake ? "" : "dot"} style={{ left: `${c.x}%`, "--d": `${c.delay}ms`, "--f": `${c.fall}s`, "--s": `${c.spin}deg` }}>
            {c.flake && <PaperFlake size={c.s} />}
          </i>
        ))}
      </div>
    </Page>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
