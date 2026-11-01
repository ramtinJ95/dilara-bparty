import { useEffect, useReducer, useState } from "preact/hooks";
import { fixture, type GalleryPhoto } from "./fixture";

// The lab's only shared behaviour: a looping clock, a replay key and local voting. Looks stay in each direction.

/** Seconds left on the quiz clock. It runs down from fixture.quiz.startAt, rests at 0, then starts again from the full time. */
export function useCountdown(): { left: number; total: number } {
  const total = fixture.quiz.seconds;
  const [left, setLeft] = useState<number>(fixture.quiz.startAt);
  useEffect(() => {
    const id = setTimeout(() => setLeft(left === 0 ? total : left - 1), left === 0 ? 2000 : 1000);
    return () => clearTimeout(id);
  }, [left, total]);
  return { left, total };
}

/** A key that changes every `ms`, so a screen can remount and replay its entrance or celebration. */
export function useReplay(ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

type Votes = { photos: GalleryPhoto[]; votesLeft: number; last: string | null };
type VoteAction = { t: "vote" | "unvote"; id: string };

function voteReducer(s: Votes, { t, id }: VoteAction): Votes {
  const photo = s.photos.find((p) => p.id === id);
  if (!photo || photo.own) return s;
  if (t === "vote" && s.votesLeft === 0) return s;
  if (t === "unvote" && photo.mine === 0) return s;
  const step = t === "vote" ? 1 : -1;
  return { photos: s.photos.map((p) => (p.id === id ? { ...p, mine: p.mine + step } : p)), votesLeft: s.votesLeft - step, last: id };
}

/** Local voting with the real rules: three votes, several on one photo, none on your own. `last` is the photo tapped last. */
export function useVotes() {
  const [state, dispatch] = useReducer(voteReducer, { photos: fixture.gallery.photos, votesLeft: fixture.gallery.votesLeft, last: null });
  return {
    ...state,
    current: state.photos.filter((p) => !p.fame),
    fame: state.photos.filter((p) => p.fame),
    vote: (id: string) => dispatch({ t: "vote", id }),
    unvote: (id: string) => dispatch({ t: "unvote", id }),
  };
}
