// Screenshots every guest state at each of SIZES, plus the admin at 1440 px, for a restyle PR. It plays the whole party through both
// finales, which can't be undone, so point it only at a fresh local instance seeded with `npm run seed -- --base-url <url> --bots`.
// Usage: node e2e/tour.ts <local base url> [out dir]
import { chromium, expect, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { chromiumLaunchOptions, versionsOf } from "./drive.ts";
import { LOOKS, placeholder, pngFile } from "./placeholder.ts";

const base = process.argv[2] ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(base)) throw new Error(`refusing ${base || "no base url"}: give a local instance`);
const out = process.argv[3] ?? "artifacts/tour";
mkdirSync(out, { recursive: true });
const vars = Object.fromEntries(readFileSync(".dev.vars", "utf8").trim().split("\n").map((l) => l.split("=") as [string, string]));
const JOIN = vars.JOIN_SECRET!;
const ADMIN = vars.ADMIN_SECRET!;

const browser = await chromium.launch({ ...chromiumLaunchOptions() });
// iPhone 15 in Safari with its toolbars, the iPhone SE, and the Pixel 7. The first is the one the phones start at.
const SIZES = [
  { width: 393, height: 659 },
  { width: 375, height: 667 },
  { width: 412, height: 839 },
];
const phoneOpts = { viewport: SIZES[0]!, isMobile: true, hasTouch: true, deviceScaleFactor: 2, baseURL: base };

async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState !== "running"), null, { timeout: 8000 }).catch(() => {});
}
let n = 0;
async function shot(page: Page, name: string, narrow = true) {
  n++;
  const id = `${String(n).padStart(2, "0")}-${name}`;
  await settle(page);
  await page.screenshot({ path: `${out}/${id}.png` });
  if (!narrow || page.viewportSize()!.width !== SIZES[0]!.width) return;
  for (const size of SIZES.slice(1)) {
    await page.setViewportSize(size);
    await settle(page);
    await page.screenshot({ path: `${out}/${id}-${size.width}.png` });
  }
  await page.setViewportSize(SIZES[0]!);
}
async function full(page: Page, name: string) {
  n++;
  await settle(page);
  await page.screenshot({ path: `${out}/${String(n).padStart(2, "0")}-${name}-full.png`, fullPage: true });
}

const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: base });
const admin = await adminCtx.newPage();
await admin.goto(`/admin/${ADMIN}`);
await expect(admin.getByText("Live", { exact: true })).toBeVisible();
const click = async (name: string | RegExp) => {
  await admin.getByRole("button", { name }).first().click();
  const yes = admin.getByRole("button", { name: /^Yes, / });
  if (await yes.isVisible().catch(() => false)) await yes.click();
};

async function phone(): Promise<[BrowserContext, Page]> {
  const ctx = await browser.newContext(phoneOpts);
  return [ctx, await ctx.newPage()];
}

const [, kim] = await phone();
await kim.goto(`/j/${JOIN}`);
await shot(kim, "landing-photo");
const [, nophoto] = await phone();
await nophoto.route("**/photos/**", (r) => r.abort());
await nophoto.goto(`/j/${JOIN}`);
await shot(nophoto, "landing-no-photo");
await nophoto.close();

await kim.getByLabel("Vad heter du?").fill("Testgäst Saga");
await kim.getByRole("button", { name: "Gå med" }).click();
await expect(kim.getByRole("heading", { name: "Är det du?" })).toBeVisible();
await shot(kim, "is-it-you");
await kim.getByRole("button", { name: "Nej, byt namn" }).click();
await kim.getByLabel("Vad heter du?").fill("Testgäst Kim");
await kim.getByRole("button", { name: "Gå med" }).click();
await expect(kim.getByRole("heading", { name: "Hej, Testgäst Kim!" })).toBeVisible();
await shot(kim, "quiz-locked");
await kim.getByRole("button", { name: "Mitt foto" }).click();
await shot(kim, "my-photo-empty");
let release = () => {};
await kim.route("**/api/photo", (route) => new Promise<void>((resolve) => (release = () => resolve(route.continue()))));
await kim.locator('input[type="file"]').setInputFiles(pngFile("snow", await placeholder(kim, LOOKS.snow)));
await expect(kim.getByText("Skickar bilden…")).toBeVisible({ timeout: 20000 });
await shot(kim, "my-photo-uploading");
release();
await kim.unroute("**/api/photo");
await expect(kim.getByText("Inga röster än")).toBeVisible({ timeout: 20000 });
await kim.getByRole("button", { name: "Galleri" }).click();
await shot(kim, "gallery-voting");
await full(kim, "gallery-voting");

const [, saga] = await phone();
await saga.goto(`/j/${JOIN}`);
await saga.getByLabel("Vad heter du?").fill("Testgäst Saga");
await saga.getByRole("button", { name: "Gå med" }).click();
await saga.getByRole("button", { name: "Ja, det är jag" }).click();
await saga.getByRole("button", { name: "Mitt foto" }).click();
await expect(saga.getByRole("img", { name: "Din bild" })).toBeVisible();
// The bots move their votes around, so Kim gives Saga's photo one to be sure the confirmations show.
const sagaThumb = (await saga.locator(".photo-frame img").evaluate((img) => getComputedStyle(img).backgroundImage)).match(/url\("?(.*?)"?\)/)![1]!;
await kim.locator(".tile").filter({ has: kim.locator(`img[src="${new URL(sagaThumb).pathname}"]`) }).getByRole("button", { name: "Ge en röst" }).click();
await expect(saga.getByText("Inga röster än")).toBeHidden();
await shot(saga, "my-photo-uploaded");
await saga.getByRole("button", { name: "Byt bild" }).click();
await shot(saga, "my-photo-replace-confirm");
await saga.getByRole("button", { name: "Avbryt" }).click();
await saga.getByRole("button", { name: "Ta bort" }).click();
await shot(saga, "my-photo-remove-confirm");
await saga.getByRole("button", { name: "Avbryt" }).click();
const sagaPhoto = versionsOf(admin, "Testgäst Saga").last();
await sagaPhoto.getByRole("button", { name: "Hide" }).click();
await expect(saga.getByText("Kalasvärden har gömt bilden från galleriet.", { exact: false })).toBeVisible();
await shot(saga, "my-photo-hidden");
await sagaPhoto.getByRole("button", { name: "Unhide" }).click();
// Hiding took the votes back, and only a photo with votes stays in the hall of fame when it is replaced.
await kim.locator(".tile").filter({ has: kim.locator(`img[src="${new URL(sagaThumb).pathname}"]`) }).getByRole("button", { name: "Ge en röst" }).click();
await expect(saga.getByText("Inga röster än")).toBeHidden();
await saga.getByRole("button", { name: "Byt bild" }).click();
await saga.getByRole("button", { name: "Välj ny bild" }).click();
await saga.locator('input[type="file"]').setInputFiles(pngFile("dusk", await placeholder(saga, LOOKS.dusk, [900, 1600])));
await expect(saga.locator(".fame-line")).toBeVisible({ timeout: 20000 });
await expect(saga.getByText("Inga röster än")).toBeVisible({ timeout: 20000 });
await shot(saga, "my-photo-fame");
await saga.locator('input[type="file"]').setInputFiles({ name: "trasig.png", mimeType: "image/png", buffer: Buffer.from("ingen bild") });
await expect(saga.getByText("Den bilden gick inte att läsa. Prova en annan.")).toBeVisible();
await shot(saga, "my-photo-refused");
await saga.route("**/api/photo", (route) => route.fulfill({ status: 503 }));
await saga.locator('input[type="file"]').setInputFiles(pngFile("mint", await placeholder(saga, LOOKS.mint, [900, 1600])));
await expect(saga.getByText("Bilden kom inte fram.", { exact: false })).toBeVisible({ timeout: 60000 });
await shot(saga, "my-photo-stuck");
await saga.unroute("**/api/photo");
await saga.getByRole("button", { name: "Försök igen" }).click();
await expect(saga.getByText("Inga röster än")).toBeVisible({ timeout: 20000 });
await saga.getByRole("button", { name: "Galleri" }).click();
await full(saga, "gallery-own-fame");

for (let i = 0; i < 2; i++) {
  const plus = kim.locator(".tile:not(:has(.own))").nth(i % 2).getByRole("button", { name: "Ge en röst" });
  if (await plus.isEnabled()) await plus.click();
  await kim.waitForTimeout(300);
}
await shot(kim, "gallery-out-of-votes");
await kim.getByRole("button", { name: "Visa bilden" }).first().click();
await shot(kim, "gallery-lightbox");
await kim.getByRole("button", { name: "Stäng" }).click();

await shot(admin, "admin-start", false);
await full(admin, "admin-start");

await click("Unlock quiz");
await expect(kim.getByRole("dialog", { name: "Quizet har börjat!" })).toBeVisible();
await shot(kim, "quiz-popup");
await kim.getByRole("button", { name: "Till quizet" }).click();
await shot(kim, "quiz-lobby");

await click(/^Start question/);
await expect(kim.locator(".choices, .guess")).toBeVisible();
await kim.waitForTimeout(1500);
await shot(kim, "quiz-question");
await kim.locator(".choice").nth(1).click();
await shot(kim, "quiz-answered");
await expect(kim.locator(".verdict")).toBeVisible({ timeout: 30000 });
await shot(kim, "quiz-reveal");
await shot(admin, "admin-reveal", false);
await expect(kim.getByRole("heading", { name: "Topplistan" })).toBeVisible({ timeout: 15000 });
await kim.waitForTimeout(2000);
await shot(kim, "quiz-leaderboard");
await shot(admin, "admin-leaderboard", false);

await click("Next question");
await expect(kim.locator(".q-photo")).toBeVisible({ timeout: 15000 });
await kim.waitForTimeout(800);
await shot(kim, "quiz-question-photo");
await full(kim, "quiz-question-photo");
await expect(kim.getByText("Tiden är ute!").or(kim.locator(".verdict"))).toBeVisible({ timeout: 60000 });
await shot(kim, "quiz-missed");
await expect(kim.locator(".verdict")).toBeVisible({ timeout: 15000 });
await shot(kim, "quiz-reveal-none");

await click("Next question");
await expect(kim.locator(".guess")).toBeVisible();
await shot(kim, "quiz-number");
await kim.getByLabel("Din gissning").fill("42");
await kim.getByRole("button", { name: "Skicka" }).click();
await expect(kim.locator(".verdict")).toBeVisible({ timeout: 30000 });
await shot(kim, "quiz-reveal-number");
await expect(kim.getByRole("heading", { name: "Topplistan" })).toBeVisible({ timeout: 15000 });
await kim.waitForTimeout(2000);
await shot(kim, "quiz-leaderboard-2");

await click("End quiz");
await expect(kim.getByRole("heading", { name: "Quizet är slut!" })).toBeVisible();
await shot(kim, "quiz-ended");

await click(/^Close voting/);
await kim.getByRole("button", { name: "Galleri" }).click();
await shot(kim, "gallery-closed");
await click(/^Close uploads/);
await saga.getByRole("button", { name: "Mitt foto" }).click();
await shot(saga, "my-photo-closed");
await shot(admin, "admin-before-finale", false);
await full(admin, "admin-before-finale");

const openSuspense = async (card: string) => {
  await admin.locator(card).getByRole("button", { name: "Open suspense page" }).click();
  await admin.locator(card).getByRole("button", { name: "Yes, open suspense page" }).click();
  await expect(kim.locator(".suspense")).toBeVisible();
};
const backToParty = async () => {
  await kim.getByRole("button", { name: "Tillbaka till festen" }).click();
  await expect(kim.locator(".tabs")).toBeVisible();
};
await openSuspense(".quiz-finale");
await shot(kim, "finale-quiz-suspense");
const winnerPhone = async (name: string) => {
  const [, page] = await phone();
  await page.goto(`/j/${JOIN}`);
  await page.getByLabel("Vad heter du?").fill(name);
  await page.getByRole("button", { name: "Gå med" }).click();
  await page.getByRole("button", { name: "Ja, det är jag" }).click();
  await expect(page.locator(".you")).toBeVisible();
  await page.waitForTimeout(2500);
  return page;
};
await click(/^Reveal quiz winner/);
await kim.waitForTimeout(2500);
await shot(kim, "finale-quiz");
await shot(await winnerPhone((await kim.locator("#finale-title").textContent())!.split(" & ")[0]!), "finale-quiz-own");
await backToParty();
await kim.getByRole("button", { name: "Quiz" }).click();
await shot(kim, "quiz-winners");
await openSuspense(".photo-finale");
await shot(kim, "finale-photo-suspense");
const pick = admin.getByRole("button", { name: "Pick as winner" });
if (await pick.first().isVisible().catch(() => false)) await pick.first().click();
await click("Reveal photo winner");
await expect(kim.locator(".win-photo")).toBeVisible();
await kim.waitForTimeout(2500);
await shot(kim, "finale-photo");
await shot(await winnerPhone((await kim.locator("#finale-title").textContent())!), "finale-photo-own");
await backToParty();
await kim.getByRole("button", { name: "Galleri" }).click();
await shot(kim, "gallery-winner");
await shot(admin, "admin-finale", false);

await browser.close();
console.log("done", n);
