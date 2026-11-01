import { nextStep, type AdminFinale, type FinaleStage, type FinaleStep, type GuestFinale, type PhotoWin, type QuizWin } from "../shared/finale";
import type { PhotoId, PlayerId } from "../shared/model";
import type { TallyRow } from "../shared/protocol";
import type { AdminQuiz } from "../shared/quiz";
import type { Roster } from "./players";

const STAGE_KEY = "finale_stage";
const PICK_KEY = "finale_pick";
const PHOTO_KEY = "finale_photo";
const QUIZ_KEY = "finale_quiz";
const JOINS_CLOSED_KEY = "joins_closed";

// Winners are frozen at their reveal, so a later rename, merge or vote never changes what the phones celebrated.
type FrozenPhoto = Omit<PhotoWin, "name">;
type FrozenQuiz = Omit<QuizWin, "name">;

export type FinaleInputs = { quiz: AdminQuiz; tally: TallyRow[]; closeVoting: () => void };

const leaders = (tally: TallyRow[]) => tally.filter((r) => r.rank === 1);

export class Finale {
  constructor(private readonly kv: SyncKvStorage) {}

  private readonly steps: { [S in FinaleStep]: (inputs: FinaleInputs) => string | void } = {
    suspense: ({ quiz, closeVoting }) => (quiz.stage.phase === "ended" ? closeVoting() : "End the quiz before you open the finale."),
    photo: ({ tally }) => {
      const top = leaders(tally);
      const pick = this.kv.get<PhotoId>(PICK_KEY);
      const win = top.length > 1 ? top.find((r) => r.photo === pick) : top[0];
      if (top.length > 1 && !win) return "Photos are tied for first. Pick the winner before you reveal it.";
      this.kv.put<FrozenPhoto | null>(PHOTO_KEY, win ? { photo: win.photo, thumb: win.thumb, owner: win.player, votes: win.votes } : null);
    },
    quiz: ({ quiz }) => {
      const scores = new Map(quiz.board.map((r) => [r.id, r.score]));
      this.kv.put<FrozenQuiz[]>(QUIZ_KEY, quiz.winners.map((id) => ({ id, score: scores.get(id) ?? 0 })));
    },
  };

  stage(): FinaleStage {
    return this.kv.get<FinaleStage>(STAGE_KEY) ?? "off";
  }

  step(step: FinaleStep, inputs: FinaleInputs): string | null {
    const stage = this.stage();
    if (stage === step) return null;
    if (nextStep(stage) !== step) return `"${step}" isn't the next finale step.`;
    const error = this.steps[step](inputs);
    if (error) return error;
    this.kv.put(STAGE_KEY, step);
    return null;
  }

  pick(photo: PhotoId, tally: TallyRow[]): string | null {
    if (this.stage() !== "off" && this.stage() !== "suspense") return "The photo winner has already been revealed.";
    const top = leaders(tally);
    if (top.length < 2 || !top.some((r) => r.photo === photo)) return "That photo isn't tied for first.";
    this.kv.put(PICK_KEY, photo);
    return null;
  }

  joinsOpen(): boolean {
    return this.kv.get<boolean>(JOINS_CLOSED_KEY) !== true;
  }

  setJoins(open: boolean): void {
    this.kv.put(JOINS_CLOSED_KEY, !open);
  }

  guest(roster: Roster): GuestFinale {
    const name = (id: PlayerId) => roster.rootOf(id)?.name ?? "";
    const photo = this.kv.get<FrozenPhoto | null>(PHOTO_KEY) ?? null;
    const won = photo && { ...photo, name: name(photo.owner) };
    const views: { [S in FinaleStage]: () => GuestFinale } = {
      off: () => ({ stage: "off" }),
      suspense: () => ({ stage: "suspense" }),
      photo: () => ({ stage: "photo", photo: won }),
      quiz: () => ({
        stage: "quiz",
        photo: won,
        quiz: (this.kv.get<FrozenQuiz[]>(QUIZ_KEY) ?? []).map((w) => ({ ...w, name: name(w.id) })),
      }),
    };
    return views[this.stage()]();
  }

  admin(roster: Roster, tally: TallyRow[]): AdminFinale {
    const top = leaders(tally);
    return {
      ...this.guest(roster),
      tied: top.length > 1 ? top.map((r) => r.photo) : [],
      pick: this.kv.get<PhotoId>(PICK_KEY) ?? null,
      joins: this.joinsOpen(),
    };
  }
}
