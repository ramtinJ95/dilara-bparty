import { useEffect } from "preact/hooks";
import { winOf, type FinaleKind, type GuestFinales, type PhotoWin, type QuizWin } from "../../shared/finale";
import type { PlayerId } from "../../shared/model";
import { photoUrl } from "../api";
import { Snowflake, Sparkle, Tiara } from "../icons";
import { Cap, Drift, Icicles, Sheen } from "../ice";
import "./finale.css";
import { votesText } from "./my-photo";
import type { OnStage } from "./on-stage";

type Props = { staged: OnStage; finales: GuestFinales; you: PlayerId; back: () => void };

const SUSPENSE: Record<FinaleKind, { title: string; sub: string }> = {
  quiz: { title: "Vem vann quizet?", sub: "Håll i er, snart får vi veta!" },
  photo: { title: "Vem tog bästa fotot?", sub: "Röstningen är stängd. Snart får vi veta!" },
};

export function Finale({ staged, finales, you, back }: Props) {
  if (staged.view.stage === "suspense") return <Suspense {...SUSPENSE[staged.kind]} />;
  if (staged.kind === "quiz") return <QuizReveal winners={staged.view.win} you={you} back={back} />;
  return <PhotoReveal photo={staged.view.win} quiz={winOf(finales.quiz) ?? []} you={you} back={back} />;
}

const points = (n: number) => `${n.toLocaleString("sv-SE")} poäng`;
const names = (winners: QuizWin[]) => winners.map((w) => w.name).join(" & ");
const quizTitle = (winners: QuizWin[]) => (winners.length > 1 ? "Quizvinnarna" : "Quizvinnaren");
const quizScore = (winners: QuizWin[]) => (winners.length > 1 ? `delar segern med ${points(winners[0]!.score)}` : points(winners[0]!.score));
const quizCheer = (winners: QuizWin[], you: PlayerId) =>
  winners.some((w) => w.id === you) ? (winners.length > 1 ? "Grattis, du delar segern!" : "Grattis, du vann!") : null;
const NO_QUIZ_WINNER = "Ingen fick poäng den här gången";

function Suspense({ title, sub }: { title: string; sub: string }) {
  return (
    <section class="finale suspense" aria-labelledby="finale-title">
      <Ice />
      <div class="sus-box">
        <Tiara />
        <h1 id="finale-title" class="finale-title">
          {title}
        </h1>
        <p class="finale-sub">{sub}</p>
      </div>
    </section>
  );
}

function PhotoReveal({ photo, quiz, you, back }: { photo: PhotoWin | null; quiz: QuizWin[]; you: PlayerId; back: () => void }) {
  useCheer();
  return (
    <section class="finale reveal" aria-labelledby="finale-title">
      <Ice opening />
      <BigFlake />
      <Burst />
      <Kicker>Bästa fotot</Kicker>
      {photo ? (
        <>
          <WinningPhoto photo={photo} />
          <h1 id="finale-title" class="finale-title" style={fit(photo.name)}>
            {photo.name}
          </h1>
          <p class="finale-sub">tog vinnarbilden · {votesText(photo.votes)}</p>
          {photo.owner === you && <You>Grattis, det är din bild!</You>}
        </>
      ) : (
        <h1 id="finale-title" class="finale-title small">
          Inga bilder var med den här gången
        </h1>
      )}
      {quiz.length > 0 && <QuizRecap winners={quiz} />}
      <Back onClick={back} />
      <Drift />
    </section>
  );
}

function QuizReveal({ winners, you, back }: { winners: QuizWin[]; you: PlayerId; back: () => void }) {
  useCheer();
  const cheer = quizCheer(winners, you);
  return (
    <section class="finale reveal" aria-labelledby="finale-title">
      <Ice opening />
      <BigFlake />
      <Burst />
      <Kicker>{quizTitle(winners)}</Kicker>
      <Tiara class="medal" />
      {winners.length > 0 ? (
        <>
          <h1 id="finale-title" class="finale-title" style={fit(names(winners))}>
            {names(winners)}
          </h1>
          <p class="finale-sub card">
            <span>{quizScore(winners)}</span>
            <Icicles />
          </p>
          {cheer && <You>{cheer}</You>}
        </>
      ) : (
        <h1 id="finale-title" class="finale-title small">
          {NO_QUIZ_WINNER}
        </h1>
      )}
      <Back onClick={back} />
      <Drift />
    </section>
  );
}

export function QuizWinners({ winners, you }: { winners: QuizWin[]; you: PlayerId }) {
  const cheer = quizCheer(winners, you);
  return (
    <section class="panel card calm quiz-winners" aria-labelledby="panel-title">
      <Cap />
      <Tiara />
      <p class="win-kicker">{quizTitle(winners)}</p>
      <h2 id="panel-title">{winners.length > 0 ? names(winners) : NO_QUIZ_WINNER}</h2>
      {winners.length > 0 && <p>{quizScore(winners)}</p>}
      {cheer && <You>{cheer}</You>}
      <Sparkle class="sparkle a" />
      <Sparkle class="sparkle b" />
    </section>
  );
}

export function PhotoWinner({ photo, open }: { photo: PhotoWin; open: () => void }) {
  return (
    <div class="photo-winner card">
      <Cap />
      <button class="thumb" type="button" aria-label="Visa vinnarbilden" onClick={open}>
        <img src={photoUrl(photo.thumb)} alt={`Vinnarbilden av ${photo.name}`} />
      </button>
      <p>
        <span class="win-kicker">Bästa fotot</span>
        <strong>{photo.name}</strong>
        <span>{votesText(photo.votes)}</span>
      </p>
      <Tiara />
      <Icicles />
    </div>
  );
}

function WinningPhoto({ photo }: { photo: PhotoWin }) {
  // The thumbnail is usually cached from the gallery, so it shows at once while the full photo loads.
  return (
    <div class="win-photo card">
      <Cap />
      <img src={photoUrl(photo.thumb)} alt="" />
      <img class="full" src={photoUrl(photo.photo)} alt={`Vinnarbilden av ${photo.name}`} onLoad={(e) => e.currentTarget.classList.add("loaded")} />
      <Sparkle class="sparkle a" />
      <Sparkle class="sparkle b" />
      <Icicles class="a" />
      <Icicles class="b" />
    </div>
  );
}

function QuizRecap({ winners }: { winners: QuizWin[] }) {
  return (
    <div class="recap card">
      <Cap />
      <Tiara />
      <p>
        {quizTitle(winners)}
        <strong>{names(winners)}</strong>
      </p>
    </div>
  );
}

const Back = ({ onClick }: { onClick: () => void }) => (
  <button class="btn back" type="button" onClick={onClick}>
    Tillbaka till festen
  </button>
);

function useCheer() {
  useEffect(() => void navigator.vibrate?.([120, 60, 240]), []);
}

// Sized by the longest word, so long names wrap between words instead of breaking mid-word at display size.
const fit = (text: string) => ({ "--len": Math.max(5, ...text.split(/\s+/).map((w) => w.length)) });

const Kicker = ({ children }: { children: string }) => (
  <p class="kicker card">
    <Cap />
    <span>{children}</span>
  </p>
);

const You = ({ children }: { children: string }) => (
  <p class="you">
    <Sheen />
    <Sparkle class="sparkle a" />
    <span>{children}</span>
  </p>
);

// The suspense page shows the block whole, and each reveal opens with it cracking apart.
const Ice = ({ opening = false }: { opening?: boolean }) => (
  <div class={opening ? "ice-wall opening" : "ice-wall"} aria-hidden="true">
    <div class="half l" />
    <div class="half r" />
    <svg class="crack" viewBox="0 0 40 844" preserveAspectRatio="none">
      <path d="M20 0L26 90L14 180L28 270L12 360L26 450L14 540L28 630L16 720L22 844" vector-effect="non-scaling-stroke" />
    </svg>
  </div>
);

const BigFlake = () => (
  <span class="big-flake" aria-hidden="true">
    <Snowflake />
  </span>
);

const PIECES = 24;
const KINDS = ["shard", "flake", "gem", "spark"] as const;

// Transform and opacity only, a fixed handful of pieces, and one run per reveal, so a cheap phone keeps up.
function Burst() {
  return (
    <div class="burst" aria-hidden="true">
      {Array.from({ length: PIECES }, (_, i) => {
        const kind = KINDS[i % KINDS.length]!;
        const angle = (i / PIECES) * 2 * Math.PI;
        const reach = 110 + (i % 4) * 45;
        const style = { "--x": `${Math.round(Math.cos(angle) * reach)}px`, "--y": `${Math.round(Math.sin(angle) * reach * 1.1)}px`, "--r": `${(i % 2 ? 1 : -1) * (120 + (i % 4) * 70)}deg`, "--dl": `${0.75 + (i % 5) * 0.04}s` };
        return (
          <i key={i} class={`${kind} c${i % 3}`} style={style}>
            {kind === "flake" && <Snowflake />}
            {kind === "spark" && <Sparkle />}
          </i>
        );
      })}
    </div>
  );
}
