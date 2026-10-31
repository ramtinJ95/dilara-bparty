import { expect, test, type Browser, type Page } from "@playwright/test";
import { LOOKS, placeholder, pngFile } from "./placeholder";
import { secrets } from "./server";
import { addQuestion, answer, reconnecting, unlockPopup } from "./drive";
import { shapeNetwork } from "./phone-network";
import { joinViaApi, laptop, openAdmin, openShell } from "./support";

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function adminPage(page: Page) {
  await page.goto(`/admin/${secrets.admin}`);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
}

test("a guest finds the party by code, joins, and shows up live for the admin", async ({ browser }) => {
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const admin = await adminContext.newPage();
  await adminPage(admin);
  const code = (await admin.locator(".code").textContent())!;
  await expect(admin.getByText("Nobody has joined yet.")).toBeVisible();

  const guestContext = await browser.newContext(phone);
  const guest = await guestContext.newPage();
  await guest.goto("/");
  await expect(guest.locator("body")).not.toContainText("Dilara");

  await guest.getByLabel("Kod").fill("AAA 222");
  await guest.getByRole("button", { name: "Fortsätt" }).click();
  await expect(guest.getByRole("alert")).toHaveText("Fel kod, försök igen.");

  await guest.getByLabel("Kod").fill(code.toLowerCase());
  await guest.getByRole("button", { name: "Fortsätt" }).click();
  await expect(guest).toHaveURL(new RegExp(`/j/${secrets.join}$`));
  await expect(guest.getByRole("heading", { name: "Dilara fyller 3!" })).toBeVisible();

  await guest.getByLabel("Vad heter du?").fill("Testgäst");
  await guest.getByRole("button", { name: "Gå med" }).click();
  await expect(guest).toHaveURL(/\/app$/);
  await expect(guest.getByRole("heading", { name: "Hej, Testgäst!" })).toBeVisible();

  await expect(guest.getByRole("heading", { name: "Quizet är inte öppet än" })).toBeVisible();
  await guest.getByRole("button", { name: "Mitt foto" }).click();
  await expect(guest).toHaveURL(/#mitt-foto$/);
  await expect(guest.getByRole("heading", { name: "Mitt foto" })).toBeVisible();
  await guest.getByRole("button", { name: "Galleri" }).click();
  await expect(guest.getByRole("heading", { name: "Galleri" })).toBeVisible();
  await guest.reload();
  await expect(guest.getByRole("button", { name: "Galleri" })).toHaveAttribute("aria-current", "page");

  const row = admin.locator(".players li", { hasText: "Testgäst" });
  await expect(row.locator(".dot.on")).toBeVisible();
  await guestContext.close();
  await expect(row.locator(".dot.on")).toHaveCount(0);
  await expect(row.locator(".dot")).toBeVisible();
  await adminContext.close();
});

test("the bare page stays neutral for a joined guest and wrong links look like nothing", async ({ browser }) => {
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  await page.goto(`/j/${secrets.join}`);
  await page.getByLabel("Vad heter du?").fill("Astrid");
  await page.getByRole("button", { name: "Gå med" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto("/");
  await expect(page.getByLabel("Kod")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Dilara");

  const wrong = await page.goto("/j/not-the-secret");
  expect(wrong?.status()).toBe(404);
  expect((await page.goto("/guest.html"))?.status()).toBe(404);
  const robots = await page.goto("/robots.txt");
  expect(await robots?.text()).toContain("Disallow: /");
  expect(robots?.headers()["x-robots-tag"]).toContain("noindex");
  await context.close();
});

async function joinedPhone(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext(phone);
  const res = await context.request.post("/api/join", { data: { secret: secrets.join, name } });
  expect(await res.json()).toEqual({ status: "joined" });
  const page = await context.newPage();
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: `Hej, ${name}!` })).toBeVisible();
  return page;
}

test("a guest uploads a photo, another guest votes for it, and the admin sees the tally", async ({ browser }) => {
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const admin = await adminContext.newPage();
  await adminPage(admin);

  const uploader = await joinedPhone(browser, "Fotogäst");
  await uploader.getByRole("button", { name: "Mitt foto" }).click();
  await uploader.locator('input[type="file"]').setInputFiles(pngFile("snow", await placeholder(uploader, LOOKS.snow)));
  await expect(uploader.getByText("Inga röster än")).toBeVisible();
  await expect(uploader.getByRole("button", { name: "Byt bild" })).toBeVisible();

  const voter = await joinedPhone(browser, "Röstgäst");
  await voter.getByRole("button", { name: "Galleri" }).click();
  await expect(voter.getByText("3 av 3 röster kvar")).toBeVisible();
  await expect(voter.locator(".gallery .tile")).toHaveCount(1);
  await voter.getByRole("button", { name: "Ge en röst" }).click();
  await expect(voter.getByText("2 av 3 röster kvar")).toBeVisible();
  await expect(voter.getByLabel("Dina röster: 1")).toBeVisible();

  await expect(uploader.getByText("Din bild har 1 röst")).toBeVisible();
  const row = admin.locator(".tally li", { hasText: "Fotogäst" });
  await expect(row).toContainText("1 vote");
  await expect(row.locator(".rank")).toHaveText("1");
  await expect(admin.locator(".versions li")).toHaveCount(1);

  await Promise.all([adminContext.close(), uploader.context().close(), voter.context().close()]);
});

test("the host runs a question; a guest on another tab is called in, answers, and sees the result and the board", async ({ browser }) => {
  const adminContext = await browser.newContext(laptop);
  const admin = await openAdmin(adminContext);
  await addQuestion(admin, { kind: "choice", text: "Vilken färg har snö?", options: ["Vit", "Blå", "Grön"], correct: 0, photo: await placeholder(admin, LOOKS.snow) });
  await addQuestion(admin, { kind: "number", text: "Hur många morötter behöver en snögubbe?", answer: "1" });
  await expect(admin.locator(".questions > ol > li")).toHaveCount(2);

  const kimContext = await joinViaApi(browser, "Kim Testsson");
  await kimContext.addInitScript(() => {
    navigator.vibrate = (pattern) => {
      (window as unknown as { vibrated: unknown }).vibrated = pattern;
      return true;
    };
  });
  const kim = await openShell(kimContext);
  await kim.getByRole("button", { name: "Galleri" }).click();
  const olleContext = await joinViaApi(browser, "Olle");
  const olle = await olleContext.newPage();
  const olleLine = await shapeNetwork(olleContext, olle, "good");
  await olle.goto("/app");
  await expect(olle.getByRole("heading", { name: "Hej, Olle!" })).toBeVisible();

  await admin.getByRole("button", { name: "Unlock quiz" }).click();
  const popup = unlockPopup(kim);
  await expect(popup).toBeVisible();
  await expect.poll(() => kim.evaluate(() => (window as unknown as { vibrated: unknown }).vibrated)).toEqual([200, 100, 200]);
  await expect(olle.getByRole("heading", { name: "Quizet börjar snart!" })).toBeVisible();
  await expect(olle.getByRole("dialog")).toHaveCount(0);

  await popup.getByRole("button", { name: "Till quizet" }).click();
  await expect(popup).toBeHidden();
  await expect(kim.getByRole("button", { name: "Quiz", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(kim.getByRole("heading", { name: "Quizet börjar snart!" })).toBeVisible();
  await kim.getByRole("button", { name: "Galleri" }).click();
  await kim.reload();
  await expect(kim.getByRole("heading", { name: "Galleri" })).toBeVisible();
  await expect(kim.getByRole("dialog")).toHaveCount(0);
  await kim.getByRole("button", { name: "Quiz", exact: true }).click();

  await admin.getByRole("button", { name: "Start question 1" }).click();
  await expect(kim.getByText("Fråga 1 av 2")).toBeVisible();
  await expect(kim.locator(".q-photo")).toBeVisible();
  expect(await kim.locator(".q-photo").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await answer(kim, "Vit");
  await expect(kim.locator(".choice.picked")).toContainText("Vit");
  await expect(admin.getByText("1 of 2 answered")).toBeVisible();
  await answer(olle, "Grön");

  await expect(admin.getByText("Answers closed")).toBeVisible();
  await expect(kim.getByText("Väntar på rätt svar …")).toBeVisible();
  await admin.getByRole("button", { name: "Reveal answer" }).click();
  await expect(kim.getByRole("heading", { name: "Rätt!" })).toBeVisible();
  await expect(kim.getByText(/^\+[\d\s]+ poäng$/)).toBeVisible();
  await expect(olle.getByRole("heading", { name: "Tyvärr fel" })).toBeVisible();
  await expect(olle.getByText("+0 poäng")).toBeVisible();

  await admin.getByRole("button", { name: "Show leaderboard" }).click();
  await expect(kim.getByRole("heading", { name: "Topplistan" })).toBeVisible();
  const first = kim.locator(".lb .row").first();
  await expect(first).toContainText("Kim Testsson");
  await expect(first).toContainText("Du");
  await expect(admin.locator(".questions > ol > li").first()).toContainText("Played");

  await admin.getByRole("button", { name: "Next question" }).click();
  await expect(olle.getByText("Fråga 2 av 2")).toBeVisible();
  await olleLine.cut("clean");
  await expect(reconnecting(olle)).toBeVisible();
  await olle.getByLabel("Din gissning").fill("3");
  await olle.getByRole("button", { name: "Skicka" }).click();
  await expect(olle.getByText("Skickar svaret …")).toBeVisible();
  await olleLine.restore();
  await expect(olle.getByText("Svar skickat!")).toBeVisible({ timeout: 15_000 });
  await expect(olle.getByText("Din gissning: 3")).toBeVisible();
  await expect(admin.getByText("1 of 2 answered")).toBeVisible();

  await Promise.all([adminContext.close(), kimContext.close(), olleContext.close()]);
});
