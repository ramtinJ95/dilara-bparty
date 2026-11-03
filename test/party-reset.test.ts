import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { PhotoId } from "../src/shared/model";
import type { AdminState } from "../src/shared/protocol";
import { answer, answerCmd, choice, closeAll, host, number, phone, phones, stage, start, step, view, type Admin, type Phone } from "./support/quiz";
import { adminCookie, call, connectAdmin, connectGuest, join, JOIN_SECRET, ORIGIN, uploadContestAs, uploadLanding, uploadQuestionPhoto } from "./support/worker";

const reset = (cookie: string | undefined, origin = ORIGIN) => call("/api/admin/party/reset", { method: "POST", cookie, headers: { Origin: origin } });

const idOf = async (res: Response) => ((await res.json()) as { id: PhotoId }).id;

async function command(admin: Admin, cmd: Parameters<Admin["send"]>[0], until: (s: AdminState) => boolean): Promise<void> {
  admin.send(cmd);
  await admin.state(until);
}

async function prepared(): Promise<{ admin: Admin; landing: PhotoId; questionPhoto: PhotoId }> {
  const landing = await idOf(await uploadLanding(new Uint8Array([1, 2, 3])));
  const questionPhoto = await idOf(await uploadQuestionPhoto(new Uint8Array([255, 216, 9])));
  const admin = await host(choice({ text: "Fråga med bild", photo: questionPhoto }), number({ text: "Fråga två" }));
  return { admin, landing, questionPhoto };
}

async function contest([astrid, olle]: Phone[]): Promise<{ photo: PhotoId; thumb: PhotoId }> {
  const { id, state } = await uploadContestAs(astrid!);
  olle!.socket.send({ t: "vote", photo: id });
  await olle!.socket.state((s) => s.contest.votesLeft === 2);
  return { photo: id, thumb: state.contest.mine!.thumb };
}

const storedRows = () =>
  runInDurableObject(env.PARTY.getByName("party"), (_, state) => {
    const count = (table: string) => state.storage.sql.exec<{ n: number }>(`SELECT count(*) AS n FROM ${table}`).one().n;
    const kinds = state.storage.sql.exec<{ kind: string }>("SELECT DISTINCT kind FROM photos ORDER BY kind").toArray().map((r) => r.kind);
    return { ...Object.fromEntries(["players", "entries", "votes", "rounds", "answers", "deliveries", "questions"].map((t) => [t, count(t)])), photoKinds: kinds };
  });

async function expectFreshParty(admin: Admin, kept: { landing: PhotoId; questionPhoto: PhotoId }): Promise<void> {
  const msg = await admin.next((m) => m.t === "state" && m.state.players.length === 0);
  expect(msg).toMatchObject({ heartbeat: "slow" });
  const after = (msg as { state: AdminState }).state;
  expect(after.quiz).toMatchObject({ stage: { phase: "locked" }, played: [], board: [], winners: [] });
  expect(after.quiz.questions.map((q) => q.text)).toEqual(["Fråga med bild", "Fråga två"]);
  expect(after.quiz.questions[0]?.photo).toBe(kept.questionPhoto);
  expect(after.contest).toEqual({ uploads: true, voting: true, tally: [], entrants: [] });
  expect(after.finale).toMatchObject({ stage: "off", tied: [], pick: null, joins: true });
  expect(after.landingPhoto).toBe(kept.landing);
  expect(await storedRows()).toEqual({ players: 0, entries: 0, votes: 0, rounds: 0, answers: 0, deliveries: 0, questions: 2, photoKinds: ["landing", "question"] });
}

describe("party reset", () => {
  it("is refused without the admin cookie, with a guest's cookie and from another origin, and changes nothing", async () => {
    const { admin } = await prepared();
    const all = await phones("Astrid", "Olle");
    await contest(all);
    const snapshot = await admin.current((s) => s.contest.tally[0]?.votes === 1);

    for (const cookie of [undefined, all[0]!.cookie]) expect((await reset(cookie)).status, `cookie ${cookie}`).toBe(404);
    expect((await reset(await adminCookie(), "https://elsewhere.test")).status).toBe(403);

    const now = await connectAdmin();
    const state = await now.state();
    expect(state.players).toEqual(snapshot.players);
    expect(state.contest).toEqual(snapshot.contest);
    expect(state.quiz.questions).toEqual(snapshot.quiz.questions);
    closeAll(admin, now, ...all.map((p) => p.socket));
  });

  it("mid-round, sends every phone away and clears the guests and their play, keeping the questions and the photos the host prepared", async () => {
    const kept = await prepared();
    const { admin } = kept;
    const all = await phones("Astrid", "Olle");
    const [astrid, olle] = all as [Phone, Phone];
    const { photo, thumb } = await contest(all);
    await step(admin, "unlock", "lobby");
    const q = await start(admin);
    await answer(astrid, q, 0);
    const staleAnswer = await answerCmd(astrid, q, 0);
    await command(admin, { t: "uploads", open: false }, (s) => !s.contest.uploads);
    await command(admin, { t: "voting", open: false }, (s) => !s.contest.voting);
    expect((await call(`/photos/${kept.questionPhoto}`, { cookie: olle.cookie })).status, "the question photo is shown in this run").toBe(200);

    const cookie = await adminCookie();
    expect((await reset(cookie)).status).toBe(204);
    for (const p of all) expect(await p.socket.next((m) => m.t === "gone")).toEqual({ t: "gone" });
    await expectFreshParty(admin, kept);

    for (const id of [photo, thumb]) expect((await call(`/photos/${id}`, { cookie })).status, "contest photos are deleted").toBe(404);
    expect((await call(`/photos/${kept.questionPhoto}`, { cookie })).status).toBe(200);
    expect((await call(`/j/${JOIN_SECRET}/photos/${kept.landing}`)).status).toBe(200);

    const landing = await call(`/j/${JOIN_SECRET}`, { cookie: astrid.cookie });
    expect(landing.status, "the old cookie shows the landing page again").toBe(200);
    expect(await landing.text()).toContain(`<meta name="landing-photo" content="${kept.landing}">`);
    const gone = await connectGuest(astrid.cookie);
    expect(await gone.next()).toEqual({ t: "gone" });

    const fresh = await phone("Astrid");
    const state = await fresh.socket.current();
    expect(state.quiz).toEqual({ phase: "locked" });
    expect(state.contest).toMatchObject({ uploads: true, voting: true, votesLeft: 3, mine: null, gallery: [] });
    expect((await call(`/photos/${kept.questionPhoto}`, { cookie: fresh.cookie })).status, "the question photo is secret again").toBe(404);

    await step(admin, "unlock", "lobby");
    expect(await start(admin)).toBe(q);
    fresh.socket.send(staleAnswer);
    expect(await fresh.socket.error(), "an answer from before the reset is stale").toBe("Svaret kom för sent.");
    await answer(fresh, q, 0);
    expect(await stage(admin, "reveal")).toMatchObject({ answered: 1, expected: 1 });
    closeAll(admin, gone, fresh.socket);
  });

  it("after the party has ended and the finale is shown, opens joins again and turns the finale off", async () => {
    const kept = await prepared();
    const { admin } = kept;
    const all = await phones("Astrid", "Olle");
    const [astrid, olle] = all as [Phone, Phone];
    const { photo } = await contest(all);
    await step(admin, "unlock", "lobby");
    const q = await start(admin);
    await answer(astrid, q, 0);
    await answer(olle, q, 1);
    await stage(admin, "reveal");
    await step(admin, "end", "ended");
    for (const s of ["suspense", "quiz", "photo"] as const) await command(admin, { t: "finale", step: s }, (st) => st.finale.stage === s);
    await command(admin, { t: "joins", open: false }, (s) => !s.finale.joins);
    expect((await join("Ny gäst")).res.status).toBe(403);

    expect((await reset(await adminCookie())).status).toBe(204);
    for (const p of all) expect(await p.socket.next((m) => m.t === "gone")).toEqual({ t: "gone" });
    await expectFreshParty(admin, kept);

    const guest = await phone("Ny gäst");
    expect((await guest.socket.current()).finale).toEqual({ stage: "off" });
    expect((await call(`/photos/${photo}`, { cookie: guest.cookie })).status, "the revealed winner is gone too").toBe(404);
    await step(admin, "unlock", "lobby");
    expect(await view(guest, "lobby"), "the quiz runs again, now that the finale is off").toMatchObject({ phase: "lobby" });
    closeAll(admin, guest.socket);
  });
});
