import { expect } from "@playwright/test";
import { greeting, joinByLink, reconnecting } from "../../drive.ts";
import type { Rehearsal, Step } from "../rehearsal.ts";

const SEE_TIMEOUT = 30_000;
const AWAY_MS = 3_000;

const finaleCard = (r: Rehearsal) => r.admin.locator(".finale");
const partyEnd = (r: Rehearsal) => r.admin.locator(".party-end");

async function press(r: Rehearsal, button: string | RegExp, stage: string): Promise<boolean> {
  return r.check(`admin presses “${button}” and sees “${stage}”`, async () => {
    await finaleCard(r).getByRole("button", { name: button }).click();
    await expect(finaleCard(r).locator(".phase")).toHaveText(stage);
  }, r.admin);
}

const suspense: Step = {
  id: "finale-suspense",
  title: "The host opens the suspense page; every phone moves there and voting closes",
  async run(r) {
    await r.check("admin opens the finale", () => finaleCard(r).getByRole("button", { name: "Open suspense page" }).click(), r.admin);
    await Promise.all([
      press(r, "Yes, open suspense page", "Suspense page on phones"),
      ...r.guests.map((g) => r.time("suspense page shows", g, () => expect(g.page.getByRole("heading", { name: "Och vinnarna är…" })).toBeVisible({ timeout: SEE_TIMEOUT }))),
    ]);
    await r.check("admin shows voting closed", () => expect(r.admin.getByText("Voting closed")).toBeVisible(), r.admin);
  },
};

const photo: Step = {
  id: "finale-photo",
  title: "The host breaks any photo tie and reveals the photo winner on every phone at once; a phone that drops comes back to it",
  async run(r) {
    const pick = finaleCard(r).getByRole("button", { name: "Pick as winner" }).first();
    if (await pick.isVisible()) {
      r.note("Photos were tied for first; the host picked the first tied photo.");
      await r.check("admin picks a winner from the tie", async () => {
        await pick.click();
        await expect(finaleCard(r).getByRole("button", { name: "Winner ✓" })).toBeVisible();
      }, r.admin);
    }
    await Promise.all([
      press(r, "Reveal photo winner", "Photo winner on phones"),
      ...r.guests.map((g) => r.time("photo winner shows", g, () => expect(g.page.getByText("tog vinnarbilden", { exact: false })).toBeVisible({ timeout: SEE_TIMEOUT }))),
    ]);
    const winner = (await finaleCard(r).locator(".revealed dd b").first().textContent())!;
    await Promise.all(r.guests.map((g) => r.check(`${g.name} shows ${winner} as the photographer`, () => expect(g.page.getByRole("heading", { name: winner, exact: true })).toBeVisible(), g.page)));

    const dropper = r.guests.find((g) => g.profile === "flaky") ?? r.guests[0]!;
    await dropper.line.cut("clean");
    await r.admin.waitForTimeout(AWAY_MS);
    await dropper.line.restore();
    await r.time("finale reconnect lands on the reveal", dropper, async () => {
      await expect(reconnecting(dropper.page)).toHaveCount(0, { timeout: SEE_TIMEOUT });
      await expect(dropper.page.getByRole("heading", { name: winner, exact: true })).toBeVisible();
    });
  },
};

const quiz: Step = {
  id: "finale-quiz",
  title: "The host reveals the quiz winner, or joint winners, on every phone at once",
  async run(r) {
    await Promise.all([
      press(r, /^Reveal quiz winners?$/, "Quiz winner on phones"),
      ...r.guests.map((g) => r.time("quiz winner shows", g, () => expect(g.page.getByText(/^Quizvinnar(en|na)$/)).toBeVisible({ timeout: SEE_TIMEOUT }))),
    ]);
  },
};

const wipe: Step = {
  id: "party-end",
  title: "The host ends the party, which refuses a new guest, then wipes it; every phone leaves, and the cast joins the empty party again",
  async run(r) {
    await r.check("admin ends the party", async () => {
      await partyEnd(r).getByRole("button", { name: "End the party" }).click();
      await partyEnd(r).getByRole("button", { name: "Yes, end the party" }).click();
      await expect(partyEnd(r).getByText("The party has ended. New guests can't join.")).toBeVisible();
    }, r.admin);
    await r.check("a new guest is turned away", async () => {
      await r.probe.page.context().clearCookies();
      await joinByLink(r.probe.page, r.secrets.join, `${r.probe.name} sen`);
      await expect(r.probe.page.getByText("Kalaset är slut. Tack för att du var med!")).toBeVisible({ timeout: SEE_TIMEOUT });
    }, r.probe.page);

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

export const finaleSteps: Step[] = [suspense, photo, quiz, wipe];
