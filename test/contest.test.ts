import { reset } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { PhotoId } from "../src/shared/model";
import type { AdminState, GuestCmd, GuestContest, GuestState } from "../src/shared/protocol";
import { PHOTO_MAX_BYTES } from "../src/worker/photo-store";
import { phone, type Phone } from "./support/quiz";
import { adminCookie, call, connectAdmin, jpeg, joinedCookie, newUploadKey, uploadContest, uploadContestAs, type TestSocket } from "./support/worker";

type Guest = Phone & { last?: GuestContest };

const sockets: TestSocket<unknown>[] = [];
afterEach(() => {
  for (const s of sockets.splice(0)) s.close();
});

async function guest(name: string): Promise<Guest> {
  const p = await phone(name);
  sockets.push(p.socket as TestSocket<unknown>);
  return p;
}

async function admin(): Promise<TestSocket<AdminState>> {
  const socket = await connectAdmin();
  sockets.push(socket as TestSocket<unknown>);
  return socket;
}

async function upload(g: Guest, init: Parameters<typeof uploadContest>[1] = {}): Promise<PhotoId> {
  const { id, state } = await uploadContestAs(g, init);
  g.last = state.contest;
  return id;
}

async function act(g: Guest, cmd: GuestCmd, see: (c: GuestContest) => boolean): Promise<GuestContest> {
  g.socket.send(cmd);
  return (await g.socket.state((s) => see(s.contest))).contest;
}

async function refused(g: Guest, cmd: GuestCmd): Promise<string> {
  g.socket.send(cmd);
  return g.socket.error();
}

const seen = (c: GuestContest, photo: PhotoId) => c.gallery.find((p) => p.id === photo);
const votesOn = (c: GuestContest, photo: PhotoId) => seen(c, photo)?.mine ?? 0;
const thumbOf = (c: GuestContest, photo: PhotoId) => seen(c, photo)!.thumb;
const fetchStatus = async (id: PhotoId, cookie?: string) => (await call(`/photos/${id}`, { cookie })).status;
const versionsOf = (s: AdminState, name: string) => s.contest.entrants.find((e) => e.name === name)?.versions ?? [];

describe("contest upload", () => {
  it("puts the photo in everyone's gallery without saying whose it is", async () => {
    const astrid = await guest("Astrid");
    const olle = await guest("Olle");
    const id = await upload(astrid);

    const mine = astrid.last!;
    expect(mine.mine).toEqual({ id, thumb: expect.any(String), votes: 0, hidden: false });
    expect(mine.gallery).toEqual([{ id, thumb: mine.mine!.thumb, fame: false, own: true, mine: 0 }]);

    const theirs = (await olle.socket.state((s) => s.contest.gallery.length === 1)).contest;
    expect(theirs).toEqual({
      uploads: true,
      voting: true,
      votesLeft: 3,
      mine: null,
      inFame: 0,
      gallery: [{ id, thumb: mine.mine!.thumb, fame: false, own: false, mine: 0 }],
    });
    expect(JSON.stringify(theirs)).not.toContain(astrid.id);
    expect(JSON.stringify(theirs)).not.toContain("Astrid");

    for (const photo of [id, mine.mine!.thumb]) {
      const res = await call(`/photos/${photo}`, { cookie: olle.cookie });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/jpeg");
      expect(res.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    }
  });

  it("treats a replay with the same key as the same upload", async () => {
    const astrid = await guest("Astrid");
    const key = newUploadKey();
    const id = await upload(astrid, { key });
    const again = await uploadContest(astrid.cookie, { key, photo: jpeg(9) });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ id });

    const olle = await guest("Olle");
    expect((await uploadContest(olle.cookie, { key })).status).toBe(409);

    const state = await (await admin()).state();
    expect(versionsOf(state, "Astrid")).toEqual([expect.objectContaining({ id, status: "current" })]);
    expect(versionsOf(state, "Olle")).toEqual([]);
  });

  it("replaces the current photo and hides a replaced one without votes from other guests", async () => {
    const astrid = await guest("Astrid");
    const olle = await guest("Olle");
    const first = await upload(astrid);
    const firstThumb = thumbOf((await olle.socket.state((s) => !!seen(s.contest, first))).contest, first);
    const second = await upload(astrid);

    const theirs = (await olle.socket.state((s) => !!seen(s.contest, second))).contest;
    expect(theirs.gallery.map((p) => p.id)).toEqual([second]);
    expect(await fetchStatus(first, olle.cookie)).toBe(404);
    expect(await fetchStatus(firstThumb, olle.cookie)).toBe(404);
    expect(await fetchStatus(first, astrid.cookie)).toBe(404);

    const state = await (await admin()).state();
    expect(versionsOf(state, "Astrid").map((v) => [v.id, v.status, v.inGallery])).toEqual([
      [first, "replaced", false],
      [second, "current", true],
    ]);
    expect(await fetchStatus(first, await adminCookie())).toBe(200);
  });

  it("removes a photo from the gallery, keeps it for the admin and gives its votes back", async () => {
    const astrid = await guest("Astrid");
    const olle = await guest("Olle");
    const id = await upload(astrid);
    await olle.socket.state((s) => !!seen(s.contest, id));
    expect((await act(olle, { t: "vote", photo: id }, (c) => votesOn(c, id) === 1)).votesLeft).toBe(2);
    await astrid.socket.state((s) => s.contest.mine?.votes === 1);

    astrid.socket.send({ t: "remove", photo: id });
    expect((await astrid.socket.state((s) => s.contest.mine === null)).contest.gallery).toEqual([]);
    const theirs = (await olle.socket.state((s) => s.contest.gallery.length === 0)).contest;
    expect(theirs.votesLeft).toBe(3);
    expect(await refused(astrid, { t: "remove", photo: id })).toBe("Bilden är redan borttagen.");

    expect(await fetchStatus(id, olle.cookie)).toBe(404);
    expect(await fetchStatus(id, astrid.cookie)).toBe(404);
    expect(await fetchStatus(id, await adminCookie())).toBe(200);
    const state = await (await admin()).state();
    expect(versionsOf(state, "Astrid")).toEqual([expect.objectContaining({ id, status: "removed", votes: 0, inGallery: false })]);
  });

  it("refuses removing someone else's photo", async () => {
    const astrid = await guest("Astrid");
    const olle = await guest("Olle");
    const id = await upload(astrid);
    expect(await refused(olle, { t: "remove", photo: id })).toBe("Bilden är redan borttagen.");
    expect(versionsOf(await (await admin()).state(), "Astrid")).toEqual([expect.objectContaining({ id, status: "current" })]);
  });

  it("keeps every version for the admin, oldest first, with its bytes", async () => {
    const astrid = await guest("Astrid");
    const ids = [];
    for (const n of [1, 2, 3]) ids.push(await upload(astrid, { photo: jpeg(n), thumb: jpeg(n, n) }));
    astrid.socket.send({ t: "remove", photo: ids[2]! });

    const state = await (await admin()).state((s) => versionsOf(s, "Astrid").at(-1)?.status === "removed");
    const versions = versionsOf(state, "Astrid");
    expect(versions.map((v) => [v.id, v.status])).toEqual([
      [ids[0], "replaced"],
      [ids[1], "replaced"],
      [ids[2], "removed"],
    ]);
    const cookie = await adminCookie();
    for (const [i, v] of versions.entries()) {
      const n = i + 1;
      expect(new Uint8Array(await (await call(`/photos/${v.id}`, { cookie })).arrayBuffer())).toEqual(jpeg(n).bytes);
      expect(new Uint8Array(await (await call(`/photos/${v.thumb}`, { cookie })).arrayBuffer())).toEqual(jpeg(n, n).bytes);
    }
  });

  it("answers bad uploads with 401, 400, 413 and 415 and stores nothing", async () => {
    const astrid = await guest("Astrid");
    expect((await uploadContest(undefined)).status).toBe(401);
    expect((await uploadContest("pid=AAAAAAAAAAAAAAAAAAAAAA.forged")).status).toBe(401);
    expect((await uploadContest(astrid.cookie, { key: "short" })).status).toBe(400);
    expect((await uploadContest(astrid.cookie, { photo: null })).status).toBe(400);
    expect((await uploadContest(astrid.cookie, { thumb: null })).status).toBe(400);
    const notMultipart = await call("/api/photo", { method: "POST", cookie: astrid.cookie, body: "{}", headers: { "Content-Type": "application/json" } });
    expect(notMultipart.status).toBe(400);
    expect((await uploadContest(astrid.cookie, { photo: { bytes: new Uint8Array(PHOTO_MAX_BYTES + 1), type: "image/jpeg" } })).status).toBe(413);
    expect((await uploadContest(astrid.cookie, { thumb: { bytes: new Uint8Array([1]), type: "image/gif" } })).status).toBe(415);
    expect((await uploadContest(astrid.cookie, { photo: { bytes: new Uint8Array([1]), type: "text/html" } })).status).toBe(415);
    expect((await uploadContest(astrid.cookie, { photo: { bytes: new Uint8Array(PHOTO_MAX_BYTES), type: "image/webp" } })).status).toBe(200);

    expect((await (await admin()).state()).contest.entrants.map((e) => e.versions.length)).toEqual([1]);
  });

  it("refuses an upload from a player who no longer exists", async () => {
    const cookie = await joinedCookie("Testgäst");
    await reset();
    expect((await uploadContest(cookie)).status).toBe(401);
  });
});

describe("voting", () => {
  it("gives each guest 3 votes to stack or move, never on their own photo", async () => {
    const astrid = await guest("Astrid");
    const olle = await guest("Olle");
    const testgast = await guest("Testgäst");
    const a = await upload(astrid);
    const t = await upload(testgast);
    const own = await upload(olle);

    expect(await refused(olle, { t: "vote", photo: own })).toBe("Du kan inte rösta på din egen bild.");
    await act(olle, { t: "vote", photo: a }, (c) => votesOn(c, a) === 1);
    await act(olle, { t: "vote", photo: a }, (c) => votesOn(c, a) === 2);
    const full = await act(olle, { t: "vote", photo: t }, (c) => votesOn(c, t) === 1);
    expect(full.votesLeft).toBe(0);
    expect(await refused(olle, { t: "vote", photo: t })).toBe("Du har inga röster kvar.");

    await act(olle, { t: "unvote", photo: a }, (c) => votesOn(c, a) === 1);
    const moved = await act(olle, { t: "vote", photo: t }, (c) => votesOn(c, t) === 2);
    expect([votesOn(moved, a), votesOn(moved, t), moved.votesLeft]).toEqual([1, 2, 0]);
    expect(await refused(olle, { t: "unvote", photo: own })).toBe("Du har ingen röst på den bilden.");

    expect((await astrid.socket.state((s) => s.contest.mine?.votes === 1)).contest.gallery.every((p) => !("votes" in p))).toBe(true);
    expect((await testgast.socket.state((s) => s.contest.mine?.votes === 2)).contest.mine?.votes).toBe(2);
  });

  it("refuses votes on photos outside the gallery", async () => {
    const astrid = await guest("Astrid");
    const olle = await guest("Olle");
    const old = await upload(astrid);
    const oldThumb = thumbOf((await olle.socket.state((s) => !!seen(s.contest, old))).contest, old);
    const current = await upload(astrid);
    await olle.socket.state((s) => !!seen(s.contest, current));
    for (const photo of [old, oldThumb, "AAAAAAAAAAAAAAAAAAAAAA" as PhotoId]) {
      expect(await refused(olle, { t: "vote", photo })).toBe("Den bilden finns inte i galleriet längre.");
    }
  });

  it("refuses votes and uploads once the admin closes them", async () => {
    const astrid = await guest("Astrid");
    const olle = await guest("Olle");
    const key = newUploadKey();
    const id = await upload(astrid, { key });
    await act(olle, { t: "vote", photo: id }, (c) => votesOn(c, id) === 1);

    const host = await admin();
    host.send({ t: "voting", open: false });
    host.send({ t: "uploads", open: false });
    expect((await host.state((s) => !s.contest.voting && !s.contest.uploads)).contest).toMatchObject({ voting: false, uploads: false });
    await olle.socket.state((s) => !s.contest.voting && !s.contest.uploads);

    expect(await refused(olle, { t: "vote", photo: id })).toBe("Röstningen är stängd.");
    expect(await refused(olle, { t: "unvote", photo: id })).toBe("Röstningen är stängd.");
    expect(await refused(astrid, { t: "remove", photo: id })).toBe("Uppladdningen är stängd.");
    const closed = await uploadContest(olle.cookie);
    expect(closed.status).toBe(403);
    expect(await closed.json()).toEqual({ error: "Uppladdningen är stängd." });
    expect(await (await uploadContest(astrid.cookie, { key })).json()).toEqual({ id });

    host.send({ t: "voting", open: true });
    await olle.socket.state((s) => s.contest.voting);
    await act(olle, { t: "vote", photo: id }, (c) => votesOn(c, id) === 2);
  });
});

describe("hall of fame", () => {
  it("keeps a replaced photo with votes in the gallery until its last vote moves away", async () => {
    const astrid = await guest("Astrid");
    const olle = await guest("Olle");
    const first = await upload(astrid);
    await act(olle, { t: "vote", photo: first }, (c) => votesOn(c, first) === 1);
    await act(olle, { t: "vote", photo: first }, (c) => votesOn(c, first) === 2);
    const second = await upload(astrid);

    const theirs = (await olle.socket.state((s) => !!seen(s.contest, second))).contest;
    expect(theirs.gallery).toEqual([
      expect.objectContaining({ id: first, fame: true, mine: 2 }),
      expect.objectContaining({ id: second, fame: false, mine: 0 }),
    ]);
    expect(theirs.votesLeft).toBe(1);
    const hers = astrid.last!;
    expect([hers.mine?.id, hers.mine?.votes, hers.inFame]).toEqual([second, 0, 1]);
    expect(await fetchStatus(first, olle.cookie)).toBe(200);

    const host = await admin();
    const tally = (await host.state((s) => s.contest.tally.length === 2)).contest.tally;
    expect(tally[0]).toMatchObject({ photo: first, votes: 2, rank: 1, fame: true, name: "Astrid" });

    await act(olle, { t: "vote", photo: first }, (c) => votesOn(c, first) === 3);
    await act(olle, { t: "unvote", photo: first }, (c) => votesOn(c, first) === 2);
    await act(olle, { t: "unvote", photo: first }, (c) => votesOn(c, first) === 1);
    const gone = await act(olle, { t: "unvote", photo: first }, (c) => !seen(c, first));
    expect([gone.gallery.map((p) => p.id), gone.votesLeft]).toEqual([[second], 3]);
    expect((await astrid.socket.state((s) => s.contest.inFame === 0)).contest.inFame).toBe(0);
    expect(await fetchStatus(first, olle.cookie)).toBe(404);
    expect(await refused(olle, { t: "vote", photo: first })).toBe("Den bilden finns inte i galleriet längre.");
  });
});

describe("admin hide", () => {
  it("takes a photo out of the gallery, gives its votes back and can show it again", async () => {
    const astrid = await guest("Astrid");
    const olle = await guest("Olle");
    const id = await upload(astrid);
    await act(olle, { t: "vote", photo: id }, (c) => votesOn(c, id) === 1);

    const host = await admin();
    host.send({ t: "hide", photo: id, hidden: true });
    const hidden = versionsOf(await host.state((s) => versionsOf(s, "Astrid")[0]?.hidden === true), "Astrid")[0];
    expect(hidden).toMatchObject({ hidden: true, inGallery: false, votes: 0 });
    const theirs = (await olle.socket.state((s) => s.contest.gallery.length === 0)).contest;
    expect(theirs.votesLeft).toBe(3);
    expect((await astrid.socket.state((s) => s.contest.mine?.hidden === true)).contest.mine).toMatchObject({ id, votes: 0 });
    expect(await fetchStatus(id, olle.cookie)).toBe(404);
    expect(await fetchStatus(id, astrid.cookie)).toBe(200);
    expect(await refused(olle, { t: "vote", photo: id })).toBe("Den bilden finns inte i galleriet längre.");

    host.send({ t: "hide", photo: id, hidden: false });
    const back = (await olle.socket.state((s) => s.contest.gallery.length === 1)).contest;
    expect(back.gallery).toEqual([expect.objectContaining({ id, mine: 0 })]);

    host.send({ t: "hide", photo: "AAAAAAAAAAAAAAAAAAAAAA" as PhotoId, hidden: true });
    expect((await host.next((m) => m.t === "error")).t).toBe("error");
  });
});

describe("tally", () => {
  it("ranks in-gallery photos by votes with ties sharing a rank, for the admin", async () => {
    const [astrid, olle, testgast, sixten] = await Promise.all(["Astrid", "Olle", "Testgäst", "Sixten"].map(guest));
    const ids: PhotoId[] = [];
    for (const g of [astrid!, olle!, testgast!, sixten!]) ids.push(await upload(g));
    const [a, o, t] = ids as [PhotoId, PhotoId, PhotoId, PhotoId];
    await act(sixten!, { t: "vote", photo: a }, (c) => votesOn(c, a) === 1);
    await act(sixten!, { t: "vote", photo: a }, (c) => votesOn(c, a) === 2);
    await act(sixten!, { t: "vote", photo: o }, (c) => votesOn(c, o) === 1);
    await testgast!.socket.state((s) => s.contest.gallery.length === 4);
    await act(testgast!, { t: "vote", photo: o }, (c) => votesOn(c, o) === 1);
    await astrid!.socket.state((s) => s.contest.gallery.length === 4);
    await act(astrid!, { t: "vote", photo: t }, (c) => votesOn(c, t) === 1);

    const host = await admin();
    const tally = (await host.state((s) => s.contest.tally[2]?.votes === 1)).contest.tally;
    expect(tally.map((r) => [r.name, r.votes, r.rank])).toEqual([
      ["Astrid", 2, 1],
      ["Olle", 2, 1],
      ["Testgäst", 1, 3],
      ["Sixten", 0, 4],
    ]);
    expect(tally[0]).toMatchObject({ player: astrid!.id, photo: a, fame: false });
  });
});

describe("merge", () => {
  it("moves the duplicate's photos and votes to the surviving player", async () => {
    const astrid = await guest("Astrid");
    const testgast = await guest("Testgäst");
    const dup = await guest("Olle");
    const survivor = await guest("Olle Testsson");
    const a = await upload(astrid);
    const t = await upload(testgast);
    const dupPhoto = await upload(dup);
    const survivorPhoto = await upload(survivor);
    for (const g of [astrid, dup]) await g.socket.state((s) => s.contest.gallery.length === 4);

    await act(survivor, { t: "vote", photo: a }, (c) => votesOn(c, a) === 1);
    await act(survivor, { t: "vote", photo: a }, (c) => votesOn(c, a) === 2);
    await act(survivor, { t: "vote", photo: t }, (c) => votesOn(c, t) === 1);
    await act(dup, { t: "vote", photo: survivorPhoto }, (c) => votesOn(c, survivorPhoto) === 1);
    await act(dup, { t: "vote", photo: a }, (c) => votesOn(c, a) === 1);
    await act(dup, { t: "vote", photo: t }, (c) => votesOn(c, t) === 1);
    await act(astrid, { t: "vote", photo: dupPhoto }, (c) => votesOn(c, dupPhoto) === 1);

    const host = await admin();
    host.send({ t: "merge", from: dup.id, into: survivor.id });
    const state = await host.state((s) => s.players.length === 3);
    expect(state.contest.entrants.map((e) => e.name)).toEqual(["Astrid", "Testgäst", "Olle Testsson"]);
    expect(versionsOf(state, "Olle Testsson").map((v) => [v.id, v.status, v.votes, v.inGallery])).toEqual([
      [dupPhoto, "replaced", 1, true],
      [survivorPhoto, "current", 0, true],
    ]);

    const merged = (await survivor.socket.state((s) => s.contest.inFame === 1)).contest;
    expect(merged.mine?.id).toBe(survivorPhoto);
    expect(merged.votesLeft).toBe(0);
    expect(merged.gallery.map((p) => [p.id, p.own, p.mine, p.fame])).toEqual([
      [a, false, 2, false],
      [t, false, 1, false],
      [dupPhoto, true, 0, true],
      [survivorPhoto, true, 0, false],
    ]);
    expect((await dup.socket.state((s) => s.you.id === survivor.id)).contest.mine?.id).toBe(survivorPhoto);
  });
});
