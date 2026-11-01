import { expect, test, type Browser, type Page } from "@playwright/test";
import { greeting, joinByLink, onlineDot, openAdmin, reconnecting, renameFromAdmin, adminRow, laptop, versionsOf } from "./drive";
import { shapeNetwork, type Line, type ProfileName } from "./phone-network";
import { noise, pngFile } from "./placeholder";
import { secrets } from "./server";

const phoneSize = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
// Names are unique per party, and the server keeps one party for the whole run, so repeats and retries need fresh names.
const tagged = (name: string) => `${name} ${Math.random().toString(36).slice(2, 5)}`;

async function admin(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext(laptop)).newPage();
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
  await expect(reconnecting(page)).toBeVisible();
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

const dropped = (page: Page) => page.getByText("Anslutningen bröts.", { exact: false });
const uploaded = (page: Page) => page.getByText("Inga röster än");

function countUploads(page: Page): () => number {
  let n = 0;
  page.on("request", (r) => void (r.method() === "POST" && new URL(r.url()).pathname === "/api/photo" && n++));
  return () => n;
}

// Chromium's offline emulation lets a request it has started finish, so the route plays the tunnel: the first try reaches the server and
// stores the photo, but its response never comes back and the line goes down with it.
test("a phone that loses the network mid-upload knows within seconds and lands exactly one version once it is back", async ({ browser }) => {
  const tunnel = tagged("Gäst Uppladdning");
  const host = await admin(browser);
  const { page, line } = await phone(browser, "slow-4g", tunnel);
  const uploads = countUploads(page);
  let reachedServer!: () => void;
  const stored = new Promise<void>((resolve) => (reachedServer = resolve));
  await page.route("**/api/photo", async (route) => {
    if (uploads() > 1) return route.fallback();
    await line.cut("clean");
    await route.fetch();
    reachedServer();
  });

  await page.getByRole("button", { name: "Mitt foto" }).click();
  await page.locator('input[type="file"]').setInputFiles(pngFile("noise", await noise(page)));
  await stored;
  const cutAt = Date.now();
  await expect(versionsOf(host, tunnel)).toHaveCount(1);
  await expect(dropped(page)).toBeVisible({ timeout: 12_000 });
  const noticedMs = Date.now() - cutAt;
  test.info().annotations.push({ type: "stall noticed after", description: `${noticedMs} ms` });
  await expect(page.getByAltText("Din bild"), "the shrunk photo is still on screen").toBeVisible();
  await expect(page.getByRole("button", { name: "Försök igen" })).toBeVisible();

  await page.waitForTimeout(5_000);
  expect(uploads(), "no tries while the phone is offline").toBe(1);

  await line.restore();
  await expect(uploaded(page)).toBeVisible({ timeout: 15_000 });
  expect(uploads(), "one retry, sent when the network came back").toBe(2);
  await expect(versionsOf(host, tunnel), "the retry was recognised as the same upload").toHaveCount(1);
  await expect(dropped(page)).toHaveCount(0);
});

test("a slow upload on bad 3G that keeps moving is never cut off as stalled", async ({ browser }) => {
  const slow = tagged("Gäst Trög");
  const host = await admin(browser);
  const { page } = await phone(browser, "bad-3g", slow);
  const uploads = countUploads(page);

  await page.getByRole("button", { name: "Mitt foto" }).click();
  const startedAt = Date.now();
  await page.locator('input[type="file"]').setInputFiles(pngFile("noise", await noise(page)));
  await expect(uploaded(page).or(dropped(page))).toBeVisible({ timeout: 60_000 });
  test.info().annotations.push({ type: "bad 3G upload took", description: `${Date.now() - startedAt} ms` });
  await expect(uploaded(page)).toBeVisible();
  expect(uploads()).toBe(1);
  expect(Date.now() - startedAt, "long enough to span several stall windows").toBeGreaterThan(16_000);
  await expect(versionsOf(host, slow)).toHaveCount(1);
});
