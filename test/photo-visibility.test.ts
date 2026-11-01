import { describe, expect, it } from "vitest";
import type { PhotoId } from "../src/shared/model";
import { newPlayerId, pidCookieValue } from "../src/worker/auth";
import { answer, closeAll, host, number, phones, start, step, type Phone } from "./support/quiz";
import { adminCookie, call, jpeg, JOIN_SECRET, uploadContest, uploadLanding, uploadQuestionPhoto } from "./support/worker";

// "both" sends the admin and the owner's pid cookie; "stale" is a signed pid for a player who doesn't exist.
const VIEWERS = ["admin", "both", "owner", "other", "stale", "link", "none"] as const;
type Viewer = (typeof VIEWERS)[number];
type Row = Record<Viewer, number>;

const adminOnly: Row = { admin: 200, both: 200, owner: 404, other: 404, stale: 404, link: 404, none: 401 };
const joinedGuests: Row = { ...adminOnly, owner: 200, other: 200 };
const anyGuest: Row = { ...joinedGuests, stale: 200 };
const ownerAndAdmin: Row = { ...adminOnly, owner: 200 };
const withLink: Row = { ...anyGuest, link: 200 };

const idOf = async (res: Response) => ((await res.json()) as { id: PhotoId }).id;

async function upload(p: Phone, n: number): Promise<{ photo: PhotoId; thumb: PhotoId }> {
  const photo = await idOf(await uploadContest(p.cookie, { photo: jpeg(n), thumb: jpeg(n, n) }));
  const { contest } = await p.socket.state((s) => s.contest.mine?.id === photo);
  return { photo, thumb: contest.mine!.thumb };
}

describe("photo visibility", () => {
  it("serves each kind of photo to exactly the viewers allowed at each stage of the party", async () => {
    const landing = await idOf(await uploadLanding(jpeg(0).bytes, "image/jpeg"));
    const question = await idOf(await uploadQuestionPhoto(jpeg(9).bytes));
    const admin = await host(number({ photo: question }));
    const all = await phones("Astrid", "Olle");
    const [astrid, olle] = all as [Phone, Phone];
    const replaced = await upload(astrid, 1);
    const current = await upload(astrid, 2);
    olle.socket.send({ t: "vote", photo: current.photo });
    await olle.socket.state((s) => s.contest.gallery.some((g) => g.id === current.photo && g.mine > 0));

    const cookies: Record<Exclude<Viewer, "link" | "none">, string> = {
      admin: await adminCookie(),
      both: `${await adminCookie()}; ${astrid.cookie}`,
      owner: astrid.cookie,
      other: olle.cookie,
      stale: `pid=${await pidCookieValue(newPlayerId(), JOIN_SECRET)}`,
    };
    const fetchAs = (viewer: Viewer, id: PhotoId) =>
      viewer === "link" ? call(`/j/${JOIN_SECRET}/photos/${id}`) : call(`/photos/${id}`, { cookie: viewer === "none" ? undefined : cookies[viewer] });
    const ids = {
      landing,
      question,
      "replaced contest": replaced.photo,
      "replaced thumb": replaced.thumb,
      "current contest": current.photo,
      "current thumb": current.thumb,
    };
    const table = async () => {
      const out: Record<string, Row> = {};
      for (const [name, id] of Object.entries(ids)) {
        const row = {} as Row;
        for (const viewer of VIEWERS) row[viewer] = (await fetchAs(viewer, id)).status;
        out[name] = row;
      }
      return out;
    };
    const hide = async (hidden: boolean) => {
      admin.send({ t: "hide", photo: current.photo, hidden });
      await admin.state((s) => s.contest.tally.length === (hidden ? 0 : 1));
    };

    await step(admin, "unlock", "lobby");
    expect(await table(), "before the question starts").toEqual({
      landing: withLink,
      question: adminOnly,
      "replaced contest": adminOnly,
      "replaced thumb": adminOnly,
      "current contest": joinedGuests,
      "current thumb": joinedGuests,
    });

    await hide(true);
    expect(await table(), "the host hides the current photo").toEqual({
      landing: withLink,
      question: adminOnly,
      "replaced contest": adminOnly,
      "replaced thumb": adminOnly,
      "current contest": ownerAndAdmin,
      "current thumb": ownerAndAdmin,
    });
    await hide(false);

    const q = await start(admin);
    expect(await table(), "after the question starts").toEqual({
      landing: withLink,
      question: anyGuest,
      "replaced contest": adminOnly,
      "replaced thumb": adminOnly,
      "current contest": joinedGuests,
      "current thumb": joinedGuests,
    });

    for (const p of all) await answer(p, q, 42);
    await step(admin, "reveal", "reveal");
    await step(admin, "end", "ended");
    admin.send({ t: "finale", step: "suspense" });
    admin.send({ t: "finale", step: "photo" });
    await olle.socket.state((s) => s.finale.stage === "photo");
    await hide(true);
    expect(await table(), "after the winner is revealed and then hidden").toEqual({
      landing: withLink,
      question: anyGuest,
      "replaced contest": adminOnly,
      "replaced thumb": adminOnly,
      "current contest": anyGuest,
      "current thumb": anyGuest,
    });
    closeAll(admin, ...all.map((p) => p.socket));
  });
});
