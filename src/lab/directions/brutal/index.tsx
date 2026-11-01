import "@fontsource/archivo-black/400.css";
import "@fontsource-variable/space-grotesk";
import "./brutal.css";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Snowflake, Sparkle, Tiara } from "../../../client/icons";
import { fixture, VOTES_PER_GUEST, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";

const { shell, landing: L, quiz: Q, reveal: R, board: B, gallery: G, finale: F } = fixture;

function Shell({ tab, children }: { tab: number; children: ComponentChildren }) {
  return (
    <div class="d-brutal">
      <header class="br-top">
        <span class="br-hello">{shell.hello}</span>
        <span class="br-online">
          <i aria-hidden="true" />
          {shell.online}
        </span>
      </header>
      <nav class="br-tabs" aria-label="Flikar">
        {shell.tabs.map((t, i) => (
          <button type="button" key={t} class={i === tab ? "on" : ""} aria-current={i === tab ? "page" : undefined}>
            {t}
          </button>
        ))}
      </nav>
      <main class="br-main">{children}</main>
    </div>
  );
}

const TICKER = ["Kalas", "Snö", "Glitter", "Is", "Kalas", "Snö", "Glitter", "Is"];

function Landing() {
  return (
    <div class="d-brutal br-landing">
      <div class="br-ticker" aria-hidden="true">
        <div>
          {[...TICKER, ...TICKER].map((w, i) => (
            <span key={i}>
              {w} <Snowflake />
            </span>
          ))}
        </div>
      </div>
      <main class="br-land">
        <div class="br-polaroid">
          <i class="br-tape" aria-hidden="true" />
          <img src={L.photo} alt={L.photoAlt} />
          <span class="br-three" aria-hidden="true">
            3
          </span>
        </div>
        <h1 class="br-title">
          <span>Dilara </span>
          <span>fyller </span>
          <span class="hl">3!</span>
        </h1>
        <p class="br-sub">{L.subtitle}</p>
        <form class="br-join" onSubmit={(e) => e.preventDefault()}>
          <label for="br-name">{L.label}</label>
          <input id="br-name" name="name" placeholder={L.placeholder} autocomplete="given-name" />
          <button type="submit" class="br-btn">
            {L.button} <span aria-hidden="true">→</span>
          </button>
        </form>
      </main>
    </div>
  );
}

function Clock({ left, total }: { left: number; total: number }) {
  return (
    <div class="br-clock" role="timer" aria-label={Q.secondsLabel(left)}>
      <span class={`br-num${left <= 5 ? " low" : ""}`} key={left}>
        {left}
      </span>
      <span class="br-cells" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} class={i < left ? "full" : ""} />
        ))}
      </span>
    </div>
  );
}

function Quiz() {
  const { left, total } = useCountdown();
  const [pick, setPick] = useState<number>(Q.pick);
  return (
    <Shell tab={0}>
      <div class="br-qhead br-in">
        <span class="br-label">{Q.progress}</span>
        <Clock left={left} total={total} />
      </div>
      <figure class="br-frame br-qphoto br-in" style={{ "--d": "80ms" }}>
        <img src={Q.photo} alt="" />
      </figure>
      <h2 class="br-question br-in" style={{ "--d": "140ms" }}>
        {Q.text}
      </h2>
      <div class="br-options">
        {Q.options.map((o, i) => (
          <button type="button" key={o} class={`br-opt${pick === i ? " on" : ""}`} aria-pressed={pick === i} onClick={() => setPick(i)} style={{ "--i": i }}>
            <span class="br-letter">{Q.letters[i]}</span>
            <span class="br-otext">{o}</span>
            {pick === i && (
              <span class="br-check" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
    </Shell>
  );
}

const ROW = 48;

function Row({ r, me = false }: { r: BoardRow; me?: boolean }) {
  return (
    <li class={`br-row${r.rank === 1 ? " first" : ""}${me ? " me" : ""}`} style={{ "--from": `${(r.prev - r.rank) * ROW}px`, "--d": `${r.rank * 90}ms` }}>
      <span class="br-rank">{r.rank}</span>
      <span class="br-name">
        {r.name}
        {r.rank === 1 && <Tiara />}
        {r.you && <em class="br-you">{B.youTag}</em>}
      </span>
      <span class="br-score">{B.score(r.score)}</span>
    </li>
  );
}

function Reveal() {
  const replay = useReplay(6000);
  const max = Math.max(...R.counts);
  return (
    <Shell tab={0}>
      <section class="br-verdict br-in">
        <p class="br-right">{R.verdict}</p>
        <p class="br-points">{R.points}</p>
        <p class="br-total">{R.total}</p>
      </section>
      <section class="br-card br-spread br-in" style={{ "--d": "120ms" }}>
        <h2>{R.spread}</h2>
        <ol>
          {R.counts.map((n, i) => (
            <li key={i} class={i === R.correct ? "right" : ""}>
              <span class="br-sl">{Q.letters[i]}</span>
              <span class="br-track">
                <span class="br-fill" style={{ "--w": n / max }}>
                  {Q.options[i]}
                </span>
              </span>
              <b>{n}</b>
            </li>
          ))}
        </ol>
        <p class="br-legend">
          <span class="br-tag">✓ {R.rightAnswer}</span>
          <span>
            {R.yourGuess}: {Q.options[Q.pick]}
          </span>
        </p>
      </section>
      <section class="br-board br-in" style={{ "--d": "200ms" }}>
        <div class="br-bhead">
          <h2>{B.title}</h2>
          <span class="br-label small">{B.progress}</span>
        </div>
        <ol key={replay}>
          {B.top.map((r) => (
            <Row key={r.name} r={r} />
          ))}
        </ol>
        <p class="br-place">{B.yourPlace}</p>
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
    <li class={`br-photo${p.mine > 0 ? " voted" : ""}${p.own ? " own" : ""}`} style={{ "--i": i, "--tilt": `${i % 2 ? 1.6 : -1.4}deg` }}>
      <div class="br-pic">
        <img src={p.src} alt="" />
        {p.own && <span class="br-ownlabel">{G.own}</span>}
        {p.mine > 0 && (
          <span class="br-stamp" key={stamp}>
            ×{p.mine}
          </span>
        )}
      </div>
      {!p.own && (
        <div class="br-vote">
          <span class="br-mine">{G.mine(p.mine)}</span>
          <div class="br-vbtns">
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
      <div class="br-ghead br-in">
        <h1 class="br-gtitle">{G.title}</h1>
        <span class="br-pips" aria-hidden="true">
          {Array.from({ length: VOTES_PER_GUEST }, (_, i) => (
            <i key={i} class={i < votes.votesLeft ? "full" : ""} />
          ))}
        </span>
      </div>
      <section class="br-card br-status br-in" style={{ "--d": "80ms" }}>
        <p class="br-left">{G.left(votes.votesLeft)}</p>
        <p class="br-hint">{G.hint(votes.votesLeft)}</p>
      </section>
      <ul class="br-grid">
        {votes.current.map((p, i) => (
          <Photo key={p.id} p={p} votes={votes} i={i} />
        ))}
      </ul>
      <section class="br-fame br-in" style={{ "--d": "300ms" }}>
        <h2>
          <span>{G.fameTitle}</span>
          <Sparkle class="br-fspark" />
        </h2>
        <p>{G.fameText}</p>
        <ul class="br-grid">
          {votes.fame.map((p, i) => (
            <Photo key={p.id} p={p} votes={votes} i={i + 4} />
          ))}
        </ul>
      </section>
    </Shell>
  );
}

const CONFETTI = Array.from({ length: 40 }, (_, i) => i);
const SHAPES = ["sq", "bar", "dot", "flake"] as const;

function Finale() {
  const replay = useReplay(7000);
  return (
    <div class="d-brutal br-finale" key={replay}>
      <div class="br-suspense">
        <span class="br-drum" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <p class="br-sus">{F.suspense}</p>
        <p class="br-sussub">{F.suspenseSub}</p>
      </div>
      <i class="br-rays" aria-hidden="true" />
      <div class="br-confetti" aria-hidden="true">
        {CONFETTI.map((i) => {
          const shape = SHAPES[i % SHAPES.length]!;
          return (
            <i
              key={i}
              class={`${shape} c${i % 4}`}
              style={{ "--x": `${(i * 41) % 100}%`, "--y": `${(i * 53) % 95}%`, "--dx": `${((i * 29) % 80) - 40}px`, "--r": `${(i % 2 ? 1 : -1) * (180 + (i % 5) * 90)}deg`, "--dl": `${-((i * 0.37) % 4)}s`, "--dur": `${3.6 + (i % 4) * 0.6}s` }}
            >
              {shape === "flake" && <Snowflake />}
            </i>
          );
        })}
      </div>
      <main class="br-win">
        <p class="br-kicker">{F.kicker}</p>
        <div class="br-crown">
          <Tiara />
        </div>
        <h1 class="br-winner">{F.winner}</h1>
        <p class="br-wpoints">{F.points}</p>
        <section class="br-recap">
          <span class="br-rkicker">{F.photoKicker}</span>
          <img src={F.photo} alt={F.photoAlt} />
          <div>
            <p class="br-rname">{F.photoWinner}</p>
            <p class="br-rsub">{F.photoSub}</p>
          </div>
        </section>
      </main>
    </div>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
