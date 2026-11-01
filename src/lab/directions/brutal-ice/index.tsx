import "@fontsource/archivo-black/400.css";
import "@fontsource-variable/space-grotesk";
import "./brutal-ice.css";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Snowflake, Sparkle } from "../../../client/icons";
import { fixture, VOTES_PER_GUEST, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";

const { shell, landing: L, quiz: Q, reveal: R, board: B, gallery: G, finale: F } = fixture;

const Cap = ({ class: c = "" }: { class?: string }) => (
  <svg class={`bi-cap ${c}`} viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
    <path
      d="M0 17C0 9 6 5 13 8C18 1 31 0 37 7C44 2 55 2 60 8C67 1 81 2 86 8C94 6 100 10 100 17C93 20 86 15 78 18C69 21 61 15 51 18C41 21 33 15 23 18C14 21 7 15 0 17Z"
      vector-effect="non-scaling-stroke"
    />
  </svg>
);

const Icicles = ({ class: c = "" }: { class?: string }) => (
  <svg class={`bi-icicles ${c}`} viewBox="0 0 62 28" aria-hidden="true">
    <path d="M2 1L7 19L12 1ZM14 1L18.5 12L23 1ZM25 1L31 27L37 1ZM39 1L43 14L47 1ZM49 1L54.5 21L60 1Z" />
  </svg>
);

const IceTiara = ({ class: c = "" }: { class?: string }) => (
  <svg class={`bi-tiara ${c}`} viewBox="0 0 124 68" aria-hidden="true">
    <defs>
      <linearGradient id="bi-tg" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.5" stop-color="#cdeaff" />
        <stop offset="1" stop-color="#8fd0ff" />
      </linearGradient>
    </defs>
    <path d="M12 62L7 32L28 45L38 18L52 39L62 4L72 39L86 18L96 45L117 32L112 62Q62 51 12 62Z" fill="url(#bi-tg)" stroke="#10204a" stroke-width="4.5" stroke-linejoin="round" />
    <path d="M62 10L62 46M38 24L42 50M86 24L82 50M18 40L22 56M106 40L102 56" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.9" />
    <circle cx="62" cy="40" r="7" fill="#ff9cc8" stroke="#10204a" stroke-width="3.5" />
    <circle cx="38" cy="18" r="4.5" fill="#8fd0ff" stroke="#10204a" stroke-width="3" />
    <circle cx="86" cy="18" r="4.5" fill="#8fd0ff" stroke="#10204a" stroke-width="3" />
    <circle cx="62" cy="5" r="4" fill="#fff" stroke="#10204a" stroke-width="3" />
  </svg>
);

const Sheen = () => <span class="bi-sheen" aria-hidden="true" />;

const FAR = Array.from({ length: 16 }, (_, i) => i);
const NEAR = Array.from({ length: 9 }, (_, i) => i);

function Snow() {
  return (
    <div class="bi-snow" aria-hidden="true">
      {FAR.map((i) => (
        <i key={`f${i}`} class="far" style={{ "--x": `${(i * 37 + 5) % 100}%`, "--y": `${(i * 61) % 100}%`, "--s": `${4 + (i % 3) * 2}px`, "--dur": `${13 + (i % 5) * 2}s`, "--dl": `${-((i * 1.9) % 15)}s` }} />
      ))}
      {NEAR.map((i) => (
        <i key={`n${i}`} class="near" style={{ "--x": `${(i * 43 + 11) % 100}%`, "--y": `${(i * 47 + 20) % 100}%`, "--s": `${16 + (i % 3) * 6}px`, "--dur": `${8 + (i % 4) * 1.5}s`, "--dl": `${-((i * 2.3) % 9)}s` }}>
          <Snowflake />
        </i>
      ))}
    </div>
  );
}

function Shell({ tab, children }: { tab: number; children: ComponentChildren }) {
  return (
    <div class="d-brutal-ice">
      <Snow />
      <header class="bi-top">
        <span class="bi-hello">{shell.hello}</span>
        <span class="bi-online">
          <i aria-hidden="true" />
          {shell.online}
        </span>
        <Icicles class="t1" />
        <Icicles class="t2" />
      </header>
      <nav class="bi-tabs" aria-label="Flikar">
        {shell.tabs.map((t, i) => (
          <button type="button" key={t} class={`bi-ice${i === tab ? " on" : ""}`} aria-current={i === tab ? "page" : undefined}>
            <Cap />
            <span>{t}</span>
          </button>
        ))}
      </nav>
      <main class="bi-main">{children}</main>
    </div>
  );
}

const Drift = () => (
  <svg class="bi-drift" viewBox="0 0 390 60" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 30C40 10 80 14 120 26C170 6 230 8 270 24C310 8 360 12 390 22V60H0Z" vector-effect="non-scaling-stroke" />
  </svg>
);

function Landing() {
  return (
    <div class="d-brutal-ice bi-landing">
      <Snow />
      <main class="bi-land">
        <h1 class="bi-title">
          <span class="bi-dilara">
            <IceTiara />
            Dilara{" "}
          </span>
          <span class="bi-l2">
            <span>fyller </span>
            <span class="bi-three bi-ice">
              <Cap />
              <Sheen />
              <span>3!</span>
            </span>
          </span>
        </h1>
        <p class="bi-sub">{L.subtitle}</p>
        <div class="bi-frozen bi-ice">
          <Cap />
          <img src={L.photo} alt={L.photoAlt} />
          <Sheen />
          <Icicles class="i1" />
          <Icicles class="i2" />
        </div>
        <form class="bi-join" onSubmit={(e) => e.preventDefault()}>
          <label for="bi-name">{L.label}</label>
          <input id="bi-name" name="name" placeholder={L.placeholder} autocomplete="given-name" />
          <button type="submit" class="bi-btn bi-ice">
            <Cap />
            <Sheen />
            <span>
              {L.button} <span aria-hidden="true">→</span>
            </span>
          </button>
        </form>
      </main>
      <Drift />
    </div>
  );
}

function Clock({ left, total }: { left: number; total: number }) {
  return (
    <>
      <div class={`bi-num bi-ice${left <= 5 ? " low" : ""}`} role="timer" aria-label={Q.secondsLabel(left)}>
        <Cap />
        <span key={left}>{left}</span>
      </div>
      <div class="bi-rail" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} class={i < left ? "on" : ""} style={{ "--h": `${16 + ((i * 7) % 3) * 6}px` }} />
        ))}
      </div>
    </>
  );
}

function Quiz() {
  const { left, total } = useCountdown();
  const [pick, setPick] = useState<number>(Q.pick);
  return (
    <Shell tab={0}>
      <div class="bi-qhead bi-in">
        <span class="bi-label">{Q.progress}</span>
        <Clock left={left} total={total} />
      </div>
      <figure class="bi-ice bi-qphoto bi-in" style={{ "--d": "80ms" }}>
        <Cap />
        <img src={Q.photo} alt="" />
        <Sheen />
      </figure>
      <h2 class="bi-question bi-in" style={{ "--d": "140ms" }}>
        {Q.text}
      </h2>
      <div class="bi-options">
        {Q.options.map((o, i) => (
          <button type="button" key={o} class={`bi-opt bi-ice${pick === i ? " on" : ""}`} aria-pressed={pick === i} onClick={() => setPick(i)} style={{ "--i": i }}>
            <span class="bi-letter">{Q.letters[i]}</span>
            <span class="bi-otext">{o}</span>
            {pick === i && (
              <span class="bi-check" aria-hidden="true">
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
    <li class={`bi-row bi-ice${r.rank === 1 ? " first" : ""}${me ? " me" : ""}`} style={{ "--from": `${(r.prev - r.rank) * ROW}px`, "--d": `${r.rank * 90}ms` }}>
      {r.rank === 1 && <Cap />}
      <span class="bi-rank">{r.rank}</span>
      <span class="bi-name">
        {r.name}
        {r.rank === 1 && <IceTiara />}
        {r.you && <em class="bi-you">{B.youTag}</em>}
      </span>
      <span class="bi-score">{B.score(r.score)}</span>
    </li>
  );
}

function Reveal() {
  const replay = useReplay(6000);
  const max = Math.max(...R.counts);
  return (
    <Shell tab={0}>
      <section class="bi-verdict bi-ice bi-in">
        <Cap />
        <Sheen />
        <p class="bi-right">{R.verdict}</p>
        <p class="bi-points">{R.points}</p>
        <p class="bi-total">{R.total}</p>
        <Icicles class="i1" />
      </section>
      <section class="bi-ice bi-spread bi-in" style={{ "--d": "120ms" }}>
        <h2>{R.spread}</h2>
        <ol>
          {R.counts.map((n, i) => (
            <li key={i} class={i === R.correct ? "right" : ""}>
              <span class="bi-sl">{Q.letters[i]}</span>
              <span class="bi-track">
                <span class="bi-fill" style={{ "--w": n / max }}>
                  {Q.options[i]}
                </span>
              </span>
              <b>{n}</b>
            </li>
          ))}
        </ol>
        <p class="bi-legend">
          <span class="bi-tag">✓ {R.rightAnswer}</span>
          <span>
            {R.yourGuess}: {Q.options[Q.pick]}
          </span>
        </p>
      </section>
      <section class="bi-board bi-in" style={{ "--d": "200ms" }}>
        <div class="bi-bhead">
          <h2>{B.title}</h2>
          <span class="bi-label small">{B.progress}</span>
        </div>
        <ol key={replay}>
          {B.top.map((r) => (
            <Row key={r.name} r={r} />
          ))}
        </ol>
        <p class="bi-place">{B.yourPlace}</p>
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
    <li class={`bi-photo bi-ice${p.mine > 0 ? " voted" : ""}${p.own ? " own" : ""}`} style={{ "--i": i, "--tilt": `${i % 2 ? 1.4 : -1.2}deg` }}>
      <Cap />
      <div class="bi-pic">
        <img src={p.src} alt="" />
        {p.own && <span class="bi-ownlabel">{G.own}</span>}
        {p.mine > 0 && (
          <span class="bi-stamp" key={stamp}>
            ×{p.mine}
          </span>
        )}
      </div>
      {!p.own && (
        <div class="bi-vote">
          <span class="bi-mine">{G.mine(p.mine)}</span>
          <div class="bi-vbtns">
            <button type="button" aria-label={G.unvote} disabled={p.mine === 0} onClick={() => votes.unvote(p.id)}>
              −
            </button>
            <button type="button" aria-label={G.vote} class={votes.votesLeft === 0 ? "spent" : ""} onClick={() => votes.vote(p.id)}>
              +
            </button>
          </div>
        </div>
      )}
      {p.mine > 0 && <Icicles class="i1" />}
    </li>
  );
}

function Gallery() {
  const votes = useVotes();
  return (
    <Shell tab={2}>
      <div class="bi-ghead bi-in">
        <h1 class="bi-gtitle">{G.title}</h1>
        <span class="bi-pips" aria-hidden="true">
          {Array.from({ length: VOTES_PER_GUEST }, (_, i) => (
            <i key={i} class={i < votes.votesLeft ? "full" : ""} />
          ))}
        </span>
      </div>
      <section class="bi-ice bi-status bi-in" style={{ "--d": "80ms" }}>
        <Cap />
        <p class="bi-left">{G.left(votes.votesLeft)}</p>
        <p class="bi-hint">{G.hint(votes.votesLeft)}</p>
      </section>
      <ul class="bi-grid">
        {votes.current.map((p, i) => (
          <Photo key={p.id} p={p} votes={votes} i={i} />
        ))}
      </ul>
      <section class="bi-fame bi-in" style={{ "--d": "300ms" }}>
        <h2>
          <span>
            {G.fameTitle}
            <Icicles />
          </span>
          <Sparkle class="bi-fspark" />
        </h2>
        <p>{G.fameText}</p>
        <ul class="bi-grid">
          {votes.fame.map((p, i) => (
            <Photo key={p.id} p={p} votes={votes} i={i + 4} />
          ))}
        </ul>
      </section>
    </Shell>
  );
}

const SHARDS = Array.from({ length: 30 }, (_, i) => i);
const KINDS = ["shard", "flake", "gem", "spark", "shard"] as const;

function Finale() {
  const replay = useReplay(7000);
  return (
    <div class="d-brutal-ice bi-finale" key={replay}>
      <Snow />
      <div class="bi-suspense">
        <div class="bi-half l" />
        <div class="bi-half r" />
        <svg class="bi-crack" viewBox="0 0 40 844" preserveAspectRatio="none" aria-hidden="true">
          <path d="M20 0L26 90L14 180L28 270L12 360L26 450L14 540L28 630L16 720L22 844" vector-effect="non-scaling-stroke" />
        </svg>
        <div class="bi-susbox">
          <p class="bi-sus">{F.suspense}</p>
          <p class="bi-sussub">{F.suspenseSub}</p>
        </div>
      </div>
      <span class="bi-bigflake" aria-hidden="true">
        <Snowflake />
      </span>
      <div class="bi-burst" aria-hidden="true">
        {SHARDS.map((i) => {
          const kind = KINDS[i % KINDS.length]!;
          const a = (i / SHARDS.length) * Math.PI * 2;
          const d = 110 + (i % 4) * 45;
          return (
            <i
              key={i}
              class={`${kind} c${i % 3}`}
              style={{ "--bx": `${Math.round(Math.cos(a) * d)}px`, "--by": `${Math.round(Math.sin(a) * d * 1.1)}px`, "--r": `${(i % 2 ? 1 : -1) * (120 + (i % 4) * 70)}deg`, "--dl": `${1.2 + (i % 5) * 0.04}s` }}
            >
              {kind === "flake" && <Snowflake />}
              {kind === "spark" && <Sparkle />}
            </i>
          );
        })}
      </div>
      <main class="bi-win">
        <p class="bi-kicker bi-ice">
          <Cap />
          <span>{F.kicker}</span>
        </p>
        <IceTiara class="big" />
        <h1 class="bi-winner">{F.winner}</h1>
        <p class="bi-wpoints bi-ice">
          <Sheen />
          <span>{F.points}</span>
          <Icicles class="i1" />
          <Icicles class="i2" />
        </p>
        <section class="bi-recap bi-ice">
          <Cap />
          <span class="bi-rkicker">{F.photoKicker}</span>
          <img src={F.photo} alt={F.photoAlt} />
          <div>
            <p class="bi-rname">{F.photoWinner}</p>
            <p class="bi-rsub">{F.photoSub}</p>
          </div>
        </section>
      </main>
      <Drift />
    </div>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
