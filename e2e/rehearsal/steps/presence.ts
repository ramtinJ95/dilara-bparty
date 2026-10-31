import { expect } from "@playwright/test";
import { greeting, guestsHere, joinByCode, joinByLink, onlineDot, reconnecting, renameFromAdmin } from "../../drive.ts";
import type { Outage } from "../../phone-network.ts";
import type { Guest, Rehearsal, Step } from "../rehearsal.ts";

const JOIN_TIMEOUT = 30_000;
const CATCH_UP_TIMEOUT = 20_000;
// A silent outage is noticed only by the phone's heartbeat, which gives up after 40 s without a word from the server.
const SILENT_CATCH_UP_TIMEOUT = 60_000;
const AWAY_MS = 5_000;

const adminCount = (r: Rehearsal) => r.admin.locator("#players-title");
const allOnline = (r: Rehearsal) => r.baselineOnline + r.guests.length;

async function rename(r: Rehearsal, guest: Guest, suffix: string): Promise<void> {
  const next = `${guest.name} ${suffix}`;
  if (await r.check(`admin renames ${guest.name} to ${next} while the phone is away`, () => renameFromAdmin(r.admin, guest.name, next), r.admin)) {
    guest.name = next;
  }
}

async function catchUp(r: Rehearsal, kind: string, guest: Guest, timeout: number): Promise<void> {
  await r.time(kind, guest, async () => {
    await expect(greeting(guest.page, guest.name)).toBeVisible({ timeout });
    await expect(reconnecting(guest.page)).toHaveCount(0, { timeout });
  });
}

async function probeArrives(r: Rehearsal): Promise<void> {
  const { probe } = r;
  await (probe.joined ? probe.page.goto("/app") : joinByLink(probe.page, r.secrets.join, probe.name));
  await expect(greeting(probe.page, probe.name)).toBeVisible();
  probe.joined = true;
}

async function everyoneCurrent(r: Rehearsal): Promise<void> {
  const n = allOnline(r);
  await r.check(`admin shows all ${r.guests.length} guests online`, async () => {
    await Promise.all(r.guests.map((g) => expect(onlineDot(r.admin, g.name)).toBeVisible({ timeout: CATCH_UP_TIMEOUT })));
    await expect(adminCount(r)).toContainText(`· ${n} online`);
  }, r.admin);
  // A stale phone can still show the right screen, so every phone must also show a change made now: the probe arriving and leaving.
  await r.check("the probe guest arrives", () => probeArrives(r), r.probe.page);
  await Promise.all(
    r.guests.map((g) =>
      r.check(`${g.name} sees the probe arrive`, () => expect(g.page.getByText(guestsHere(n + 1), { exact: true })).toBeVisible({ timeout: CATCH_UP_TIMEOUT }), g.page),
    ),
  );
  await r.check("the probe guest leaves", () => r.probe.page.goto("about:blank"));
  await Promise.all(
    r.guests.map((g) =>
      r.check(`${g.name} greets them by name and sees the probe leave`, async () => {
        await expect(greeting(g.page, g.name)).toBeVisible({ timeout: CATCH_UP_TIMEOUT });
        await expect(g.page.getByText(guestsHere(n), { exact: true })).toBeVisible({ timeout: CATCH_UP_TIMEOUT });
      }, g.page),
    ),
  );
}

const join: Step = {
  id: "join",
  title: "Every guest joins at once, most by link and every fifth by code",
  async run(r) {
    const code = (await r.admin.locator(".code").textContent())!;
    await Promise.all(
      r.guests.map((g, i) =>
        r.time(i % 5 === 4 ? "join by code" : "join by link", g, async () => {
          await (i % 5 === 4 ? joinByCode(g.page, code, g.name) : joinByLink(g.page, r.secrets.join, g.name));
          await expect(greeting(g.page, g.name)).toBeVisible({ timeout: JOIN_TIMEOUT });
        }),
      ),
    );
    await everyoneCurrent(r);
  },
};

const lock: Step = {
  id: "lock",
  title: "Phones on slow networks lock, miss a change and unlock",
  async run(r) {
    const lockers = r.guests.filter((g) => g.profile === "slow-4g" || g.profile === "bad-3g").slice(0, 4);
    if (!lockers[0]) return r.note("No guests on slow networks to lock.");
    if (!lockers[0].line.lifecycle) r.note(`${r.browser} has no CDP page freeze, so a locked phone here only loses its socket.`);
    await Promise.all(
      lockers.map(async (g) => {
        await g.line.cut("clean");
        await expect(reconnecting(g.page)).toBeVisible({ timeout: CATCH_UP_TIMEOUT });
        await g.line.lifecycle?.freeze();
      }),
    );
    await r.check(`admin sees ${lockers.length} locked phones go offline`, async () => {
      await Promise.all(lockers.map((g) => expect(onlineDot(r.admin, g.name)).toHaveCount(0, { timeout: CATCH_UP_TIMEOUT })));
      await expect(adminCount(r)).toContainText(`· ${allOnline(r) - lockers.length} online`);
    }, r.admin);
    for (const g of lockers) await rename(r, g, "ny");
    await r.admin.waitForTimeout(AWAY_MS);
    await Promise.all(
      lockers.map(async (g) => {
        await g.line.restore();
        await g.line.lifecycle?.resume();
        await catchUp(r, "unlock and catch up", g, CATCH_UP_TIMEOUT);
      }),
    );
    await everyoneCurrent(r);
  },
};

const drop: Step = {
  id: "drop",
  title: "Flaky phones lose the network, cleanly or silently, and come back",
  async run(r) {
    const droppers = r.guests.filter((g) => g.profile === "flaky").map((g, i) => ({ g, outage: (i % 2 === 0 ? "clean" : "silent") as Outage }));
    const clean = droppers.filter((d) => d.outage === "clean").map((d) => d.g);
    const silent = droppers.filter((d) => d.outage === "silent").map((d) => d.g);
    await Promise.all(droppers.map(({ g, outage }) => g.line.cut(outage)));
    await r.check(`admin sees ${clean.length} cleanly dropped phones go offline`, () =>
      Promise.all(clean.map((g) => expect(onlineDot(r.admin, g.name)).toHaveCount(0, { timeout: CATCH_UP_TIMEOUT }))), r.admin);
    const stillShown = (await Promise.all(silent.map((g) => onlineDot(r.admin, g.name).count()))).filter((n) => n > 0).length;
    if (silent.length) r.note(`During the silent outage the admin still showed ${stillShown} of ${silent.length} silently dropped phones as online; the server has no way to tell yet.`);
    for (const { g } of droppers) await rename(r, g, "igen");
    await r.admin.waitForTimeout(AWAY_MS);
    await Promise.all(
      droppers.map(async ({ g, outage }) => {
        await g.line.restore();
        await catchUp(r, `${outage} drop, back and current`, g, outage === "silent" ? SILENT_CATCH_UP_TIMEOUT : CATCH_UP_TIMEOUT);
      }),
    );
    await everyoneCurrent(r);
  },
};

const rejoin: Step = {
  id: "rejoin",
  title: "Phones that lost their cookie rejoin by name with “Är det du?”",
  async run(r) {
    const forgetful = [r.guests.find((g, i) => i > 0 && g.profile === "good"), r.guests.filter((g) => g.profile === "bad-3g")[2]].filter((g) => g !== undefined);
    await Promise.all(
      forgetful.map((g) =>
        r.time("rejoin by name", g, async () => {
          await g.context.clearCookies();
          await joinByLink(g.page, r.secrets.join, g.name.toLowerCase());
          await expect(g.page.getByRole("heading", { name: "Är det du?" })).toBeVisible({ timeout: JOIN_TIMEOUT });
          await g.page.getByRole("button", { name: "Ja, det är jag" }).click();
          await expect(greeting(g.page, g.name)).toBeVisible({ timeout: JOIN_TIMEOUT });
        }),
      ),
    );
    await r.check("admin still lists each rejoined guest once", () =>
      Promise.all(forgetful.map((g) => expect(r.admin.locator(".players li .name").getByText(g.name, { exact: true })).toHaveCount(1))), r.admin);
    await everyoneCurrent(r);
  },
};

export const presenceSteps: Step[] = [join, lock, drop, rejoin];

export const settle: Step = { id: "settle", title: "Everyone is online and current at the end", run: everyoneCurrent };
