import { expect, type Locator, type Page } from "@playwright/test";
import { LOOKS, placeholder, pngFile } from "../../placeholder.ts";
import type { Guest, Rehearsal, Step } from "../rehearsal.ts";

const UPLOAD_TIMEOUT = 45_000;
const LIVE_TIMEOUT = 20_000;
const looks = Object.values(LOOKS);

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tallyRow = (admin: Page, name: string): Locator => admin.locator(".tally li").filter({ has: admin.locator(".name").getByText(name, { exact: true }) });
const versionsOf = (admin: Page, name: string): Locator =>
  admin.locator(".entrants > li").filter({ has: admin.locator("h4", { hasText: new RegExp(`^${escape(name)} ·`) }) }).locator(".versions > li");
const votesText = (n: number) => (n === 0 ? "Inga röster än" : `Din bild har ${n === 1 ? "1 röst" : `${n} röster`}`);
const tab = (page: Page, name: "Mitt foto" | "Galleri") => page.getByRole("button", { name, exact: true }).click();

async function photoFor(guest: Guest, i: number) {
  return pngFile(`placeholder-${i}`, await placeholder(guest.page, looks[i % looks.length]!));
}

// Uploaders cover every profile. One flaky phone is offline when it picks its photo, and one loses the network mid-send.
function uploaders(r: Rehearsal): { g: Guest; outage: "before" | "mid-send" | null }[] {
  const flaky = r.guests.filter((g) => g.profile === "flaky");
  const steady = r.guests.filter((g) => g.profile !== "flaky").slice(0, 5);
  return [...steady.map((g) => ({ g, outage: null })), ...flaky.slice(0, 2).map((g, i) => ({ g, outage: i === 0 ? ("before" as const) : ("mid-send" as const) }))];
}

// Votes go to a known photo per voter, so the expected counts follow from this table, not from the app.
function voteTable(r: Rehearsal) {
  const photos = uploaders(r).map(({ g }) => g);
  const expected = new Map(photos.map((g) => [g, 0]));
  const targets = r.guests.map((voter, i) => {
    const candidates = photos.filter((p) => p !== voter);
    const target = candidates[i % candidates.length]!;
    expected.set(target, expected.get(target)! + 1);
    return { voter, target };
  });
  return { photos, expected, targets };
}

const upload: Step = {
  id: "upload",
  title: "Phones upload contest photos, one offline and one cut mid-send",
  async run(r) {
    await Promise.all(
      uploaders(r).map(async ({ g, outage }, i) => {
        const file = await photoFor(g, i);
        await tab(g.page, "Mitt foto");
        const kind = outage === "before" ? "upload while offline, sent on reconnect" : outage === "mid-send" ? "upload cut mid-send" : "upload";
        await r.time(kind, g, async () => {
          if (outage === "before") await g.line.cut("clean");
          await g.page.locator('input[type="file"]').setInputFiles(file);
          if (outage === "before") {
            await expect(g.page.getByText("Ingen kontakt just nu.", { exact: false })).toBeVisible({ timeout: LIVE_TIMEOUT });
            await g.page.waitForTimeout(2_000);
            await g.line.restore();
          }
          if (outage === "mid-send") {
            await expect(g.page.getByText("Skickar bilden…", { exact: false })).toBeVisible({ timeout: LIVE_TIMEOUT });
            await g.line.cut("clean");
            const waiting = g.page.getByText("Ingen kontakt just nu.", { exact: false });
            const done = g.page.getByText(votesText(0));
            await expect(waiting.or(done)).toBeVisible({ timeout: 5_000 }).catch(() => {});
            const seen = (await done.isVisible()) ? "finished anyway: the request already in flight kept going" : (await waiting.isVisible()) ? "showed “Ingen kontakt just nu.” and waited" : "was still sending 5 s later";
            r.note(`${g.name} lost the network mid-send, and the upload ${seen}.`);
            await g.line.restore();
          }
          await expect(g.page.getByText(votesText(0))).toBeVisible({ timeout: UPLOAD_TIMEOUT });
        });
      }),
    );
    await r.check("admin lists exactly one version per uploader, so no retry stored a photo twice", () =>
      Promise.all(uploaders(r).map(({ g }) => expect(versionsOf(r.admin, g.name)).toHaveCount(1, { timeout: LIVE_TIMEOUT }))), r.admin);
  },
};

const vote: Step = {
  id: "vote",
  title: "Every guest votes for a photo, and the uploaders and the admin see the counts",
  async run(r) {
    if (r.guests.length < 2) return r.note("Voting needs at least 2 guests, so the vote and hall-of-fame steps were skipped.");
    const { photos, expected, targets } = voteTable(r);
    const thumbs = new Map<Guest, string>();
    for (const g of photos) {
      const src = await tallyRow(r.admin, g.name).locator("img").getAttribute("src");
      if (src) thumbs.set(g, src);
    }
    await Promise.all(
      targets.map(({ voter, target }) =>
        r.time("vote", voter, async () => {
          await tab(voter.page, "Galleri");
          const tile = voter.page.locator(".gallery .tile").filter({ has: voter.page.locator(`img[src="${thumbs.get(target)}"]`) });
          await tile.getByRole("button", { name: "Ge en röst" }).click({ timeout: LIVE_TIMEOUT });
          await expect(voter.page.getByText("2 av 3 röster kvar")).toBeVisible({ timeout: LIVE_TIMEOUT });
          await expect(tile.getByLabel("Dina röster: 1")).toBeVisible();
        }),
      ),
    );
    await Promise.all(
      photos.map((g) =>
        r.check(`${g.name} and the admin both count ${expected.get(g)} votes for their photo`, async () => {
          await tab(g.page, "Mitt foto");
          await expect(g.page.getByText(votesText(expected.get(g)!))).toBeVisible({ timeout: LIVE_TIMEOUT });
          await expect(tallyRow(r.admin, g.name).locator(".tally-votes")).toContainText(`${expected.get(g)} vote`);
        }, g.page),
      ),
    );
  },
};

const fame: Step = {
  id: "hall-of-fame",
  title: "A voted photo is replaced into the hall of fame, and voting closes and reopens live",
  async run(r) {
    if (r.guests.length < 2) return;
    const { expected } = voteTable(r);
    const [top, topVotes] = [...expected].sort((a, b) => b[1] - a[1])[0]!;
    const oldThumb = await tallyRow(r.admin, top.name).locator("img").getAttribute("src");
    await r.time("replace into hall of fame", top, async () => {
      await tab(top.page, "Mitt foto");
      await top.page.getByRole("button", { name: "Byt bild" }).click();
      await expect(top.page.getByText("Hall of fame", { exact: false }).first()).toBeVisible();
      const chooser = top.page.waitForEvent("filechooser");
      await top.page.getByRole("button", { name: "Välj ny bild" }).click();
      await (await chooser).setFiles(await photoFor(top, 5));
      await expect(top.page.getByText("Din tidigare bild är kvar i Hall of fame och kan fortfarande vinna.")).toBeVisible({ timeout: UPLOAD_TIMEOUT });
      await expect(top.page.getByText(votesText(0))).toBeVisible();
    });
    await r.check(`admin keeps ${top.name}'s old photo in the hall of fame with its ${topVotes} votes`, async () => {
      await expect(versionsOf(r.admin, top.name)).toHaveCount(2);
      await expect(tallyRow(r.admin, top.name).filter({ has: r.admin.locator(".badge.fame") }).locator(".tally-votes")).toContainText(`${topVotes} vote`);
    }, r.admin);

    await Promise.all(r.guests.map((g) => tab(g.page, "Galleri")));
    await Promise.all(
      r.guests.map((g) =>
        r.check(`${g.name} sees the replaced photo in the hall of fame`, () =>
          expect(g.page.locator(`.gallery h3.fame-title ~ ul.grid img[src="${oldThumb}"]`)).toBeVisible({ timeout: LIVE_TIMEOUT }), g.page),
      ),
    );
    await r.check("admin closes voting", () => r.admin.getByRole("button", { name: "Close voting" }).click(), r.admin);
    await Promise.all(
      r.guests.map((g) => r.check(`${g.name} sees voting close`, () => expect(g.page.getByText("Röstningen är stängd.")).toBeVisible({ timeout: LIVE_TIMEOUT }), g.page)),
    );
    await r.check("admin opens voting again", () => r.admin.getByRole("button", { name: "Open voting" }).click(), r.admin);
    await Promise.all(
      r.guests.map((g) =>
        r.check(`${g.name} sees voting open with 2 of 3 votes left`, () => expect(g.page.getByText("2 av 3 röster kvar")).toBeVisible({ timeout: LIVE_TIMEOUT }), g.page),
      ),
    );
  },
};

export const photoSteps: Step[] = [upload, vote, fame];
