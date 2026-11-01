import "@fontsource-variable/bricolage-grotesque/standard.css";
import "./bento.css";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { CameraIcon, CheckIcon, GalleryIcon, QuizIcon, Snowflake, Sparkle, Tiara } from "../../../client/icons";
import { fixture, VOTES_PER_GUEST, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";

const { shell: S, landing: L, quiz: Q, reveal: R, board: B, gallery: G, finale: F } = fixture;

type TileProps = { class?: string; i: number; children: ComponentChildren; as?: "div" | "section" | "li" };
const Tile = ({ class: c = "", i, children, as: Tag = "div" }: TileProps) => (
  <Tag class={`bn-tile ${c}`} style={{ "--i": i }}>
    {children}
  </Tag>
);

const Sticker = ({ class: c = "", children, tilt = -5 }: { class?: string; children: ComponentChildren; tilt?: number }) => (
  <span class={`bn-sticker ${c}`} style={{ "--tilt": `${tilt}deg` }}>
    {children}
  </span>
);

const TAB_ICONS = [QuizIcon, CameraIcon, GalleryIcon];

function Shell({ tab, children }: { tab: 0 | 2; children: ComponentChildren }) {
  const count = S.online.match(/^\d+/)?.[0] ?? "";
  return (
    <div class="d-bento bn-page">
      <div class="bn-grid">
        <Tile class="bn-hello bn-s3" i={0}>
          <Snowflake />
          <strong>{S.hello}</strong>
        </Tile>
        <Tile class="bn-online bn-s3" i={1}>
          <span class="bn-online-n">
            <i aria-hidden="true" />
            {count}
          </span>
          <span class="bn-online-t">{S.online.slice(count.length).trim()}</span>
        </Tile>
        <nav class="bn-tabs bn-s6 bn-tile" style={{ "--i": 2 }} aria-label="Flikar">
          {S.tabs.map((t, i) => {
            const Icon = TAB_ICONS[i]!;
            return (
              <a key={t} href="#" class="bn-tab" aria-current={i === tab ? "page" : undefined} onClick={(e) => e.preventDefault()}>
                <Icon />
                {t}
              </a>
            );
          })}
        </nav>
        {children}
      </div>
    </div>
  );
}

function Landing() {
  return (
    <div class="d-bento bn-page bn-landing">
      <div class="bn-grid">
        <Tile class="bn-hero bn-s6" i={0}>
          <Sticker class="bn-pink bn-hero-sticker" tilt={-6}>
            {L.subtitle}
          </Sticker>
          <h1>Dilara fyller 3!</h1>
          <Sparkle class="bn-hero-spark" />
        </Tile>
        <Tile class="bn-photo-hero bn-s4 bn-r2" i={1}>
          <img src={L.photo} alt={L.photoAlt} width={240} height={248} />
        </Tile>
        <Tile class="bn-three bn-s2" i={2}>
          <span aria-hidden="true">3</span>
        </Tile>
        <Tile class="bn-tiara-tile bn-s2" i={3}>
          <Tiara />
        </Tile>
        <Tile class="bn-chips bn-s6" i={4}>
          {S.tabs.map((t, i) => {
            const Icon = TAB_ICONS[i]!;
            return (
              <span key={t} class={`bn-chip c-${i}`} style={{ "--tilt": `${[-3, 2, -2][i]}deg` }} aria-hidden="true">
                <Icon />
                {t}
              </span>
            );
          })}
        </Tile>
        <Tile class="bn-form bn-s6" i={5}>
          <form onSubmit={(e) => e.preventDefault()}>
            <label for="bn-name">{L.label}</label>
            <div class="bn-form-row">
              <input id="bn-name" name="name" autocomplete="given-name" placeholder={L.placeholder} />
              <button type="submit" class="bn-go">
                {L.button}
              </button>
            </div>
          </form>
        </Tile>
      </div>
    </div>
  );
}

function Clock() {
  const { left, total } = useCountdown();
  return (
    <Tile class={`bn-clock bn-s3${left <= 5 ? " is-low" : ""}`} i={4}>
      <div role="timer" aria-label={Q.secondsLabel(left)}>
        <span class="bn-clock-n" key={left} aria-hidden="true">
          {left}
        </span>
        <span class="bn-clock-unit" aria-hidden="true">
          sek
        </span>
      </div>
      <div class="bn-bar" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} class={i < left ? "on" : ""} />
        ))}
      </div>
    </Tile>
  );
}

function Quiz() {
  const [pick, setPick] = useState<number>(Q.pick);
  return (
    <Shell tab={0}>
      <Tile class="bn-progress bn-s3" i={3}>
        <span class="bn-big" aria-hidden="true">
          3<small>/8</small>
        </span>
        <span class="bn-progress-t">{Q.progress}</span>
      </Tile>
      <Clock />
      <Tile class="bn-qphoto bn-s2" i={5}>
        <img src={Q.photo} alt="" width={118} height={118} />
      </Tile>
      <Tile class="bn-question bn-s4" i={6}>
        <h2>{Q.text}</h2>
      </Tile>
      {Q.options.map((o, i) => (
        <button
          key={o}
          type="button"
          class={`bn-tile bn-option bn-s3 c-${i}${pick === i ? " is-picked" : ""}`}
          style={{ "--i": 7 + i }}
          aria-pressed={pick === i}
          onClick={() => setPick(i)}
        >
          <span class="bn-letter">{Q.letters[i]}</span>
          <span class="bn-option-t">{o}</span>
          {pick === i && (
            <span class="bn-picked" key={`p-${i}`} aria-hidden="true">
              <CheckIcon />
            </span>
          )}
        </button>
      ))}
    </Shell>
  );
}

const STEP = 42;

function Row({ row, i }: { row: BoardRow; i: number }) {
  return (
    <li class={`bn-row${row.rank === 1 ? " is-first" : ""}${row.you ? " is-you" : ""}`} style={{ "--from": `${(row.prev - row.rank) * STEP}px`, "--j": i }}>
      <span class="bn-rank">{row.rank}</span>
      <span class="bn-name">
        {row.name}
        {row.rank === 1 && <Tiara />}
        {row.you && (
          <Sticker class="bn-pink bn-you" tilt={-8}>
            {B.youTag}
          </Sticker>
        )}
      </span>
      <span class="bn-move" aria-hidden="true">
        {row.prev > row.rank ? "▲" : row.prev < row.rank ? "▼" : "•"}
      </span>
      <span class="bn-score">{B.score(row.score)}</span>
    </li>
  );
}

function Reveal() {
  const replay = useReplay(6000);
  return (
    <Shell tab={0}>
      <Tile class="bn-verdict bn-s4" i={3}>
        <p class="bn-verdict-w">{R.verdict}</p>
        <Sticker class="bn-pink bn-points" tilt={6}>
          {R.points}
        </Sticker>
      </Tile>
      <Tile class="bn-total bn-s2" i={4}>
        <p>{R.total}</p>
      </Tile>
      <Tile class="bn-spread bn-s6" i={5}>
        <h2>{R.spread}</h2>
        <ul>
          {Q.options.map((o, i) => (
            <li key={o} class={i === R.correct ? "is-right" : ""}>
              <strong>{R.counts[i]}</strong>
              <span>
                {Q.letters[i]} · {o}
              </span>
              {i === R.correct && (
                <Sticker class="bn-lilac bn-right" tilt={-7}>
                  <CheckIcon />
                  {R.rightAnswer}
                </Sticker>
              )}
            </li>
          ))}
        </ul>
      </Tile>
      <Tile class="bn-board bn-s6" i={6}>
        <div class="bn-board-head">
          <h2>{B.title}</h2>
          <Sticker class="bn-lilac" tilt={4}>
            {B.progress}
          </Sticker>
        </div>
        <ol key={replay}>
          {B.top.map((row, i) => (
            <Row key={row.name} row={row} i={i} />
          ))}
        </ol>
      </Tile>
      <Tile class="bn-me bn-s6" i={7}>
        <p class="bn-me-label">{B.yourPlace}</p>
        <ol key={replay}>
          <Row row={B.me} i={5} />
        </ol>
      </Tile>
    </Shell>
  );
}

type Tap = { n: number; up: boolean };

function Photo({ p, span, tap, canVote, onVote, onUnvote }: { p: GalleryPhoto; span: string; tap: Tap | null; canVote: boolean; onVote: () => void; onUnvote: () => void }) {
  return (
    <li class={`bn-tile bn-photo ${span}${p.own ? " is-own" : ""}${p.mine > 0 ? " is-voted" : ""}`}>
      <img src={p.src} alt="" width={180} height={180} loading="lazy" />
      {p.own ? (
        <Sticker class="bn-pink bn-own" tilt={-6}>
          <CameraIcon />
          {G.own}
        </Sticker>
      ) : (
        <>
          <Sticker class={`bn-mine${p.mine > 0 ? " bn-pink" : ""}`} tilt={-4}>
            <span key={tap ? `m-${tap.n}` : "m"} class={tap ? "bn-bump" : ""}>
              {G.mine(p.mine)}
            </span>
          </Sticker>
          {tap?.up && (
            <span class="bn-plus1" key={`f-${tap.n}`} aria-hidden="true">
              +1
            </span>
          )}
          <div class="bn-vote">
            <button type="button" class={`bn-step${p.mine === 0 ? " is-dim" : ""}`} aria-label={G.unvote} onClick={onUnvote}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5 10h10" />
              </svg>
            </button>
            <button type="button" class={`bn-step is-plus${canVote ? "" : " is-dim"}`} aria-label={G.vote} onClick={onVote}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5 10h10M10 5v10" />
              </svg>
            </button>
          </div>
        </>
      )}
    </li>
  );
}

const SPANS = ["bn-s4 bn-tall", "bn-s2 bn-tall", "bn-s3", "bn-s3"];

function Gallery() {
  const votes = useVotes();
  const [tap, setTap] = useState<Tap>({ n: 0, up: true });
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
  const photo = (p: GalleryPhoto, span: string) => (
    <Photo
      key={p.id}
      p={p}
      span={span}
      tap={votes.last === p.id ? tap : null}
      canVote={votes.votesLeft > 0}
      onVote={() => vote(p)}
      onUnvote={() => unvote(p)}
    />
  );
  const used = VOTES_PER_GUEST - votes.votesLeft;
  return (
    <Shell tab={2}>
      <Tile class="bn-gtitle bn-s3" i={3}>
        <h2>{G.title}</h2>
        <Sparkle class="bn-gtitle-spark" />
      </Tile>
      <Tile class="bn-left bn-s3" i={4}>
        <div role="status">
          <span class="bn-pips" aria-hidden="true">
            {Array.from({ length: VOTES_PER_GUEST }, (_, i) => (
              <i key={i} class={i < used ? "used" : ""} />
            ))}
          </span>
          <strong>{G.left(votes.votesLeft)}</strong>
        </div>
      </Tile>
      <Tile class="bn-hint bn-s6" i={5}>
        <p>{G.hint(votes.votesLeft)}</p>
      </Tile>
      <div class="bn-s6 bn-sub" style={{ "--i": 6 }}>
        <ul class="bn-grid bn-photos">{votes.current.map((p, i) => photo(p, SPANS[i] ?? "bn-s3"))}</ul>
      </div>
      <Tile class="bn-fame bn-s6" i={7}>
        <div class="bn-fame-head">
          <h2>{G.fameTitle}</h2>
          <Tiara />
        </div>
        <p>{G.fameText}</p>
        <ul class="bn-grid bn-photos">{votes.fame.map((p) => photo(p, "bn-s3"))}</ul>
      </Tile>
    </Shell>
  );
}

const CONFETTI = Array.from({ length: 34 }, (_, i) => ({
  x: i % 2 === 0 ? (i * 7) % 16 : 84 + ((i * 7) % 16),
  delay: ((i * 7) % 10) * 0.05,
  drift: ((i * 37) % 80) - 40,
  spin: ((i * 61) % 360) + 180,
  kind: (["rect", "dot", "flake", "spark"] as const)[i % 4]!,
  tone: i % 5,
  fall: 300 + ((i * 29) % 420),
}));

function Finale() {
  const replay = useReplay(7000);
  return (
    <div class="d-bento bn-page bn-finale" key={replay}>
      <div class="bn-suspense" aria-hidden="true">
        <div class="bn-sus-grid">
          <span class="bn-sus-tile t-a" />
          <span class="bn-sus-tile t-b">
            <Snowflake />
          </span>
          <p class="bn-sus-main">{F.suspense}</p>
          <p class="bn-sus-sub">{F.suspenseSub}</p>
          <span class="bn-sus-tile t-c">
            <Sparkle />
          </span>
          <span class="bn-sus-tile t-d" />
        </div>
      </div>
      <div class="bn-confetti" aria-hidden="true">
        {CONFETTI.map((c, i) => (
          <i
            key={i}
            class={`k-${c.kind} t-${c.tone}`}
            style={{ left: `${c.x}%`, "--w": `${c.delay}s`, "--dx": `${c.drift}px`, "--r": `${c.spin}deg`, "--fall": `${c.fall}px` }}
          >
            {c.kind === "flake" && <Snowflake />}
            {c.kind === "spark" && <Sparkle />}
          </i>
        ))}
      </div>
      <div class="bn-grid">
        <Tile class="bn-winner bn-s6" i={0}>
          <Sticker class="bn-lilac bn-kicker" tilt={-5}>
            {F.kicker}
          </Sticker>
          <div class="bn-winner-tiara">
            <Tiara />
          </div>
          <h1>{F.winner}</h1>
        </Tile>
        <Tile class="bn-wpoints bn-s4" i={1}>
          <p>{F.points}</p>
        </Tile>
        <Tile class="bn-wstar bn-s2" i={2}>
          <span aria-hidden="true">1</span>
        </Tile>
        <Tile class="bn-best bn-s6" i={3}>
          <img src={F.photo} alt={F.photoAlt} width={128} height={128} />
          <div>
            <Sticker class="bn-pink" tilt={-4}>
              {F.photoKicker}
            </Sticker>
            <p class="bn-best-name">{F.photoWinner}</p>
            <p class="bn-best-sub">{F.photoSub}</p>
          </div>
        </Tile>
      </div>
    </div>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
