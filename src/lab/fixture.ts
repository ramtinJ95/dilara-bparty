import { PHOTOS } from "./photos";

/** Lab pages render this marker; the build check fails if it shows up in the production build. */
export const LAB_MARKER = "dilara-design-lab";

export const VOTES_PER_GUEST = 3;

export type BoardRow = { name: string; rank: number; prev: number; score: number; you: boolean };
export type GalleryPhoto = { id: string; src: string; own: boolean; mine: number; fame: boolean };

const sv = (n: number) => n.toLocaleString("sv-SE");

export const fixture = {
  you: "Olle",
  shell: { hello: "Hej, Olle!", online: "14 gäster här just nu", tabs: ["Quiz", "Mitt foto", "Galleri"] },
  landing: {
    title: "Dilara fyller 3!",
    subtitle: "Välkommen på kalaset",
    photo: PHOTOS.landing,
    photoAlt: "Dilara",
    label: "Vad heter du?",
    placeholder: "Ditt namn",
    button: "Gå med",
  },
  quiz: {
    progress: "Fråga 3 av 8",
    text: "Vilket djur bor på Nordpolen?",
    photo: PHOTOS.question,
    letters: ["A", "B", "C", "D"],
    options: ["Isbjörn", "Pingvin", "Kamel", "Papegoja"],
    seconds: 20,
    startAt: 12,
    secondsLabel: (left: number) => `${left} sekunder kvar`,
    pick: 0,
  },
  reveal: {
    verdict: "Rätt!",
    points: `+${sv(850)} poäng`,
    total: `Totalt ${sv(2350)} poäng`,
    yourGuess: "Din gissning",
    rightAnswer: "Rätt svar",
    correct: 0,
    spread: "Så svarade alla",
    counts: [9, 3, 1, 2],
  },
  board: {
    title: "Topplistan",
    progress: "Efter fråga 3 av 8",
    youTag: "Du",
    yourPlace: "Din plats",
    top: [
      { name: "Astrid", rank: 1, prev: 2, score: 2950, you: false },
      { name: "Kim", rank: 2, prev: 1, score: 2800, you: false },
      { name: "Saga", rank: 3, prev: 5, score: 2640, you: false },
      { name: "Noah", rank: 4, prev: 3, score: 2510, you: false },
      { name: "Maja", rank: 5, prev: 4, score: 2480, you: false },
    ] satisfies BoardRow[],
    me: { name: "Olle", rank: 7, prev: 9, score: 2350, you: true } satisfies BoardRow,
    score: sv,
  },
  gallery: {
    title: "Galleri",
    left: (left: number) => (left === 0 ? "Alla röster är använda" : `${left} av ${VOTES_PER_GUEST} röster kvar`),
    hint: (left: number) => (left === 0 ? "Tryck − för att flytta en röst." : "Ge bilderna du gillar mest en röst. Samma bild kan få flera."),
    own: "Din bild",
    vote: "Ge en röst",
    unvote: "Ta tillbaka en röst",
    mine: (n: number) => `Dina röster: ${n}`,
    fameTitle: "Hall of fame",
    fameText: "Utbytta bilder som fick röster. De är kvar och kan fortfarande vinna.",
    votesLeft: 1,
    photos: [
      { id: "p1", src: PHOTOS.snow, own: false, mine: 2, fame: false },
      { id: "p2", src: PHOTOS.rose, own: true, mine: 0, fame: false },
      { id: "p3", src: PHOTOS.mint, own: false, mine: 0, fame: false },
      { id: "p4", src: PHOTOS.sun, own: false, mine: 0, fame: false },
      { id: "p5", src: PHOTOS.dusk, own: false, mine: 0, fame: true },
      { id: "p6", src: PHOTOS.sea, own: false, mine: 0, fame: true },
    ] satisfies GalleryPhoto[],
  },
  finale: {
    suspense: "Och vinnarna är…",
    suspenseSub: "Håll i er, snart får vi veta!",
    kicker: "Quizvinnaren",
    winner: "Astrid",
    points: `${sv(6450)} poäng`,
    photoKicker: "Bästa fotot",
    photoWinner: "Saga",
    photoSub: "tog vinnarbilden · 7 röster",
    photo: PHOTOS.dusk,
    photoAlt: "Vinnarbilden av Saga",
  },
};
