import "@fontsource/pinyon-script/400.css";
import "@fontsource-variable/instrument-sans";
import "./couture.css";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Sparkle } from "../../../client/icons";
import { fixture, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";

// A crystal curtain: strands are long at the edges and short in the middle, so it frames the crest instead of crossing it.
const strands = (n: number, short: number, long: number) =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const edge = Math.abs(2 * t - 1) ** 1.6;
    return { x: 3 + t * 94, h: Math.round(short + (long - short) * edge + (i % 2 ? 0 : 12)), d: (i % 5) * 0.06, sw: 4.6 + (i % 4) * 0.7 };
  });

const CURTAIN = strands(15, 20, 104);
const FRINGE = strands(19, 8, 18);

function Chandelier({ list, cls }: { list: ReturnType<typeof strands>; cls: string }) {
  return (
    <div class={`chand ${cls}`} aria-hidden="true">
      {list.map((s, i) => (
        <span key={i} class="strand" style={{ left: `${s.x}%`, "--h": `${s.h}px`, "--d": `${s.d}s`, "--sw": `${s.sw}s` }}>
          <i class="drop" />
        </span>
      ))}
    </div>
  );
}

function Crystal({ cls = "" }: { cls?: string }) {
  return (
    <div class={`crys ${cls}`} aria-hidden="true">
      <span class="ln" />
      <svg viewBox="0 0 64 18">
        <path class="c-s" d="M20 9 L24 6 L28 9 L24 12Z M36 9 L40 6 L44 9 L40 12Z" />
        <path class="c-b" d="M32 0 L35 7 L42 9 L35 11 L32 18 L29 11 L22 9 L29 7Z" />
        <path class="c-f" d="M32 0 L32 18 M22 9 L42 9" />
      </svg>
      <span class="ln" />
    </div>
  );
}

function Gem({ cls = "" }: { cls?: string }) {
  return <i class={`gem ${cls}`} aria-hidden="true" />;
}

function Crest() {
  return (
    <svg class="crest" viewBox="0 0 100 108" aria-hidden="true">
      <defs>
        <linearGradient id="lc-foil" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#3a5677" />
          <stop offset="0.45" stop-color="#8aa3bd" />
          <stop offset="0.6" stop-color="#3f5d80" />
          <stop offset="1" stop-color="#7690ad" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#lc-foil)" stroke-linejoin="round" stroke-linecap="round">
        <path class="dr" pathLength={1} stroke-width="1.6" d="M24 32 L30 12 L40 24 L50 2 L60 24 L70 12 L76 32 Q50 25 24 32Z" />
        <circle class="dr" pathLength={1} cx="50" cy="68" r="36" stroke-width="1.4" />
        <circle class="dr d2" pathLength={1} cx="50" cy="68" r="31" stroke-width="0.7" />
      </g>
      <text x="51" y="84" text-anchor="middle" class="mono">
        D
      </text>
      <g class="gems">
        <circle cx="50" cy="3" r="3.2" fill="#3f86cf" />
        <circle cx="30" cy="12" r="2.2" fill="#8ec2ee" />
        <circle cx="70" cy="12" r="2.2" fill="#8ec2ee" />
        <circle cx="50" cy="24" r="2.4" fill="#e3a7bf" />
        <circle cx="50" cy="104" r="2.4" fill="#3f86cf" />
        <circle cx="14" cy="68" r="1.8" fill="#9fb4c9" />
        <circle cx="86" cy="68" r="1.8" fill="#9fb4c9" />
      </g>
    </svg>
  );
}

function Shell({ tab, children }: { tab: number; children: ComponentChildren }) {
  return (
    <div class="d-luxe-couture shell">
      <header class="mast">
        <span class="hello">{fixture.shell.hello}</span>
        <span class="online">
          <Gem cls="sm" />
          {fixture.shell.online}
        </span>
      </header>
      <nav class="tabs" aria-label="Flikar">
        {fixture.shell.tabs.map((name, i) => (
          <a key={name} href="#" class={i === tab ? "tab on" : "tab"} aria-current={i === tab ? "page" : undefined} onClick={(e) => e.preventDefault()}>
            {name}
          </a>
        ))}
      </nav>
      <Chandelier list={FRINGE} cls="fringe" />
      <main class="page">{children}</main>
    </div>
  );
}

function Landing() {
  const l = fixture.landing;
  return (
    <div class="d-luxe-couture landing">
      <span class="frame" aria-hidden="true" />
      <Chandelier list={CURTAIN} cls="curtain" />
      <Crest />
      <h1 class="title">
        <span class="script foil glint">Dilara</span> <span class="caps foil">fyller 3!</span>
      </h1>
      <Crystal />
      <p class="deck">{l.subtitle}</p>
      <figure class="cameo">
        <img src={l.photo} alt={l.photoAlt} />
      </figure>
      <form class="join" onSubmit={(e) => e.preventDefault()}>
        <label for="lc-name">{l.label}</label>
        <input id="lc-name" class="field" placeholder={l.placeholder} autocomplete="given-name" />
        <button class="gembtn" type="submit">
          <Gem />
          <span>{l.button}</span>
          <Gem />
          <span class="shine" aria-hidden="true" />
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
      <section class="quiz">
        <div class="qtop">
          <p class="kick">{q.progress}</p>
          <div class="clock" role="timer" aria-label={q.secondsLabel(left)}>
            <span key={left} class="secs">
              {left}
            </span>
            <span class="kick" aria-hidden="true">
              {q.secondsLabel(left).replace(/^\d+ /, "")}
            </span>
          </div>
          <div class="facets" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <i key={i} class={i < left ? "lit" : ""} />
            ))}
          </div>
        </div>
        <figure class="cut">
          <img src={q.photo} alt="" />
        </figure>
        <h2 class="qtext">{q.text}</h2>
        <ol class="opts">
          {q.options.map((o, i) => (
            <li key={o} style={{ "--i": i }}>
              <button type="button" class={i === pick ? "opt on" : "opt"} aria-pressed={i === pick} onClick={() => setPick(i)}>
                <span class="letter">{q.letters[i]}</span>
                <span class="otext">{o}</span>
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
        <span>{r.rank}</span>
      </span>
      <span class="name">
        {r.name}
        {r.you && <b class="youtag">{fixture.board.youTag}</b>}
      </span>
      {r.rank === 1 && <Crown />}
      <span class="score">{fixture.board.score(r.score)}</span>
    </li>
  );
}

function Crown() {
  return (
    <svg class="crown" viewBox="0 0 40 22" aria-hidden="true">
      <path d="M3 20 L6 6 L13 13 L20 2 L27 13 L34 6 L37 20 Q20 16 3 20Z" fill="#eef4fa" stroke="#5b7898" stroke-width="1.2" stroke-linejoin="round" />
      <circle cx="20" cy="3" r="2.2" fill="#3f86cf" />
      <circle cx="6" cy="6" r="1.6" fill="#8ec2ee" />
      <circle cx="34" cy="6" r="1.6" fill="#8ec2ee" />
      <circle cx="20" cy="14" r="1.8" fill="#e3a7bf" />
    </svg>
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
          <Sparkle class="sp s1" />
          <h2 class="word script foil glint">{r.verdict}</h2>
          <Sparkle class="sp s2" />
          <p class="pts">
            <span class="kick plus">{r.points}</span>
            <span class="tot">{r.total}</span>
          </p>
        </div>
        <section class="spread">
          <h3 class="kick head">{r.spread}</h3>
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
                <span class="bar">
                  <span />
                </span>
                <span class="n">{n}</span>
              </li>
            ))}
          </ul>
        </section>
        <Crystal cls="mid" />
        <section class="board" key={replay}>
          <h3 class="bhead">
            <span class="kick head">{b.title}</span>
            <small>{b.progress}</small>
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

type PlateProps = { p: GalleryPhoto; n: number; bump: number; left: number; onVote: () => void; onUnvote: () => void };

function Plate({ p, n, bump, left, onVote, onUnvote }: PlateProps) {
  const g = fixture.gallery;
  return (
    <li class={`plate${p.mine > 0 ? " voted" : ""}${p.own ? " own" : ""}`} style={{ "--i": n }}>
      <div class="cut">
        <img src={p.src} alt="" />
        {p.mine > 0 && (
          <span key={bump} class="badge" aria-hidden="true">
            ×{p.mine}
          </span>
        )}
        {p.mine > 0 && <span key={`g${bump}`} class="flash" aria-hidden="true" />}
      </div>
      {p.own ? (
        <p class="ownlabel">
          <Gem cls="sm" />
          {g.own}
          <Gem cls="sm" />
        </p>
      ) : (
        <>
          <p key={bump} class="mine">
            {g.mine(p.mine)}
          </p>
          <div class="ctl">
            <button type="button" class={p.mine === 0 ? "facet minus off" : "facet minus"} aria-label={g.unvote} onClick={onUnvote}>
              −
            </button>
            <span class="studs" aria-hidden="true">
              {Array.from({ length: 3 }, (_, i) => (
                <Gem key={i} cls={i < p.mine ? "sm" : "sm dim"} />
              ))}
            </span>
            <button type="button" class={left === 0 ? "facet plus off" : "facet plus"} aria-label={g.vote} onClick={onVote}>
              +
            </button>
          </div>
        </>
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
          bump={v.last === p.id ? tap : 0}
          left={v.votesLeft}
          onVote={() => (setTap(tap + 1), v.vote(p.id))}
          onUnvote={() => (setTap(tap + 1), v.unvote(p.id))}
        />
      ))}
    </ul>
  );
  return (
    <Shell tab={2}>
      <section class="gallery">
        <h2 class="ghead caps foil glint">{g.title}</h2>
        <Crystal />
        <div class="status">
          <span class="pips" aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => (
              <Gem key={`${i}${i < v.votesLeft}`} cls={i < v.votesLeft ? "" : "dim"} />
            ))}
          </span>
          <p class="kick">{g.left(v.votesLeft)}</p>
          <p class="hint">{g.hint(v.votesLeft)}</p>
        </div>
        {plates(v.current, 0)}
        <div class="famehead">
          <Crown />
          <h2 class="ghead caps foil">{g.fameTitle}</h2>
        </div>
        <p class="hint fametext">{g.fameText}</p>
        {plates(v.fame, v.current.length)}
      </section>
    </Shell>
  );
}

const BURST = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2;
  const r = 110 + (i % 3) * 28;
  return { x: Math.round(Math.cos(a) * r * 1.15), y: Math.round(Math.max(Math.sin(a) * r * 0.62, -64)), s: i % 3 === 1 ? 14 + (i % 2) * 4 : 8 + (i % 4) * 4, d: (i % 6) * 0.04, k: i % 3 };
});

const GLITTER = Array.from({ length: 22 }, (_, i) => ({ x: (i * 41 + 7) % 96, y: 14 + ((i * 29) % 80), s: 6 + (i % 4) * 3, d: ((i * 13) % 30) / 10 }));

function Finale() {
  const f = fixture.finale;
  const replay = useReplay(7000);
  return (
    <div class="d-luxe-couture finale" key={replay}>
      <span class="frame" aria-hidden="true" />
      <Chandelier list={CURTAIN} cls="curtain fin" />
      <div class="glitter" aria-hidden="true">
        {GLITTER.map((g, i) => (
          <span key={i} style={{ left: `${g.x}%`, top: `${g.y}%`, "--s": `${g.s}px`, "--d": `${g.d}s` }}>
            <Sparkle />
          </span>
        ))}
      </div>
      <div class="suspense" aria-hidden="true">
        <p class="sus script">{f.suspense}</p>
        <Crystal />
        <p class="kick">{f.suspenseSub}</p>
      </div>
      <section class="win">
        <p class="kick k1">{f.kicker}</p>
        <div class="stage" aria-hidden="true">
          {BURST.map((b, i) => (
            <span key={i} class={`burst k${b.k}`} style={{ "--x": `${b.x}px`, "--y": `${b.y}px`, "--s": `${b.s}px`, "--d": `${b.d}s` }}>
              {b.k === 1 ? <i /> : <Sparkle />}
            </span>
          ))}
          <Crest />
        </div>
        <h1 class="winner script foil glint">{f.winner}</h1>
        <p class="wpts">
          <Gem cls="sm" />
          {f.points}
          <Gem cls="sm" />
        </p>
        <figure class="best">
          <div class="cut">
            <img src={f.photo} alt={f.photoAlt} />
          </div>
          <figcaption>
            <span class="kick">{f.photoKicker}</span>
            <strong class="script">{f.photoWinner}</strong>
            <span class="sub">{f.photoSub}</span>
          </figcaption>
        </figure>
        <footer class="sig" aria-hidden="true">
          <Crystal />
          <span class="script">{fixture.landing.title}</span>
        </footer>
      </section>
    </div>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
