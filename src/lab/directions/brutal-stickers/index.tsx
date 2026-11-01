import "@fontsource/archivo-black/400.css";
import "@fontsource-variable/space-grotesk";
import "./brutal-stickers.css";
import type { ComponentChildren, JSX } from "preact";
import { useState } from "preact/hooks";
import { fixture, VOTES_PER_GUEST, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";

const { shell, landing: L, quiz: Q, reveal: R, board: B, gallery: G, finale: F } = fixture;

const INK = "#10204a";
const ink = { stroke: INK, "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round" } as const;

const ART = {
  crown: (
    <svg viewBox="0 0 56 44">
      <path d="M7 40L4 13L16 23L28 4L40 23L52 13L49 40Q28 34 7 40Z" fill="#e8eef5" {...ink} />
      <path d="M8 34Q28 28 48 34" fill="none" {...ink} stroke-width="2.4" />
      <circle cx="28" cy="25" r="4.5" fill="#ff9cc8" {...ink} stroke-width="2.4" />
      <circle cx="28" cy="5" r="3" fill="#8fd0ff" {...ink} stroke-width="2.2" />
      <circle cx="4" cy="13" r="2.6" fill="#fff" {...ink} stroke-width="2" />
      <circle cx="52" cy="13" r="2.6" fill="#fff" {...ink} stroke-width="2" />
    </svg>
  ),
  castle: (
    <svg viewBox="0 0 64 62">
      <path d="M4 60V22h14v38ZM46 60V22h14v38Z" fill="#cfeaff" {...ink} />
      <path d="M12 60V32h40v28Z" fill="#fff" {...ink} />
      <path d="M23 60V18h18v42Z" fill="#cfeaff" {...ink} />
      <path d="M2 22L11 6L20 22ZM44 22L53 6L62 22ZM21 18L32 1L43 18Z" fill="#d9c8ff" {...ink} />
      <path d="M27 60V48a5 5 0 0 1 10 0v12" fill="#8fd0ff" {...ink} />
      <circle cx="32" cy="30" r="3" fill="#ff9cc8" {...ink} stroke-width="2" />
    </svg>
  ),
  wand: (
    <svg viewBox="0 0 60 60">
      <path d="M8 56L30 30" {...ink} stroke-width="9" />
      <path d="M8 56L30 30" stroke="#e8eef5" stroke-width="3.5" stroke-linecap="round" />
      <path d="M40 2l5.6 11.4 12.4 1.8-9 8.8 2.1 12.4L40 30.6l-11.1 5.8 2.1-12.4-9-8.8 12.4-1.8Z" fill="#8fd0ff" {...ink} />
      <circle cx="40" cy="19" r="3" fill="#fff" />
    </svg>
  ),
  heart: (
    <svg viewBox="0 0 48 44">
      <path d="M24 41C6 29 1 18 7 10C13 3 21 6 24 12C27 6 35 3 41 10C47 18 42 29 24 41Z" fill="#ff9cc8" {...ink} />
      <path d="M12 14Q14 10 18 11" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 48 46">
      <path d="M24 3l6.5 13.2 14.5 2.1-10.5 10.2 2.5 14.5L24 36.2 11 43l2.5-14.5L3 18.3l14.5-2.1Z" fill="#fff" {...ink} />
      <path d="M24 12l3 7" stroke="#8fd0ff" stroke-width="3" stroke-linecap="round" />
    </svg>
  ),
  flake: (
    <svg viewBox="-26 -26 52 52">
      <circle r="23" fill="#8fd0ff" {...ink} />
      <g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round">
        {[0, 60, 120].map((a) => (
          <path key={a} transform={`rotate(${a})`} d="M0 -15V15M0 -9l-4 -4M0 -9l4 -4M0 9l-4 4M0 9l4 4" />
        ))}
      </g>
    </svg>
  ),
} satisfies Record<string, JSX.Element>;

type Kind = keyof typeof ART;

function St({ kind, class: c = "", style }: { kind: Kind; class?: string; style?: Record<string, string> }) {
  return (
    <span class={`bs-st ${c}`} style={style} aria-hidden="true">
      {ART[kind]}
    </span>
  );
}

function Ribbon({ children, class: c = "" }: { children: ComponentChildren; class?: string }) {
  return (
    <span class={`bs-ribbon ${c}`}>
      <span>
        <span>{children}</span>
      </span>
    </span>
  );
}

const SNOW = Array.from({ length: 14 }, (_, i) => i);

function Snow() {
  return (
    <div class="bs-snow" aria-hidden="true">
      {SNOW.map((i) => (
        <i key={i} style={{ "--x": `${(i * 41 + 7) % 100}%`, "--y": `${(i * 59) % 100}%`, "--s": `${5 + (i % 3) * 3}px`, "--dur": `${11 + (i % 4) * 2}s`, "--dl": `${-((i * 1.7) % 12)}s` }} />
      ))}
    </div>
  );
}

function Shell({ tab, children }: { tab: number; children: ComponentChildren }) {
  return (
    <div class="d-brutal-stickers">
      <Snow />
      <header class="bs-top">
        <span class="bs-hello bs-cut">{shell.hello}</span>
        <span class="bs-online">
          <i aria-hidden="true" />
          {shell.online}
        </span>
      </header>
      <nav class="bs-tabs" aria-label="Flikar">
        {shell.tabs.map((t, i) => (
          <button type="button" key={t} class={`bs-cut${i === tab ? " on" : ""}`} aria-current={i === tab ? "page" : undefined}>
            {t}
            {i === tab && <St kind="star" class="bs-tabstar" />}
          </button>
        ))}
      </nav>
      <main class="bs-main">{children}</main>
    </div>
  );
}

function Landing() {
  return (
    <div class="d-brutal-stickers bs-landing">
      <Snow />
      <main class="bs-land">
        <div class="bs-hero">
          <div class="bs-photo-st">
            <img src={L.photo} alt={L.photoAlt} />
          </div>
          <St kind="crown" class="h-crown" />
          <St kind="castle" class="h-castle" />
          <St kind="heart" class="h-heart" />
          <St kind="flake" class="h-flake" />
          <St kind="wand" class="h-wand" />
          <St kind="heart" class="h-heart2" />
        </div>
        <h1 class="bs-title">
          <span class="bs-name bs-cut">
            Dilara{" "}
            <St kind="crown" class="n-crown" />
          </span>
          <span class="bs-l2">
            <span class="bs-fyller bs-cut">fyller </span>
            <span class="bs-three">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <path d="M50 2l11 20 22-6-4 22 20 12-20 12 4 22-22-6-11 20-11-20-22 6 4-22L1 50l20-12-4-22 22 6Z" />
              </svg>
              <span>3!</span>
            </span>
          </span>
        </h1>
        <Ribbon class="bs-sub">{L.subtitle}</Ribbon>
        <form class="bs-join bs-cut" onSubmit={(e) => e.preventDefault()}>
          <label for="bs-name">{L.label}</label>
          <input id="bs-name" name="name" placeholder={L.placeholder} autocomplete="given-name" />
          <button type="submit" class="bs-btn">
            {L.button} <span aria-hidden="true">→</span>
          </button>
        </form>
      </main>
    </div>
  );
}

function Clock({ left, total }: { left: number; total: number }) {
  return (
    <div class={`bs-clock${left <= 5 ? " low" : ""}`} role="timer" aria-label={Q.secondsLabel(left)} style={{ "--p": left / total }}>
      <span key={left}>{left}</span>
    </div>
  );
}

function Quiz() {
  const { left, total } = useCountdown();
  const [pick, setPick] = useState<number>(Q.pick);
  return (
    <Shell tab={0}>
      <div class="bs-qhead bs-in">
        <Ribbon>{Q.progress}</Ribbon>
        <Clock left={left} total={total} />
      </div>
      <figure class="bs-cut bs-qphoto bs-peel bs-in" style={{ "--d": "80ms" }}>
        <img src={Q.photo} alt="" />
        <St kind="flake" class="q-flake" />
      </figure>
      <h2 class="bs-question bs-in" style={{ "--d": "140ms" }}>
        {Q.text}
      </h2>
      <div class="bs-options">
        {Q.options.map((o, i) => (
          <button type="button" key={o} class={`bs-opt bs-cut${pick === i ? " on" : ""}`} aria-pressed={pick === i} onClick={() => setPick(i)} style={{ "--i": i }}>
            <span class={`bs-letter l${i}`}>{Q.letters[i]}</span>
            <span class="bs-otext">{o}</span>
            {pick === i && <St kind="heart" class="bs-pickheart" />}
          </button>
        ))}
      </div>
    </Shell>
  );
}

const ROW = 48;

function Row({ r, me = false }: { r: BoardRow; me?: boolean }) {
  return (
    <li class={`bs-row bs-cut${r.rank === 1 ? " first" : ""}${me ? " me" : ""}`} style={{ "--from": `${(r.prev - r.rank) * ROW}px`, "--d": `${r.rank * 90}ms` }}>
      {r.rank === 1 ? (
        <span class="bs-badge">
          {ART.crown}
          <b>1</b>
        </span>
      ) : (
        <span class="bs-rank">{r.rank}</span>
      )}
      <span class="bs-name2">
        {r.name}
        {r.you && <em class="bs-you">{B.youTag}</em>}
      </span>
      <span class="bs-score">{B.score(r.score)}</span>
    </li>
  );
}

function Reveal() {
  const replay = useReplay(6000);
  const max = Math.max(...R.counts);
  return (
    <Shell tab={0}>
      <section class="bs-verdict bs-in">
        <span class="bs-burstst">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <path d="M50 2l9 16 17-8 1 18 18 3-9 16 13 13-17 6 3 18-18-3-6 17-11-14-11 14-6-17-18 3 3-18-17-6 13-13-9-16 18-3 1-18 17 8Z" />
          </svg>
          <span class="bs-right">{R.verdict}</span>
        </span>
        <div class="bs-vtext">
          <p class="bs-points bs-cut">{R.points}</p>
          <p class="bs-total">{R.total}</p>
        </div>
        <St kind="star" class="v-star" />
      </section>
      <section class="bs-cut bs-spread bs-in" style={{ "--d": "120ms" }}>
        <h2>{R.spread}</h2>
        <ol>
          {R.counts.map((n, i) => (
            <li key={i} class={i === R.correct ? "right" : ""}>
              <span class="bs-sl">{Q.letters[i]}</span>
              <span class="bs-track">
                <span class="bs-fill" style={{ "--w": n / max }}>
                  {Q.options[i]}
                </span>
              </span>
              <b>{n}</b>
            </li>
          ))}
        </ol>
        <p class="bs-legend">
          <span class="bs-tag">✓ {R.rightAnswer}</span>
          <span>
            {R.yourGuess}: {Q.options[Q.pick]}
          </span>
        </p>
      </section>
      <section class="bs-board bs-in" style={{ "--d": "200ms" }}>
        <div class="bs-bhead">
          <Ribbon class="pink">{B.title}</Ribbon>
          <span class="bs-small">{B.progress}</span>
        </div>
        <ol key={replay}>
          {B.top.map((r) => (
            <Row key={r.name} r={r} />
          ))}
        </ol>
        <p class="bs-place">{B.yourPlace}</p>
        <ol key={`me-${replay}`}>
          <Row r={B.me} me />
        </ol>
      </section>
    </Shell>
  );
}

function Photo({ p, votes, i }: { p: GalleryPhoto; votes: ReturnType<typeof useVotes>; i: number }) {
  const stamp = votes.last === p.id ? `${p.id}-${p.mine}` : p.id;
  return (
    <li class={`bs-photo bs-cut bs-peel${p.mine > 0 ? " voted" : ""}${p.own ? " own" : ""}`} style={{ "--i": i, "--tilt": `${i % 2 ? 1.8 : -1.6}deg` }}>
      <div class="bs-pic">
        <img src={p.src} alt="" />
        {p.own && <Ribbon class="bs-ownlabel">{G.own}</Ribbon>}
        {p.mine > 0 && (
          <span class="bs-stamp" key={stamp}>
            {ART.heart}
            <b>×{p.mine}</b>
          </span>
        )}
      </div>
      {!p.own && (
        <div class="bs-vote">
          <span class="bs-mine">{G.mine(p.mine)}</span>
          <div class="bs-vbtns">
            <button type="button" aria-label={G.unvote} disabled={p.mine === 0} onClick={() => votes.unvote(p.id)}>
              −
            </button>
            <button type="button" aria-label={G.vote} class={votes.votesLeft === 0 ? "spent" : ""} onClick={() => votes.vote(p.id)}>
              +
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Gallery() {
  const votes = useVotes();
  return (
    <Shell tab={2}>
      <div class="bs-ghead bs-in">
        <h1 class="bs-gtitle">{G.title}</h1>
        <span class="bs-pips" aria-hidden="true">
          {Array.from({ length: VOTES_PER_GUEST }, (_, i) => (
            <St key={i} kind="heart" class={i < votes.votesLeft ? "full" : "empty"} />
          ))}
        </span>
      </div>
      <section class="bs-cut bs-status bs-in" style={{ "--d": "80ms" }}>
        <p class="bs-left">{G.left(votes.votesLeft)}</p>
        <p class="bs-hint">{G.hint(votes.votesLeft)}</p>
      </section>
      <ul class="bs-grid">
        {votes.current.map((p, i) => (
          <Photo key={p.id} p={p} votes={votes} i={i} />
        ))}
      </ul>
      <section class="bs-fame bs-in" style={{ "--d": "300ms" }}>
        <h2>
          <Ribbon class="pink">{G.fameTitle}</Ribbon>
          <St kind="crown" class="f-crown" />
        </h2>
        <p>{G.fameText}</p>
        <ul class="bs-grid">
          {votes.fame.map((p, i) => (
            <Photo key={p.id} p={p} votes={votes} i={i + 4} />
          ))}
        </ul>
      </section>
    </Shell>
  );
}

const SLAPS: { kind: Kind; x: number; y: number; s: number; r: number }[] = [
  { kind: "heart", x: 6, y: 6, s: 40, r: -14 },
  { kind: "flake", x: 80, y: 4, s: 46, r: 10 },
  { kind: "star", x: 4, y: 30, s: 36, r: 12 },
  { kind: "castle", x: 76, y: 27, s: 58, r: 6 },
  { kind: "wand", x: 2, y: 48, s: 52, r: -8 },
  { kind: "heart", x: 85, y: 47, s: 34, r: 16 },
  { kind: "flake", x: 6, y: 64, s: 36, r: -6 },
  { kind: "star", x: 84, y: 62, s: 42, r: -12 },
  { kind: "heart", x: 44, y: 92, s: 34, r: 8 },
  { kind: "flake", x: 12, y: 91, s: 40, r: 14 },
  { kind: "star", x: 80, y: 91, s: 38, r: -6 },
  { kind: "crown", x: 64, y: 13, s: 38, r: 18 },
  { kind: "heart", x: 22, y: 15, s: 28, r: -20 },
];

function Finale() {
  const replay = useReplay(7000);
  return (
    <div class="d-brutal-stickers bs-finale" key={replay}>
      <Snow />
      <div class="bs-suspense">
        <div class="bs-sheet">
          <St kind="crown" class="s1" />
          <St kind="heart" class="s2" />
          <St kind="flake" class="s3" />
          <Ribbon class="bs-sus">{F.suspense}</Ribbon>
          <p class="bs-sussub bs-cut">{F.suspenseSub}</p>
        </div>
      </div>
      <div class="bs-slaps" aria-hidden="true">
        {SLAPS.map((s, i) => (
          <St key={i} kind={s.kind} style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.s}px`, "--r": `${s.r}deg`, "--dl": `${1.3 + i * 0.08}s` }} />
        ))}
      </div>
      <main class="bs-win">
        <Ribbon class="bs-kicker">{F.kicker}</Ribbon>
        <span class="bs-holocrown" aria-hidden="true">
          <span class="bs-holo-disc" />
          {ART.crown}
        </span>
        <h1 class="bs-winner">{F.winner}</h1>
        <p class="bs-wpoints bs-cut">{F.points}</p>
        <section class="bs-recap bs-cut">
          <Ribbon class="bs-rkicker pink">{F.photoKicker}</Ribbon>
          <img src={F.photo} alt={F.photoAlt} />
          <div>
            <p class="bs-rname">{F.photoWinner}</p>
            <p class="bs-rsub">{F.photoSub}</p>
          </div>
          <St kind="heart" class="r-heart" />
        </section>
      </main>
    </div>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
