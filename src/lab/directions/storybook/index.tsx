import "@fontsource/young-serif/400.css";
import "@fontsource-variable/shantell-sans";
import "./storybook.css";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Tiara } from "../../../client/icons";
import { fixture, VOTES_PER_GUEST, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";
import { Castle, Flake, Hills, Page, Sky, Star, STAR, wobble } from "./art";

const enter = (ms: number) => ({ "--d": `${ms}ms` });

function Ring({ seed, r = 21 }: { seed: number; r?: number }) {
  return (
    <svg class="sb-ring" viewBox="0 0 50 50" aria-hidden="true">
      <path d={wobble(25, 25, r, seed)} />
    </svg>
  );
}

function Shell({ tab, children }: { tab: number; children: ComponentChildren }) {
  return (
    <Page class="sb-shelled">
      <Sky stars={[{ x: 52, y: 1.2, s: 14, d: 0.4 }, { x: 92, y: 9, s: 12, d: 1.4 }]} />
      <header class="sb-top">
        <p class="sb-hello">
          <Star size={22} class="sb-twinkle" />
          {fixture.shell.hello}
        </p>
        <p class="sb-online">
          <i aria-hidden="true" />
          {fixture.shell.online}
        </p>
      </header>
      <nav class="sb-tabs" aria-label="Meny">
        {fixture.shell.tabs.map((name, i) => (
          <a key={name} href="#" class="sb-tab" aria-current={i === tab ? "page" : undefined}>
            {name}
          </a>
        ))}
      </nav>
      <main class="sb-sheet">{children}</main>
      <Hills class="sb-hills-shell" />
    </Page>
  );
}

function Landing() {
  const l = fixture.landing;
  return (
    <Page class="sb-landing">
      <Sky />
      <h1 class="sb-title sb-enter" style={enter(0)}>
        {l.title}
      </h1>
      <svg class="sb-swash sb-draw" viewBox="0 0 220 20" aria-hidden="true">
        <path d="M6 12 C50 2 90 18 130 8 S196 6 214 12" />
      </svg>
      <p class="sb-sub sb-enter" style={enter(250)}>
        {l.subtitle}
      </p>
      <figure class="sb-portrait sb-enter" style={enter(350)}>
        <img src={l.photo} alt={l.photoAlt} />
        <span class="sb-portrait-star sb-twinkle">
          <Star size={34} />
        </span>
      </figure>
      <Hills castle class="sb-hills-landing" />
      <form class="sb-card sb-join sb-enter" style={enter(550)} onSubmit={(e) => e.preventDefault()}>
        <label for="sb-name">{l.label}</label>
        <input id="sb-name" name="name" autocomplete="given-name" placeholder={l.placeholder} />
        <button type="submit" class="sb-btn">
          {l.button}
          <Star size={20} />
        </button>
      </form>
    </Page>
  );
}

function Countdown() {
  const { left, total } = useCountdown();
  const len = 2 * Math.PI * 24;
  return (
    <div class="sb-clock" role="timer" aria-label={fixture.quiz.secondsLabel(left)}>
      <svg viewBox="0 0 60 60" aria-hidden="true">
        <path class="sb-clock-bg" d={wobble(30, 30, 24, 3, 0.03)} />
        <circle class="sb-clock-run" cx="30" cy="30" r="24" style={{ strokeDasharray: len, strokeDashoffset: len * (1 - left / total) }} />
      </svg>
      <span key={left} class="sb-clock-n">
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
      <div class="sb-quiz-head sb-enter" style={enter(100)}>
        <p class="sb-ribbon">{q.progress}</p>
        <Countdown />
      </div>
      <figure class="sb-polaroid sb-enter" style={enter(200)}>
        <span class="sb-tape" aria-hidden="true" />
        <img src={q.photo} alt="" />
      </figure>
      <h2 class="sb-question sb-enter" style={enter(320)}>
        {q.text}
      </h2>
      <ul class="sb-options">
        {q.options.map((text, i) => (
          <li key={text} class="sb-enter" style={enter(420 + i * 90)}>
            <button type="button" class={`sb-card sb-option ${pick === i ? "is-picked" : ""}`} aria-pressed={pick === i} onClick={() => setPick(i)}>
              <span class="sb-letter">
                <Ring seed={i + 2} />
                {q.letters[i]}
              </span>
              {text}
              {pick === i && (
                <span class="sb-stamp" aria-hidden="true">
                  <Star size={26} />
                </span>
              )}
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
    <li class={`sb-line ${row.rank === 1 ? "is-first" : ""} ${row.you ? "is-you" : ""}`} style={{ "--from": `${(row.prev - row.rank) * 38}px`, "--d": `${600 + i * 110}ms` }}>
      <span class="sb-place">
        <Ring seed={row.rank + 7} r={19} />
        {row.rank}
      </span>
      <span class="sb-line-name">
        {row.name}
        {row.rank === 1 && <Tiara />}
        {row.you && <em class="sb-du">{b.youTag}</em>}
      </span>
      <span class="sb-dots" aria-hidden="true" />
      <span class="sb-line-score">{b.score(row.score)}</span>
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
      <section class="sb-verdict sb-enter" style={enter(80)}>
        <div class="sb-burst" aria-hidden="true">
          <svg viewBox="-60 -60 120 120">
            <path d={wobble(0, 0, 50, 5, 0.12, 14)} />
          </svg>
          <Star size={20} class="sb-v1" />
          <Star size={14} class="sb-v2" />
        </div>
        <p class="sb-verdict-word">{r.verdict}</p>
        <div class="sb-verdict-pts">
          <p class="sb-points">{r.points}</p>
          <p class="sb-total">{r.total}</p>
        </div>
      </section>
      <section class="sb-card sb-spread sb-enter" style={enter(220)}>
        <h2 class="sb-h2">{r.spread}</h2>
        <ul>
          {q.options.map((text, i) => (
            <li key={text} class={i === r.correct ? "is-right" : ""}>
              <span class="sb-col-n">{r.counts[i]}</span>
              <span class="sb-col" style={{ "--h": r.counts[i]! / most, "--d": `${400 + i * 90}ms` }} />
              <span class="sb-col-label">
                {q.letters[i]} {text}
              </span>
            </li>
          ))}
        </ul>
        <p class="sb-note">
          <Star size={14} /> {r.rightAnswer}: {q.options[r.correct]} · {r.yourGuess}: {q.options[q.pick]}
        </p>
      </section>
      <section class="sb-card sb-board sb-enter" style={enter(360)} key={replay}>
        <div class="sb-board-head">
          <h2 class="sb-h2">{b.title}</h2>
          <span>{b.progress}</span>
        </div>
        <ol>
          {b.top.map((row, i) => (
            <Line key={row.name} row={row} i={i} />
          ))}
        </ol>
        <p class="sb-yourplace">{b.yourPlace}</p>
        <ol>
          <Line row={b.me} i={5} />
        </ol>
      </section>
    </Shell>
  );
}

const TILTS = [-2.2, 1.8, 1.2, -1.6, -1.4, 2];

function Snap({ p, i, tap, onVote, onUnvote }: { p: GalleryPhoto; i: number; tap: number; onVote: () => void; onUnvote: () => void }) {
  const g = fixture.gallery;
  return (
    <li class={`sb-snap sb-enter ${p.own ? "is-own" : ""} ${p.mine > 0 ? "is-voted" : ""}`} style={{ ...enter(250 + i * 90), "--t": `${TILTS[i % TILTS.length]}deg` }}>
      <div class="sb-snap-paper">
        <span class="sb-tape" aria-hidden="true" />
        <div class="sb-snap-img">
          <img src={p.src} alt="" />
          {tap > 0 && (
            <span key={tap} class="sb-poof" aria-hidden="true">
              <Star size={56} />
            </span>
          )}
        </div>
        {p.mine > 0 && (
          <span class="sb-badge" aria-hidden="true">
            <svg viewBox="-12 -12 24 24">
              <path d={STAR} />
            </svg>
            <b key={`${p.mine}-${tap}`}>{p.mine}</b>
          </span>
        )}
        {p.own ? (
          <p class="sb-own">{g.own}</p>
        ) : (
          <div class="sb-vote">
            <button type="button" class="sb-round" aria-label={g.unvote} aria-disabled={p.mine === 0} onClick={onUnvote}>
              <Ring seed={i + 11} />−
            </button>
            <span key={`${p.mine}-${tap}`} class="sb-count" aria-hidden="true">
              {p.mine}
            </span>
            <button type="button" class="sb-round sb-plus" aria-label={g.vote} onClick={onVote}>
              <Ring seed={i + 17} />+
            </button>
          </div>
        )}
        {!p.own && <p class="sb-mine">{g.mine(p.mine)}</p>}
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
      <h1 class="sb-gtitle sb-enter" style={enter(80)}>
        {g.title}
      </h1>
      <section class="sb-card sb-status sb-enter" style={enter(180)} aria-live="polite">
        <span class="sb-pips" aria-hidden="true">
          {Array.from({ length: VOTES_PER_GUEST }, (_, i) => (
            <svg key={i} class={i < v.votesLeft ? "on" : ""} viewBox="-12 -12 24 24">
              <path d={STAR} />
            </svg>
          ))}
        </span>
        <div>
          <p class="sb-left">{g.left(v.votesLeft)}</p>
          <p class="sb-hint">{g.hint(v.votesLeft)}</p>
        </div>
      </section>
      <ul class="sb-album">{v.current.map(snap)}</ul>
      <section class="sb-fame">
        <h2 class="sb-ribbon sb-fame-title">{g.fameTitle}</h2>
        <p class="sb-hint">{g.fameText}</p>
        <ul class="sb-album">{v.fame.map((p, i) => snap(p, i + 4))}</ul>
      </section>
    </Shell>
  );
}

const CONFETTI = Array.from({ length: 30 }, (_, i) => ({
  x: (i * 53) % 100,
  delay: 1200 + ((i * 97) % 700),
  fall: 2.6 + (i % 5) * 0.5,
  kind: i % 3,
  spin: (i % 2 ? 1 : -1) * (180 + (i % 4) * 90),
}));

function Finale() {
  const f = fixture.finale;
  const replay = useReplay(7000);
  return (
    <Page class="sb-finale" key={replay}>
      <Sky />
      <div class="sb-suspense" aria-hidden="true">
        <svg class="sb-wandline" viewBox="0 0 300 120">
          <path d="M20 100 C80 20 140 110 200 50 S270 20 286 30" />
        </svg>
        <span class="sb-wandtip">
          <Star size={40} />
        </span>
        <p class="sb-suspense-title">{f.suspense}</p>
        <p class="sb-sub">{f.suspenseSub}</p>
      </div>
      <div class="sb-confetti" aria-hidden="true">
        {CONFETTI.map((c, i) => (
          <i key={i} class={`c${c.kind}`} style={{ left: `${c.x}%`, "--d": `${c.delay}ms`, "--f": `${c.fall}s`, "--s": `${c.spin}deg` }}>
            {c.kind === 0 ? <Star size={18} /> : c.kind === 1 ? <Flake size={18} /> : null}
          </i>
        ))}
      </div>
      <div class="sb-stage">
        <p class="sb-banner sb-show" style={enter(1200)}>
          <span>{f.kicker}</span>
        </p>
        <div class="sb-crown sb-show" style={enter(1350)}>
          <Tiara />
        </div>
        <h1 class="sb-winner sb-show" style={enter(1450)}>
          {f.winner}
        </h1>
        <p class="sb-winpoints sb-show" style={enter(1600)}>
          {f.points}
        </p>
        <section class="sb-card sb-recap sb-show" style={enter(1800)}>
          <figure class="sb-polaroid sb-recap-photo">
            <span class="sb-tape" aria-hidden="true" />
            <img src={f.photo} alt={f.photoAlt} />
          </figure>
          <div>
            <p class="sb-recap-kicker">{f.photoKicker}</p>
            <p class="sb-recap-name">{f.photoWinner}</p>
            <p class="sb-recap-sub">{f.photoSub}</p>
          </div>
        </section>
      </div>
      <div class="sb-finale-land sb-show" style={enter(1150)}>
        <Castle />
        <Hills />
      </div>
    </Page>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
