import { useEffect } from "preact/hooks";
import type { GuestFinale, PhotoWin, QuizWin } from "../../shared/finale";
import type { PlayerId } from "../../shared/model";
import { photoUrl } from "../api";
import { Snowflake, Sparkle, Tiara } from "../icons";
import { Cap, Drift, Icicles, Sheen } from "../ice";
import "./finale.css";
import { votesText } from "./my-photo";

type Of<S extends GuestFinale["stage"]> = Extract<GuestFinale, { stage: S }>;
type Props<S extends GuestFinale["stage"]> = { finale: Of<S>; you: PlayerId };
type Stage = Exclude<GuestFinale["stage"], "off">;

const VIEWS: { [S in Stage]: (props: Props<S>) => preact.JSX.Element } = {
  suspense: Suspense,
  quiz: QuizReveal,
  photo: PhotoReveal,
};

export function Finale({ finale, you }: { finale: Of<Stage>; you: PlayerId }) {
  const View = VIEWS[finale.stage] as (props: Props<Stage>) => preact.JSX.Element;
  return <View finale={finale} you={you} />;
}

const points = (n: number) => `${n.toLocaleString("sv-SE")} poäng`;

function Suspense() {
  return (
    <section class="finale suspense" aria-labelledby="finale-title">
      <Ice />
      <div class="sus-box">
        <Tiara />
        <h1 id="finale-title" class="finale-title">
          Och vinnarna är…
        </h1>
        <p class="finale-sub">Håll i er, snart får vi veta!</p>
      </div>
    </section>
  );
}

function PhotoReveal({ finale: { photo, quiz }, you }: Props<"photo">) {
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
      <Drift />
    </section>
  );
}

function QuizReveal({ finale: { quiz }, you }: Props<"quiz">) {
  useCheer();
  const mine = quiz.some((w) => w.id === you);
  return (
    <section class="finale reveal" aria-labelledby="finale-title">
      <Ice opening />
      <BigFlake />
      <Burst />
      <Kicker>{quiz.length > 1 ? "Quizvinnarna" : "Quizvinnaren"}</Kicker>
      <Tiara class="medal" />
      {quiz.length > 0 ? (
        <>
          <h1 id="finale-title" class="finale-title" style={fit(quiz.map((w) => w.name).join(" & "))}>
            {quiz.map((w) => w.name).join(" & ")}
          </h1>
          <p class="finale-sub card">
            <span>{quiz.length > 1 ? `delar segern med ${points(quiz[0]!.score)}` : points(quiz[0]!.score)}</span>
            <Icicles />
          </p>
          {mine && <You>{quiz.length > 1 ? "Grattis, du delar segern!" : "Grattis, du vann!"}</You>}
        </>
      ) : (
        <h1 id="finale-title" class="finale-title small">
          Ingen fick poäng den här gången
        </h1>
      )}
      <Drift />
    </section>
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
        {winners.length > 1 ? "Quizvinnarna" : "Quizvinnaren"}
        <strong>{winners.map((w) => w.name).join(" & ")}</strong>
      </p>
    </div>
  );
}

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
