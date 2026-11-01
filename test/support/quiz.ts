import type { PlayerId, QuestionId } from "../../src/shared/model";
import type { AdminState, GuestCmd, GuestState } from "../../src/shared/protocol";
import type { AdminStage, ChoiceBody, GuestQuiz, NumberBody, Phase, QuestionBody, QuizStep } from "../../src/shared/quiz";
import { connectAdmin, connectGuest, joinedCookie, type TestSocket } from "./worker";

export type Admin = TestSocket<AdminState>;
export type Phone = { socket: TestSocket<GuestState>; id: PlayerId; name: string; cookie: string };

export const choice = (over: Partial<ChoiceBody> = {}): ChoiceBody => ({
  kind: "choice",
  text: "Vilken färg har en snöflinga?",
  photo: null,
  seconds: 20,
  options: ["Vit", "Röd", "Grön"],
  correct: 0,
  ...over,
});

export const number = (over: Partial<NumberBody> = {}): NumberBody => ({
  kind: "number",
  text: "Hur många snöflingor ryms i en vante?",
  photo: null,
  seconds: 20,
  answer: 42,
  ...over,
});

export async function host(...questions: QuestionBody[]): Promise<Admin> {
  const admin = await connectAdmin();
  for (const body of questions) admin.send({ t: "save-question", id: null, body });
  await admin.state((s) => s.quiz.questions.length === questions.length);
  return admin;
}

export async function phone(name: string, cookie?: string): Promise<Phone> {
  cookie ??= await joinedCookie(name);
  const socket = await connectGuest(cookie);
  const { you } = await socket.state();
  return { socket, id: you.id, name: you.name, cookie };
}

export async function phones(...names: string[]): Promise<Phone[]> {
  const out: Phone[] = [];
  for (const name of names) out.push(await phone(name));
  return out;
}

export async function stage<P extends Phase>(admin: Admin, phase: P): Promise<AdminStage & { phase: P }> {
  const { quiz } = await admin.current((s) => s.quiz.stage.phase === phase);
  return quiz.stage as AdminStage & { phase: P };
}

export async function step<P extends Phase>(admin: Admin, quizStep: QuizStep, phase: P): Promise<AdminStage & { phase: P }> {
  admin.send({ t: "quiz", step: quizStep });
  return stage(admin, phase);
}

export async function start(admin: Admin): Promise<QuestionId> {
  return (await step(admin, "start", "open")).q;
}

export async function view<P extends GuestQuiz["phase"]>(phone: Phone, phase: P): Promise<Extract<GuestQuiz, { phase: P }>> {
  const { quiz } = await phone.socket.current((s) => s.quiz.phase === phase);
  return quiz as Extract<GuestQuiz, { phase: P }>;
}

export async function answerCmd(phone: Phone, q: QuestionId, pick: number, ms = 0): Promise<GuestCmd> {
  const quiz = phone.socket.latest()?.quiz ?? (await phone.socket.state()).quiz;
  return { t: "answer", q, pick, ms, run: "unlockedAt" in quiz ? quiz.unlockedAt : 0 };
}

export async function answer(phone: Phone, q: QuestionId, pick: number, ms = 0): Promise<void> {
  phone.socket.send(await answerCmd(phone, q, pick, ms));
  await phone.socket.state((s) => "question" in s.quiz && s.quiz.question.id === q && s.quiz.pick !== null);
}

export async function refused(phone: Phone, q: QuestionId, pick: number, ms = 0): Promise<string> {
  phone.socket.send(await answerCmd(phone, q, pick, ms));
  return phone.socket.error();
}

export async function revealPoints(admin: Admin, all: Phone[]): Promise<Record<string, number>> {
  await step(admin, "reveal", "reveal");
  const out: Record<string, number> = {};
  for (const p of all) out[p.name] = (await view(p, "reveal")).points;
  return out;
}

export function closeAll(...sockets: { close(): void }[]): void {
  for (const s of sockets) s.close();
}
