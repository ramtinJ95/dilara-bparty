import { devices, type Locator, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addQuestion, answer, greeting, versionsOf } from "./drive";
import { LOOKS, placeholder, pngFile } from "./placeholder";
import { joinViaApi, laptop, openAdmin, openShell } from "./support";

// iPhone 15 in Safari with its toolbars showing. The project's scale factor, for the same memory reason as the other WebKit phones.
const { deviceScaleFactor: _, defaultBrowserType: __, ...iPhone15 } = devices["iPhone 15"];

test.describe.configure({ mode: "serial" });

// The iPhone 15 first, then the 15 Plus and Pro Max, the Pixel 7, and the iPhone SE, which is not a target but must not lose a control.
const SIZES = [
  { width: 393, height: 659 },
  { width: 390, height: 664 },
  { width: 430, height: 739 },
  { width: 412, height: 839 },
  { width: 375, height: 667 },
];

// On screen at scroll 0, and above the tab bar when the page has one.
const onScreen = (target: Locator) =>
  target.evaluate((el) => {
    scrollTo(0, 0);
    document.querySelector("main")?.scrollTo(0, 0);
    const box = el.getBoundingClientRect();
    const floor = document.querySelector(".tabs")?.getBoundingClientRect().top ?? innerHeight;
    return { top: Math.round(box.top), bottom: Math.round(box.bottom), floor: Math.round(floor), fits: box.top >= 0 && box.bottom <= floor };
  });

async function expectOnScreen(targets: Locator[], what: string) {
  const page = targets[0]!.page();
  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const target of targets) {
      await expect(target).toBeVisible();
      const box = await onScreen(target);
      const name = await target.evaluate((el) => el.outerHTML.slice(0, 60));
      expect.soft(box.fits, `${what} at ${size.width}x${size.height}: ${name} at ${box.top}..${box.bottom}, floor ${box.floor}`).toBe(true);
    }
    const spill = await page.evaluate(() => {
      const frame = document.querySelector(".photo-frame")?.getBoundingClientRect();
      const photo = document.querySelector(".photo-frame img")?.getBoundingClientRect();
      return frame && photo ? Math.round(photo.bottom - frame.bottom) : 0;
    });
    expect.soft(spill, `${what} at ${size.width}x${size.height}: the photo ends ${spill} px below its frame`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize(SIZES[0]!);
}

const tab = (guest: Page, name: "Quiz" | "Mitt foto" | "Galleri") => guest.getByRole("button", { name, exact: true }).click();
const uploaded = { timeout: 20_000 };
// A phone's own photos are portrait, and a tall photo is the one that pushes on the frame.
const portrait: [number, number] = [900, 1600];

test("on an iPhone 15, my photo's controls and both finales' Back button fit on screen without scrolling, also on the winners' phones", async ({ browser }) => {
  const admin = await openAdmin(await browser.newContext(laptop));
  await expect(admin.getByText("Nobody has joined yet."), "the admin tests leave the party wiped").toBeVisible();
  await addQuestion(admin, { kind: "choice", text: "Vilken färg har snö?", options: ["Vit", "Blå"], correct: 0 });

  const join = async (name: string) => openShell(await joinViaApi(browser, name, iPhone15));
  const [photoWinner, quizWinner, guest] = await Promise.all([join("Testgäst Långnamnsdotter"), join("Testgäst Frågesportsson"), join("Testgäst Ada")]);

  await tab(photoWinner, "Mitt foto");
  // Held in the page until the checks are done, since WebKit's request interception loses the upload's body. By then the phone may have given up
  // on the request and tried again, so every held send goes out and the latest finishes the upload.
  await photoWinner.evaluate(() => {
    const { open, send } = XMLHttpRequest.prototype;
    const held: (() => void)[] = [];
    const urls = new WeakMap<XMLHttpRequest, string>();
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: Parameters<XMLHttpRequest["open"]>) {
      urls.set(this, String(args[1]));
      return open.apply(this, args);
    } as XMLHttpRequest["open"];
    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body) {
      if (!urls.get(this)?.includes("/api/photo")) return send.call(this, body);
      held.push(() => send.call(this, body));
    };
    Object.assign(window, {
      releaseUploads: () => {
        Object.assign(XMLHttpRequest.prototype, { open, send });
        for (const go of held) {
          try {
            go();
          } catch {}
        }
      },
    });
  });
  await photoWinner.locator('input[type="file"]').setInputFiles(pngFile("snow", await placeholder(photoWinner, LOOKS.snow, portrait)));
  await expect(photoWinner.getByText("Skickar bilden…")).toBeVisible(uploaded);
  await expect(photoWinner.getByRole("progressbar", { name: "Uppladdning" })).toBeVisible();
  // The lowest of the upload's lines: the status under the progress bar, or Försök igen once the phone's stall timer gives up on the held request.
  await expectOnScreen([photoWinner.locator(".photo-stage > *").last()], "the upload's status");
  await photoWinner.evaluate(() => (window as unknown as { releaseUploads: () => void }).releaseUploads());
  await expect(photoWinner.getByText("Inga röster än"), "the upload finished").toBeVisible({ timeout: 60_000 });

  await tab(guest, "Galleri");
  await guest.getByRole("button", { name: "Ge en röst" }).first().click();
  await expect(photoWinner.getByText("Din bild har 1 röst")).toBeVisible();
  const button = (name: string) => photoWinner.getByRole("button", { name, exact: true });
  await expectOnScreen([button("Byt bild"), button("Ta bort")], "the photo's buttons");
  await button("Byt bild").click();
  await expectOnScreen([photoWinner.getByRole("alert"), button("Välj ny bild"), button("Avbryt")], "the replace confirmation");
  await button("Avbryt").click();
  await button("Ta bort").click();
  await expectOnScreen([photoWinner.getByRole("alert"), button("Ta bort"), button("Avbryt")], "the remove confirmation");
  await button("Avbryt").click();

  const versions = versionsOf(admin, "Testgäst Långnamnsdotter");
  const hiddenNote = photoWinner.getByText("Kalasvärden har gömt bilden från galleriet. Byt gärna till en annan.");
  const actions = [button("Byt bild"), button("Ta bort")];
  const vote = async () => {
    await guest.getByRole("button", { name: "Ge en röst" }).first().click();
    await expect(photoWinner.getByText("Din bild har 1 röst")).toBeVisible();
  };
  await versions.last().getByRole("button", { name: "Hide" }).click();
  await expectOnScreen([hiddenNote, ...actions], "the hidden photo's note and buttons");
  await versions.last().getByRole("button", { name: "Unhide" }).click();
  await expect(hiddenNote).toBeHidden();
  // Hiding took the vote back, and the replace confirmation only shows for a photo with votes.
  await vote();

  const picker = photoWinner.locator('input[type="file"]');
  await button("Byt bild").click();
  await button("Välj ny bild").click();
  await picker.setInputFiles(pngFile("dusk", await placeholder(photoWinner, LOOKS.dusk, portrait)));
  const fame = photoWinner.getByText("Din tidigare bild är kvar i Hall of fame och kan fortfarande vinna.");
  await expect(fame, "the replaced photo went to the hall of fame").toBeVisible(uploaded);
  await expectOnScreen([photoWinner.getByText("Inga röster än"), ...actions, fame], "the replacement's buttons and the hall-of-fame note");
  await vote();
  await button("Byt bild").click();
  await expectOnScreen([photoWinner.getByRole("alert"), button("Välj ny bild"), button("Avbryt")], "the replace confirmation over the hall-of-fame note");
  await button("Avbryt").click();

  const unreadable = { name: "trasig.png", mimeType: "image/png", buffer: Buffer.from("ingen bild") };
  const refused = photoWinner.getByRole("alert").filter({ hasText: "Den bilden gick inte att läsa. Prova en annan." });
  await picker.setInputFiles(unreadable);
  await expectOnScreen([refused, ...actions, fame], "the refused upload's error, the buttons and the hall-of-fame note");
  await button("Ta bort").click();
  await expectOnScreen([photoWinner.locator(".confirm"), button("Ta bort"), button("Avbryt")], "the remove confirmation under the refused upload's error");
  await button("Avbryt").click();
  await versions.last().getByRole("button", { name: "Hide" }).click();
  await expectOnScreen([refused, hiddenNote, ...actions, fame], "the refused upload's error over the hidden photo, its buttons and the hall-of-fame note");

  await photoWinner.route("**/api/photo", (route) => route.fulfill({ status: 503 }));
  await picker.setInputFiles(pngFile("mint", await placeholder(photoWinner, LOOKS.mint, portrait)));
  const retry = button("Försök igen");
  await expect(photoWinner.getByText("Bilden kom inte fram.", { exact: false }), "every try failed").toBeVisible({ timeout: 60_000 });
  await expectOnScreen([photoWinner.locator(".status-line"), retry, fame], "the stuck upload's status, Försök igen and the hall-of-fame note");
  await photoWinner.unroute("**/api/photo");
  await retry.click();
  await expect(photoWinner.getByText("Inga röster än"), "the retry finished the upload").toBeVisible(uploaded);

  await picker.setInputFiles(unreadable);
  await expect(refused).toBeVisible();
  await admin.getByRole("button", { name: /^Close uploads/ }).click();
  const closed = photoWinner.getByText("Uppladdningen är stängd. Tack för alla fina bilder!");
  await expectOnScreen([refused, closed, fame], "the closed note under the refused upload's error, and the hall-of-fame note");

  const phones = [photoWinner, quizWinner, guest];
  const back = (p: Page) => p.getByRole("button", { name: "Tillbaka till festen" });
  const quiz = admin.locator(".quiz");
  for (const p of phones) await tab(p, "Quiz");
  await quiz.getByRole("button", { name: "Unlock quiz" }).click();
  await quiz.getByRole("button", { name: "Start question 1" }).click();
  await Promise.all([answer(quizWinner, "Vit"), answer(photoWinner, "Blå"), answer(guest, "Blå")]);
  await expect(quiz.locator(".phase")).toHaveText("Answer revealed");
  await quiz.getByRole("button", { name: "End quiz" }).click();
  const quizFinale = admin.locator(".quiz-finale");
  await quizFinale.getByRole("button", { name: "Open suspense page" }).click();
  await quizFinale.getByRole("button", { name: "Yes, open suspense page" }).click();
  await quizFinale.getByRole("button", { name: "Reveal quiz winner" }).click();
  for (const p of phones) await expect(p.locator("#finale-title")).toHaveText("Testgäst Frågesportsson");
  expect(await twoLines(quizWinner.locator("#finale-title")), "the quiz winner's name takes two lines").toBe(true);
  await expectOnScreen([quizWinner.getByText("Grattis, du vann!"), back(quizWinner)], "the quiz winner's own reveal");
  for (const p of [photoWinner, guest]) await expectOnScreen([back(p)], "the quiz reveal");
  for (const p of phones) await back(p).click();
  await tab(quizWinner, "Quiz");
  await expectOnScreen([quizWinner.locator(".quiz-winners .you")], "the quiz winners panel on the winner's phone");

  const photoFinale = admin.locator(".photo-finale");
  await photoFinale.getByRole("button", { name: "Open suspense page" }).click();
  await photoFinale.getByRole("button", { name: "Yes, open suspense page" }).click();
  await photoFinale.getByRole("button", { name: "Reveal photo winner" }).click();
  for (const p of phones) await expect(p.locator("#finale-title")).toHaveText("Testgäst Långnamnsdotter");
  expect(await twoLines(photoWinner.locator("#finale-title")), "the photo winner's name takes two lines").toBe(true);
  for (const p of phones) await expect(p.locator(".recap"), "the quiz winner is recapped").toContainText("Testgäst Frågesportsson");
  await expectOnScreen([photoWinner.locator(".win-photo"), photoWinner.getByText("Grattis, det är din bild!"), photoWinner.locator(".recap"), back(photoWinner)], "the photo winner's own reveal");
  for (const p of [quizWinner, guest]) await expectOnScreen([p.locator(".recap"), back(p)], "the photo reveal");
  for (const p of phones) await back(p).click();
  await expect(greeting(guest, "Testgäst Ada")).toBeVisible();

  await Promise.all(browser.contexts().map((c) => c.close()));
});

const twoLines = (title: Locator) => title.evaluate((el) => el.getBoundingClientRect().height >= 1.8 * parseFloat(getComputedStyle(el).lineHeight));
