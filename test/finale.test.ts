import { describe, expect, it } from "vitest";
import type { GuestFinale } from "../src/shared/finale";
import type { PhotoId } from "../src/shared/model";
import type { AdminCmd, AdminState } from "../src/shared/protocol";
import { answer, closeAll, host, number, phone, phones, start, step, type Admin, type Phone } from "./support/quiz";
import { adminCookie, call, connectGuest, join, uploadContest } from "./support/worker";

async function adminError(admin: Admin, cmd: AdminCmd): Promise<string> {
  admin.send(cmd);
  const msg = await admin.next((m) => m.t === "error");
  return msg.t === "error" ? msg.message : "";
}

async function finale<S extends GuestFinale["stage"]>(p: Phone, stage: S): Promise<Extract<GuestFinale, { stage: S }>> {
  return (await p.socket.current((s) => s.finale.stage === stage)).finale as Extract<GuestFinale, { stage: S }>;
}

const adminAt = (admin: Admin, stage: GuestFinale["stage"]) => admin.current((s) => s.finale.stage === stage);

async function upload(p: Phone): Promise<PhotoId> {
  const res = await uploadContest(p.cookie);
  expect(res.status).toBe(200);
  const { id } = (await res.json()) as { id: PhotoId };
  await p.socket.state((s) => s.contest.mine?.id === id);
  return id;
}

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
  await step(admin, "reveal", "reveal");
  await step(admin, "end", "ended");
}

describe("finale", () => {
  it("opens only after the quiz has ended and then moves every phone through suspense, photo and quiz in order", async () => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    const [astrid, olle, saga] = all as [Phone, Phone, Phone];
    const photo = await upload(astrid);
    await vote(olle, photo);

    expect(await adminError(admin, { t: "finale", step: "suspense" })).toBe("End the quiz before you open the finale.");
    await playQuiz(admin, all);

    expect(await adminError(admin, { t: "finale", step: "photo" })).toBe(`"photo" isn't the next finale step.`);
    admin.send({ t: "finale", step: "suspense" });
    for (const p of all) expect(await finale(p, "suspense")).toEqual({ stage: "suspense" });
    expect(await adminError(admin, { t: "finale", step: "quiz" })).toBe(`"quiz" isn't the next finale step.`);

    admin.send({ t: "finale", step: "photo" });
    const photoWin = { photo, thumb: expect.any(String), owner: astrid.id, name: "Astrid", votes: 1 };
    for (const p of all) expect(await finale(p, "photo")).toEqual({ stage: "photo", photo: photoWin });

    admin.send({ t: "finale", step: "quiz" });
    for (const p of all) {
      const shown = await finale(p, "quiz");
      expect(shown.photo).toEqual(photoWin);
      expect(shown.quiz.map((w) => [w.name, w.score]).sort()).toEqual([["Astrid", 1000], ["Olle", 1000]]);
    }
    expect(await adminError(admin, { t: "finale", step: "suspense" })).toBe(`"suspense" isn't the next finale step.`);
    expect(await adminError(admin, { t: "quiz", step: "reset" })).toBe("The finale has started, so the quiz can't change.");
    expect((await finale(saga, "quiz")).quiz).toHaveLength(2);
    closeAll(admin, ...all.map((p) => p.socket));
  });

  it("treats a repeated press of the current step as done", async () => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    await playQuiz(admin, all);
    admin.send({ t: "finale", step: "suspense" });
    admin.send({ t: "finale", step: "suspense" });
    await adminAt(admin, "suspense");
    admin.send({ t: "finale", step: "photo" });
    const after = await adminAt(admin, "photo");
    expect(after.finale).toMatchObject({ stage: "photo", photo: null });
    expect(admin.latest()?.finale.stage).toBe("photo");
    closeAll(admin, ...all.map((p) => p.socket));
  });

  it("closes voting when the suspense page opens", async () => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    const [astrid, olle] = all as [Phone, Phone];
    const photo = await upload(astrid);
    await playQuiz(admin, all);
    expect((await admin.current()).contest.voting).toBe(true);

    admin.send({ t: "finale", step: "suspense" });
    expect((await adminAt(admin, "suspense")).contest.voting).toBe(false);
    expect((await olle.socket.current((s) => s.finale.stage === "suspense")).contest.voting).toBe(false);
    olle.socket.send({ t: "vote", photo });
    const refused = await olle.socket.next((m) => m.t === "error");
    expect(refused).toEqual({ t: "error", message: "Röstningen är stängd." });
    closeAll(admin, ...all.map((p) => p.socket));
  });

  it("makes the host pick the photo winner from a tie before revealing it", async () => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    const [astrid, olle, saga] = all as [Phone, Phone, Phone];
    const first = await upload(astrid);
    const second = await upload(olle);
    const third = await upload(saga);
    await vote(saga, first);
    await vote(saga, second);
    await playQuiz(admin, all);
    admin.send({ t: "finale", step: "suspense" });

    const tied = await adminAt(admin, "suspense");
    expect([...tied.finale.tied].sort()).toEqual([first, second].sort());
    expect(tied.finale.pick).toBeNull();
    expect(await adminError(admin, { t: "finale", step: "photo" })).toBe("Photos are tied for first. Pick the winner before you reveal it.");
    expect(await adminError(admin, { t: "pick-photo", photo: third })).toBe("That photo isn't tied for first.");
    expect((await finale(astrid, "suspense")).stage).toBe("suspense");

    admin.send({ t: "pick-photo", photo: second });
    await admin.state((s) => s.finale.pick === second);
    admin.send({ t: "finale", step: "photo" });
    for (const p of all) expect((await finale(p, "photo")).photo).toMatchObject({ photo: second, name: "Olle", votes: 1 });
    expect(await adminError(admin, { t: "pick-photo", photo: first })).toBe("The photo winner has already been revealed.");
    closeAll(admin, ...all.map((p) => p.socket));
  });

  it("brings a phone that reconnects back to the current finale step", async () => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    const [astrid] = all as [Phone];
    const photo = await upload(astrid);
    await playQuiz(admin, all);
    admin.send({ t: "finale", step: "suspense" });
    await adminAt(admin, "suspense");

    astrid.socket.close();
    admin.send({ t: "finale", step: "photo" });
    await adminAt(admin, "photo");
    const back = await phone("Astrid", astrid.cookie);
    expect((await finale(back, "photo")).photo).toMatchObject({ photo, name: "Astrid" });
    expect((await call(`/photos/${photo}`, { cookie: back.cookie })).status).toBe(200);
    closeAll(admin, back.socket, ...all.slice(1).map((p) => p.socket));
  });
});

describe("revealed winners", () => {
  it("keeps the revealed photo visible after the host hides it", async () => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    const [astrid, olle] = all as [Phone, Phone];
    const photo = await upload(astrid);
    await vote(olle, photo);
    await playQuiz(admin, all);
    admin.send({ t: "finale", step: "suspense" });
    admin.send({ t: "finale", step: "photo" });
    const { photo: win } = await finale(olle, "photo");

    admin.send({ t: "hide", photo, hidden: true });
    await admin.state((s) => s.contest.tally.length === 0);
    expect((await finale(olle, "photo")).photo).toMatchObject({ photo, name: "Astrid" });
    for (const id of [win!.photo, win!.thumb]) expect((await call(`/photos/${id}`, { cookie: olle.cookie })).status).toBe(200);
    closeAll(admin, ...all.map((p) => p.socket));
  });

  it("shows joint winners merged after the reveal as one winner, congratulated on both phones", async () => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    const [astrid, olle] = all as [Phone, Phone];
    await playQuiz(admin, all);
    admin.send({ t: "finale", step: "suspense" });
    admin.send({ t: "finale", step: "photo" });
    admin.send({ t: "finale", step: "quiz" });
    await adminAt(admin, "quiz");

    admin.send({ t: "merge", from: astrid.id, into: olle.id });
    const merged = await astrid.socket.state((s) => s.you.id === olle.id);
    expect(merged.finale).toMatchObject({ stage: "quiz", quiz: [{ id: olle.id, name: "Olle", score: 1000 }] });
    expect((await olle.socket.current((s) => s.finale.stage === "quiz" && s.finale.quiz.length === 1)).you.id).toBe(olle.id);
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

  it("wipes players, photos, votes and the quiz only after the party has ended", async () => {
    const admin = await host(number());
    const all = await phones("Astrid", "Olle", "Saga");
    const [astrid, olle] = all as [Phone, Phone];
    const photo = await upload(astrid);
    await vote(olle, photo);
    await playQuiz(admin, all);
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
    expect(wiped.finale).toMatchObject({ stage: "off", joins: true });
    expect((await call(`/photos/${photo}`, { cookie })).status).toBe(404);

    const gone = await connectGuest(astrid.cookie);
    expect(await gone.next()).toEqual({ t: "gone" });
    expect((await join("Astrid")).body).toEqual({ status: "joined" });
    closeAll(admin, gone);
  });
});
