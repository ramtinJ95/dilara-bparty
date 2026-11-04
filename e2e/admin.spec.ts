import { type Browser, type BrowserContext, type FileChooser, type Locator, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import jsQR from "jsqr";
import { readFileSync } from "node:fs";
import { crc32 } from "node:zlib";
import { addQuestion, adminRow, answer, greeting, heartbeatState, joinByCode, joinByLink, renameFromAdmin, unlockPopup, versionsOf } from "./drive";
import { LOOKS, placeholder, pngFile } from "./placeholder";
import { secrets } from "./server";
import { joinViaApi, laptop, openAdmin, openShell, phone } from "./support";

type LookName = keyof typeof LOOKS;

test.describe.configure({ mode: "serial" });

let admin: Page;
let astrid: Page;
let olle: Page;
let kim: Page;
let kimAgain: Page;

const tab = (guest: Page, name: "Quiz" | "Mitt foto" | "Galleri") => guest.getByRole("button", { name, exact: true }).click();
const card = (selector: string) => admin.locator(selector);
// Phones and the admin shrink photos on the CPU before sending them, which takes seconds on a busy machine.
const uploaded = { timeout: 20_000 };

test.beforeAll(async ({ browser }) => {
  admin = await openAdmin(await browser.newContext(laptop));
  const end = card(".party-end");
  // The card draws with the first snapshot, after "Live", so wait for it before asking which state the party is in.
  await expect(end.getByRole("button", { name: /^(End the party|Wipe all data…)$/ })).toBeVisible();
  if (await end.getByRole("button", { name: "End the party" }).isVisible()) {
    await end.getByRole("button", { name: "End the party" }).click();
    await end.getByRole("button", { name: "Yes, end the party" }).click();
  }
  await end.getByRole("button", { name: "Wipe all data…" }).click();
  await end.getByRole("button", { name: "Yes, wipe everything" }).click();
  // A failed wipe shows its reason in an alert, so the test reports that rather than a missing empty list.
  const wiped = admin.getByText("Nobody has joined yet.");
  await expect(wiped.or(end.getByRole("alert")).first(), "the other projects' party is wiped first").toBeVisible({ timeout: 15_000 });
  expect(await end.getByRole("alert").allTextContents(), "the wipe succeeds").toEqual([]);
  await expect(wiped).toBeVisible();
  await expect(end.getByText("New guests can join.")).toBeVisible();
  const join = async (name: string) => openShell(await joinViaApi(browser, name));
  [astrid, olle, kim] = await Promise.all([join("Astrid"), join("Olle"), join("Kim Testsson")]);
});

test.afterAll(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

// The placeholder looks differ in their sky colour, which survives the phones' JPEG re-encode, so a corner pixel names the photo.
async function lookAt(page: Page, src: string): Promise<string> {
  // Its own decode of the bytes, because in WebKit an <img> for a photo already on the page sometimes drew nothing, and read as black.
  const rgb = await page.evaluate(async (src) => {
    const res = await fetch(src).catch(() => null);
    const img = res?.ok ? await createImageBitmap(await res.blob()).catch(() => null) : null;
    if (!img) return null;
    const ctx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d")!;
    ctx.drawImage(img, 4, 4, 1, 1, 0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }, src);
  if (!rgb) return `an image that doesn't load (${src.slice(0, 40)})`;
  const distance = (hex: string) => Math.max(...[1, 3, 5].map((at, i) => Math.abs(parseInt(hex.slice(at, at + 2), 16) - rgb[i]!)));
  const [name, d] = Object.entries(LOOKS).map(([name, look]) => [name, distance(look.sky[0])] as const).sort((a, b) => a[1] - b[1])[0]!;
  return d < 32 ? name : `no placeholder (corner rgb ${rgb.join(", ")})`;
}

async function lookOf(img: Locator): Promise<string> {
  await expect(img).toBeVisible();
  return lookAt(img.page(), await img.evaluate((el: HTMLImageElement) => el.currentSrc || el.src));
}

// expect.poll gives up at the first throw, so a polled read reports a missing image instead of failing on it.
const polledLook = async (img: Locator): Promise<string> => ((await img.isVisible()) ? lookOf(img) : "no image shown yet");

async function readQr(qr: Locator): Promise<string | undefined> {
  const png = (await qr.screenshot()).toString("base64");
  const { width, height, rgba } = await qr.page().evaluate(async (png) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const canvas = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height });
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const pixels = new Blob([ctx.getImageData(0, 0, img.width, img.height).data]);
    const rgba = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]!);
      reader.readAsDataURL(pixels);
    });
    return { width: img.width, height: img.height, rgba };
  }, png);
  return jsQR(new Uint8ClampedArray(Buffer.from(rgba, "base64")), width, height)?.data;
}

type ZipFile = { name: string; stored: boolean; crcMatches: boolean; data: Buffer };

// Read from the central directory with Node's own CRC, independently of the app's zip writer.
function unzip(zip: Buffer): ZipFile[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end, "the zip has an end-of-central-directory record").toBeGreaterThan(0);
  const files: ZipFile[] = [];
  let at = zip.readUInt32LE(end + 16);
  for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
    expect(zip.readUInt32LE(at), `central record ${i} has its signature`).toBe(0x02014b50);
    const [nameLength, extraLength, commentLength] = [28, 30, 32].map((o) => zip.readUInt16LE(at + o)) as [number, number, number];
    const local = zip.readUInt32LE(at + 42);
    expect(zip.readUInt32LE(local), `local header ${i} has its signature`).toBe(0x04034b50);
    const dataAt = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(dataAt, dataAt + zip.readUInt32LE(at + 20));
    files.push({
      name: zip.toString("utf8", at + 46, at + 46 + nameLength),
      stored: zip.readUInt16LE(at + 10) === 0,
      crcMatches: crc32(data) === zip.readUInt32LE(at + 16),
      data,
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

// Through the visible button and the browser's file chooser, as a person picks a file, so a broken button fails the test.
async function choose(page: Page, button: Locator, file: Parameters<FileChooser["setFiles"]>[0]) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), button.click()]);
  await chooser.setFiles(file);
}

async function uploadContestPhoto(guest: Page, look: LookName) {
  await tab(guest, "Mitt foto");
  const file = pngFile(look, await placeholder(guest, LOOKS[look]));
  const chooser = guest.waitForEvent("filechooser");
  const pick = guest.getByRole("button", { name: "Välj bild", exact: true });
  await ((await pick.isVisible()) ? pick : guest.getByRole("button", { name: "Byt bild", exact: true })).click();
  const confirm = guest.getByRole("button", { name: "Välj ny bild", exact: true });
  await Promise.race([chooser, confirm.waitFor().then(() => confirm.click(), () => {})]);
  await (await chooser).setFiles(file);
  await expect.poll(() => polledLook(guest.getByAltText("Din bild")), { ...uploaded, message: "the phone shows its new photo" }).toBe(look);
  await expect(guest.getByText("Inga röster än"), "the upload finished").toBeVisible(uploaded);
}

// The earlier reveal must still be on the phones when the later one is left, or the check after Back proves nothing. A run too slow for
// that is noted, not failed, so a slow machine never turns this into a race against the reveal's minute.
async function overlap(earlier: Locator) {
  const stage = await earlier.locator(".phase").textContent();
  if (stage !== "Winner on phones") test.info().annotations.push({ type: "no overlap", description: `the earlier reveal had ended (${stage})` });
}

async function newPhone(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(phone);
  return { context, page: await context.newPage() };
}

test("the QR code and the short join code each bring a phone into the party", async ({ browser }) => {
  const join = card(".join-card");
  const joinUrl = new URL(`/j/${secrets.join}`, admin.url()).href;
  const qr = join.getByRole("img", { name: "QR code for the join link" });
  const scannedUrl = await readQr(qr);
  expect(scannedUrl, "the QR on screen decodes to the join link").toBe(joinUrl);
  await expect(join.locator(".url")).toHaveText(joinUrl);
  const code = (await join.locator(".code").textContent())!;

  const scanned = await newPhone(browser);
  await scanned.page.goto(scannedUrl!);
  await expect(scanned.page.getByRole("heading", { name: "Dilara fyller 3!" }), "the scanned link opens the join page").toBeVisible();
  await scanned.page.getByLabel("Vad heter du?").fill("Saga");
  await scanned.page.getByRole("button", { name: "Gå med" }).click();
  await expect(greeting(scanned.page, "Saga")).toBeVisible();

  const typed = await newPhone(browser);
  await joinByCode(typed.page, code, "Ture");
  await expect(greeting(typed.page, "Ture"), "the typed code leads to the same party").toBeVisible();

  for (const name of ["Saga", "Ture"]) await expect(adminRow(admin, name).locator(".dot.on"), `${name} shows up online`).toBeVisible();
  await expect(admin.getByRole("region", { name: /^Players 5 · / })).toBeVisible();
  await Promise.all([scanned.context.close(), typed.context.close()]);
});

test("the landing photo the host uploads, replaces and removes is what the join page shows", async ({ browser }) => {
  const landing = card(".landing-photo");
  const upload = async (look: LookName) =>
    choose(admin, landing.getByRole("button", { name: /^(Upload|Replace) photo$/ }), pngFile(look, await placeholder(admin, LOOKS[look])));
  const { context, page: visitor } = await newPhone(browser);
  const joinPhoto = visitor.getByAltText("Dilara");

  await upload("rose");
  await expect.poll(() => polledLook(landing.getByAltText("Current landing photo")), uploaded).toBe("rose");
  await visitor.goto(`/j/${secrets.join}`);
  expect(await lookOf(joinPhoto), "the join page shows the uploaded photo").toBe("rose");

  await upload("snow");
  await expect.poll(() => polledLook(landing.getByAltText("Current landing photo")), uploaded).toBe("snow");
  await visitor.reload();
  expect(await lookOf(joinPhoto), "the join page shows the replacement").toBe("snow");

  await landing.getByRole("button", { name: "Remove" }).click();
  await expect(landing.getByText("No photo yet")).toBeVisible();
  await visitor.reload();
  await expect(visitor.getByRole("heading", { name: "Dilara fyller 3!" })).toBeVisible();
  await expect(joinPhoto, "the join page falls back to the snowflake").toHaveCount(0);

  await upload("snow");
  await expect(landing.getByAltText("Current landing photo")).toBeVisible(uploaded);
  await context.close();
});

test("the host adds both kinds of question, edits, reorders and deletes them, and attaches a photo", async () => {
  const texts = card(".questions .q-text");
  const row = (n: number) => card(".questions > ol > li").nth(n - 1);
  await expect(card(".questions").getByText("No questions yet. Add the first one below.")).toBeVisible();

  // The quiz test checks every phone while a question is open, which took over 20 s in WebKit on a slow Mac, so the default
  // 20 s limit closed the question before the early reveal the test presses. Only the host or the last answer closes these.
  await addQuestion(admin, { kind: "number", text: "Hur många ballonger hänger i taket?", answer: "10", seconds: 120 });
  await addQuestion(admin, { kind: "choice", text: "Vad blir vatten när det fryser?", options: ["Is", "Sand", "Sylt"], correct: 0 });
  await addQuestion(admin, { kind: "choice", text: "Vilken färg har snö?", options: ["Vit", "Blå"], correct: 0, seconds: 120 });
  await expect(texts).toHaveText(["Hur många ballonger hänger i taket?", "Vad blir vatten när det fryser?", "Vilken färg har snö?"]);
  await expect(row(1).locator(".badge.kind")).toHaveText("Closest number");
  await expect(row(1)).toContainText("Answer: 10");
  await expect(row(2).locator(".badge.kind")).toHaveText("Multiple choice");
  await expect(row(2).locator(".q-options li")).toHaveText(["A. Is ✓", "B. Sand", "C. Sylt"]);

  await row(3).getByRole("button", { name: "Edit" }).click();
  const editor = card(".questions form.editor");
  await editor.getByLabel("Question", { exact: true }).fill("Vilken färg har snöflingan på bilden?");
  await editor.getByLabel("Option A", { exact: true }).fill("Rosa");
  await editor.getByRole("button", { name: "+ Add option" }).click();
  await editor.getByLabel("Option C", { exact: true }).fill("Grön");
  await editor.getByLabel("Option B is correct").check();
  await choose(admin, editor.getByRole("button", { name: "Add photo", exact: true }), pngFile("question", await placeholder(admin, LOOKS.sea)));
  await expect(editor.getByAltText("Question photo")).toBeVisible(uploaded);
  await editor.getByRole("button", { name: "Save question" }).click();
  await expect(row(3).locator(".q-text")).toHaveText("Vilken färg har snöflingan på bilden?");
  await expect(row(3).locator(".q-options li")).toHaveText(["A. Rosa", "B. Blå ✓", "C. Grön"]);
  expect(await lookOf(row(3).locator("img.thumb")), "the edited question carries its photo").toBe("sea");

  await row(1).getByRole("button", { name: "Edit" }).click();
  await editor.getByLabel("Correct answer").fill("12");
  await editor.getByRole("button", { name: "Save question" }).click();
  await expect(row(1)).toContainText("Answer: 12");

  await admin.getByRole("button", { name: "Move question 1 down" }).click();
  await expect(texts).toHaveText(["Vad blir vatten när det fryser?", "Hur många ballonger hänger i taket?", "Vilken färg har snöflingan på bilden?"]);
  await admin.getByRole("button", { name: "Move question 3 up" }).click();
  await expect(texts).toHaveText(["Vad blir vatten när det fryser?", "Vilken färg har snöflingan på bilden?", "Hur många ballonger hänger i taket?"]);

  await row(1).getByRole("button", { name: "Delete" }).click();
  await expect(row(1).getByText("Delete question 1? This can't be undone.")).toBeVisible();
  await row(1).getByRole("button", { name: "Delete question" }).click();
  await expect(texts).toHaveText(["Vilken färg har snöflingan på bilden?", "Hur många ballonger hänger i taket?"]);
  await expect(card(".quiz").getByText("Up next: question 1, “Vilken färg har snöflingan på bilden?”")).toBeVisible();
});

test("unlock, reset, start, an early reveal and leaderboard, the automatic ones, next and end each reach every phone", async () => {
  const quiz = card(".quiz");
  const phase = quiz.locator(".phase");
  const heartbeat = admin.locator("header .toggle .state");
  const phones = [astrid, olle, kim];
  const press = (label: string) => quiz.getByRole("button", { name: label, exact: true }).click();
  await tab(kim, "Galleri");
  await expect(admin.getByRole("region", { name: /^Players 5 · 3 online$/ }), "only the three quiz phones are online").toBeVisible({ timeout: 15_000 });

  await press("Unlock quiz");
  await expect(unlockPopup(kim), "a phone on another tab gets the popup").toBeVisible();
  for (const p of [astrid, olle]) await expect(p.getByRole("heading", { name: "Quizet börjar snart!" })).toBeVisible();
  await expect(heartbeat).toHaveText("Fast heartbeat on");
  await unlockPopup(kim).getByRole("button", { name: "Till quizet" }).click();
  await expect(kim.getByRole("heading", { name: "Quizet börjar snart!" })).toBeVisible();

  await press("Reset quiz");
  await expect(quiz.getByText("Reset the quiz? Every answer and score is wiped. The questions stay.")).toBeVisible();
  await press("Yes, reset quiz");
  await expect(phase).toHaveText("Locked");
  for (const p of phones) await expect(p.getByRole("heading", { name: "Quizet är inte öppet än" }), "reset locks the quiz again on phones").toBeVisible();
  await expect(heartbeat).toHaveText("Fast heartbeat off");
  await tab(kim, "Galleri");
  await press("Unlock quiz");
  await expect(unlockPopup(kim), "unlocking again pops up again").toBeVisible();
  await unlockPopup(kim).getByRole("button", { name: "Till quizet" }).click();

  await press("Start question 1");
  await expect(phase).toHaveText("Question open");
  for (const p of phones) {
    await expect(p.getByText("Fråga 1 av 2")).toBeVisible();
    await expect(p.getByText("Vilken färg har snöflingan på bilden?"), "phones show the edited text").toBeVisible();
    expect(await lookOf(p.locator(".q-photo")), "phones show the photo the host attached").toBe("sea");
  }
  await Promise.all([answer(astrid, "Rosa"), answer(olle, "Blå", 1_500)]);
  await expect(quiz.getByText("2 of 3 answered")).toBeVisible();
  await press("Reveal answer");
  await expect(quiz.getByText("Close answers now? 1 guest hasn't answered.")).toBeVisible();
  await press("Yes, reveal answer");
  await expect(phase, "the host cuts the question short").toHaveText("Answer revealed");
  await expect(quiz.getByText("The leaderboard follows on its own in a few seconds.")).toBeVisible();
  // Pressed before any phone check, so it lands well inside the reveal's few seconds even on a slow WebKit run.
  await press("Show leaderboard");
  await expect(phase, "the host skips the wait for the leaderboard").toHaveText("Leaderboard on phones", { timeout: 3_000 });
  await expect(quiz.locator(".result.bars li.correct"), "the edited correct option counts").toContainText("Blå");
  for (const p of phones) await expect(p.getByRole("heading", { name: "Topplistan" })).toBeVisible();
  await expect(olle.locator(".lb .row").first()).toContainText("Olle");
  await expect(olle.locator(".lb .row").first()).toContainText("Du");
  await expect(kim.locator(".lb .row.you .score"), "the guest the early reveal cut off scores nothing").toHaveText("0");

  await press("Next question");
  for (const p of phones) await expect(p.getByText("Fråga 2 av 2")).toBeVisible();
  await Promise.all([answer(astrid, "12"), answer(kim, "12"), answer(olle, "9")]);
  await expect(phase, "everyone answered, so the answer is revealed at once").toHaveText("Answer revealed");
  await expect(quiz.getByText("3 of 3 answered")).toBeVisible();
  for (const p of [astrid, kim]) await expect(p.getByRole("heading", { name: "Närmast!" }), "the edited answer counts: 9 would be closer to the old 10").toBeVisible();
  await expect(olle.getByRole("heading", { name: "Inte närmast den här gången" })).toBeVisible();
  await expect(phase, "the leaderboard follows on its own").toHaveText("Leaderboard on phones", { timeout: 15_000 });
  for (const p of phones) await expect(p.getByRole("heading", { name: "Topplistan" })).toBeVisible();

  await press("End quiz");
  for (const p of phones) await expect(p.getByRole("heading", { name: "Quizet är slut!" })).toBeVisible();
  await expect(quiz.locator(".winners"), "two exact guesses beat one slow right answer").toHaveText("Joint winners: Astrid & Kim Testsson");
  await expect(heartbeat).toHaveText("Fast heartbeat off");
});

test("the quiz finale shows its suspense page and the joint winners on every phone, a phone that joins lands on it, and each goes back to the party", async ({ browser }) => {
  const finale = card(".quiz-finale");
  const phones = [astrid, olle, kim];
  await expect(card(".photo-finale").getByRole("button", { name: "Open suspense page" }), "the photo finale could open too").toBeEnabled();

  await finale.getByRole("button", { name: "Open suspense page" }).click();
  await expect(finale.getByText("Open the quiz finale? Every phone moves to the quiz suspense page. The quiz can't change after this.")).toBeVisible();
  await finale.getByRole("button", { name: "Yes, open suspense page" }).click();
  for (const p of phones) await expect(p.getByRole("heading", { name: "Vem vann quizet?" })).toBeVisible();
  await olle.context().clearCookies();
  await olle.goto("/");
  await expect(olle.getByRole("heading", { name: "Vem vann quizet?" }), "a phone that lost its cookie restores it and lands on the suspense page").toBeVisible();
  await expect(kim.getByRole("button", { name: "Galleri" }), "the tabs are gone from phones").toHaveCount(0);
  await expect(finale.locator(".phase")).toHaveText("Suspense page on phones");
  await expect(heartbeatState(admin)).toHaveText("Fast heartbeat on");
  await expect(card(".quiz").getByRole("button", { name: "Reset quiz" }), "the quiz can't change any more").toBeDisabled();
  for (const open of ["Uploads open", "Voting open"]) await expect(card(".contest").getByText(open), "the photo contest goes on").toBeVisible();
  await expect(card(".photo-finale").getByText("The quiz finale is on the phones. Reveal it first.")).toBeVisible();

  await finale.getByRole("button", { name: "Reveal quiz winners" }).click();
  // Every phone at once, not one after another, so a slow browser checks them all inside the reveal's minute.
  await Promise.all([
    ...phones.map(async (p) => {
      await expect(p.getByText("Quizvinnarna")).toBeVisible();
      await expect(p.getByRole("heading", { name: "Astrid & Kim Testsson" })).toBeVisible();
      await expect(p.getByText(/^delar segern med 1\s000 poäng$/)).toBeVisible();
      await expect(p.getByText("Grattis, du delar segern!"), "each winner's phone, and no other").toHaveCount(p === olle ? 0 : 1);
      await expect(p.getByRole("button", { name: "Tillbaka till festen" }), "the way back fits on the screen").toBeInViewport();
    }),
    (async () => {
      kimAgain = (await newPhone(browser)).page;
      await joinByLink(kimAgain, secrets.join, "Kim T");
      await expect(kimAgain.getByRole("heading", { name: "Astrid & Kim Testsson" }), "a phone that joins during the reveal lands on it").toBeVisible();
    })(),
  ]);
  await expect(finale.locator(".revealed dd"), "the admin view names both winners").toHaveText("Astrid & Kim Testsson");
  await expect(finale.getByText("Phones go back to the party on their own in a minute.")).toBeVisible();

  for (const p of phones) await p.getByRole("button", { name: "Tillbaka till festen" }).click();
  await expect(kimAgain.getByRole("button", { name: "Tillbaka till festen" }), "a phone nobody touched stays on the reveal").toBeVisible();
  for (const p of phones) {
    await tab(p, "Quiz");
    await expect(p.locator(".quiz-winners").getByRole("heading", { name: "Astrid & Kim Testsson" }), "the Quiz tab shows the winners").toBeVisible();
  }
  await expect(kim.locator(".quiz-winners")).toContainText("Grattis, du delar segern!");
  await expect(olle.locator(".quiz-winners")).not.toContainText("Grattis");
});

test("the host closes and reopens uploads and voting, hides a photo, browses every version and downloads them all", async () => {
  const contest = card(".contest");
  const tally = contest.locator(".tally li");
  await uploadContestPhoto(astrid, "snow");
  await uploadContestPhoto(astrid, "sun");
  await uploadContestPhoto(olle, "rose");

  await expect(versionsOf(admin, "Astrid").locator(".badge")).toHaveText(["replaced", "current"]);
  await expect(versionsOf(admin, "Olle").locator(".badge")).toHaveText(["current"]);
  const viewer = contest.getByRole("dialog", { name: "Full-size photo" });
  for (const [i, look] of [[0, "snow"], [1, "sun"]] as const) {
    await versionsOf(admin, "Astrid").nth(i).getByRole("button", { name: /^Open Astrid's photo/ }).click();
    expect(await lookOf(viewer.locator("img")), `Astrid's version ${i + 1} opens full size`).toBe(look);
    await viewer.click();
  }

  await tab(kim, "Galleri");
  const tiles = kim.locator(".gallery .tile");
  await expect(tiles, "the replaced photo without votes stays out of the gallery").toHaveCount(2);
  for (const t of await tiles.all()) await t.getByRole("button", { name: "Ge en röst" }).click();
  await expect(kim.getByText("1 av 3 röster kvar")).toBeVisible();
  await expect(tally).toHaveCount(2);
  for (const name of ["Astrid", "Olle"]) await expect(tally.filter({ hasText: name })).toContainText("1 vote");

  await versionsOf(admin, "Olle").first().getByRole("button", { name: "Hide" }).click();
  await expect(versionsOf(admin, "Olle").first().locator(".badge.hidden")).toBeVisible();
  await expect(kim.getByText("2 av 3 röster kvar"), "the vote on the hidden photo goes back to the voter").toBeVisible();
  await expect(tiles).toHaveCount(1);
  await expect(olle.getByText("Kalasvärden har gömt bilden från galleriet.", { exact: false })).toBeVisible();
  await expect(tally).toHaveCount(1);

  await versionsOf(admin, "Olle").first().getByRole("button", { name: "Unhide" }).click();
  await expect(tiles, "unhiding puts it back in the gallery").toHaveCount(2);
  await expect(kim.getByText("2 av 3 röster kvar"), "unhiding gives no votes back to the photo").toBeVisible();
  await tiles.filter({ has: kim.getByLabel("Dina röster: 0") }).getByRole("button", { name: "Ge en röst" }).click();
  await expect(kim.getByText("1 av 3 röster kvar")).toBeVisible();
  await expect(tally.locator(".badge.tie")).toHaveCount(2);

  await contest.getByRole("button", { name: "Close uploads" }).click();
  await expect(contest.getByText("Uploads closed")).toBeVisible();
  await expect(astrid.getByText("Uppladdningen är stängd. Tack för alla fina bilder!")).toBeVisible();
  await expect(astrid.getByRole("button", { name: "Byt bild" })).toHaveCount(0);
  await contest.getByRole("button", { name: "Open uploads" }).click();
  await expect(astrid.getByRole("button", { name: "Byt bild" }), "reopened uploads let the guest replace again").toBeVisible();

  await contest.getByRole("button", { name: "Close voting" }).click();
  await expect(contest.getByText("Voting closed")).toBeVisible();
  await expect(kim.getByText("Röstningen är stängd.")).toBeVisible();
  for (const t of await tiles.all()) await expect(t.getByRole("button", { name: "Ge en röst" })).toBeDisabled();
  await contest.getByRole("button", { name: "Open voting" }).click();
  await expect(kim.getByText("1 av 3 röster kvar"), "reopened voting shows the votes left").toBeVisible();
  await expect(tiles.first().getByRole("button", { name: "Ge en röst" })).toBeEnabled();

  const download = admin.waitForEvent("download");
  await contest.getByRole("button", { name: "Download all (zip, 3)" }).click();
  const zip = unzip(readFileSync(await (await download).path()));
  expect(zip.map((f) => f.name).toSorted(), "one file per stored version, named after the guest").toEqual(["Astrid - 1 (replaced).jpg", "Astrid - 2.jpg", "Olle - 1.jpg"]);
  for (const f of zip) {
    expect(f.stored && f.crcMatches, `${f.name} is stored whole with a matching CRC`).toBe(true);
    expect(f.data.subarray(0, 3).toString("hex"), `${f.name} is a JPEG`).toBe("ffd8ff");
  }
  const looks = await Promise.all(zip.map(async (f) => [f.name, await lookAt(admin, `data:image/jpeg;base64,${f.data.toString("base64")}`)]));
  expect(Object.fromEntries(looks)).toEqual({ "Astrid - 1 (replaced).jpg": "snow", "Astrid - 2.jpg": "sun", "Olle - 1.jpg": "rose" });
});

test("a phone left on the quiz reveal goes back to the party on its own", async () => {
  // The server ends the reveal a minute after it, so this waits out whatever of that minute the contest test left.
  await expect(greeting(kimAgain, "Kim T")).toBeVisible({ timeout: 70_000 });
  await expect(kimAgain.locator(".quiz-winners").getByRole("heading", { name: "Astrid & Kim Testsson" }), "the Quiz tab keeps the winners").toBeVisible();
  await expect(card(".quiz-finale .phase")).toHaveText("Revealed");
  await expect(heartbeatState(admin), "the fast heartbeat ends with the reveal").toHaveText("Fast heartbeat off");
});

test("the host renames a guest and merges a duplicate, and the phones follow", async () => {
  await renameFromAdmin(admin, "Olle", "Olle Testsson");
  await expect(greeting(olle, "Olle Testsson"), "the renamed guest's phone shows the new name").toBeVisible();

  await uploadContestPhoto(kimAgain, "mint");
  await expect(admin.getByRole("region", { name: /^Players 6 · 4 online$/ })).toBeVisible();

  await adminRow(admin, "Kim T").getByRole("button", { name: "Merge…" }).click();
  await adminRow(admin, "Kim T").getByRole("combobox").selectOption({ label: "Kim Testsson" });
  await expect(admin.getByText("“Kim T” disappears and everything of theirs moves to “Kim Testsson”. This can't be undone.")).toBeVisible();
  await admin.getByRole("button", { name: "Confirm merge" }).click();
  await expect(adminRow(admin, "Kim T")).toHaveCount(0);
  await expect(adminRow(admin, "Kim Testsson"), "one row is left").toHaveCount(1);
  await expect(admin.getByRole("region", { name: /^Players 5 · 3 online$/ })).toBeVisible();
  await expect(greeting(kimAgain, "Kim Testsson"), "the duplicate's phone becomes the kept player").toBeVisible();
  await tab(kim, "Mitt foto");
  expect(await lookOf(kim.getByAltText("Din bild")), "the duplicate's photo moved to the kept player").toBe("mint");
  await expect(versionsOf(admin, "Kim Testsson").locator(".badge")).toHaveText(["current"]);
  await tab(kimAgain, "Galleri");
  await expect(kimAgain.getByText("1 av 3 röster kvar"), "it holds the kept player's votes").toBeVisible();
  await expect(kimAgain.getByLabel("Dina röster: 1")).toHaveCount(2);
  await tab(kimAgain, "Quiz");
  await expect(kimAgain.locator(".quiz-winners"), "and the kept player's place among the quiz winners").toContainText("Grattis, du delar segern!");
});

test("the photo finale closes uploads and voting, reveals the picked tied photo under the quiz winners, and the gallery then shows it", async () => {
  const finale = card(".photo-finale");
  const phones = [astrid, olle, kim, kimAgain];
  await finale.getByRole("button", { name: "Open suspense page" }).click();
  await expect(finale.getByText("Open the photo finale? Uploads and voting close and every phone moves to the photo suspense page.")).toBeVisible();
  await finale.getByRole("button", { name: "Yes, open suspense page" }).click();
  for (const p of phones) await expect(p.getByRole("heading", { name: "Vem tog bästa fotot?" })).toBeVisible();
  await expect(kim.getByText("Röstningen är stängd. Snart får vi veta!")).toBeVisible();
  for (const closed of ["Uploads closed", "Voting closed"]) await expect(card(".contest").getByText(closed), "the photo finale closes the contest").toBeVisible();

  await expect(finale.getByText("Tie for first, 1 vote each. Pick the winner.")).toBeVisible();
  const tied = finale.locator(".tie-photos li");
  await expect(tied).toHaveCount(2);
  expect(await lookOf(tied.filter({ hasText: "Olle Testsson" }).getByRole("img")), "the tie shows each photo").toBe("rose");
  await expect(finale.getByText("Photos are tied for first. Pick the winner before you reveal it.")).toBeVisible();
  await expect(finale.getByRole("button", { name: "Reveal photo winner" })).toBeDisabled();
  await tied.filter({ hasText: "Olle Testsson" }).getByRole("button", { name: "Pick as winner" }).click();
  await expect(tied.filter({ hasText: "Olle Testsson" }).getByRole("button", { name: "Winner ✓" })).toBeVisible();

  await finale.getByRole("button", { name: "Reveal photo winner" }).click();
  // Every phone at once, not one after another, so a slow browser checks them all inside the reveal's minute.
  await Promise.all(
    phones.map(async (p) => {
      await expect(p.getByRole("heading", { name: "Olle Testsson" }), "the picked photo wins under the new name").toBeVisible();
      await expect(p.getByText("tog vinnarbilden · 1 röst")).toBeVisible();
      await expect(p.locator(".recap"), "the quiz winners stay as a recap").toHaveText("QuizvinnarnaAstrid & Kim Testsson");
      expect(await lookOf(p.getByAltText("Vinnarbilden av Olle Testsson"))).toBe("rose");
      await expect(p.getByText("Grattis, det är din bild!"), "only the winner's phone congratulates").toHaveCount(p === olle ? 1 : 0);
      await expect(p.getByRole("button", { name: "Tillbaka till festen" }), "the way back fits on the screen").toBeInViewport();
      if (p !== olle) return;
      await olle.context().clearCookies();
      await olle.reload();
      await expect(olle.getByText("Grattis, det är din bild!"), "a phone that restored its cookie lands on the reveal as the winner").toBeVisible();
    }),
  );
  await expect(finale.locator(".revealed dd"), "the admin view names the photographer").toContainText("Olle Testsson");
  await expect(finale.locator(".tie"), "the tie is settled").toHaveCount(0);

  await astrid.getByRole("button", { name: "Tillbaka till festen" }).click();
  await tab(astrid, "Galleri");
  await expect(astrid.locator(".photo-winner"), "the gallery opens with the winner").toContainText(/Bästa fotot\s*Olle Testsson\s*1 röst/);
  expect(await lookOf(astrid.locator(".photo-winner img"))).toBe("rose");
  await tab(astrid, "Quiz");
  await expect(astrid.locator(".quiz-winners"), "the Quiz tab keeps the quiz winners").toContainText("Grattis, du delar segern!");
});

test("resetting the party sends every phone away and keeps the questions and the landing photo for a fresh start", async () => {
  const end = card(".party-end");
  await end.getByRole("button", { name: "Reset party…" }).click();
  await expect(end.getByText("Reset the party? Every guest leaves", { exact: false })).toBeVisible();
  await expect(end.getByText("The questions, their photos and the landing photo stay.", { exact: false })).toBeVisible();
  const confirm = end.getByRole("button", { name: "Yes, reset the party" });
  const word = end.getByLabel("Type RESET to confirm");
  await expect(confirm).toBeDisabled();
  await word.fill("reset");
  await expect(confirm, "only the exact word unlocks the reset").toBeDisabled();
  await word.fill("RESET");
  const saved = await astrid.evaluate(() => localStorage.getItem("pid"));
  expect(saved, "a joined phone keeps a copy of its signed identity").toMatch(/^[\w-]+\.[\w-]+$/);
  await confirm.click();

  for (const p of [astrid, olle, kim, kimAgain]) await expect(p, "every phone leaves for the bare page").toHaveURL(/\/$/);
  for (const p of [astrid, olle, kim, kimAgain]) {
    await p.reload();
    await expect(p.getByLabel("Kod"), "and stays there, not signed back in to a deleted player").toBeVisible();
    await expect(p).toHaveURL(/\/$/);
  }
  expect(await astrid.evaluate(() => localStorage.getItem("pid")), "the reset clears the copy").toBeNull();
  await astrid.evaluate((pid) => localStorage.setItem("pid", pid!), saved);
  await astrid.reload();
  await expect(astrid.getByLabel("Kod"), "a phone that slept through the reset is refused and stays on the bare page").toBeVisible();
  expect(await astrid.evaluate(() => localStorage.getItem("pid")), "and forgets the refused copy").toBeNull();
  await expect(admin.getByText("Nobody has joined yet.")).toBeVisible();
  await expect(card(".contest").getByText("Nobody has uploaded yet.")).toBeVisible();
  await expect(card(".quiz .phase")).toHaveText("Locked");
  await expect(card(".finale .phase"), "both finales are off").toHaveText(["Not started", "Not started"]);
  await expect(end.getByText("New guests can join.")).toBeVisible();
  await expect(admin.locator(".questions > ol > li"), "the questions stay").toHaveCount(2);
  await expect(admin.locator(".questions > ol > li").filter({ hasText: "Played" }), "and none has been played").toHaveCount(0);
  await expect(card(".landing-photo").getByAltText("Current landing photo")).toBeVisible();

  await astrid.goto(`/j/${secrets.join}`);
  expect(await lookOf(astrid.getByAltText("Dilara")), "the join page keeps its photo").toBe("snow");
  await joinByLink(astrid, secrets.join, "Astrid");
  await expect(greeting(astrid, "Astrid"), "the join link works again, with no Är det du?").toBeVisible();
  await expect(admin.getByRole("region", { name: /^Players 1 · 1 online$/ })).toBeVisible();
  await uploadContestPhoto(astrid, "rose");
  await expect(card(".contest").getByText("Nobody has uploaded yet."), "uploads are open again").toHaveCount(0);
});

test("ending the party refuses new guests but lets a known guest back in by name, and the wipe empties everything", async ({ browser }) => {
  const end = card(".party-end");
  await end.getByRole("button", { name: "End the party" }).click();
  await expect(end.getByText("End the party? New guests can't join.", { exact: false })).toBeVisible();
  await end.getByRole("button", { name: "Yes, end the party" }).click();
  await expect(end.getByText("The party has ended. New guests can't join.")).toBeVisible();

  const stranger = await newPhone(browser);
  await joinByLink(stranger.page, secrets.join, "Vera Testsson");
  await expect(stranger.page.getByRole("alert"), "a new guest is turned away").toHaveText("Kalaset är slut. Tack för att du var med!");

  await end.getByRole("button", { name: "Reopen joins" }).click();
  await expect(end.getByText("New guests can join.")).toBeVisible();
  await stranger.page.getByRole("button", { name: "Gå med" }).click();
  await expect(stranger.page, "reopened joins let the new guest in").toHaveURL(/\/app$/);
  await expect(greeting(stranger.page, "Vera Testsson")).toBeVisible();
  await stranger.context.close();
  await end.getByRole("button", { name: "End the party" }).click();
  await end.getByRole("button", { name: "Yes, end the party" }).click();
  await expect(end.getByText("The party has ended. New guests can't join.")).toBeVisible();

  const lostCookie = await newPhone(browser);
  await joinByLink(lostCookie.page, secrets.join, "astrid");
  await expect(lostCookie.page.getByRole("heading", { name: "Är det du?" })).toBeVisible();
  await lostCookie.page.getByRole("button", { name: "Ja, det är jag" }).click();
  await expect(greeting(lostCookie.page, "Astrid"), "a known guest gets back in as themselves after the end").toBeVisible();
  await expect(admin.getByRole("region", { name: /^Players 2 · / })).toBeVisible();

  await end.getByRole("button", { name: "Wipe all data…" }).click();
  await expect(end.getByText("Download the photos first!", { exact: false }), "the wipe reminds the host to download").toBeVisible();
  await expect(end.getByRole("button", { name: "Download all (zip, 1)" })).toBeVisible();
  await end.getByRole("button", { name: "Yes, wipe everything" }).click();
  for (const p of [astrid, lostCookie.page]) await expect(p, "every phone leaves for the bare page").toHaveURL(/\/$/);
  await expect(admin.getByText("Nobody has joined yet.")).toBeVisible();
  await expect(card(".questions").getByText("No questions yet. Add the first one below.")).toBeVisible();
  await expect(card(".contest").getByText("Nobody has uploaded yet.")).toBeVisible();
  await expect(card(".landing-photo").getByText("No photo yet")).toBeVisible();
  await expect(end.getByText("New guests can join.")).toBeVisible();

  await lostCookie.page.goto(`/j/${secrets.join}`);
  await expect(lostCookie.page.getByRole("heading", { name: "Dilara fyller 3!" })).toBeVisible();
  await expect(lostCookie.page.getByAltText("Dilara"), "the landing photo is gone").toHaveCount(0);
  await lostCookie.page.getByLabel("Vad heter du?").fill("Astrid");
  await lostCookie.page.getByRole("button", { name: "Gå med" }).click();
  await expect(greeting(lostCookie.page, "Astrid"), "the old name is free again, with no Är det du?").toBeVisible();
  await lostCookie.context.close();
});

test("after the wipe, the photo finale runs before the quiz has started, and the quiz finale after the quiz", async () => {
  const photoFinale = card(".photo-finale");
  const quizFinale = card(".quiz-finale");
  const quiz = card(".quiz");
  await addQuestion(admin, { kind: "choice", text: "Vilken färg har snö?", options: ["Vit", "Blå"], correct: 0, seconds: 120 });
  for (const [p, name] of [[olle, "Olle"], [kim, "Kim Testsson"]] as const) {
    await joinByLink(p, secrets.join, name);
    await expect(greeting(p, name)).toBeVisible();
  }
  await uploadContestPhoto(olle, "sun");
  await expect(quizFinale.getByText("End the quiz before you open the quiz finale.")).toBeVisible();
  await expect(quizFinale.getByRole("button", { name: "Open suspense page" })).toBeDisabled();

  await photoFinale.getByRole("button", { name: "Open suspense page" }).click();
  await photoFinale.getByRole("button", { name: "Yes, open suspense page" }).click();
  for (const p of [olle, kim]) await expect(p.getByRole("heading", { name: "Vem tog bästa fotot?" })).toBeVisible();
  await expect(quiz.getByRole("button", { name: "Unlock quiz" }), "the quiz waits while the photo suspense page is on").toBeDisabled();
  await photoFinale.getByRole("button", { name: "Reveal photo winner" }).click();
  await expect(olle.getByText("Grattis, det är din bild!")).toBeVisible();
  await expect(kim.getByText("tog vinnarbilden · 0 röster")).toBeVisible();
  await expect(kim.locator(".recap"), "no quiz winners to recap yet").toHaveCount(0);
  await olle.getByRole("button", { name: "Tillbaka till festen" }).click();
  await olle.reload();
  await expect(greeting(olle, "Olle"), "a reveal the phone left stays left after a reload").toBeVisible();
  await tab(olle, "Galleri");
  await expect(olle.locator(".photo-winner")).toContainText("Olle");

  await quiz.getByRole("button", { name: "Unlock quiz" }).click();
  await unlockPopup(olle).getByRole("button", { name: "Till quizet" }).click();
  await expect(kim.getByRole("heading", { name: "Quizet börjar snart!" }), "the quiz takes kim off the photo winner, onto the Quiz tab kim was on").toBeVisible();
  await quiz.getByRole("button", { name: "Start question 1" }).click();
  await Promise.all([answer(olle, "Vit"), answer(kim, "Blå")]);
  await expect(quiz.locator(".phase")).toHaveText("Answer revealed");
  await quiz.getByRole("button", { name: "End quiz" }).click();
  await expect(quiz.locator(".winners")).toHaveText("Winner: Olle");

  await quizFinale.getByRole("button", { name: "Open suspense page" }).click();
  await quizFinale.getByRole("button", { name: "Yes, open suspense page" }).click();
  for (const p of [olle, kim]) await expect(p.getByRole("heading", { name: "Vem vann quizet?" })).toBeVisible();
  await quizFinale.getByRole("button", { name: "Reveal quiz winner" }).click();
  await expect(olle.getByText("Grattis, du vann!")).toBeVisible();
  await expect(kim.getByText("Quizvinnaren")).toBeVisible();
  await overlap(photoFinale);
  for (const p of [olle, kim]) await p.getByRole("button", { name: "Tillbaka till festen" }).click();
  await expect(greeting(kim, "Kim Testsson"), "back from the quiz winners goes to the party, not to the earlier photo winner kim never left").toBeVisible();
  await expect(olle.locator(".quiz-winners")).toContainText("Grattis, du vann!");
  await tab(kim, "Galleri");
  await expect(kim.locator(".photo-winner"), "the gallery keeps the photo winner").toContainText("Olle");
});

test("after a reset, the quiz finale runs before the photo finale, and back from either reveal goes to the party, also after a reload", async () => {
  const photoFinale = card(".photo-finale");
  const quizFinale = card(".quiz-finale");
  const quiz = card(".quiz");
  const end = card(".party-end");
  await end.getByRole("button", { name: "Reset party…" }).click();
  await end.getByLabel("Type RESET to confirm").fill("RESET");
  await end.getByRole("button", { name: "Yes, reset the party" }).click();
  for (const p of [olle, kim]) await expect(p, "every phone leaves for the bare page").toHaveURL(/\/$/);
  for (const [p, name] of [[olle, "Olle"], [kim, "Kim Testsson"]] as const) {
    await joinByLink(p, secrets.join, name);
    await expect(greeting(p, name)).toBeVisible();
  }

  await quiz.getByRole("button", { name: "Unlock quiz" }).click();
  for (const p of [olle, kim]) await expect(p.getByRole("heading", { name: "Quizet börjar snart!" })).toBeVisible();
  await quiz.getByRole("button", { name: "Start question 1" }).click();
  await Promise.all([answer(olle, "Vit"), answer(kim, "Blå")]);
  await expect(quiz.locator(".phase")).toHaveText("Answer revealed");
  await quiz.getByRole("button", { name: "End quiz" }).click();
  await quizFinale.getByRole("button", { name: "Open suspense page" }).click();
  await quizFinale.getByRole("button", { name: "Yes, open suspense page" }).click();
  await quizFinale.getByRole("button", { name: "Reveal quiz winner" }).click();
  for (const p of [olle, kim]) await expect(p.getByText("Quizvinnaren")).toBeVisible();
  await olle.getByRole("button", { name: "Tillbaka till festen" }).click();
  await olle.reload();
  await expect(greeting(olle, "Olle"), "a reveal the phone left stays left after a reload").toBeVisible();

  await photoFinale.getByRole("button", { name: "Open suspense page" }).click();
  await photoFinale.getByRole("button", { name: "Yes, open suspense page" }).click();
  await photoFinale.getByRole("button", { name: "Reveal photo winner" }).click();
  for (const p of [olle, kim]) await expect(p.getByText("Inga bilder var med den här gången")).toBeVisible();
  await overlap(quizFinale);
  for (const p of [olle, kim]) await p.getByRole("button", { name: "Tillbaka till festen" }).click();
  await expect(greeting(kim, "Kim Testsson"), "back from the photo winner goes to the party, not to the earlier quiz winners kim never left").toBeVisible();
  await expect(greeting(olle, "Olle")).toBeVisible();
  for (const [p, name] of [[olle, "Olle"], [kim, "Kim Testsson"]] as const) {
    await p.reload();
    await expect(greeting(p, name), "neither reveal comes back after a reload").toBeVisible();
  }
  await expect(olle.locator(".quiz-winners")).toContainText("Grattis, du vann!");

  await end.getByRole("button", { name: "End the party" }).click();
  await end.getByRole("button", { name: "Yes, end the party" }).click();
  await end.getByRole("button", { name: "Wipe all data…" }).click();
  await end.getByRole("button", { name: "Yes, wipe everything" }).click();
  for (const p of [olle, kim]) await expect(p, "the shared party is left wiped").toHaveURL(/\/$/);
});
