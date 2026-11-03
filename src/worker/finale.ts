import {
  FINALE_KINDS,
  finaleBlocker,
  nextStep,
  REVEAL_SHOW_MS,
  stepTaken,
  type AdminFinales,
  type FinaleKind,
  type FinaleStage,
  type FinaleStep,
  type FinaleView,
  type GuestFinales,
  type PhotoWin,
  type QuizWin,
  type Winner,
} from "../shared/finale";
import type { PhotoId, PlayerId } from "../shared/model";
import type { TallyRow } from "../shared/protocol";
import type { AdminQuiz } from "../shared/quiz";
import type { Roster } from "./players";

const PICK_KEY = "finale_pick";
const JOINS_CLOSED_KEY = "joins_closed";

// Winners are frozen at their reveal, so a later rename, merge or vote never changes what the phones celebrated.
type FrozenPhoto = Omit<PhotoWin, "name">;
type FrozenQuiz = Omit<QuizWin, "name">;
type Frozen = { quiz: FrozenQuiz[]; photo: FrozenPhoto | null };

// Nothing is stored until the suspense page opens. A reveal is on the phones until at + REVEAL_SHOW_MS, and settle() then marks it done.
type Stored<W> = { stage: "suspense" } | { stage: "revealed"; at: number; win: W } | { stage: "done"; win: W };

export type FinaleInputs = { quiz: AdminQuiz; tally: TallyRow[]; goLive: () => void; closeContest: () => void };

type Root = (id: PlayerId) => { id: PlayerId; name: string };

type Kind<K extends FinaleKind> = {
  key: string;
  open?: (inputs: FinaleInputs) => void;
  freeze: (inputs: FinaleInputs, pick: PhotoId | null) => Frozen[K];
  named: (win: Frozen[K], root: Root) => Winner[K];
};

const leaders = (tally: TallyRow[]) => tally.filter((r) => r.rank === 1);

const KINDS: { [K in FinaleKind]: Kind<K> } = {
  quiz: {
    key: "quiz_finale",
    freeze: ({ quiz }) => {
      const scores = new Map(quiz.board.map((r) => [r.id, r.score]));
      return quiz.winners.map((id) => ({ id, score: scores.get(id) ?? 0 }));
    },
    // Joint winners merged into one player after the reveal are one winner.
    named: (win, root) => [...new Map(win.map((w) => [root(w.id).id, { ...root(w.id), score: w.score }])).values()],
  },
  photo: {
    key: "photo_finale",
    open: ({ closeContest }) => closeContest(),
    freeze: ({ tally }, pick) => {
      const top = leaders(tally);
      const win = top.length > 1 ? top.find((r) => r.photo === pick) : top[0];
      return win ? { photo: win.photo, thumb: win.thumb, owner: win.player, votes: win.votes } : null;
    },
    named: (win, root) => win && { ...win, owner: root(win.owner).id, name: root(win.owner).name },
  },
};

// The phones' view follows the clock, so a reveal is over on time even if the alarm that settles it runs late.
function view<W>(stored: Stored<W> | undefined, now: number): FinaleView<W> {
  if (!stored) return { stage: "off" };
  if (stored.stage === "suspense") return stored;
  if (stored.stage === "revealed" && now < stored.at + REVEAL_SHOW_MS) return { stage: "reveal", win: stored.win, backInMs: stored.at + REVEAL_SHOW_MS - now };
  return { stage: "done", win: stored.win };
}

export class Finale {
  constructor(private readonly kv: SyncKvStorage) {}

  private readonly steps: { [S in FinaleStep]: (kind: FinaleKind, inputs: FinaleInputs, now: number) => Stored<Frozen[FinaleKind]> } = {
    suspense: (kind, inputs) => {
      inputs.goLive();
      KINDS[kind].open?.(inputs);
      return { stage: "suspense" };
    },
    reveal: (kind, inputs, now) => ({ stage: "revealed", at: now, win: KINDS[kind].freeze(inputs, this.picked()) }),
  };

  // A press of a step already taken is a late double press, and changes nothing.
  step(kind: FinaleKind, step: FinaleStep, inputs: FinaleInputs, now: number): string | null {
    const stages = this.stages(now);
    if (stepTaken(step, stages[kind])) return null;
    if (nextStep(stages[kind]) !== step) return `"${step}" isn't the next step of the ${kind} finale.`;
    const leading = leaders(inputs.tally).map((r) => r.photo);
    const error = finaleBlocker(kind, step, { quizPhase: inputs.quiz.stage.phase, ...stages, tied: leading, pick: this.picked() });
    if (error) return error;
    this.kv.put(KINDS[kind].key, this.steps[step](kind, inputs, now));
    return null;
  }

  stages(now: number): { [K in FinaleKind]: FinaleStage } {
    return { quiz: view(this.stored("quiz"), now).stage, photo: view(this.stored("photo"), now).stage };
  }

  // Marks each reveal whose time on the phones is up as done, and says whether any was.
  settle(now: number): boolean {
    let moved = false;
    for (const kind of FINALE_KINDS) {
      const stored = this.stored(kind);
      if (stored?.stage !== "revealed" || view(stored, now).stage !== "done") continue;
      this.kv.put(KINDS[kind].key, { stage: "done", win: stored.win });
      moved = true;
    }
    return moved;
  }

  // When the Durable Object must wake to send the phones back to the party.
  wakeAt(): number | null {
    const due = FINALE_KINDS.flatMap((kind) => {
      const stored = this.stored(kind);
      return stored?.stage === "revealed" ? [stored.at + REVEAL_SHOW_MS] : [];
    });
    return due.length > 0 ? Math.min(...due) : null;
  }

  pick(photo: PhotoId, tally: TallyRow[]): string | null {
    const stored = this.stored("photo");
    if (stored && stored.stage !== "suspense") return "The photo winner has already been revealed.";
    const top = leaders(tally);
    if (top.length < 2 || !top.some((r) => r.photo === photo)) return "That photo isn't tied for first.";
    this.kv.put(PICK_KEY, photo);
    return null;
  }

  clear(): void {
    for (const key of [KINDS.quiz.key, KINDS.photo.key, PICK_KEY, JOINS_CLOSED_KEY]) this.kv.delete(key);
  }

  joinsOpen(): boolean {
    return this.kv.get<boolean>(JOINS_CLOSED_KEY) !== true;
  }

  setJoins(open: boolean): void {
    this.kv.put(JOINS_CLOSED_KEY, !open);
  }

  // A revealed winner stays visible to guests even if it is later hidden or replaced.
  revealedPhoto(id: PhotoId): boolean {
    const stored = this.stored("photo");
    const win = stored && "win" in stored ? stored.win : null;
    return win?.photo === id || win?.thumb === id;
  }

  guest(roster: Roster, now: number): GuestFinales {
    const root: Root = (id) => roster.rootOf(id) ?? { id, name: "" };
    const named = <K extends FinaleKind>(kind: K): GuestFinales[K] => {
      const shown = view(this.stored(kind), now);
      return ("win" in shown ? { ...shown, win: KINDS[kind].named(shown.win, root) } : shown) as GuestFinales[K];
    };
    return { quiz: named("quiz"), photo: named("photo") };
  }

  admin(guest: GuestFinales, tally: TallyRow[]): AdminFinales {
    const top = leaders(tally);
    return { ...guest, tied: top.length > 1 ? top.map((r) => r.photo) : [], pick: this.picked(), joins: this.joinsOpen() };
  }

  private picked(): PhotoId | null {
    return this.kv.get<PhotoId>(PICK_KEY) ?? null;
  }

  private stored<K extends FinaleKind>(kind: K): Stored<Frozen[K]> | undefined {
    return this.kv.get<Stored<Frozen[K]>>(KINDS[kind].key);
  }
}
