import { expect, test, type Browser, type Page } from "@playwright/test";
import { greeting, joinByLink, onlineDot, openAdmin, reconnecting, renameFromAdmin, adminRow } from "./drive";
import { shapeNetwork, type Line, type ProfileName } from "./phone-network";
import { secrets } from "./server";

const phoneSize = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
// Names are unique per party, and the server keeps one party for the whole run, so repeats and retries need fresh names.
const tagged = (name: string) => `${name} ${Math.random().toString(36).slice(2, 5)}`;

async function admin(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await openAdmin(page, secrets.admin);
  return page;
}

async function phone(browser: Browser, profile: ProfileName, name: string): Promise<{ page: Page; line: Line }> {
  const context = await browser.newContext(phoneSize);
  const page = await context.newPage();
  const line = await shapeNetwork(context, page, profile);
  await joinByLink(page, secrets.join, name);
  await expect(greeting(page, name)).toBeVisible({ timeout: 15_000 });
  return { page, line };
}

test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

test("a phone on bad 3G joins, follows live changes and comes back to the same state after a reload", async ({ browser }) => {
  const [slow, sluggish] = [tagged("Gäst Långsam"), tagged("Gäst Seg")];
  const host = await admin(browser);
  const { page } = await phone(browser, "bad-3g", slow);
  await expect(onlineDot(host, slow)).toBeVisible();

  await renameFromAdmin(host, slow, sluggish);
  await expect(greeting(page, sluggish)).toBeVisible({ timeout: 5_000 });

  await page.reload();
  await expect(greeting(page, sluggish)).toBeVisible({ timeout: 15_000 });
  await expect(onlineDot(host, sluggish)).toBeVisible();
});

test("a phone that drops off mid-session reconnects on its own and shows what changed while it was away", async ({ browser }) => {
  const [tunnel, back] = [tagged("Gäst Tunnel"), tagged("Gäst Tillbaka")];
  const host = await admin(browser);
  const { page, line } = await phone(browser, "slow-4g", tunnel);

  await line.cut("clean");
  await expect(reconnecting(page)).toBeVisible();
  await expect(onlineDot(host, tunnel)).toHaveCount(0);
  await renameFromAdmin(host, tunnel, back);
  await page.waitForTimeout(1_000);
  await expect(greeting(page, tunnel)).toBeVisible();

  await line.restore();
  await expect(greeting(page, back)).toBeVisible({ timeout: 10_000 });
  await expect(reconnecting(page)).toHaveCount(0);
  await expect(onlineDot(host, back)).toBeVisible();
});

test("a frozen background tab catches up when it resumes, with or without its socket", async ({ browser }) => {
  const [pocket, bag, locked] = [tagged("Gäst Ficka"), tagged("Gäst Väska"), tagged("Gäst Låst")];
  const host = await admin(browser);
  const { page, line } = await phone(browser, "slow-4g", pocket);
  const { freeze, resume } = line.lifecycle!;

  await freeze();
  await renameFromAdmin(host, pocket, bag);
  await host.waitForTimeout(1_000);
  await resume();
  await expect(greeting(page, bag)).toBeVisible({ timeout: 5_000 });

  await line.cut("clean");
  await freeze();
  await expect(onlineDot(host, bag)).toHaveCount(0);
  await renameFromAdmin(host, bag, locked);
  await line.restore();
  await resume();
  await expect(greeting(page, locked)).toBeVisible({ timeout: 10_000 });
  await expect(onlineDot(host, locked)).toBeVisible();
});

test("a phone that lost its cookie rejoins by name and keeps its identity", async ({ browser }) => {
  const forgetful = tagged("Gäst Glömsk");
  const host = await admin(browser);
  const { page } = await phone(browser, "slow-4g", forgetful);

  await page.context().clearCookies();
  await page.reload();
  await expect(page.getByLabel("Kod")).toBeVisible({ timeout: 15_000 });
  await expect(onlineDot(host, forgetful)).toHaveCount(0);

  await joinByLink(page, secrets.join, forgetful.toLowerCase());
  await expect(page.getByRole("heading", { name: "Är det du?" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Ja, det är jag" }).click();
  await expect(greeting(page, forgetful)).toBeVisible({ timeout: 15_000 });
  await expect(adminRow(host, forgetful)).toHaveCount(1);
  await expect(onlineDot(host, forgetful)).toBeVisible();
});
