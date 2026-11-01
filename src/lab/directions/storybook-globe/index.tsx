import "@fontsource/young-serif/400.css";
import "@fontsource/pinyon-script/400.css";
import "./globe.css";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Tiara } from "../../../client/icons";
import { fixture, VOTES_PER_GUEST, type BoardRow, type GalleryPhoto } from "../../fixture";
import { useCountdown, useReplay, useVotes } from "../../kit";
import type { Direction } from "../../types";
import { Castle, Flake, Glint, Globe, Leaf, Page, Ribbon, STAR, Wand } from "./art";

const enter = (ms: number) => ({ "--d": `${ms}ms` });

/** The first letter as an illuminated initial, the rest as running text. */
function DropCap({ text, class: cls = "", as: Tag = "p" }: { text: string; class?: string; as?: "p" | "h2" }) {
  return (
    <Tag class={`gl-dropcap ${cls}`}>
      <span class="gl-initial">{text[0]}</span>
      {text.slice(1)}
    </Tag>
  );
}

function Gem({ class: cls = "" }: { class?: string }) {
  return <span class={`gl-gem ${cls}`} aria-hidden="true" />;
}

function Divider() {
  return (
    <span class="gl-divider" aria-hidden="true">
      <i />
      <Flake size={14} />
      <i />
    </span>
  );
}

function Shell({ tab, children }: { tab: number; children: ComponentChildren }) {
  return (
    <Page class="gl-shelled">
      <Castle class="gl-shell-castle" />
      <header class="gl-top">
        <p class="gl-hello">
          <span class="gl-hello-tiara">
            <Tiara />
          </span>
          {fixture.shell.hello}
        </p>
        <p class="gl-online">
          <i aria-hidden="true" />
          {fixture.shell.online}
        </p>
      </header>
      <nav class="gl-tabs" aria-label="Meny">
        {fixture.shell.tabs.map((name, i) => (
          <a key={name} href="#" class="gl-tab" aria-current={i === tab ? "page" : undefined}>
            {name}
          </a>
        ))}
      </nav>
      <Leaf as="main" seed={tab + 3} class="gl-sheet">
        {children}
      </Leaf>
    </Page>
  );
}

function Landing() {
  const l = fixture.landing;
  const [name, rest] = [l.title.split(" ")[0], l.title.slice(l.title.indexOf(" ") + 1)];
  return (
    <Page class="gl-landing">
        <h1 class="gl-title gl-enter" style={enter(0)}>
          <span class="gl-title-tiara" aria-hidden="true">
            <Tiara />
          </span>
          <span class="gl-script gl-shimmer">{name}</span> <span class="gl-title-rest">{rest}</span>
        </h1>
        <Ribbon class="gl-enter gl-sub" style={enter(150)}>
          {l.subtitle}
        </Ribbon>
        <div class="gl-scene gl-enter" style={enter(250)}>
          <Castle class="gl-scene-castle" />
          <Globe class="gl-landing-globe" base={<Glint size={18} class="gl-base-glint" />}>
            <img src={l.photo} alt={l.photoAlt} />
          </Globe>
          <div class="gl-wand" aria-hidden="true">
            <Wand />
            {[0, 1, 2, 3, 4, 5, 6].map((k) => (
              <span key={k} class="gl-trail" style={{ "--k": k }}>
                <Glint size={k % 2 ? 10 : 15} />
              </span>
            ))}
          </div>
        </div>
        <Leaf as="form" seed={1} class="gl-join gl-enter" style={enter(500)} onSubmit={(e: Event) => e.preventDefault()}>
          <label for="gl-name">{l.label}</label>
          <input id="gl-name" name="name" autocomplete="given-name" placeholder={l.placeholder} />
          <button type="submit" class="gl-btn">
            <Gem />
            {l.button}
            <Gem />
          </button>
        </Leaf>
    </Page>
  );
}

function Countdown() {
  const { left, total } = useCountdown();
  return (
    <div class="gl-clock" role="timer" aria-label={fixture.quiz.secondsLabel(left)} style={{ "--p": left / total }}>
      <span class="gl-clock-face" aria-hidden="true" />
      <span key={left} class="gl-clock-n">
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
      <div class="gl-quiz-head gl-enter" style={enter(100)}>
        <Ribbon class="gl-progress">{q.progress}</Ribbon>
        <Countdown />
      </div>
      <figure class="gl-oval gl-enter" style={enter(200)}>
        <img src={q.photo} alt="" />
      </figure>
      <div class="gl-enter" style={enter(320)}>
        <DropCap as="h2" class="gl-question" text={q.text} />
      </div>
      <ul class="gl-options">
        {q.options.map((text, i) => (
          <li key={text} class="gl-enter" style={enter(420 + i * 90)}>
            <button type="button" class={`gl-option ${pick === i ? "is-picked" : ""}`} aria-pressed={pick === i} onClick={() => setPick(i)}>
              <span class="gl-letter">{q.letters[i]}</span>
              <span class="gl-option-text">{text}</span>
              {pick === i && (
                <span class="gl-chosen" aria-hidden="true">
                  <Tiara />
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
    <li class={`gl-line ${row.rank === 1 ? "is-first" : ""} ${row.you ? "is-you" : ""}`} style={{ "--from": `${(row.prev - row.rank) * 34}px`, "--d": `${600 + i * 110}ms` }}>
      <span class="gl-place">{row.rank}</span>
      <span class="gl-line-name">
        {row.rank === 1 && (
          <span class="gl-line-tiara">
            <Tiara />
          </span>
        )}
        {row.name}
        {row.you && <em class="gl-du">{b.youTag}</em>}
      </span>
      <span class="gl-dots" aria-hidden="true" />
      <span class="gl-line-score">{b.score(row.score)}</span>
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
      <section class="gl-verdict gl-enter" style={enter(80)}>
        <div class="gl-seal">
          <p class="gl-verdict-word">{r.verdict}</p>
          <Glint size={18} class="gl-seal-g1" />
          <Glint size={12} class="gl-seal-g2" />
        </div>
        <div>
          <p class="gl-points">{r.points}</p>
          <p class="gl-total">{r.total}</p>
        </div>
      </section>
      <Divider />
      <section class="gl-spread gl-enter" style={enter(220)}>
        <h2 class="gl-h2">{r.spread}</h2>
        <ul>
          {q.options.map((text, i) => (
            <li key={text} class={i === r.correct ? "is-right" : ""}>
              <span class="gl-bar-label">
                {q.letters[i]} {text}
              </span>
              <span class="gl-bar" style={{ "--w": r.counts[i]! / most, "--d": `${400 + i * 90}ms` }} />
              <span class="gl-bar-n">{r.counts[i]}</span>
            </li>
          ))}
        </ul>
        <p class="gl-note">
          {r.rightAnswer}: {q.options[r.correct]} · {r.yourGuess}: {q.options[q.pick]}
        </p>
      </section>
      <Divider />
      <section class="gl-board gl-enter" style={enter(360)} key={replay}>
        <div class="gl-board-head">
          <h2 class="gl-h2">{b.title}</h2>
          <span>{b.progress}</span>
        </div>
        <ol>
          {b.top.map((row, i) => (
            <Line key={row.name} row={row} i={i} />
          ))}
        </ol>
        <p class="gl-yourplace">{b.yourPlace}</p>
        <ol>
          <Line row={b.me} i={5} />
        </ol>
      </section>
    </Shell>
  );
}

function Portrait({ p, i, tap, onVote, onUnvote }: { p: GalleryPhoto; i: number; tap: number; onVote: () => void; onUnvote: () => void }) {
  const g = fixture.gallery;
  return (
    <li class={`gl-portrait gl-enter ${p.own ? "is-own" : ""} ${p.mine > 0 ? "is-voted" : ""}`} style={enter(250 + i * 90)}>
      <div class="gl-frame">
        <img src={p.src} alt="" />
        {tap > 0 && (
          <span key={tap} class="gl-poof" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <i key={k} style={{ "--a": `${k * 60}deg` }}>
                <Glint size={k % 2 ? 12 : 18} />
              </i>
            ))}
          </span>
        )}
        {p.mine > 0 && (
          <span class="gl-badge" aria-hidden="true">
            <svg viewBox="-12 -12 24 24">
              <path d={STAR} />
            </svg>
            <b key={`${p.mine}-${tap}`}>{p.mine}</b>
          </span>
        )}
      </div>
      {p.own ? (
        <p class="gl-own">{g.own}</p>
      ) : (
        <>
          <div class="gl-vote">
            <button type="button" class="gl-round" aria-label={g.unvote} aria-disabled={p.mine === 0} onClick={onUnvote}>
              −
            </button>
            <span key={`${p.mine}-${tap}`} class="gl-count" aria-hidden="true">
              {p.mine}
            </span>
            <button type="button" class="gl-round gl-plus" aria-label={g.vote} onClick={onVote}>
              +
            </button>
          </div>
          <p class="gl-mine">{g.mine(p.mine)}</p>
        </>
      )}
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
  const portrait = (p: GalleryPhoto, i: number) => <Portrait key={p.id} p={p} i={i} tap={v.last === p.id ? taps : 0} onVote={act(v.vote, p.id)} onUnvote={act(v.unvote, p.id)} />;
  return (
    <Shell tab={2}>
      <h1 class="gl-gtitle gl-enter" style={enter(80)}>
        {g.title}
      </h1>
      <section class="gl-status gl-enter" style={enter(180)} aria-live="polite">
        <span class="gl-pips" aria-hidden="true">
          {Array.from({ length: VOTES_PER_GUEST }, (_, i) => (
            <svg key={`${i}-${i < v.votesLeft}`} class={i < v.votesLeft ? "on" : ""} viewBox="-12 -12 24 24">
              <path d={STAR} />
            </svg>
          ))}
        </span>
        <div>
          <p class="gl-left">{g.left(v.votesLeft)}</p>
          <p class="gl-hint">{g.hint(v.votesLeft)}</p>
        </div>
      </section>
      <ul class="gl-hall">{v.current.map(portrait)}</ul>
      <Divider />
      <section class="gl-fame">
        <Ribbon as="h2" class="gl-fame-title">
          {g.fameTitle}
        </Ribbon>
        <DropCap text={g.fameText} class="gl-fame-text" />
        <ul class="gl-hall">{v.fame.map((p, i) => portrait(p, i + 4))}</ul>
      </section>
    </Shell>
  );
}

const BURST = Array.from({ length: 26 }, (_, i) => ({
  a: (i * 137.5) % 360,
  dist: 150 + ((i * 53) % 140),
  delay: 1250 + ((i * 61) % 450),
  k: i % 3,
  spin: (i % 2 ? 1 : -1) * (120 + (i % 4) * 80),
}));

function Finale() {
  const f = fixture.finale;
  const replay = useReplay(7000);
  return (
    <Page class="gl-finale" key={replay}>
      <div class="gl-ground" aria-hidden="true" />
      <div class="gl-stage">
        <div class="gl-swap gl-swap-top">
          <div class="gl-suspense" aria-hidden="true">
            <p class="gl-suspense-title">{f.suspense}</p>
          </div>
          <Ribbon class="gl-kicker gl-after" style={enter(1250)}>
            {f.kicker}
          </Ribbon>
        </div>
        <div class="gl-globe-wrap">
          <Castle class="gl-finale-castle" />
          <div class="gl-shaker">
          <Globe class="gl-finale-globe" base={<p class="gl-winpoints gl-after" style={enter(1650)}>{f.points}</p>}>
            <div class="gl-blizzard" aria-hidden="true" />
            <div class="gl-crown gl-after" style={enter(1500)}>
              <Tiara />
            </div>
            <h1 class="gl-winner gl-after" style={enter(1400)}>
              {f.winner}
            </h1>
          </Globe>
          <div class="gl-burst" aria-hidden="true">
            {BURST.map((c, i) => (
              <i key={i} class={`k${c.k}`} style={{ "--a": `${c.a}deg`, "--dist": `${c.dist}px`, "--d": `${c.delay}ms`, "--s": `${c.spin}deg` }}>
                {c.k === 0 ? <Glint size={18} /> : c.k === 1 ? <Flake size={16} /> : null}
              </i>
            ))}
          </div>
          </div>
        </div>
        <div class="gl-swap gl-swap-bottom">
          <p class="gl-suspense-sub" aria-hidden="true">
            {f.suspenseSub}
          </p>
          <Leaf seed={9} class="gl-recap gl-after" style={enter(1800)}>
            <figure class="gl-oval gl-recap-photo">
              <img src={f.photo} alt={f.photoAlt} />
            </figure>
            <div>
              <p class="gl-recap-kicker">{f.photoKicker}</p>
              <p class="gl-recap-name">{f.photoWinner}</p>
              <p class="gl-recap-sub">{f.photoSub}</p>
            </div>
          </Leaf>
        </div>
      </div>
    </Page>
  );
}

export const direction: Direction = { landing: Landing, quiz: Quiz, reveal: Reveal, gallery: Gallery, finale: Finale };
