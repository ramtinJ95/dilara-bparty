import { evictAllDurableObjects } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { PhotoId, QuestionId } from "../src/shared/model";
import type { AdminCmd, AdminState, Heartbeat } from "../src/shared/protocol";
import { PHOTO_MAX_BYTES } from "../src/worker/photo-store";
import {
  answer,
  answerCmd,
  choice,
  closeAll,
  host,
  number,
  phone,
  phones,
  refused,
  revealPoints,
  stage,
  start,
  step,
  view,
  type Admin,
  type Phone,
} from "./support/quiz";
import { adminCookie as adminCookieOf, alarmAt, call, connectAdmin, elapse, fireAlarm, JOIN_SECRET, joinedCookie, uploadQuestionPhoto } from "./support/worker";

const texts = (s: AdminState) => s.quiz.questions.map((q) => q.text);

describe("questions", () => {
  it("adds, edits, reorders and deletes questions", async () => {
    const admin = await host(choice({ text: "Fråga A" }), number({ text: "Fråga B" }), choice({ text: "Fråga C" }));
    const [a, b, c] = (await admin.current()).quiz.questions.map((q) => q.id) as [QuestionId, QuestionId, QuestionId];

    admin.send({ t: "save-question", id: b, body: number({ text: "Hur många istappar?", answer: 7 }) });
    const edited = await admin.state((s) => texts(s).includes("Hur många istappar?"));
    expect(edited.quiz.questions[1]).toEqual({ ...number({ text: "Hur många istappar?", answer: 7 }), id: b });

    admin.send({ t: "move-question", id: c, to: 0 });
    expect(texts(await admin.state((s) => s.quiz.questions[0]?.id === c))).toEqual(["Fråga C", "Fråga A", "Hur många istappar?"]);
    admin.send({ t: "move-question", id: c, to: 99 });
    expect(texts(await admin.state((s) => s.quiz.questions[2]?.id === c))).toEqual(["Fråga A", "Hur många istappar?", "Fråga C"]);
    admin.send({ t: "move-question", id: b, to: -3 });
    expect(texts(await admin.state((s) => s.quiz.questions[0]?.id === b))).toEqual(["Hur många istappar?", "Fråga A", "Fråga C"]);

    admin.send({ t: "delete-question", id: a });
    const after = await admin.state((s) => s.quiz.questions.length === 2);
    expect(texts(after)).toEqual(["Hur många istappar?", "Fråga C"]);
    expect(after.quiz.next).toBe(b);
    admin.close();
  });

  it("refuses an invalid question and an unknown id", async () => {
    const admin = await host(choice());
    const missing = "AAAAAAAAAAAAAAAAAAAAAA" as QuestionId;
    admin.send({ t: "save-question", id: null, body: { ...choice(), options: ["Bara en"] } });
    expect(await admin.error()).toBe("Unknown command.");
    const commands: AdminCmd[] = [
      { t: "save-question", id: missing, body: choice() },
      { t: "delete-question", id: missing },
      { t: "move-question", id: missing, to: 0 },
    ];
    for (const cmd of commands) {
      admin.send(cmd);
      expect(await admin.error(), cmd.t).toBe("That question no longer exists.");
    }
    admin.close();
    const fresh = await connectAdmin();
    expect((await fresh.state()).quiz.questions).toHaveLength(1);
    fresh.close();
  });

  it("refuses to edit or delete a played question until the quiz is reset", async () => {
    const admin = await host(choice(), choice({ text: "Fråga två" }));
    await step(admin, "unlock", "lobby");
    const q = await start(admin);
    expect((await admin.current()).quiz.played).toEqual([q]);

    const played = "This question has already been played. Reset the quiz to change it.";
    admin.send({ t: "save-question", id: q, body: choice({ text: "Ändrad" }) });
    expect(await admin.error()).toBe(played);
    admin.send({ t: "delete-question", id: q });
    expect(await admin.error()).toBe(played);

    await step(admin, "reset", "locked");
    admin.send({ t: "save-question", id: q, body: choice({ text: "Ändrad" }) });
    const after = await admin.state((s) => texts(s).includes("Ändrad"));
    expect(after.quiz.played).toEqual([]);
    admin.close();
  });
});

describe("quiz flow", () => {
  it("pushes the unlock to every connected phone and to a phone that connects later", async () => {
    const admin = await host(choice());
    const [astrid, olle] = await phones("Astrid", "Olle");
    for (const p of [astrid!, olle!]) expect((await p.socket.current()).quiz).toEqual({ phase: "locked" });

    const before = Date.now();
    await step(admin, "unlock", "lobby");
    const lobby = await view(astrid!, "lobby");
    expect(lobby.unlockedAt).toBeGreaterThanOrEqual(before);
    expect(await view(olle!, "lobby")).toEqual(lobby);

    const late = await phone("Sen gäst");
    expect((await late.socket.current()).quiz).toEqual(lobby);
    closeAll(admin, astrid!.socket, olle!.socket, late.socket);
  });

  it("refuses steps the phase does not allow and a start with no questions left", async () => {
    const admin = await host(choice());
    admin.send({ t: "quiz", step: "start" });
    expect(await admin.error()).toBe(`"start" isn't possible while the quiz is locked.`);
    await step(admin, "unlock", "lobby");
    admin.send({ t: "quiz", step: "reveal" });
    expect(await admin.error()).toBe(`"reveal" isn't possible while the quiz is lobby.`);

    await start(admin);
    await elapse(22_000);
    expect(await fireAlarm()).toBe(true);
    await stage(admin, "closed");
    await step(admin, "reveal", "reveal");
    admin.send({ t: "quiz", step: "start" });
    expect(await admin.error()).toBe("There are no more questions.");
    expect((await step(admin, "end", "ended")).phase).toBe("ended");
    admin.close();
  });

  it("shows phones the question, a countdown and their own pick, never the answer", async () => {
    const admin = await host(choice({ text: "Vad heter snögubben?", options: ["Kalle", "Frost"], correct: 1 }), number());
    const [astrid, olle] = await phones("Astrid", "Olle");
    const { unlockedAt } = await step(admin, "unlock", "lobby").then(() => view(astrid!, "lobby"));
    const q = await start(admin);

    const open = await view(astrid!, "open");
    expect(open).toEqual({
      phase: "open",
      endsInMs: expect.any(Number),
      unlockedAt,
      n: 1,
      total: 2,
      question: { id: q, kind: "choice", text: "Vad heter snögubben?", photo: null, seconds: 20, options: ["Kalle", "Frost"] },
      pick: null,
    });
    expect(open.endsInMs).toBeGreaterThan(19_000);
    expect(open.endsInMs).toBeLessThanOrEqual(20_000);

    await answer(astrid!, q, 1, 900);
    const tally = await admin.state((s) => s.quiz.stage.phase === "open" && s.quiz.stage.answered === 1);
    expect(tally.quiz.stage).toEqual({ phase: "open", endsInMs: expect.any(Number), q, n: 1, answered: 1, expected: 2 });
    expect((await view(olle!, "open")).pick).toBeNull();
    closeAll(admin, astrid!.socket, olle!.socket);
  });

  it("closes the question when the alarm fires at the deadline, not before", async () => {
    const admin = await host(choice(), choice({ text: "Nästa", photo: null }));
    const [astrid, olle] = await phones("Astrid", "Olle");
    await step(admin, "unlock", "lobby");
    const q = await start(admin);
    await answer(astrid!, q, 0);

    expect(await fireAlarm()).toBe(true);
    const watcher = await connectAdmin();
    expect((await watcher.state()).quiz.stage.phase).toBe("open");

    await elapse(22_000);
    expect(await fireAlarm()).toBe(true);
    expect(await stage(admin, "closed")).toEqual({ phase: "closed", q, n: 1, answered: 1, expected: 2 });
    expect(await view(astrid!, "closed")).toMatchObject({ pick: 0 });
    expect(await view(olle!, "closed")).toMatchObject({ pick: null });
    expect(await refused(olle!, q, 0)).toBe("Svaret kom för sent.");
    closeAll(admin, watcher, astrid!.socket, olle!.socket);
  });

  it("shares the one alarm with the liveness check and still closes the question once every socket is gone", async () => {
    const admin = await host(choice());
    const [astrid] = await phones("Astrid");
    await step(admin, "unlock", "lobby");
    await start(admin);
    expect(await alarmAt()).toBeLessThanOrEqual(Date.now() + 4_000);

    closeAll(admin, astrid!.socket);
    await expect.poll(() => admin.closed && astrid!.socket.closed).toBe(true);
    await fireAlarm();
    const wake = await alarmAt();
    expect(wake).toBeGreaterThan(Date.now() + 15_000);
    expect(wake).toBeLessThanOrEqual(Date.now() + 22_000);

    await elapse(22_000);
    await fireAlarm();
    const watcher = await connectAdmin();
    expect((await watcher.state()).quiz.stage.phase).toBe("closed");
    watcher.close();
  });

  it("closes early once every online player has answered, without waiting for offline ones", async () => {
    const admin = await host(choice());
    await joinedCookie("Borta");
    const [astrid, olle] = await phones("Astrid", "Olle");
    await step(admin, "unlock", "lobby");
    const q = await start(admin);

    await answer(astrid!, q, 0);
    expect((await admin.state((s) => s.quiz.stage.phase === "open" && s.quiz.stage.answered === 1)).quiz.stage.phase).toBe("open");
    olle!.socket.send(await answerCmd(olle!, q, 2));
    expect(await stage(admin, "closed")).toMatchObject({ answered: 2, expected: 2 });
    closeAll(admin, astrid!.socket, olle!.socket);
  });

  it("closes early when the last player who hasn't answered leaves", async () => {
    const admin = await host(choice());
    const [astrid, olle] = await phones("Astrid", "Olle");
    await step(admin, "unlock", "lobby");
    const q = await start(admin);
    await answer(astrid!, q, 0);
    olle!.socket.close();
    expect(await stage(admin, "closed")).toMatchObject({ answered: 1, expected: 1 });
    closeAll(admin, astrid!.socket);
  });

  it("lets a late joiner play the current question, timed from when the phone got it", async () => {
    const admin = await host(choice());
    const astrid = await phone("Astrid");
    await step(admin, "unlock", "lobby");
    const q = await start(admin);
    await elapse(10_000);

    const late = await phone("Sen gäst");
    expect((await view(late, "open")).question.id).toBe(q);
    await answer(late, q, 0, 99_999);
    await answer(astrid, q, 0, 10_000);
    await stage(admin, "closed");
    const points = await revealPoints(admin, [astrid, late]);
    expect(points["Astrid"]).toBe(750);
    expect(points["Sen gäst"]).toBeGreaterThanOrEqual(990);
    closeAll(admin, astrid.socket, late.socket);
  });

  it("gives a reconnecting phone its pick back and later its points", async () => {
    const admin = await host(choice());
    const [astrid, olle] = await phones("Astrid", "Olle");
    await step(admin, "unlock", "lobby");
    const q = await start(admin);
    await answer(astrid!, q, 0);
    astrid!.socket.close();
    await admin.state((s) => s.players.find((p) => p.id === astrid!.id)?.online === false);

    const again = await phone("Astrid", astrid!.cookie);
    expect(await view(again, "open")).toMatchObject({ pick: 0, question: { id: q } });
    await answer(olle!, q, 1);
    await stage(admin, "closed");
    await step(admin, "reveal", "reveal");
    expect(await view(again, "reveal")).toMatchObject({ pick: 0, points: 1000, score: 1000 });
    closeAll(admin, again.socket, olle!.socket);
  });

  it("keeps the first answer and the open question across hibernation", async () => {
    const admin = await host(choice());
    const [astrid, olle] = await phones("Astrid", "Olle");
    await step(admin, "unlock", "lobby");
    const q = await start(admin);
    await evictAllDurableObjects();

    await answer(astrid!, q, 1);
    astrid!.socket.send(await answerCmd(astrid!, q, 0));
    expect((await astrid!.socket.state()).quiz).toMatchObject({ phase: "open", pick: 1 });
    await answer(olle!, q, 0);
    await stage(admin, "closed");
    expect(await revealPoints(admin, [astrid!, olle!])).toEqual({ Astrid: 0, Olle: 1000 });
    closeAll(admin, astrid!.socket, olle!.socket);
  });

  it("refuses answers outside the open question and picks the question can't take", async () => {
    const admin = await host(choice({ options: ["Ett", "Två"] }), number());
    const astrid = await phone("Astrid");
    await step(admin, "unlock", "lobby");
    const next = (await admin.current()).quiz.next!;
    expect(await refused(astrid, next, 0)).toBe("Svaret kom för sent.");

    const q = await start(admin);
    for (const pick of [2, -1, 0.5]) expect(await refused(astrid, q, pick), String(pick)).toBe("Svaret gick inte att läsa.");
    expect(await refused(astrid, "AAAAAAAAAAAAAAAAAAAAAA" as QuestionId, 0)).toBe("Svaret kom för sent.");
    const fresh = await connectAdmin();
    expect((await fresh.state()).quiz.stage).toMatchObject({ phase: "open", answered: 0 });
    closeAll(admin, fresh, astrid.socket);
  });

  it("ignores quiz commands sent from a phone", async () => {
    const admin = await host(choice());
    const astrid = await phone("Astrid");
    for (const cmd of [{ t: "quiz", step: "unlock" }, { t: "save-question", id: null, body: choice() }]) {
      astrid.socket.ws.send(JSON.stringify(cmd));
      expect(await astrid.socket.next((m) => m.t === "error")).toEqual({ t: "error", message: "Det där gick inte, försök igen." });
    }
    const now = await connectAdmin();
    const state = await now.state();
    expect(state.quiz.stage).toEqual({ phase: "locked" });
    expect(state.quiz.questions).toHaveLength(1);
    closeAll(admin, now, astrid.socket);
  });

  it("resets every phone to locked and clears the scores", async () => {
    const admin = await host(choice());
    const astrid = await phone("Astrid");
    await step(admin, "unlock", "lobby");
    const q = await start(admin);
    await answer(astrid, q, 0);
    await step(admin, "reveal", "reveal");

    await step(admin, "reset", "locked");
    expect(await view(astrid, "locked")).toEqual({ phase: "locked" });
    const after = await admin.current();
    expect(after.quiz).toMatchObject({ played: [], next: q, winners: [] });
    expect(after.quiz.board.map((r) => r.score)).toEqual([0]);
    closeAll(admin, astrid.socket);
  });

  it("refuses an answer sent before a reset when it arrives after the same question restarts", async () => {
    const admin = await host(choice());
    const astrid = await phone("Astrid");
    await step(admin, "unlock", "lobby");
    const q = await start(admin);
    const sentBeforeReset = await answerCmd(astrid, q, 1);

    await step(admin, "reset", "locked");
    await step(admin, "unlock", "lobby");
    expect(await start(admin)).toBe(q);
    astrid.socket.send(sentBeforeReset);
    expect(await astrid.socket.next((m) => m.t === "error")).toEqual({ t: "error", message: "Svaret kom för sent." });

    await answer(astrid, q, 0);
    expect((await view(astrid, "closed")).pick).toBe(0);
    closeAll(admin, astrid.socket);
  });
});

describe("question photos", () => {
  const bytes = new Uint8Array([255, 216, 255, 1, 2, 3]);

  const photoStatus = (id: string, cookie?: string) => call(`/photos/${id}`, { cookie }).then((res) => res.status);

  it("shows a guest a question photo only once its question has started in this run", async () => {
    const upload = await uploadQuestionPhoto(bytes);
    expect(upload.status).toBe(200);
    const { id: first } = (await upload.json()) as { id: string };
    const { id: second } = (await (await uploadQuestionPhoto(bytes, "image/webp")).json()) as { id: string };

    const admin = await host(choice({ photo: first as PhotoId }), number({ photo: second as PhotoId }));
    const astrid = await phone("Astrid");
    const adminCookie = await adminCookieOf();
    expect(await photoStatus(first, astrid.cookie)).toBe(404);
    expect(await photoStatus(first, adminCookie)).toBe(200);

    await step(admin, "unlock", "lobby");
    expect(await photoStatus(first, astrid.cookie)).toBe(404);
    const q = await start(admin);
    expect((await view(astrid, "open")).question.photo).toBe(first);
    expect(await photoStatus(first, astrid.cookie)).toBe(200);
    expect(await photoStatus(second, astrid.cookie)).toBe(404);
    await answer(astrid, q, 0);
    await step(admin, "reveal", "reveal");
    await start(admin);
    expect(await photoStatus(first, astrid.cookie)).toBe(200);
    expect(await photoStatus(second, astrid.cookie)).toBe(200);

    await step(admin, "reset", "locked");
    expect(await photoStatus(first, astrid.cookie)).toBe(404);
    expect(await photoStatus(second, astrid.cookie)).toBe(404);
    expect(await photoStatus(second, adminCookie)).toBe(200);
    closeAll(admin, astrid.socket);
  });

  it("makes phones revalidate a question photo, so a cached copy stops after a reset, and serves it only to joined guests", async () => {
    const { id: first } = (await (await uploadQuestionPhoto(bytes)).json()) as { id: string };
    const admin = await host(choice({ photo: first as PhotoId }));
    const astrid = await phone("Astrid");
    await step(admin, "unlock", "lobby");
    await start(admin);

    const served = await call(`/photos/${first}`, { cookie: astrid.cookie });
    expect(served.status).toBe(200);
    expect(served.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes);
    const etag = served.headers.get("ETag")!;
    const again = () => call(`/photos/${first}`, { cookie: astrid.cookie, headers: { "If-None-Match": etag } });
    expect((await again()).status).toBe(304);
    await step(admin, "reset", "locked");
    expect((await again()).status).toBe(404);
    expect((await call(`/photos/${first}`)).status).toBe(401);
    expect((await call(`/j/${JOIN_SECRET}/photos/${first}`)).status).toBe(404);
    closeAll(admin, astrid.socket);
  });

  it("checks the type and size like the landing photo", async () => {
    expect((await uploadQuestionPhoto(new Uint8Array([1]), "image/gif")).status).toBe(415);
    expect((await uploadQuestionPhoto(new Uint8Array(PHOTO_MAX_BYTES + 1))).status).toBe(413);
  });
});

describe("heartbeat", () => {
  const heartbeat = (socket: Phone["socket"] | Admin, want: Heartbeat) => socket.next((m) => m.t === "state" && m.heartbeat === want);

  it("switches phones to fast ticks when the quiz unlocks, and back when it ends or is reset", { timeout: 15_000 }, async () => {
    const admin = await host(choice());
    const guest = await phone("Astrid");
    await step(admin, "unlock", "lobby");
    await heartbeat(guest.socket, "fast");
    const ticks = guest.socket.ticks;
    await expect.poll(() => guest.socket.ticks, { timeout: 5_000 }).toBeGreaterThan(ticks);

    await step(admin, "end", "ended");
    await heartbeat(guest.socket, "slow");

    await step(admin, "reset", "locked");
    await step(admin, "unlock", "lobby");
    await heartbeat(guest.socket, "fast");
    await step(admin, "reset", "locked");
    await heartbeat(guest.socket, "slow");
    closeAll(guest.socket, admin);
  });
});
