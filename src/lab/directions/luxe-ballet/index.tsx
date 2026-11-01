import "@fontsource/parisienne/400.css";
import "@fontsource-variable/cormorant-garamond/wght.css";
import "@fontsource-variable/cormorant-garamond/wght-italic.css";
import "./ballet.css";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Sparkle } from "../../../client/icons";
import { fixture, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";

type Pt = { x: number; y: number };

// Pearls hung along a swag between two points, sagging by `sag` at the middle.
const swag = (n: number, a: Pt, b: Pt, sag: number): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + sag * 4 * t * (1 - t) };
  });

const ring = (n: number, cx: number, cy: number, rx: number, ry: number): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });

const TOP_SWAGS = [...swag(17, { x: -6, y: 4 }, { x: 196, y: 4 }, 34), ...swag(17, { x: 194, y: 4 }, { x: 396, y: 4 }, 34)];
const TOP_LOW = swag(30, { x: -6, y: 2 }, { x: 396, y: 2 }, 58);
const MEDALLION = ring(36, 110, 132, 104, 126);
const BOTTOM = [...swag(17, { x: -6, y: 58 }, { x: 196, y: 58 }, -30), ...swag(17, { x: 194, y: 58 }, { x: 396, y: 58 }, -30)];
const CLOCK = ring(20, 48, 48, 40, 40);

function PearlDefs() {
  return (
    <svg class="defs" aria-hidden="true" width="0" height="0">
      <defs>
        <radialGradient id="bp-pearl" cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset="0.45" stop-color="#f4f2f6" />
          <stop offset="0.8" stop-color="#d9dfe9" />
          <stop offset="1" stop-color="#c3cddb" />
        </radialGradient>
        <radialGradient id="bp-blush" cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset="0.5" stop-color="#fbe9ef" />
          <stop offset="1" stop-color="#e7bccb" />
        </radialGradient>
        <linearGradient id="bp-satin" x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stop-color="#b9d5ee" />
          <stop offset="0.2" stop-color="#e9f3fc" />
          <stop offset="0.4" stop-color="#9dc3e6" />
          <stop offset="0.6" stop-color="#dcebf9" />
          <stop offset="0.8" stop-color="#94bce3" />
          <stop offset="1" stop-color="#cfe3f5" />
        </linearGradient>
        <linearGradient id="bp-rose" x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stop-color="#f6d3de" />
          <stop offset="0.25" stop-color="#fdf1f5" />
          <stop offset="0.5" stop-color="#eeb5c8" />
          <stop offset="0.75" stop-color="#fbe4ec" />
          <stop offset="1" stop-color="#e9aac0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Pearls({ pts, r, cls, blush = 0, view }: { pts: Pt[]; r: number; cls: string; blush?: number; view: string }) {
  return (
    <svg class={`pearls ${cls}`} viewBox={view} aria-hidden="true">
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={r} fill={blush && i % blush === 0 ? "url(#bp-blush)" : "url(#bp-pearl)"} style={{ "--i": i }} />
      ))}
    </svg>
  );
}

function Bow({ cls = "", tone = "rose" }: { cls?: string; tone?: "rose" | "satin" }) {
  const fill = `url(#bp-${tone})`;
  return (
    <svg class={`bow ${cls}`} viewBox="0 0 80 56" aria-hidden="true">
      <g stroke={tone === "rose" ? "#d996ad" : "#86afd8"} stroke-width="0.8" stroke-linejoin="round">
        <path class="tail l" d="M38 24 C30 34 24 44 14 54 L22 54 L26 48 L30 52 C34 42 38 34 40 26Z" fill={fill} />
        <path class="tail r" d="M42 24 C50 34 56 44 66 54 L58 54 L54 48 L50 52 C46 42 42 34 40 26Z" fill={fill} />
        <path class="loop l" d="M40 22 C30 6 8 2 6 14 C4 26 24 30 40 24Z" fill={fill} />
        <path class="loop r" d="M40 22 C50 6 72 2 74 14 C76 26 56 30 40 24Z" fill={fill} />
        <ellipse cx="40" cy="23" rx="6" ry="5.5" fill={fill} />
      </g>
    </svg>
  );
}

const FLAKES = Array.from({ length: 30 }, (_, i) => {
  const layer = i % 3;
  return { x: (i * 37 + 5) % 100, d: -((i * 1.7) % 14), layer, drift: ((i * 13) % 24) - 12 };
});

function Snow() {
  return (
    <div class="snow" aria-hidden="true">
      {FLAKES.map((f, i) => (
        <i key={i} class={`f l${f.layer}`} style={{ left: `${f.x}%`, "--d": `${f.d}s`, "--dx": `${f.drift}px`, "--y": `${(f.x * 7) % 96}%` }} />
      ))}
    </div>
  );
}

function Shell({ tab, children }: { tab: number; children: ComponentChildren }) {
  return (
    <div class="d-luxe-ballet shell">
      <PearlDefs />
      <Snow />
      <svg class="corner-ribbon" viewBox="0 0 200 120" aria-hidden="true">
        <path class="rib" pathLength={1} d="M210 6 C160 10 150 60 120 50 C92 40 116 10 136 26 C150 38 120 84 60 92 C30 96 10 110 -10 118" stroke="url(#bp-rose)" stroke-width="6" fill="none" stroke-linecap="round" />
      </svg>
      <header class="mast">
        <span class="hello">{fixture.shell.hello}</span>
        <span class="online">
          <i class="pearl" aria-hidden="true" />
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
      <main class="page">{children}</main>
    </div>
  );
}

function Landing() {
  const l = fixture.landing;
  return (
    <div class="d-luxe-ballet landing">
      <PearlDefs />
      <Snow />
      <Pearls pts={TOP_LOW} r={4} cls="top low" view="0 0 390 70" />
      <Pearls pts={TOP_SWAGS} r={5} cls="top" blush={4} view="0 0 390 50" />
      <svg class="sweep" viewBox="0 0 390 300" aria-hidden="true">
        <path class="rib blue" pathLength={1} d="M-20 230 C60 150 120 260 190 190 C250 130 300 40 340 80 C372 112 330 150 306 122 C286 98 330 50 410 40" stroke="url(#bp-satin)" stroke-width="12" fill="none" stroke-linecap="round" />
        <path class="rib pink" pathLength={1} d="M-20 260 C70 200 130 290 210 220 C270 166 300 110 350 120 C380 126 390 150 410 150" stroke="url(#bp-rose)" stroke-width="6" fill="none" stroke-linecap="round" />
      </svg>
      <p class="kicker">En vintersaga</p>
      <h1 class="title">
        <span class="name">Dilara</span> <span class="sub">fyller 3!</span>
      </h1>
      <figure class="medallion">
        <img src={l.photo} alt={l.photoAlt} />
        <Pearls pts={MEDALLION} r={5.4} cls="frame" blush={5} view="0 0 220 264" />
        <Bow cls="mbow" />
      </figure>
      <p class="deck">{l.subtitle}</p>
      <form class="join" onSubmit={(e) => e.preventDefault()}>
        <label for="lb-name">{l.label}</label>
        <input id="lb-name" class="field" placeholder={l.placeholder} autocomplete="given-name" />
        <button class="pearlbtn" type="submit">
          <span>{l.button}</span>
          <i class="sheen" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

function Quiz() {
  const q = fixture.quiz;
  const [pick, setPick] = useState<number>(q.pick);
  const { left } = useCountdown();
  const [at = 0, of = 0] = (q.progress.match(/\d+/g) ?? []).map(Number);
  return (
    <Shell tab={0}>
      <section class="quiz">
        <div class="qtop">
          <div class="act">
            <p class="prog">{q.progress}</p>
            <span class="beads" aria-hidden="true">
              {Array.from({ length: of }, (_, i) => (
                <i key={i} class={i < at ? "pearl" : "pearl off"} />
              ))}
            </span>
          </div>
          <div class="clock" role="timer" aria-label={q.secondsLabel(left)}>
            <svg viewBox="0 0 96 96" aria-hidden="true">
              {CLOCK.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={i < left ? 6.4 : 2.6} class={i < left ? "on" : "off"} fill={i < left ? (i % 5 === 0 ? "url(#bp-blush)" : "url(#bp-pearl)") : "none"} />
              ))}
            </svg>
            <span key={left} class="secs">
              {left}
            </span>
          </div>
        </div>
        <p class="secslabel" aria-hidden="true">
          {q.secondsLabel(left)}
        </p>
        <figure class="tied">
          <img src={q.photo} alt="" />
          <span class="band" aria-hidden="true" />
          <Bow cls="tbow" tone="satin" />
        </figure>
        <h2 class="qtext">{q.text}</h2>
        <ol class="opts">
          {q.options.map((o, i) => (
            <li key={o} style={{ "--i": i }}>
              <button type="button" class={i === pick ? "opt on" : "opt"} aria-pressed={i === pick} onClick={() => setPick(i)}>
                <span key={i === pick ? "on" : "off"} class="letter">
                  {q.letters[i]}
                </span>
                <span class="otext">{o}</span>
                {i === pick && <Bow cls="obow" />}
              </button>
            </li>
          ))}
        </ol>
      </section>
    </Shell>
  );
}

function Tiara() {
  return (
    <svg class="tiara" viewBox="0 0 80 44" aria-hidden="true">
      <path d="M6 40 L12 16 L26 30 L40 4 L54 30 L68 16 L74 40 Q40 32 6 40Z" fill="url(#bp-satin)" stroke="#5f7ea3" stroke-width="1.4" stroke-linejoin="round" />
      <circle cx="40" cy="5" r="4.6" fill="url(#bp-blush)" stroke="#d9a3b8" stroke-width="0.6" />
      <circle cx="12" cy="16" r="3.4" fill="url(#bp-pearl)" stroke="#b8c6d6" stroke-width="0.6" />
      <circle cx="68" cy="16" r="3.4" fill="url(#bp-pearl)" stroke="#b8c6d6" stroke-width="0.6" />
      {[18, 26, 34, 40, 46, 54, 62].map((x) => (
        <circle key={x} cx={x} cy={36 - Math.abs(x - 40) * 0.05} r="2.2" fill="url(#bp-pearl)" />
      ))}
    </svg>
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

function Swash({ cls = "" }: { cls?: string }) {
  return (
    <svg class={`swash ${cls}`} viewBox="0 0 220 30" aria-hidden="true">
      <path class="rib" pathLength={1} d="M4 18 C50 4 80 30 112 16 C140 4 150 26 132 26 C118 26 126 8 160 10 C186 12 200 20 216 14" stroke="url(#bp-satin)" stroke-width="5" fill="none" stroke-linecap="round" />
      <path class="rib d2" pathLength={1} d="M14 24 C60 14 90 30 120 22 C150 14 180 26 210 20" stroke="url(#bp-rose)" stroke-width="2.5" fill="none" stroke-linecap="round" />
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
          <h2 class="word">{r.verdict}</h2>
          <Swash />
          <p class="pts">
            <strong>{r.points}</strong>
            <span>{r.total}</span>
          </p>
        </div>
        <section class="card spread">
          <Bow cls="cbow" />
          <h3>{r.spread}</h3>
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
        <section class="card board" key={replay}>
          <h3>
            {b.title}
            <small>{b.progress}</small>
          </h3>
          <ol>
            {b.top.map((row, i) => (
              <Row key={row.name} r={row} slot={i} />
            ))}
          </ol>
          <p class="place">{b.yourPlace}</p>
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
      <div class="photo">
        <img src={p.src} alt="" />
        {p.mine > 0 && <Bow key={`b${bump}`} cls="vbow" tone="satin" />}
        {p.mine > 0 && (
          <span key={bump} class="badge" aria-hidden="true">
            ×{p.mine}
          </span>
        )}
        {p.own && <span class="banner">{g.own}</span>}
      </div>
      {!p.own && (
        <p key={bump} class="mine">
          {g.mine(p.mine)}
        </p>
      )}
      {!p.own && (
        <div class="ctl">
          <button type="button" class={p.mine === 0 ? "pb off" : "pb"} aria-label={g.unvote} onClick={onUnvote}>
            −
          </button>
          <span class="beads" aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => (
              <i key={i} class={i < p.mine ? "pearl" : "pearl off"} />
            ))}
          </span>
          <button type="button" class={left === 0 ? "pb off" : "pb plus"} aria-label={g.vote} onClick={onVote}>
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
        <h2 class="ghead">{g.title}</h2>
        <Swash cls="gs" />
        <div class="status">
          <span class="pips" aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => (
              <i key={`${i}${i < v.votesLeft}`} class={i < v.votesLeft ? "pearl" : "pearl off"} />
            ))}
          </span>
          <p class="left">{g.left(v.votesLeft)}</p>
          <p class="hint">{g.hint(v.votesLeft)}</p>
        </div>
        {plates(v.current, 0)}
        <div class="famehead">
          <Tiara />
          <h2 class="ghead small">{g.fameTitle}</h2>
        </div>
        <p class="hint">{g.fameText}</p>
        {plates(v.fame, v.current.length)}
      </section>
    </Shell>
  );
}

const PETALS = Array.from({ length: 26 }, (_, i) => ({
  x: (i * 29 + 9) % 100,
  d: ((i * 7) % 13) / 10,
  k: ["petal", "spark", "flake", "petal", "pearl", "spark"][i % 6]!,
  dx: ((i * 17) % 60) - 30,
  r: (i * 53) % 360,
}));

function Finale() {
  const f = fixture.finale;
  const replay = useReplay(7000);
  return (
    <div class="d-luxe-ballet finale" key={replay}>
      <PearlDefs />
      <Snow />
      <div class="flurry" aria-hidden="true">
        {PETALS.map((p, i) => (
          <span key={i} class={`fl ${p.k}`} style={{ left: `${p.x}%`, "--d": `${p.d}s`, "--dx": `${p.dx}px`, "--r": `${p.r}deg` }}>
            {p.k === "spark" && <Sparkle />}
          </span>
        ))}
      </div>
      <svg class="sweep fin" viewBox="0 0 390 300" aria-hidden="true">
        <path class="rib blue" pathLength={1} d="M-20 120 C60 40 110 200 190 160 C260 124 250 40 300 50 C350 60 330 120 300 110 C270 100 320 20 410 30" stroke="url(#bp-satin)" stroke-width="10" fill="none" stroke-linecap="round" />
        <path class="rib pink" pathLength={1} d="M-20 170 C70 110 140 230 220 180 C280 140 320 90 410 100" stroke="url(#bp-rose)" stroke-width="5" fill="none" stroke-linecap="round" />
      </svg>
      <div class="drape l" aria-hidden="true" />
      <div class="drape r" aria-hidden="true" />
      <div class="valance" aria-hidden="true">
        <Pearls pts={TOP_SWAGS} r={5} cls="top" blush={4} view="0 0 390 50" />
      </div>
      <div class="suspense" aria-hidden="true">
        <p class="sus">{f.suspense}</p>
        <p class="susb">{f.suspenseSub}</p>
      </div>
      <section class="win">
        <p class="k1">{f.kicker}</p>
        <div class="crownwrap">
          <Tiara />
        </div>
        <h1 class="winner">{f.winner}</h1>
        <p class="wpts">{f.points}</p>
        <figure class="best">
          <Bow cls="bbow" />
          <div class="photo">
            <img src={f.photo} alt={f.photoAlt} />
          </div>
          <figcaption>
            <span class="bk">{f.photoKicker}</span>
            <strong>{f.photoWinner}</strong>
            <span class="sub">{f.photoSub}</span>
          </figcaption>
        </figure>
      </section>
      <Pearls pts={BOTTOM} r={4.6} cls="bottom" blush={3} view="0 0 390 60" />
    </div>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
