import "@fontsource-variable/cinzel";
import "@fontsource-variable/lexend";
import "./crystal.css";
import { useState } from "preact/hooks";
import { CheckIcon, Snowflake, Sparkle } from "../../../client/icons";
import { fixture, VOTES_PER_GUEST, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";
import { Crown, Facets, Gem, Shell, Twinkles } from "./parts";

const { landing: L, quiz: Q, reveal: R, board: B, gallery: G, finale: F } = fixture;

function Landing() {
  return (
    <div class="d-crystal cr-page cr-landing">
      <Facets />
      <Twinkles />
      <header class="cr-hero">
        <p class="cr-kicker cr-in" style={{ "--i": 0 }}>
          <Snowflake />
          {L.subtitle}
          <Snowflake />
        </p>
        <h1 class="cr-title cr-in" style={{ "--i": 1 }}>
          Dilara fyller <span class="cr-three">3</span>!
        </h1>
      </header>
      <div class="cr-portrait cr-in" style={{ "--i": 2 }}>
        <div class="cr-portrait-cut">
          <img src={L.photo} alt={L.photoAlt} width={240} height={240} />
        </div>
        <span class="cr-glint" aria-hidden="true" />
        <Gem class="cr-portrait-gem cr-portrait-gem-l" tone="rose" />
        <Gem class="cr-portrait-gem cr-portrait-gem-r" tone="lilac" />
      </div>
      <form class="cr-join cr-facet cr-in" style={{ "--i": 3 }} onSubmit={(e) => e.preventDefault()}>
        <label for="cr-name">{L.label}</label>
        <input id="cr-name" name="name" autocomplete="given-name" placeholder={L.placeholder} />
        <button type="submit" class="cr-button">
          <span>{L.button}</span>
        </button>
      </form>
    </div>
  );
}

const SEGMENTS = Array.from({ length: Q.seconds }, (_, i) => {
  const at = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  };
  const a0 = -90 + (i * 360) / Q.seconds + 1.4;
  const a1 = a0 + 360 / Q.seconds - 2.8;
  return `M${at(a0, 48)}L${at(a1, 48)}L${at(a1, 37)}L${at(a0, 37)}Z`;
});
const TABLE = Array.from({ length: 8 }, (_, i) => (i * 45 - 22.5) * (Math.PI / 180));
const ring = (r: number) => TABLE.map((a) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`).join(" ");

function GemClock() {
  const { left } = useCountdown();
  return (
    <div class={`cr-clock${left <= 5 ? " is-low" : ""}`} role="timer" aria-label={Q.secondsLabel(left)}>
      <svg viewBox="-50 -50 100 100" aria-hidden="true">
        {SEGMENTS.map((d, i) => (
          <path key={i} d={d} class={i < left ? (i === left - 1 ? "on edge" : "on") : "off"} style={{ "--k": i }} />
        ))}
        <polygon points={ring(34)} class="cr-clock-girdle" />
        <polygon points={ring(23)} class="cr-clock-table" />
        {TABLE.map((a, i) => (
          <line key={i} x1={Math.cos(a) * 23} y1={Math.sin(a) * 23} x2={Math.cos(a) * 34} y2={Math.sin(a) * 34} class="cr-clock-facet" />
        ))}
      </svg>
      <span class="cr-clock-n" key={left}>
        {left}
      </span>
    </div>
  );
}

function Quiz() {
  const [pick, setPick] = useState<number>(Q.pick);
  return (
    <Shell tab={0}>
      <section class="cr-quiz">
        <div class="cr-quiz-head cr-in" style={{ "--i": 0 }}>
          <div>
            <p class="cr-progress">{Q.progress}</p>
            <div class="cr-steps" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <i key={i} class={i < 2 ? "done" : i === 2 ? "now" : ""} />
              ))}
            </div>
          </div>
          <GemClock />
        </div>
        <div class="cr-qcard cr-facet cr-in" style={{ "--i": 1 }}>
          <img src={Q.photo} alt="" width={120} height={120} />
          <h2>{Q.text}</h2>
        </div>
        <ul class="cr-options">
          {Q.options.map((o, i) => (
            <li key={o} class="cr-in" style={{ "--i": 2 + i }}>
              <button type="button" class={`cr-option${pick === i ? " is-picked" : ""}`} aria-pressed={pick === i} onClick={() => setPick(i)}>
                <span class="cr-letter">{Q.letters[i]}</span>
                <span class="cr-option-text">{o}</span>
                {pick === i && <Sparkle class="cr-option-spark" />}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}

const ROW = 46;

function BoardLine({ row, place }: { row: BoardRow; place: number }) {
  return (
    <li class={`cr-row${row.rank === 1 ? " is-first" : ""}${row.you ? " is-you" : ""}`} style={{ "--from": `${(row.prev - row.rank) * ROW}px`, "--i": place }}>
      <span class="cr-rank">
        <span>{row.rank}</span>
      </span>
      <span class="cr-name">
        {row.name}
        {row.you && <em class="cr-you">{B.youTag}</em>}
      </span>
      {row.rank === 1 && <Crown />}
      <span class="cr-score">{B.score(row.score)}</span>
    </li>
  );
}

function Reveal() {
  const replay = useReplay(6000);
  const max = Math.max(...R.counts);
  return (
    <Shell tab={0}>
      <section class="cr-reveal">
        <div class="cr-verdict cr-facet cr-in" style={{ "--i": 0 }}>
          <Gem class="cr-verdict-gem" />
          <div>
            <p class="cr-verdict-word">{R.verdict}</p>
            <p class="cr-verdict-total">{R.total}</p>
          </div>
          <p class="cr-verdict-points">{R.points}</p>
        </div>
        <div class="cr-spread cr-facet cr-in" style={{ "--i": 1 }}>
          <h2>{R.spread}</h2>
          <ul>
            {Q.options.map((o, i) => (
              <li key={o} class={i === R.correct ? "is-right" : ""}>
                <span class="cr-shard" style={{ "--h": R.counts[i]! / max }} aria-hidden="true" />
                <strong>{R.counts[i]}</strong>
                <span class="cr-spread-name">
                  {Q.letters[i]} {o}
                </span>
                {i === R.correct && (
                  <span class="cr-right">
                    <CheckIcon />
                    {R.rightAnswer}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div class="cr-board" key={replay}>
          <div class="cr-board-head">
            <h2>{B.title}</h2>
            <p>{B.progress}</p>
          </div>
          <ol>
            {B.top.map((row, i) => (
              <BoardLine key={row.name} row={row} place={i} />
            ))}
          </ol>
          <p class="cr-yourplace">{B.yourPlace}</p>
          <ol class="cr-me">
            <BoardLine row={B.me} place={6} />
          </ol>
        </div>
      </section>
    </Shell>
  );
}

function Pips({ left }: { left: number }) {
  return (
    <span class="cr-pips" aria-hidden="true">
      {Array.from({ length: VOTES_PER_GUEST }, (_, i) => (
        <i key={i} class={i < VOTES_PER_GUEST - left ? "used" : ""} />
      ))}
    </span>
  );
}

function Photo({ p, canVote, burstKey, onVote, onUnvote }: { p: GalleryPhoto; canVote: boolean; burstKey: string | null; onVote: () => void; onUnvote: () => void }) {
  return (
    <li class={`cr-photo${p.own ? " is-own" : ""}${p.mine > 0 ? " is-voted" : ""}`}>
      <div class="cr-photo-cut">
        <img src={p.src} alt="" width={170} height={170} loading="lazy" />
        {burstKey && (
          <span class={`cr-burst is-${burstKey.split("-")[0]}`} key={burstKey} aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ "--a": `${i * 45}deg` }} />
            ))}
          </span>
        )}
      </div>
      {p.own ? (
        <p class="cr-own">
          <Gem tone="rose" />
          {G.own}
        </p>
      ) : (
        <div class="cr-vote">
          <button type="button" class={`cr-step${p.mine === 0 ? " is-dim" : ""}`} aria-label={G.unvote} onClick={onUnvote}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 10h10" />
            </svg>
          </button>
          <span class="cr-mine">{G.mine(p.mine)}</span>
          <button type="button" class={`cr-step is-plus${canVote ? "" : " is-dim"}`} aria-label={G.vote} onClick={onVote}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 10h10M10 5v10" />
            </svg>
          </button>
        </div>
      )}
    </li>
  );
}

function Gallery() {
  const votes = useVotes();
  const [tap, setTap] = useState({ n: 0, up: true });
  const vote = (p: GalleryPhoto) => {
    if (votes.votesLeft === 0) return;
    votes.vote(p.id);
    setTap({ n: tap.n + 1, up: true });
  };
  const unvote = (p: GalleryPhoto) => {
    if (p.mine === 0) return;
    votes.unvote(p.id);
    setTap({ n: tap.n + 1, up: false });
  };
  const grid = (list: GalleryPhoto[]) => (
    <ul class="cr-grid">
      {list.map((p) => (
        <Photo
          key={p.id}
          p={p}
          canVote={votes.votesLeft > 0}
          burstKey={votes.last === p.id ? `${tap.up ? "up" : "down"}-${tap.n}` : null}
          onVote={() => vote(p)}
          onUnvote={() => unvote(p)}
        />
      ))}
    </ul>
  );
  return (
    <Shell tab={2}>
      <section class="cr-gallery">
        <div class="cr-gallery-head cr-in" style={{ "--i": 0 }}>
          <h2 class="cr-h">{G.title}</h2>
          <div class="cr-left cr-facet" role="status">
            <div class="cr-left-row">
              <strong>{G.left(votes.votesLeft)}</strong>
              <Pips left={votes.votesLeft} />
            </div>
            <p>{G.hint(votes.votesLeft)}</p>
          </div>
        </div>
        <div class="cr-in" style={{ "--i": 1 }}>
          {grid(votes.current)}
        </div>
        <div class="cr-fame cr-in" style={{ "--i": 2 }}>
          <h2 class="cr-h">
            <Crown />
            {G.fameTitle}
          </h2>
          <p>{G.fameText}</p>
          {grid(votes.fame)}
        </div>
      </section>
    </Shell>
  );
}

const SHARDS = Array.from({ length: 28 }, (_, i) => {
  const a = (i * 360) / 28 + (i % 3) * 7;
  const dist = 130 + ((i * 37) % 80);
  const kinds = ["shard", "spark", "flake"] as const;
  return { a, dist, kind: kinds[i % 3]!, delay: (i % 5) * 0.04, tone: i % 4 };
});

function Finale() {
  const replay = useReplay(7000);
  return (
    <div class="d-crystal cr-page cr-finale" key={replay}>
      <Facets />
      <Twinkles />
      <div class="cr-suspense" aria-hidden="true">
        <Gem class="cr-suspense-gem" />
        <p class="cr-suspense-text">{F.suspense}</p>
        <p class="cr-suspense-sub">{F.suspenseSub}</p>
      </div>
      <section class="cr-win">
        <div class="cr-burst-big" aria-hidden="true">
          {SHARDS.map((s, i) => (
            <i key={i} class={`k-${s.kind} t-${s.tone}`} style={{ "--a": `${s.a}deg`, "--d": `${s.dist}px`, "--w": `${s.delay}s` }}>
              {s.kind === "spark" && <Sparkle />}
              {s.kind === "flake" && <Snowflake />}
            </i>
          ))}
        </div>
        <span class="cr-halo" aria-hidden="true" />
        <Crown />
        <p class="cr-win-kicker">{F.kicker}</p>
        <h1 class="cr-win-name">{F.winner}</h1>
        <p class="cr-win-points">{F.points}</p>
      </section>
      <section class="cr-best cr-facet">
        <div class="cr-best-cut">
          <img src={F.photo} alt={F.photoAlt} width={112} height={112} />
        </div>
        <div>
          <p class="cr-best-kicker">{F.photoKicker}</p>
          <p class="cr-best-name">{F.photoWinner}</p>
          <p class="cr-best-sub">{F.photoSub}</p>
        </div>
      </section>
    </div>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
