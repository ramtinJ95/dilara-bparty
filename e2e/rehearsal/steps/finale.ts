import { expect, type Locator } from "@playwright/test";
import { forgetIdentity, greeting, joinByLink, reconnecting } from "../../drive.ts";
import type { Guest, Rehearsal, Step } from "../rehearsal.ts";

const SEE_TIMEOUT = 30_000;
const AWAY_MS = 3_000;

const quizCard = (r: Rehearsal) => r.admin.locator(".quiz-finale");
const photoCard = (r: Rehearsal) => r.admin.locator(".photo-finale");
const partyEnd = (r: Rehearsal) => r.admin.locator(".party-end");
const tab = (g: Guest, name: "Quiz" | "Galleri") => g.page.getByRole("button", { name, exact: true }).click();

async function press(r: Rehearsal, card: Locator, button: string | RegExp, stage: string): Promise<boolean> {
  return r.check(`admin presses “${button}” and sees “${stage}”`, async () => {
    await card.getByRole("button", { name: button }).click();
    await expect(card.locator(".phase")).toHaveText(stage);
  }, r.admin);
}

async function openSuspense(r: Rehearsal, card: Locator, title: string): Promise<void> {
  await r.check(`admin asks to open the suspense page “${title}”`, () => card.getByRole("button", { name: "Open suspense page" }).click(), r.admin);
  await Promise.all([
    press(r, card, "Yes, open suspense page", "Suspense page on phones"),
    ...r.guests.map((g) => r.time("suspense page shows", g, () => expect(g.page.getByRole("heading", { name: title })).toBeVisible({ timeout: SEE_TIMEOUT }))),
  ]);
}

// Each phone leaves the reveal with its own button, so the rehearsal never waits the minute after which the server sends them back.
async function backToParty(r: Rehearsal, show: "Quiz" | "Galleri", winner: (g: Guest) => Locator): Promise<void> {
  await Promise.all(
    r.guests.map(async (g) => {
      await r.time("back to the party", g, async () => {
        await g.page.getByRole("button", { name: "Tillbaka till festen" }).click();
        await expect(greeting(g.page, g.name)).toBeVisible({ timeout: SEE_TIMEOUT });
      });
      await r.check(`${g.name} keeps the winner on ${show}`, async () => {
        await tab(g, show);
        await expect(winner(g)).toBeVisible();
      }, g.page);
    }),
  );
}

const quizSuspense: Step = {
  id: "finale-quiz-suspense",
  title: "The host opens the quiz finale's suspense page; every phone moves there, and the photo contest stays open",
  async run(r) {
    await openSuspense(r, quizCard(r), "Vem vann quizet?");
    await r.check("admin shows uploads and voting still open", async () => {
      await expect(r.admin.getByText("Uploads open")).toBeVisible();
      await expect(r.admin.getByText("Voting open")).toBeVisible();
    }, r.admin);
  },
};

const quiz: Step = {
  id: "finale-quiz",
  title: "The host reveals the quiz winner, or joint winners, on every phone at once; each phone goes back to the party and keeps the winners on the Quiz tab",
  async run(r) {
    await Promise.all([
      press(r, quizCard(r), /^Reveal quiz winners?$/, "Winner on phones"),
      ...r.guests.map((g) => r.time("quiz winner shows", g, () => expect(g.page.getByText(/^Quizvinnar(en|na)$/)).toBeVisible({ timeout: SEE_TIMEOUT }))),
    ]);
    const named = quizCard(r).locator(".revealed dd b");
    const winners = (await named.count()) ? (await named.textContent())!.split(" & ") : [];
    const cheer = winners.length > 1 ? "Grattis, du delar segern!" : "Grattis, du vann!";
    await Promise.all(r.guests.map((g) => r.check(`${g.name} ${winners.includes(g.name) ? "is" : "isn't"} congratulated on the quiz`, () =>
      expect(g.page.getByText(cheer)).toHaveCount(winners.includes(g.name) ? 1 : 0), g.page)));
    await backToParty(r, "Quiz", (g) => g.page.locator(".quiz-winners").getByText(/^Quizvinnar(en|na)$/));
  },
};

const photoSuspense: Step = {
  id: "finale-photo-suspense",
  title: "The host opens the photo finale's suspense page; every phone moves there, and uploads and voting close",
  async run(r) {
    await openSuspense(r, photoCard(r), "Vem tog bästa fotot?");
    await r.check("admin shows uploads and voting closed", async () => {
      await expect(r.admin.getByText("Uploads closed")).toBeVisible();
      await expect(r.admin.getByText("Voting closed")).toBeVisible();
    }, r.admin);
  },
};

const photo: Step = {
  id: "finale-photo",
  title: "The host breaks any photo tie and reveals the photo winner on every phone at once, under a recap of the quiz winners; a phone that drops comes back to it, and the gallery then shows the winner",
  async run(r) {
    const pick = photoCard(r).getByRole("button", { name: "Pick as winner" }).first();
    if (await pick.isVisible()) {
      r.note("Photos were tied for first; the host picked the first tied photo.");
      await r.check("admin picks a winner from the tie", async () => {
        await pick.click();
        await expect(photoCard(r).getByRole("button", { name: "Winner ✓" })).toBeVisible();
      }, r.admin);
    }
    await Promise.all([
      press(r, photoCard(r), "Reveal photo winner", "Winner on phones"),
      ...r.guests.map((g) => r.time("photo winner shows", g, () => expect(g.page.getByText("tog vinnarbilden", { exact: false })).toBeVisible({ timeout: SEE_TIMEOUT }))),
    ]);
    const winner = (await photoCard(r).locator(".revealed dd b").textContent())!;
    await Promise.all(r.guests.map((g) => r.check(`${g.name} shows ${winner} as the photographer`, () => expect(g.page.getByRole("heading", { name: winner, exact: true })).toBeVisible(), g.page)));
    await Promise.all(r.guests.map((g) => r.check(`${g.name} keeps the quiz winners as a recap`, () => expect(g.page.locator(".recap")).toContainText(/^Quizvinnar(en|na)/), g.page)));
    await Promise.all(r.guests.map((g) => r.check(`${g.name} ${g.name === winner ? "is" : "isn't"} congratulated on the photo`, () =>
      expect(g.page.getByText("Grattis, det är din bild!")).toHaveCount(g.name === winner ? 1 : 0), g.page)));

    const dropper = r.guests.find((g) => g.profile === "flaky") ?? r.guests[0]!;
    await dropper.line.cut("clean");
    await r.admin.waitForTimeout(AWAY_MS);
    await dropper.line.restore();
    await r.time("finale reconnect lands on the reveal", dropper, async () => {
      await expect(reconnecting(dropper.page)).toHaveCount(0, { timeout: SEE_TIMEOUT });
      await expect(dropper.page.getByRole("heading", { name: winner, exact: true })).toBeVisible();
    });
    await backToParty(r, "Galleri", (g) => g.page.locator(".photo-winner").getByText(winner, { exact: true }));
  },
};

const wipe: Step = {
  id: "party-end",
  title: "The host ends the party, which refuses a new guest but lets one who lost their cookie back in by name, reopens and ends it again, then wipes it; every phone leaves, and the cast joins the empty party again",
  async run(r) {
    await r.check("admin ends the party", async () => {
      await partyEnd(r).getByRole("button", { name: "End the party" }).click();
      await partyEnd(r).getByRole("button", { name: "Yes, end the party" }).click();
      await expect(partyEnd(r).getByText("The party has ended. New guests can't join.")).toBeVisible();
    }, r.admin);
    await r.check("a new guest is turned away", async () => {
      await forgetIdentity(r.probe.page);
      await joinByLink(r.probe.page, r.secrets.join, `${r.probe.name} sen`);
      await expect(r.probe.page.getByText("Kalaset är slut. Tack för att du var med!")).toBeVisible({ timeout: SEE_TIMEOUT });
    }, r.probe.page);
    const returning = r.guests.find((g) => g.profile === "good") ?? r.guests[0]!;
    await r.time("guest without a cookie gets back in by name after the end", returning, async () => {
      await forgetIdentity(returning.page);
      await joinByLink(returning.page, r.secrets.join, returning.name.toLowerCase());
      await expect(returning.page.getByRole("heading", { name: "Är det du?" })).toBeVisible({ timeout: SEE_TIMEOUT });
      await returning.page.getByRole("button", { name: "Ja, det är jag" }).click();
      // A fresh page shows the photo reveal for the rest of its minute, and the app after that.
      await expect(returning.page.getByText("tog vinnarbilden", { exact: false }).or(greeting(returning.page, returning.name))).toBeVisible({ timeout: SEE_TIMEOUT });
    });
    await r.check("admin reopens joins and ends the party again", async () => {
      await partyEnd(r).getByRole("button", { name: "Reopen joins" }).click();
      await expect(partyEnd(r).getByText("New guests can join.")).toBeVisible();
      await partyEnd(r).getByRole("button", { name: "End the party" }).click();
      await partyEnd(r).getByRole("button", { name: "Yes, end the party" }).click();
      await expect(partyEnd(r).getByText("The party has ended. New guests can't join.")).toBeVisible();
    }, r.admin);

    await Promise.all([
      r.check("admin wipes the party", async () => {
        await partyEnd(r).getByRole("button", { name: "Wipe all data…" }).click();
        await expect(partyEnd(r).getByText(/^Download the photos first!/)).toBeVisible();
        await partyEnd(r).getByRole("button", { name: "Yes, wipe everything" }).click();
        await expect(r.admin.locator("#players-title")).toContainText(/^Players\s*0/, { timeout: SEE_TIMEOUT });
      }, r.admin),
      ...r.guests.map((g) => r.time("wiped phone leaves for the bare page", g, () => expect(g.page).toHaveURL(/\/$/, { timeout: SEE_TIMEOUT }))),
    ]);
    r.probe.joined = false;
    if (r.baselineOnline > 0) r.note(`The wipe also signed out ${r.baselineOnline} phone(s) that were online before the rehearsal.`);
    r.baselineOnline = 0;
    await Promise.all(
      r.guests.map((g) =>
        r.time("join the wiped party", g, async () => {
          await joinByLink(g.page, r.secrets.join, g.name);
          await expect(greeting(g.page, g.name)).toBeVisible({ timeout: SEE_TIMEOUT });
        }),
      ),
    );
  },
};

export const finaleSteps: Step[] = [quizSuspense, quiz, photoSuspense, photo, wipe];
