import { useEffect } from "preact/hooks";
import type { GuestFinale, PhotoWin } from "../../shared/finale";
import type { PlayerId } from "../../shared/model";
import { Snowflake, Sparkle, Tiara } from "../icons";
import "./finale.css";
import { photoUrl } from "./quiz";

type Of<S extends GuestFinale["stage"]> = Extract<GuestFinale, { stage: S }>;
type Props<S extends GuestFinale["stage"]> = { finale: Of<S>; you: PlayerId };
type Stage = Exclude<GuestFinale["stage"], "off">;

const VIEWS: { [S in Stage]: (props: Props<S>) => preact.JSX.Element } = {
  suspense: Suspense,
  photo: PhotoReveal,
  quiz: QuizReveal,
};

export function Finale({ finale, you }: { finale: Of<Stage>; you: PlayerId }) {
  const View = VIEWS[finale.stage] as (props: Props<Stage>) => preact.JSX.Element;
  return <View finale={finale} you={you} />;
}

const points = (n: number) => `${n.toLocaleString("sv-SE")} poäng`;
const votes = (n: number) => (n === 1 ? "1 röst" : `${n} röster`);

function Suspense() {
  return (
    <section class="finale suspense" aria-labelledby="finale-title">
      <Flurry />
      <div class="orb">
        <Tiara />
        <Sparkle class="sparkle a" />
        <Sparkle class="sparkle b" />
        <Sparkle class="sparkle c" />
      </div>
      <h1 id="finale-title" class="finale-title">
        Och vinnarna är…
      </h1>
      <p class="finale-sub">Håll i er, snart får vi veta!</p>
    </section>
  );
}

function PhotoReveal({ finale: { photo }, you }: Props<"photo">) {
  useCheer();
  return (
    <section class="finale reveal" aria-labelledby="finale-title">
      <Burst />
      <p class="kicker">Bästa fotot</p>
      {photo ? (
        <>
          <WinningPhoto photo={photo} />
          <h1 id="finale-title" class="finale-title">
            {photo.name}
          </h1>
          <p class="finale-sub">tog vinnarbilden · {votes(photo.votes)}</p>
          {photo.owner === you && <p class="you">Grattis, det är din bild!</p>}
        </>
      ) : (
        <h1 id="finale-title" class="finale-title small">
          Inga bilder var med den här gången
        </h1>
      )}
    </section>
  );
}

function QuizReveal({ finale: { quiz, photo }, you }: Props<"quiz">) {
  useCheer();
  const mine = quiz.some((w) => w.id === you);
  return (
    <section class="finale reveal" aria-labelledby="finale-title">
      <Burst />
      <p class="kicker">{quiz.length > 1 ? "Quizvinnarna" : "Quizvinnaren"}</p>
      <div class="medal">
        <Tiara />
      </div>
      {quiz.length > 0 ? (
        <>
          <h1 id="finale-title" class="finale-title">
            {quiz.map((w) => w.name).join(" & ")}
          </h1>
          <p class="finale-sub">{quiz.length > 1 ? `delar segern med ${points(quiz[0]!.score)}` : points(quiz[0]!.score)}</p>
          {mine && <p class="you">{quiz.length > 1 ? "Grattis, du delar segern!" : "Grattis, du vann!"}</p>}
        </>
      ) : (
        <h1 id="finale-title" class="finale-title small">
          Ingen fick poäng den här gången
        </h1>
      )}
      {photo && <PhotoRecap photo={photo} />}
    </section>
  );
}

function WinningPhoto({ photo }: { photo: PhotoWin }) {
  // The thumbnail is usually cached from the gallery, so it shows at once while the full photo loads.
  return (
    <div class="win-photo">
      <img src={photoUrl(photo.thumb)} alt="" />
      <img class="full" src={photoUrl(photo.photo)} alt={`Vinnarbilden av ${photo.name}`} onLoad={(e) => e.currentTarget.classList.add("loaded")} />
      <Sparkle class="sparkle a" />
      <Sparkle class="sparkle b" />
    </div>
  );
}

function PhotoRecap({ photo }: { photo: PhotoWin }) {
  return (
    <div class="recap card">
      <img src={photoUrl(photo.thumb)} alt="" />
      <p>
        Bästa fotot
        <strong>{photo.name}</strong>
      </p>
    </div>
  );
}

function useCheer() {
  useEffect(() => void navigator.vibrate?.([120, 60, 240]), []);
}

const FLAKES = 10;

function Flurry() {
  return (
    <div class="flurry" aria-hidden="true">
      {Array.from({ length: FLAKES }, (_, i) => (
        <span key={i} style={{ "--x": `${(i * 37) % 100}%`, "--d": `${(i * 0.7) % 5}s`, "--s": `${0.6 + ((i * 3) % 5) / 10}` }}>
          <Snowflake />
        </span>
      ))}
    </div>
  );
}

const PIECES = 16;

// Transform and opacity only, a fixed handful of pieces, and one run per reveal, so a cheap phone keeps up.
function Burst() {
  return (
    <div class="burst" aria-hidden="true">
      {Array.from({ length: PIECES }, (_, i) => {
        const angle = (i / PIECES) * 2 * Math.PI;
        const reach = 120 + ((i * 53) % 90);
        const style = { "--x": `${Math.cos(angle) * reach}px`, "--y": `${Math.sin(angle) * reach}px`, "--r": `${(i * 47) % 360}deg` };
        return (
          <span key={i} style={style}>
            {i % 2 ? <Sparkle /> : <Snowflake />}
          </span>
        );
      })}
    </div>
  );
}
