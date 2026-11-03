import { describe, expect, it, vi } from "vitest";
import { REVEAL_SHOW_MS, type FinaleKind, type FinaleStage, type FinaleStep, type GuestFinales } from "../src/shared/finale";
import type { PhotoId } from "../src/shared/model";
import type { AdminCmd, AdminState, Heartbeat } from "../src/shared/protocol";
import { answer, closeAll, host, number, phone, phones, stage, start, step, type Admin, type Phone } from "./support/quiz";
import { adminCookie, alarmAt, call, connectAdmin, connectGuest, fireAlarm, join, uploadContest, uploadContestAs } from "./support/worker";

async function adminError(admin: Admin, cmd: AdminCmd): Promise<string> {
  admin.send(cmd);
  return admin.error();
}

const press = (admin: Admin, kind: FinaleKind, step: FinaleStep) => admin.send({ t: "finale", kind, step });

async function finale<K extends FinaleKind, S extends FinaleStage>(p: Phone, kind: K, stage: S): Promise<Extract<GuestFinales[K], { stage: S }>> {
  return (await p.socket.current((s) => s.finale[kind].stage === stage)).finale[kind] as Extract<GuestFinales[K], { stage: S }>;
}

const adminAt = (admin: Admin, kind: FinaleKind, stage: FinaleStage) => admin.current((s) => s.finale[kind].stage === stage);

const heartbeatWith = (admin: Admin, heartbeat: Heartbeat, until: (s: AdminState) => boolean) =>
  admin.next((m) => m.t === "state" && m.heartbeat === heartbeat && until(m.state));

const upload = async (p: Phone): Promise<PhotoId> => (await uploadContestAs(p)).id;

async function vote(p: Phone, photo: PhotoId): Promise<void> {
  p.socket.send({ t: "vote", photo });
  await p.socket.state((s) => s.contest.gallery.some((g) => g.id === photo && g.mine > 0));
}

// Astrid and Olle guess the number exactly and share first place; Saga guesses far off.
async function playQuiz(admin: Admin, [astrid, olle, saga]: Phone[]): Promise<void> {
  await step(admin, "unlock", "lobby");
  const q = await start(admin);
  await answer(astrid!, q, 42);
  await answer(olle!, q, 42);
  await answer(saga!, q, 1);
  await stage(admin, "reveal");
  await step(admin, "end", "ended");
}

const JOINT = [["Astrid", 1000], ["Olle", 1000]];
const named = (win: { name: string; score: number }[]) => win.map((w) => [w.name, w.score]).sort();

describe("quiz finale", () => {
  it("opens once the quiz has ended, moves every phone to its suspense page and then the joint winners, and leaves the photo contest open", async () => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    const [astrid, olle, saga] = all as [Phone, Phone, Phone];
    const photo = await upload(astrid);

    expect(await adminError(admin, { t: "finale", kind: "quiz", step: "suspense" })).toBe("End the quiz before you open the quiz finale.");
    await playQuiz(admin, all);
    expect(await adminError(admin, { t: "finale", kind: "quiz", step: "reveal" })).toBe(`"reveal" isn't the next step of the quiz finale.`);

    vi.useFakeTimers({ toFake: ["Date"] });
    press(admin, "quiz", "suspense");
    for (const p of all) expect((await p.socket.current((s) => s.finale.quiz.stage === "suspense")).finale).toEqual({ quiz: { stage: "suspense" }, photo: { stage: "off" } });
    expect((await adminAt(admin, "quiz", "suspense")).contest).toMatchObject({ uploads: true, voting: true });
    await vote(olle, photo);
    expect((await uploadContest(saga.cookie)).status, "guests can still upload").toBe(200);
    expect(await adminError(admin, { t: "quiz", step: "reset" })).toBe("The quiz finale has started, so the quiz can't change.");

    press(admin, "quiz", "reveal");
    for (const p of all) {
      const shown = await finale(p, "quiz", "reveal");
      expect(shown.backInMs).toBe(REVEAL_SHOW_MS);
      expect(named(shown.win)).toEqual(JOINT);
    }
    expect((await saga.socket.current()).finale.photo, "the photo winner is still a secret").toEqual({ stage: "off" });
    expect(await adminError(admin, { t: "quiz", step: "reset" })).toBe("The quiz finale has started, so the quiz can't change.");
    closeAll(admin, ...all.map((p) => p.socket));
  });

  it("brings a phone that joins or reconnects to the current step: the suspense page, the reveal for the rest of its minute, then the app", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = Date.now();
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    const [astrid] = all as [Phone];
    await playQuiz(admin, all);

    press(admin, "quiz", "suspense");
    await adminAt(admin, "quiz", "suspense");
    const early = await phone("Tidig");
    expect((await early.socket.current()).finale.quiz).toEqual({ stage: "suspense" });

    press(admin, "quiz", "reveal");
    await adminAt(admin, "quiz", "reveal");
    vi.setSystemTime(t0 + 20_000);
    astrid.socket.close();
    const back = await phone("Astrid", astrid.cookie);
    const reveal = (await back.socket.current()).finale.quiz;
    expect(reveal).toMatchObject({ stage: "reveal", backInMs: REVEAL_SHOW_MS - 20_000 });
    expect(named(reveal.stage === "reveal" ? reveal.win : [])).toEqual(JOINT);

    vi.setSystemTime(t0 + REVEAL_SHOW_MS);
    const late = await phone("Sen");
    const done = (await late.socket.current()).finale.quiz;
    expect(done.stage, "the minute is over even before the alarm has fired").toBe("done");
    expect(named(done.stage === "done" ? done.win : [])).toEqual(JOINT);
    closeAll(admin, early.socket, back.socket, late.socket, ...all.slice(1).map((p) => p.socket));
  });
});

describe("photo finale", () => {
  it("can run before the quiz: its suspense page closes uploads, voting and the quiz, and its reveal shows the photo and its photographer", async () => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    const [astrid, olle, saga] = all as [Phone, Phone, Phone];
    const photo = await upload(astrid);
    await vote(olle, photo);

    press(admin, "photo", "suspense");
    for (const p of all) expect((await p.socket.current((s) => s.finale.photo.stage === "suspense")).finale).toEqual({ quiz: { stage: "off" }, photo: { stage: "suspense" } });
    expect((await adminAt(admin, "photo", "suspense")).contest).toMatchObject({ uploads: false, voting: false });
    olle.socket.send({ t: "unvote", photo });
    expect(await olle.socket.error()).toBe("Röstningen är stängd.");
    const refused = await uploadContest(saga.cookie);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "Uppladdningen är stängd." });
    expect(await adminError(admin, { t: "quiz", step: "unlock" })).toBe("The photo finale is on the phones.");

    vi.useFakeTimers({ toFake: ["Date"] });
    press(admin, "photo", "reveal");
    for (const p of all) {
      expect(await finale(p, "photo", "reveal")).toEqual({
        stage: "reveal",
        win: { photo, thumb: expect.any(String), owner: astrid.id, name: "Astrid", votes: 1 },
        backInMs: REVEAL_SHOW_MS,
      });
    }

    await playQuiz(admin, all);
    press(admin, "quiz", "suspense");
    press(admin, "quiz", "reveal");
    expect(named((await finale(saga, "quiz", "reveal")).win), "the quiz finale follows the photo finale").toEqual(JOINT);
    expect((await saga.socket.current()).finale.photo).toMatchObject({ stage: "reveal", win: { photo } });
    closeAll(admin, ...all.map((p) => p.socket));
  });

  it("waits for a running quiz to end", async () => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    await step(admin, "unlock", "lobby");
    expect(await adminError(admin, { t: "finale", kind: "photo", step: "suspense" })).toBe("The quiz is running. End it before you open the photo finale.");
    await start(admin);
    expect(await adminError(admin, { t: "finale", kind: "photo", step: "suspense" })).toBe("The quiz is running. End it before you open the photo finale.");
    await step(admin, "reveal", "reveal");
    await step(admin, "end", "ended");
    press(admin, "photo", "suspense");
    await adminAt(admin, "photo", "suspense");
    closeAll(admin, ...all.map((p) => p.socket));
  });

  it("makes the host pick the photo winner from a tie, and lets them change the pick until the reveal", async () => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    const [astrid, olle, saga] = all as [Phone, Phone, Phone];
    const first = await upload(astrid);
    const second = await upload(olle);
    const third = await upload(saga);
    await vote(saga, first);
    await vote(saga, second);
    press(admin, "photo", "suspense");

    const tied = await adminAt(admin, "photo", "suspense");
    expect([...tied.finale.tied].sort()).toEqual([first, second].sort());
    expect(tied.finale.pick).toBeNull();
    expect(await adminError(admin, { t: "finale", kind: "photo", step: "reveal" })).toBe("Photos are tied for first. Pick the winner before you reveal it.");
    expect(await adminError(admin, { t: "pick-photo", photo: third })).toBe("That photo isn't tied for first.");
    admin.send({ t: "pick-photo", photo: first });
    await admin.state((s) => s.finale.pick === first);
    admin.send({ t: "pick-photo", photo: second });
    await admin.state((s) => s.finale.pick === second);
    await expect.poll(() => astrid.socket.latest()?.contest.voting).toBe(false);
    expect(astrid.socket.latest()?.finale.photo, "the pick stays off the phones").toEqual({ stage: "suspense" });

    press(admin, "photo", "reveal");
    for (const p of all) expect((await finale(p, "photo", "reveal")).win).toMatchObject({ photo: second, name: "Olle", votes: 1 });
    expect(await adminError(admin, { t: "pick-photo", photo: first })).toBe("The photo winner has already been revealed.");
    closeAll(admin, ...all.map((p) => p.socket));
  });
});

describe("both finales", () => {
  it.each([
    ["quiz", "photo"],
    ["photo", "quiz"],
  ] as const)("keep the %s finale's suspense page alone on the phones until its reveal, then let the %s finale open", async (first, second) => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    await playQuiz(admin, all);
    press(admin, first, "suspense");
    await adminAt(admin, first, "suspense");
    const title = { quiz: "The quiz finale", photo: "The photo finale" }[first];
    expect(await adminError(admin, { t: "finale", kind: second, step: "suspense" })).toBe(`${title} is on the phones. Reveal it first.`);

    press(admin, first, "reveal");
    press(admin, second, "suspense");
    const after = await adminAt(admin, second, "suspense");
    expect(after.finale[first].stage).toBe("reveal");
    for (const p of all) expect((await p.socket.current((s) => s.finale[second].stage === "suspense")).finale[first].stage).toBe("reveal");
    closeAll(admin, ...all.map((p) => p.socket));
  });

  it("treat a repeated or late press of a step as done, which changes nothing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = Date.now();
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    await playQuiz(admin, all);
    for (const kind of ["quiz", "photo"] as const) {
      press(admin, kind, "suspense");
      press(admin, kind, "suspense");
      await adminAt(admin, kind, "suspense");
      press(admin, kind, "reveal");
      press(admin, kind, "reveal");
      press(admin, kind, "suspense");
      await adminAt(admin, kind, "reveal");
    }
    const shown = await admin.current();
    expect(named(shown.finale.quiz.stage === "reveal" ? shown.finale.quiz.win : [])).toEqual(JOINT);
    expect(shown.finale.photo).toEqual({ stage: "reveal", win: null, backInMs: REVEAL_SHOW_MS });

    vi.setSystemTime(t0 + REVEAL_SHOW_MS);
    await fireAlarm();
    await heartbeatWith(admin, "slow", (s) => s.finale.quiz.stage === "done" && s.finale.photo.stage === "done");
    press(admin, "quiz", "suspense");
    expect(await admin.next((m) => m.t === "ack" || m.t === "error")).toEqual({ t: "ack" });
    expect(admin.latest(), "a late press doesn't turn the fast heartbeat back on").toMatchObject({ finale: { quiz: { stage: "done" } } });
    await expect(admin.next((m) => m.t === "state" && m.heartbeat === "fast", 300)).rejects.toThrow();
    expect(await alarmAt()).toBe(t0 + REVEAL_SHOW_MS + 30_000);
    closeAll(admin, ...all.map((p) => p.socket));
  });
});

describe("reveal on the phones", () => {
  it("runs with the fast heartbeat from the suspense page, and a minute after the reveal sends every phone back to the party with the slow one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = Date.now();
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    await playQuiz(admin, all);

    press(admin, "quiz", "suspense");
    await heartbeatWith(admin, "fast", (s) => s.finale.quiz.stage === "suspense");
    press(admin, "quiz", "reveal");
    await adminAt(admin, "quiz", "reveal");
    expect(await alarmAt(), "the fast tick comes first").toBe(t0 + 4_000);

    vi.setSystemTime(t0 + REVEAL_SHOW_MS - 1);
    await fireAlarm();
    expect(await alarmAt(), "and then the end of the reveal").toBe(t0 + REVEAL_SHOW_MS);
    for (const p of all) expect(p.socket.latest()?.finale.quiz.stage).toBe("reveal");

    vi.setSystemTime(t0 + REVEAL_SHOW_MS);
    await fireAlarm();
    for (const p of all) {
      const back = await p.socket.next((m) => m.t === "state" && m.state.finale.quiz.stage === "done");
      expect(back).toMatchObject({ heartbeat: "slow", state: { finale: { quiz: { stage: "done" }, photo: { stage: "off" } } } });
    }
    expect(await alarmAt(), "the slow tick").toBe(t0 + REVEAL_SHOW_MS + 30_000);
    closeAll(admin, ...all.map((p) => p.socket));
  });

  it("keeps the fast heartbeat when the reveal ends while the quiz is running", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = Date.now();
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    press(admin, "photo", "suspense");
    press(admin, "photo", "reveal");
    await heartbeatWith(admin, "fast", (s) => s.finale.photo.stage === "reveal");
    await step(admin, "unlock", "lobby");

    vi.setSystemTime(t0 + REVEAL_SHOW_MS);
    await fireAlarm();
    for (const p of all) {
      expect(await p.socket.next((m) => m.t === "state" && m.state.finale.photo.stage === "done")).toMatchObject({ heartbeat: "fast", state: { quiz: { phase: "lobby" } } });
    }
    closeAll(admin, ...all.map((p) => p.socket));
  });

  it("ends on time when nobody is connected", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = Date.now();
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    await playQuiz(admin, all);
    press(admin, "quiz", "suspense");
    press(admin, "quiz", "reveal");
    await adminAt(admin, "quiz", "reveal");

    const sockets = [admin, ...all.map((p) => p.socket)];
    closeAll(...sockets);
    await expect.poll(() => sockets.every((s) => s.closed)).toBe(true);
    await fireAlarm();
    expect(await alarmAt(), "no tick, only the end of the reveal").toBe(t0 + REVEAL_SHOW_MS);
    vi.setSystemTime(t0 + REVEAL_SHOW_MS);
    expect(await fireAlarm()).toBe(true);
    expect(await alarmAt()).toBeNull();

    const watcher = await connectAdmin();
    expect(await watcher.next()).toMatchObject({ t: "state", heartbeat: "slow", state: { finale: { quiz: { stage: "done" } } } });
    watcher.close();
  });
});

describe("revealed winners", () => {
  it("keeps the revealed photo visible after the host hides it", async () => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    const [astrid, olle] = all as [Phone, Phone];
    const photo = await upload(astrid);
    await vote(olle, photo);
    press(admin, "photo", "suspense");
    press(admin, "photo", "reveal");
    const { win } = await finale(olle, "photo", "reveal");

    admin.send({ t: "hide", photo, hidden: true });
    await admin.state((s) => s.contest.tally.length === 0);
    expect((await finale(olle, "photo", "reveal")).win).toMatchObject({ photo, name: "Astrid" });
    for (const id of [win!.photo, win!.thumb]) expect((await call(`/photos/${id}`, { cookie: olle.cookie })).status).toBe(200);
    closeAll(admin, ...all.map((p) => p.socket));
  });

  it("shows joint winners merged after the reveal as one winner", async () => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    const [astrid, olle] = all as [Phone, Phone];
    await playQuiz(admin, all);
    press(admin, "quiz", "suspense");
    press(admin, "quiz", "reveal");
    await adminAt(admin, "quiz", "reveal");

    admin.send({ t: "merge", from: astrid.id, into: olle.id });
    const merged = await astrid.socket.state((s) => s.you.id === olle.id);
    expect(merged.finale.quiz).toMatchObject({ stage: "reveal", win: [{ id: olle.id, name: "Olle", score: 1000 }] });
    expect((await olle.socket.current((s) => s.finale.quiz.stage === "reveal" && s.finale.quiz.win.length === 1)).you.id).toBe(olle.id);
    closeAll(admin, ...all.map((p) => p.socket));
  });
});

describe("end of the party", () => {
  it("refuses new guests once the party has ended, but lets a guest reclaim their name", async () => {
    const admin = await host();
    await phone("Astrid");
    admin.send({ t: "joins", open: false });
    await admin.state((s) => !s.finale.joins);

    const fresh = await join("Olle");
    expect(fresh.res.status).toBe(403);
    expect(fresh.body).toEqual({ error: "Kalaset är slut. Tack för att du var med!" });
    expect(fresh.cookie).toBeUndefined();
    const again = await join("Astrid", true);
    expect(again.body).toEqual({ status: "joined" });

    admin.send({ t: "joins", open: true });
    await admin.state((s) => s.finale.joins);
    expect((await join("Olle")).body).toEqual({ status: "joined" });
    admin.close();
  });

  it("wipes players, photos, votes, the quiz and both finales only after the party has ended", async () => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    const [astrid, olle] = all as [Phone, Phone];
    const photo = await upload(astrid);
    await vote(olle, photo);
    await playQuiz(admin, all);
    press(admin, "quiz", "suspense");
    press(admin, "quiz", "reveal");
    press(admin, "photo", "suspense");
    await adminAt(admin, "photo", "suspense");
    const cookie = await adminCookie();

    const early = await call("/api/admin/party", { method: "DELETE", cookie });
    expect(early.status).toBe(409);
    expect(await early.json()).toEqual({ error: "End the party before you wipe its data." });
    expect((await call(`/photos/${photo}`, { cookie })).status).toBe(200);

    admin.send({ t: "joins", open: false });
    await admin.state((s) => !s.finale.joins);
    expect((await call("/api/admin/party", { method: "DELETE", cookie: astrid.cookie })).status).toBe(404);
    expect((await call("/api/admin/party", { method: "DELETE", cookie })).status).toBe(204);

    for (const p of all) expect(await p.socket.next((m) => m.t === "gone")).toEqual({ t: "gone" });
    const wiped: AdminState = await admin.state((s) => s.players.length === 0);
    expect(wiped.quiz).toMatchObject({ stage: { phase: "locked" }, questions: [], board: [] });
    expect(wiped.contest).toMatchObject({ uploads: true, voting: true, tally: [], entrants: [] });
    expect(wiped.finale).toEqual({ quiz: { stage: "off" }, photo: { stage: "off" }, tied: [], pick: null, joins: true });
    expect((await call(`/photos/${photo}`, { cookie })).status).toBe(404);

    const gone = await connectGuest(astrid.cookie);
    expect(await gone.next()).toEqual({ t: "gone" });
    expect((await join("Astrid")).body).toEqual({ status: "joined" });
    closeAll(admin, gone);
  });

  it("after a wipe, goes back to slow ticks for the admin who is still connected", async () => {
    const admin = await host(number());
    admin.send({ t: "liveMode", on: true });
    await admin.next((m) => m.t === "state" && m.heartbeat === "fast");
    admin.send({ t: "joins", open: false });
    await admin.state((s) => !s.finale.joins);

    expect((await call("/api/admin/party", { method: "DELETE", cookie: await adminCookie() })).status).toBe(204);
    await admin.next((m) => m.t === "state" && m.heartbeat === "slow" && m.state.finale.joins);
    const slowTick = async () => ((await alarmAt()) ?? 0) - Date.now();
    expect(await slowTick(), "the tick is scheduled again, 30 s out").toBeGreaterThan(25_000);
    expect(await slowTick()).toBeLessThanOrEqual(30_000);
    const ticks = admin.ticks;
    expect(await fireAlarm()).toBe(true);
    await expect.poll(() => admin.ticks).toBe(ticks + 1);
    expect(await slowTick(), "and rearmed 30 s out after it fires").toBeGreaterThan(25_000);
    admin.close();
  });

  it("after a wipe with nobody connected, leaves no alarm", async () => {
    const admin = await connectAdmin();
    await admin.state();
    admin.send({ t: "joins", open: false });
    await admin.state((s) => !s.finale.joins);
    admin.close();
    await expect.poll(() => admin.closed).toBe(true);

    expect((await call("/api/admin/party", { method: "DELETE", cookie: await adminCookie() })).status).toBe(204);
    expect(await alarmAt()).toBeNull();
  });
});
