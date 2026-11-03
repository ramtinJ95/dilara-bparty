import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs, parseEnv } from "node:util";
import { LOOKS, placeholder, type Look } from "../e2e/placeholder.ts";
import { CONTEST_UPLOAD_PATH, UPLOAD_FIELDS } from "../src/shared/api.ts";
import type { PhotoId, QuestionId } from "../src/shared/model.ts";
import type { AdminCmd, AdminState, GuestCmd, GuestState, ServerMsg } from "../src/shared/protocol.ts";
import type { Question, QuestionBody } from "../src/shared/quiz.ts";

const USAGE = "Usage: npm run seed -- [--base-url http://127.0.0.1:<port>] [--bots]\nWithout --base-url it waits for the web service's port from `nexus services list`.";

const PLAYERS = ["Testgäst Saga", "Testgäst Nils", "Testgäst Maja", "Testgäst Ebbe", "Testgäst Tove", "Testgäst Algot"];

const LANDING: Look = LOOKS.snow;

const QUESTIONS: { look?: Look; body: QuestionBody }[] = [
  { body: { kind: "choice", text: "Vilken färg har nysnö?", photo: null, seconds: 20, options: ["Blå", "Vit", "Grön", "Röd"], correct: 1 } },
  { look: LOOKS.dusk, body: { kind: "choice", text: "Vilken form ser du på bilden?", photo: null, seconds: 20, options: ["Hjärta", "Krona", "Stjärna", "Snöflinga"], correct: 2 } },
  { body: { kind: "number", text: "Hur många ben har tre spindlar tillsammans?", photo: null, seconds: 20, answer: 24 } },
  { look: LOOKS.mint, body: { kind: "choice", text: "Är det ett hjärta på bilden?", photo: null, seconds: 15, options: ["Ja", "Nej"], correct: 0 } },
  {
    body: {
      kind: "choice",
      text: "Vilket av de här djuren kan man få syn på i snön långt uppe i norr, om man har tur och är riktigt tyst?",
      photo: null,
      seconds: 25,
      options: ["Kamel", "Isbjörn", "Papegoja"],
      correct: 1,
    },
  },
  { body: { kind: "number", text: "Hur många dagar har ett år?", photo: null, seconds: 20, answer: 365 } },
];

// Indexes into PLAYERS. Each guest has 3 votes, so the bots keep a few to spend later.
const CONTEST: { by: number; look: Look; voters: number[] }[] = [
  { by: 0, look: { ...LOOKS.rose, seed: 3 }, voters: [5, 5, 1] },
  { by: 1, look: LOOKS.sun, voters: [0, 2] },
  { by: 2, look: LOOKS.sea, voters: [3] },
  { by: 3, look: { ...LOOKS.snow, shape: "crown", seed: 17 }, voters: [] },
  { by: 4, look: { ...LOOKS.mint, shape: "star", seed: 5 }, voters: [0, 3] },
];
// Replacing a photo that has votes moves it to the hall of fame.
const REPLACEMENTS: { by: number; look: Look }[] = [{ by: 0, look: { ...LOOKS.dusk, shape: "heart", seed: 71 } }];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const between = (min: number, max: number) => min + Math.random() * (max - min);
const anyOf = <T>(items: T[]): T | undefined => items[Math.floor(Math.random() * items.length)];

type Reply = { ok: true } | { ok: false; error: string };

/** A party socket as a phone or the admin laptop holds it: the latest snapshot, commands answered in order, and a reconnect until the server says the player is gone. */
class Live<S> {
  state: S | null = null;
  private ws: WebSocket | null = null;
  private replies: ((reply: Reply) => void)[] = [];
  private stopped = false;
  private first = Promise.withResolvers<S>();
  onState: (state: S) => void = () => {};
  private readonly url: URL;
  private readonly cookie: string;

  constructor(url: URL, cookie: string) {
    this.url = url;
    this.cookie = cookie;
    this.open();
  }

  get ready(): Promise<S> {
    return this.first.promise;
  }

  private open() {
    // Node's WebSocket takes headers in its second argument, which the DOM type doesn't know. The socket route wants a same-origin Origin.
    const origin = this.url.origin.replace(/^ws/, "http");
    const ws = (this.ws = new WebSocket(this.url, { headers: { cookie: this.cookie, origin } } as unknown as string[]));
    ws.onmessage = (e) => {
      const text = String(e.data);
      // Ticks and pongs are bare words, not JSON.
      if (!text.startsWith("{")) return;
      const msg = JSON.parse(text) as ServerMsg<S>;
      if (msg.t === "state") {
        this.state = msg.state;
        this.first.resolve(msg.state);
        this.onState(msg.state);
      } else if (msg.t === "ack") this.replies.shift()?.({ ok: true });
      else if (msg.t === "error") this.replies.shift()?.({ ok: false, error: msg.message });
      else this.stopped = true;
    };
    ws.onclose = () => {
      for (const reply of this.replies.splice(0)) reply({ ok: false, error: "the socket closed" });
      if (!this.stopped) setTimeout(() => this.open(), 3_000);
    };
  }

  send(cmd: S extends AdminState ? AdminCmd : GuestCmd): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) throw new Error("not connected");
      this.ws.send(JSON.stringify(cmd));
      this.replies.push((r) => (r.ok ? resolve() : reject(new Error(r.error))));
    });
  }

  close() {
    this.stopped = true;
    this.ws?.close();
  }
}

function isLocal(baseUrl: string): boolean {
  try {
    return /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

async function webServiceUrl(): Promise<string> {
  for (;;) {
    try {
      const { services } = JSON.parse(execFileSync("nexus", ["services", "list", "--json"], { encoding: "utf8" })) as { services: { name: string; state: string; port: number }[] };
      const web = services.find((s) => s.name === "web" && s.state === "ready");
      if (web) return `http://127.0.0.1:${web.port}`;
    } catch {}
    await sleep(2_000);
  }
}

function cookieFrom(res: Response, name: string): string | null {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(";")[0] ?? null;
}

async function adminCookie(base: string, secret: string): Promise<string> {
  for (let tries = 1; ; tries++) {
    const res = await fetch(new URL(`/admin/${secret}`, base), { redirect: "manual" }).catch(() => null);
    const cookie = res && cookieFrom(res, "admin");
    if (cookie) return cookie;
    if (res?.status === 404) throw new Error(`${base} doesn't know this ADMIN_SECRET; is it the app this .dev.vars belongs to?`);
    if (tries === 60) throw new Error(`${base} gave no admin cookie after 2 minutes`);
    await sleep(2_000);
  }
}

// Reclaiming by name hands back the player who already has it, so a second run gets the same players with fresh cookies.
async function join(base: string, secret: string, name: string): Promise<string> {
  const res = await fetch(new URL("/api/join", base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, name, reclaim: true }),
  });
  const cookie = cookieFrom(res, "pid");
  if (!cookie) throw new Error(`${name} could not join: HTTP ${res.status} ${await res.text()}`);
  return cookie;
}

async function photoId(res: Response, what: string): Promise<PhotoId> {
  if (!res.ok) throw new Error(`${what} failed: HTTP ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: PhotoId }).id;
}

type Seeder = {
  base: string;
  admin: Live<AdminState>;
  adminCookie: string;
  guests: Live<GuestState>[];
  guestCookies: string[];
  draw: (look: Look, size?: [number, number]) => Promise<Buffer>;
};

const adminPhoto = (s: Seeder, path: string, png: Buffer) =>
  fetch(new URL(path, s.base), { method: "PUT", headers: { cookie: s.adminCookie, "Content-Type": "image/png" }, body: new Uint8Array(png) }).then((res) => photoId(res, `PUT ${path}`));

async function uploadContest(s: Seeder, by: number, look: Look): Promise<PhotoId> {
  const form = new FormData();
  form.append(UPLOAD_FIELDS.key, randomBytes(16).toString("base64url"));
  form.append(UPLOAD_FIELDS.photo, new Blob([new Uint8Array(await s.draw(look))], { type: "image/png" }), "photo.png");
  form.append(UPLOAD_FIELDS.thumb, new Blob([new Uint8Array(await s.draw(look, [400, 400]))], { type: "image/png" }), "thumb.png");
  const res = await fetch(new URL(CONTEST_UPLOAD_PATH, s.base), { method: "POST", headers: { cookie: s.guestCookies[by]! }, body: form });
  return photoId(res, `${PLAYERS[by]}'s upload`);
}

// Each part is seeded only while the party has none of it, so a second run, or a run after the host added their own, changes nothing.
const PARTS: { name: string; seeded: (state: AdminState) => boolean; seed: (s: Seeder) => Promise<void> }[] = [
  {
    name: "landing photo",
    seeded: (state) => state.landingPhoto !== null,
    seed: async (s) => void (await adminPhoto(s, "/api/admin/landing-photo", await s.draw(LANDING))),
  },
  {
    name: "quiz questions",
    seeded: (state) => state.quiz.questions.length > 0,
    async seed(s) {
      for (const { look, body } of QUESTIONS) {
        const photo = look ? await adminPhoto(s, "/api/admin/question-photo", await s.draw(look)) : null;
        await s.admin.send({ t: "save-question", id: null, body: { ...body, photo } });
      }
    },
  },
  {
    name: "contest photos and votes",
    seeded: (state) => state.contest.entrants.some((e) => e.versions.length > 0),
    async seed(s) {
      const ids: PhotoId[] = [];
      for (const { by, look } of CONTEST) ids.push(await uploadContest(s, by, look));
      for (const [i, { voters }] of CONTEST.entries()) {
        for (const voter of voters) await s.guests[voter]!.send({ t: "vote", photo: ids[i]! });
      }
      for (const { by, look } of REPLACEMENTS) await uploadContest(s, by, look);
    },
  },
];

function describe(state: AdminState): string {
  const versions = state.contest.entrants.flatMap((e) => e.versions);
  const kinds = state.quiz.questions.map((q) => `${q.kind}${q.photo ? "+photo" : ""}`);
  return [
    `players (${state.players.length}): ${state.players.map((p) => `${p.name}${p.online ? " (online)" : ""}`).join(", ")}`,
    `landing photo: ${state.landingPhoto ? "yes" : "no"}`,
    `questions (${kinds.length}): ${kinds.join(", ")}`,
    `contest: ${versions.length} versions, ${state.contest.tally.filter((r) => !r.fame).length} in the gallery, ${state.contest.tally.filter((r) => r.fame).length} in the hall of fame, ${versions.reduce((n, v) => n + v.votes, 0)} votes`,
    `quiz ${state.quiz.stage.phase}, quiz finale ${state.finale.quiz.stage}, photo finale ${state.finale.photo.stage}, joins ${state.finale.joins ? "open" : "closed"}`,
  ].join("\n  ");
}

function guess(q: Question): number {
  if (q.kind === "number") return Math.round(q.answer * between(0.8, 1.2));
  if (Math.random() < 0.75) return q.correct;
  return anyOf(q.options.map((_, i) => i).filter((i) => i !== q.correct)) ?? q.correct;
}

/** Answers every open question after a few seconds, mostly right, and now and then spends or moves a vote. */
function play(name: string, guest: Live<GuestState>, answerKey: (id: QuestionId) => Question | undefined) {
  const asked = new Set<string>();
  const report = (what: string) => (e: unknown) => console.log(`${name}: ${what}: ${e instanceof Error ? e.message : e}`);
  const onState = (state: GuestState) => {
    const quiz = state.quiz;
    if (quiz.phase !== "open" || quiz.pick !== null) return;
    const round = `${quiz.unlockedAt}:${quiz.question.id}`;
    const q = answerKey(quiz.question.id);
    if (asked.has(round) || !q) return;
    asked.add(round);
    const ms = Math.round(Math.min(between(2_000, 12_000), Math.max(0, quiz.endsInMs - 500)));
    setTimeout(() => guest.send({ t: "answer", q: q.id, pick: guess(q), ms, run: quiz.unlockedAt }).catch(report("answer")), ms);
  };
  async function vote() {
    const contest = guest.state?.contest;
    if (!contest?.voting) return;
    const others = contest.gallery.filter((p) => !p.own);
    const to = anyOf(others);
    if (!to) return;
    // Votes never leave the hall of fame, because a replaced photo whose last vote moves away is gone for good.
    const from = contest.votesLeft === 0 ? anyOf(others.filter((p) => p.mine > 0 && !p.fame && p !== to)) : undefined;
    if (contest.votesLeft === 0 && !from) return;
    if (from) await guest.send({ t: "unvote", photo: from.id });
    await guest.send({ t: "vote", photo: to.id });
  }
  const wander = () => setTimeout(() => void vote().catch(report("vote")).finally(wander), between(20_000, 60_000));
  wander();
  return onState;
}

// Playwright is loaded only to draw, so the bots that stay running after a seeded wake don't carry it.
async function launchBrowser() {
  const [{ chromium }, { chromiumLaunchOptions }] = await Promise.all([import("@playwright/test"), import("../e2e/drive.ts")]);
  return chromium.launch(chromiumLaunchOptions());
}

function usage(problem: string): never {
  console.error(`${problem}\n${USAGE}`);
  process.exit(2);
}

const { values: args } = parseArgs({ options: { "base-url": { type: "string" }, bots: { type: "boolean", default: false } } });
const base = args["base-url"] ?? (await webServiceUrl());
if (!isLocal(base)) usage(`Refusing ${base}: the seed only runs against a local dev server (localhost or 127.x).`);
const vars = parseEnv(readFileSync(new URL("../.dev.vars", import.meta.url), "utf8"));
const joinSecret = vars.JOIN_SECRET ?? usage(".dev.vars has no JOIN_SECRET.");
const adminSecret = vars.ADMIN_SECRET ?? usage(".dev.vars has no ADMIN_SECRET.");

const wsUrl = (path: string) => Object.assign(new URL(path, base), { protocol: "ws:" });
const cookie = await adminCookie(base, adminSecret);
const admin = new Live<AdminState>(wsUrl("/ws/admin"), cookie);
const before = await admin.ready;
const guestCookies = await Promise.all(PLAYERS.map((name) => join(base, joinSecret, name)));
const answerKey = (id: QuestionId) => admin.state?.quiz.questions.find((q) => q.id === id);
const guests = guestCookies.map((c, i) => {
  const guest = new Live<GuestState>(wsUrl("/ws"), c);
  if (args.bots) guest.onState = play(PLAYERS[i]!, guest, answerKey);
  return guest;
});
await Promise.all(guests.map((g) => g.ready));

const todo = PARTS.filter((p) => !p.seeded(before));
const browser = todo.length ? await launchBrowser() : null;
try {
  const page = await browser?.newPage();
  const draw = (look: Look, size?: [number, number]) => placeholder(page!, look, size);
  const seeder: Seeder = { base, admin, adminCookie: cookie, guests, guestCookies, draw };
  for (const part of PARTS) {
    if (!todo.includes(part)) {
      console.log(`kept the party's ${part.name}`);
      continue;
    }
    await part.seed(seeder);
    console.log(`seeded ${part.name}`);
  }
} finally {
  await browser?.close();
}

const check = new Live<AdminState>(wsUrl("/ws/admin"), cookie);
console.log(`${base} now has:\n  ${describe(await check.ready)}`);
check.close();
if (args.bots) console.log(`${PLAYERS.length} bots are online and play every question the host starts. Stop with Ctrl-C.`);
else [admin, ...guests].forEach((s) => s.close());
