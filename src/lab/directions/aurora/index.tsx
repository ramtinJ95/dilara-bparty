import "@fontsource-variable/outfit";
import "./aurora.css";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Snowflake, Sparkle, Tiara } from "../../../client/icons";
import { fixture, VOTES_PER_GUEST, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";

const { shell, landing: L, quiz: Q, reveal: R, board: B, gallery: G, finale: F } = fixture;

function Sky({ children, class: extra = "" }: { children: ComponentChildren; class?: string }) {
  return (
    <div class={`d-aurora ${extra}`}>
      <div class="au-sky" aria-hidden="true">
        <i class="au-ribbon r1" />
        <i class="au-ribbon r2" />
        <i class="au-ribbon r3" />
        <i class="au-dust" />
      </div>
      {children}
    </div>
  );
}

function Shell({ tab, children }: { tab: number; children: ComponentChildren }) {
  return (
    <Sky class="au-shelled">
      <header class="au-top au-glass">
        <span class="au-hello">{shell.hello}</span>
        <span class="au-online">
          <i aria-hidden="true" />
          {shell.online}
        </span>
      </header>
      <main class="au-main">{children}</main>
      <nav class="au-tabs au-glass" aria-label="Flikar">
        {shell.tabs.map((t, i) => (
          <button type="button" key={t} class={i === tab ? "on" : ""} aria-current={i === tab ? "page" : undefined}>
            {t}
          </button>
        ))}
      </nav>
    </Sky>
  );
}

function Landing() {
  return (
    <Sky class="au-landing">
      <main class="au-land">
        <div class="au-halo">
          <i class="au-halo-ring" aria-hidden="true" />
          <img src={L.photo} alt={L.photoAlt} />
          <Sparkle class="au-spark s1" />
          <Sparkle class="au-spark s2" />
        </div>
        <h1>{L.title}</h1>
        <p class="au-sub">{L.subtitle}</p>
        <form class="au-card au-glass au-join" onSubmit={(e) => e.preventDefault()}>
          <label for="au-name">{L.label}</label>
          <input id="au-name" name="name" placeholder={L.placeholder} autocomplete="given-name" />
          <button type="submit" class="au-primary">
            {L.button}
          </button>
        </form>
      </main>
    </Sky>
  );
}

function Ring({ left, total }: { left: number; total: number }) {
  const c = 2 * Math.PI * 28;
  return (
    <div class="au-ring" role="timer" aria-label={Q.secondsLabel(left)}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="au-ring-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#4fc3e8" />
            <stop offset="0.55" stop-color="#5fd6b4" />
            <stop offset="1" stop-color="#a08ce8" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="28" class="track" />
        <circle cx="32" cy="32" r="28" class="arc" stroke-dasharray={c} stroke-dashoffset={c * (1 - left / total)} />
      </svg>
      <span key={left}>{left}</span>
    </div>
  );
}

function Quiz() {
  const { left, total } = useCountdown();
  const [pick, setPick] = useState<number>(Q.pick);
  return (
    <Shell tab={0}>
      <div class="au-qhead au-in">
        <span class="au-chip">{Q.progress}</span>
        <Ring left={left} total={total} />
      </div>
      <figure class="au-qphoto au-in">
        <img src={Q.photo} alt="" />
      </figure>
      <h2 class="au-question au-in">{Q.text}</h2>
      <div class="au-options">
        {Q.options.map((o, i) => (
          <button type="button" key={o} class={`au-opt au-glass${pick === i ? " on" : ""}`} aria-pressed={pick === i} onClick={() => setPick(i)} style={{ "--i": i }}>
            <span class="au-letter">{Q.letters[i]}</span>
            <span class="au-otext">{o}</span>
          </button>
        ))}
      </div>
    </Shell>
  );
}

const ROW = 44;

function Row({ r, me = false }: { r: BoardRow; me?: boolean }) {
  return (
    <li class={`au-row${r.rank === 1 ? " first" : ""}${me ? " me" : ""}`} style={{ "--from": `${(r.prev - r.rank) * ROW}px`, "--d": `${r.rank * 70}ms` }}>
      <span class="au-rank">{r.rank === 1 ? <Tiara /> : r.rank}</span>
      <span class="au-name">
        {r.name}
        {r.you && <em class="au-you">{B.youTag}</em>}
      </span>
      <span class="au-move" aria-hidden="true">
        {r.prev > r.rank ? "▲" : "▼"}
      </span>
      <span class="au-score">{B.score(r.score)}</span>
    </li>
  );
}

function Reveal() {
  const replay = useReplay(6000);
  const max = Math.max(...R.counts);
  return (
    <Shell tab={0}>
      <section class="au-verdict au-glass au-in">
        <Sparkle class="au-vspark" />
        <p class="au-right">{R.verdict}</p>
        <p class="au-points">{R.points}</p>
        <p class="au-total">{R.total}</p>
      </section>
      <section class="au-spread au-glass au-in" style={{ "--d": "120ms" }}>
        <h2>{R.spread}</h2>
        <ol>
          {R.counts.map((n, i) => (
            <li key={i} class={i === R.correct ? "right" : ""}>
              <span class="au-bar" style={{ "--h": n / max }}>
                <b>{n}</b>
              </span>
              <span class="au-blabel">
                {Q.letters[i]} {Q.options[i]}
              </span>
            </li>
          ))}
        </ol>
        <p class="au-legend">
          <span class="au-tick" aria-hidden="true">
            ✓
          </span>
          {R.rightAnswer}: {Q.options[R.correct]} · {R.yourGuess}: {Q.options[Q.pick]}
        </p>
      </section>
      <section class="au-board au-glass au-in" style={{ "--d": "220ms" }}>
        <div class="au-bhead">
          <h2>{B.title}</h2>
          <span>{B.progress}</span>
        </div>
        <ol key={replay}>
          {B.top.map((r) => (
            <Row key={r.name} r={r} />
          ))}
        </ol>
        <p class="au-place">{B.yourPlace}</p>
        <ol key={`me-${replay}`}>
          <Row r={B.me} me />
        </ol>
      </section>
    </Shell>
  );
}

function Pips({ left }: { left: number }) {
  return (
    <span class="au-pips" aria-hidden="true">
      {Array.from({ length: VOTES_PER_GUEST }, (_, i) => (
        <i key={i} class={i < left ? "full" : ""} />
      ))}
    </span>
  );
}

function Photo({ p, votes, i }: { p: GalleryPhoto; votes: ReturnType<typeof useVotes>; i: number }) {
  const popKey = votes.last === p.id ? `${p.id}-${p.mine}` : p.id;
  return (
    <li class={`au-photo au-glass${p.mine > 0 ? " voted" : ""}${p.own ? " own" : ""}`} style={{ "--i": i }}>
      <div class="au-pic">
        <img src={p.src} alt="" />
        {p.own && <span class="au-ownbadge">{G.own}</span>}
        {p.mine > 0 && (
          <span class="au-heart" key={popKey}>
            <Snowflake />
            {p.mine}
          </span>
        )}
        {votes.last === p.id && <i class="au-burst" key={`b-${popKey}`} aria-hidden="true" />}
      </div>
      {!p.own && (
        <div class="au-vote">
          <span class="au-mine">{G.mine(p.mine)}</span>
          <div class="au-vbtns">
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
      <h1 class="au-gtitle au-in">{G.title}</h1>
      <section class="au-status au-glass au-in" style={{ "--d": "80ms" }}>
        <Pips left={votes.votesLeft} />
        <div>
          <p class="au-left">{G.left(votes.votesLeft)}</p>
          <p class="au-hint">{G.hint(votes.votesLeft)}</p>
        </div>
      </section>
      <ul class="au-grid">
        {votes.current.map((p, i) => (
          <Photo key={p.id} p={p} votes={votes} i={i} />
        ))}
      </ul>
      <section class="au-fame au-in" style={{ "--d": "300ms" }}>
        <h2>
          <Sparkle class="au-fspark" />
          {G.fameTitle}
        </h2>
        <p>{G.fameText}</p>
        <ul class="au-grid">
          {votes.fame.map((p, i) => (
            <Photo key={p.id} p={p} votes={votes} i={i + 4} />
          ))}
        </ul>
      </section>
    </Shell>
  );
}

const BURST = Array.from({ length: 18 }, (_, i) => i);
const SNOW = Array.from({ length: 14 }, (_, i) => i);

function Finale() {
  const replay = useReplay(7000);
  return (
    <Sky class="au-finale" key={replay}>
      <div class="au-suspense">
        <div class="au-orb" aria-hidden="true" />
        <p class="au-sus">{F.suspense}</p>
        <p class="au-sussub">{F.suspenseSub}</p>
      </div>
      <main class="au-win">
        <div class="au-burstwrap" aria-hidden="true">
          {BURST.map((i) => (
            <i key={i} class={i % 3 === 0 ? "flake" : "dot"} style={{ "--a": `${i * 20}deg`, "--r": `${110 + (i % 4) * 26}px` }}>
              {i % 3 === 0 ? <Snowflake /> : i % 3 === 1 ? <Sparkle /> : null}
            </i>
          ))}
        </div>
        <div class="au-fall" aria-hidden="true">
          {SNOW.map((i) => (
            <i key={i} style={{ "--x": `${(i * 37) % 100}%`, "--t": `${5 + (i % 5)}s`, "--dl": `${1 + (i % 7) * 0.4}s`, "--s": `${10 + (i % 4) * 5}px` }}>
              <Snowflake />
            </i>
          ))}
        </div>
        <p class="au-kicker">{F.kicker}</p>
        <div class="au-crown">
          <Tiara />
        </div>
        <h1 class="au-winner">{F.winner}</h1>
        <p class="au-wpoints">{F.points}</p>
        <section class="au-recap au-glass">
          <img src={F.photo} alt={F.photoAlt} />
          <div>
            <p class="au-rkicker">{F.photoKicker}</p>
            <p class="au-rname">{F.photoWinner}</p>
            <p class="au-rsub">{F.photoSub}</p>
          </div>
        </section>
      </main>
    </Sky>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
