import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { CONTEST_UPLOAD_PATH } from "../src/shared/api";
import { LOOKS, placeholder, pngFile, type Look } from "./placeholder";
import { secrets } from "./server";
import { addQuestion, answer, fillQuestion, type QuestionSpec } from "./drive";
import { joinViaApi, laptop, openAdmin, openShell, phone } from "./support";

const out = "artifacts";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test.beforeAll(() => {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
});

function sideBySideGif(inputs: [string, string], output: string) {
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", inputs[0],
    "-i", inputs[1],
    "-filter_complex",
    "[0:v]pad=iw+24:ih:0:0:color=white[a];[a][1:v]hstack=inputs=2:shortest=1,fps=12,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4",
    output,
  ]);
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${out}/${name}.png` });

test("screenshots", async ({ browser }) => {
  const adminContext = await browser.newContext(laptop);
  const admin = await openAdmin(adminContext);
  await admin.locator('.landing-photo input[type="file"]').setInputFiles({ name: "snow.png", mimeType: "image/png", buffer: await placeholder(admin, LOOKS.snow) });
  await expect(admin.getByAltText("Current landing photo")).toBeVisible();

  const offline = await joinViaApi(browser, "Olle");
  await offline.close();
  const online = await Promise.all(["Astrid", "Testgäst", "Kim Testsson"].map((n) => joinViaApi(browser, n)));
  await Promise.all(online.map((c) => openShell(c)));

  const guestContext = await browser.newContext(phone);
  const guest = await guestContext.newPage();
  await guest.goto("/");
  await shot(guest, "01-bare");

  await guest.goto(`/j/${secrets.join}`);
  await expect(guest.getByAltText("Dilara")).toBeVisible();
  await guest.waitForFunction(() => (document.querySelector(".frame img") as HTMLImageElement | null)?.complete);
  await shot(guest, "02-landing");

  await guest.getByLabel("Vad heter du?").fill("olle");
  await shot(guest, "03-name-entry");

  await guest.getByRole("button", { name: "Gå med" }).click();
  await expect(guest.getByRole("heading", { name: "Är det du?" })).toBeVisible();
  await shot(guest, "04-ar-det-du");

  await guest.getByRole("button", { name: "Ja, det är jag" }).click();
  await expect(guest.getByRole("heading", { name: "Hej, Olle!" })).toBeVisible();
  await shot(guest, "05-shell-quiz");
  await guestContext.close();

  const row = admin.locator(".players li", { hasText: "Olle" });
  await expect(row.locator(".dot.on")).toHaveCount(0);
  await expect(admin.locator(".dot.on")).toHaveCount(3);
  await shot(admin, "06-admin");

  await Promise.all([adminContext.close(), ...online.map((c) => c.close())]);
});

async function pickPhoto(page: Page, look: Look, name: string) {
  await page.locator('input[type="file"]').setInputFiles(pngFile(name, await placeholder(page, look)));
}

async function uploadViaApi(context: BrowserContext, page: Page, look: Look) {
  const png = await placeholder(page, look, [900, 1100]);
  const thumb = await placeholder(page, look, [330, 400]);
  const res = await context.request.post(CONTEST_UPLOAD_PATH, {
    multipart: {
      key: randomBytes(16).toString("base64url"),
      photo: { name: "photo.png", mimeType: "image/png", buffer: png },
      thumb: { name: "thumb.png", mimeType: "image/png", buffer: thumb },
    },
  });
  expect(res.status()).toBe(200);
}

async function throttleUploads(page: Page, bytesPerSecond: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: bytesPerSecond });
  return () => cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
}

const progress = (page: Page) => page.getByRole("progressbar");

async function vote(page: Page, nth: number, times: number, section: "current" | "fame" = "current") {
  const grid = page.locator(".gallery .grid").nth(section === "current" ? 0 : 1);
  const card = grid.locator(".tile:not(:has(.own))").nth(nth);
  for (let i = 0; i < times; i++) {
    const before = await card.locator(".mine").textContent();
    await card.getByRole("button", { name: "Ge en röst" }).click();
    await expect(card.locator(".mine")).not.toHaveText(before!);
  }
}

test("contest screenshots", async ({ browser }) => {
  const [maja, nils, elin, viggo] = await Promise.all(["Maja", "Nils", "Elin", "Viggo"].map((n) => joinViaApi(browser, n)));
  const majaPage = await openShell(maja!);
  await majaPage.getByRole("button", { name: "Mitt foto" }).click();
  await expect(majaPage.getByRole("button", { name: "Välj bild" })).toBeVisible();
  await shot(majaPage, "07-mitt-foto-empty");

  await majaPage.route(CONTEST_UPLOAD_PATH, (route) => route.abort("internetdisconnected"));
  await pickPhoto(majaPage, LOOKS.snow, "snow");
  await expect(majaPage.getByText("Ingen kontakt just nu.", { exact: false })).toBeVisible();
  await shot(majaPage, "08-mitt-foto-no-connection");

  await majaPage.unroute(CONTEST_UPLOAD_PATH);
  const unthrottle = await throttleUploads(majaPage, 40_000);
  await majaPage.evaluate(() => dispatchEvent(new Event("online")));
  await expect(progress(majaPage)).toHaveAttribute("aria-valuenow", /^(3\d|4\d|5\d|6\d)$/, { timeout: 30_000 });
  await shot(majaPage, "09-mitt-foto-uploading");
  await unthrottle();
  await expect(majaPage.getByText("Inga röster än")).toBeVisible({ timeout: 30_000 });

  const others = await Promise.all([nils!, elin!, viggo!].map(openShell));
  await uploadViaApi(nils!, others[0]!, LOOKS.dusk);
  await uploadViaApi(elin!, others[1]!, LOOKS.mint);
  await uploadViaApi(viggo!, others[2]!, LOOKS.rose);
  for (const page of others) await page.getByRole("button", { name: "Galleri" }).click();
  await expect(others[0]!.locator(".gallery .tile")).toHaveCount(4);

  await vote(others[0]!, 0, 2);
  await vote(others[1]!, 0, 1);
  await expect(majaPage.getByText("Din bild har 3 röster")).toBeVisible();
  await shot(majaPage, "10-mitt-foto-uploaded");

  await majaPage.getByRole("button", { name: "Byt bild" }).click();
  await expect(majaPage.getByText("flyttar den här till", { exact: false })).toBeVisible();
  await shot(majaPage, "11-mitt-foto-replace-confirm");
  const chooser = majaPage.waitForEvent("filechooser");
  await majaPage.getByRole("button", { name: "Välj ny bild" }).click();
  await (await chooser).setFiles(pngFile("sun", await placeholder(majaPage, LOOKS.sun)));
  await expect(majaPage.getByText("Din tidigare bild är kvar i Hall of fame", { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(majaPage.getByText("Inga röster än")).toBeVisible();

  await majaPage.getByRole("button", { name: "Galleri" }).click();
  await expect(majaPage.locator(".gallery .grid").nth(1).locator(".tile")).toHaveCount(1);
  await vote(majaPage, 0, 1);
  await vote(majaPage, 1, 1);
  await vote(others[2]!, 0, 2);
  await vote(others[2]!, 2, 1);
  await expect(majaPage.getByText("1 av 3 röster kvar")).toBeVisible();
  await majaPage.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
  await shot(majaPage, "12-galleri");
  await majaPage.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await shot(majaPage, "13-galleri-hall-of-fame");

  await majaPage.locator(".gallery .tile").nth(1).locator(".thumb").click();
  await expect(majaPage.getByRole("dialog")).toBeVisible();
  await majaPage.getByRole("dialog").locator("img").evaluate((img: HTMLImageElement) => img.decode());
  await shot(majaPage, "14-galleri-lightbox");

  const adminContext = await browser.newContext(laptop);
  const admin = await openAdmin(adminContext);
  await admin.locator(".versions li", { hasText: "current" }).filter({ has: admin.locator("img") }).first().waitFor();
  const viggoVersion = admin.locator(".entrants > li", { hasText: "Viggo" }).locator(".versions li").first();
  await viggoVersion.getByRole("button", { name: "Hide" }).click();
  await expect(viggoVersion.locator(".badge.hidden")).toBeVisible();
  await admin.locator(".contest").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await admin.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
  await shot(admin, "15-admin-contest");

  const download = admin.waitForEvent("download");
  await admin.getByRole("button", { name: /Download all/ }).click();
  await (await download).saveAs(`${out}/photo-contest.zip`);

  await Promise.all([adminContext.close(), maja!.close(), nils!.close(), elin!.close(), viggo!.close()]);
});

test("contest video", async ({ browser }) => {
  const videoDir = `${out}/video-tmp`;
  const clip = { ...phone, deviceScaleFactor: 1, recordVideo: { dir: videoDir, size: phone.viewport } };
  const [uploaderContext, voterContext] = await Promise.all([browser.newContext(clip), browser.newContext(clip)]);
  for (const [context, name] of [[uploaderContext, "Ture"], [voterContext, "Alva"]] as const) {
    const res = await context.request.post("/api/join", { data: { secret: secrets.join, name } });
    expect(await res.json()).toEqual({ status: "joined" });
  }
  const [uploader, voter] = await Promise.all([openShell(uploaderContext), openShell(voterContext)]);
  await uploader.getByRole("button", { name: "Mitt foto" }).click();
  await voter.getByRole("button", { name: "Galleri" }).click();
  await uploader.waitForTimeout(900);

  const unthrottle = await throttleUploads(uploader, 60_000);
  const first = uploader.waitForEvent("filechooser");
  await uploader.getByRole("button", { name: "Välj bild" }).click();
  await (await first).setFiles(pngFile("sea", await placeholder(uploader, LOOKS.sea)));
  await expect(uploader.getByRole("button", { name: "Byt bild" })).toBeVisible({ timeout: 30_000 });
  await unthrottle();

  const newest = voter.locator(".gallery .grid").first().locator(".tile").last();
  await expect(newest).toBeVisible();
  await voter.waitForTimeout(700);
  await newest.getByRole("button", { name: "Ge en röst" }).click();
  await voter.waitForTimeout(500);
  await newest.getByRole("button", { name: "Ge en röst" }).click();
  await expect(uploader.getByText("Din bild har 2 röster")).toBeVisible();
  await uploader.waitForTimeout(1000);

  await uploader.getByRole("button", { name: "Byt bild" }).click();
  await uploader.waitForTimeout(1600);
  const second = uploader.waitForEvent("filechooser");
  await uploader.getByRole("button", { name: "Välj ny bild" }).click();
  await (await second).setFiles(pngFile("rose", await placeholder(uploader, LOOKS.rose)));
  await expect(uploader.getByText("Din tidigare bild är kvar", { exact: false })).toBeVisible({ timeout: 30_000 });
  await voter.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
  await voter.waitForTimeout(1200);
  await voter.evaluate(() => scrollTo({ top: 0, behavior: "smooth" }));
  await voter.waitForTimeout(700);
  await voter.locator(".gallery .grid").first().locator(".tile").last().getByRole("button", { name: "Ge en röst" }).click();
  await voter.waitForTimeout(1500);

  const videos = [uploader.video()!, voter.video()!];
  await Promise.all([uploaderContext.close(), voterContext.close()]);
  const [a, b] = [`${out}/contest-uploader.webm`, `${out}/contest-voter.webm`];
  renameSync(await videos[0]!.path(), a);
  renameSync(await videos[1]!.path(), b);
  rmSync(videoDir, { recursive: true, force: true });
  sideBySideGif([a, b], `${out}/contest.gif`);
});

test("join-live video", async ({ browser }) => {
  const videoDir = `${out}/video-tmp`;
  const adminContext = await browser.newContext({ ...laptop, recordVideo: { dir: videoDir, size: laptop.viewport } });
  const phoneContext = await browser.newContext({ ...phone, deviceScaleFactor: 1, recordVideo: { dir: videoDir, size: phone.viewport } });
  const [admin, guest] = await Promise.all([openAdmin(adminContext), phoneContext.newPage()]);

  await guest.goto(`/j/${secrets.join}`);
  await guest.waitForTimeout(1200);
  await guest.getByLabel("Vad heter du?").pressSequentially("Saga Testsson", { delay: 110 });
  await guest.waitForTimeout(500);
  await guest.getByRole("button", { name: "Gå med" }).click();
  await expect(admin.locator(".players li", { hasText: "Saga Testsson" }).locator(".dot.on")).toBeVisible();
  await guest.waitForTimeout(1500);
  await guest.getByRole("button", { name: "Mitt foto" }).click();
  await guest.waitForTimeout(800);
  await guest.getByRole("button", { name: "Galleri" }).click();
  await guest.waitForTimeout(1200);

  const adminVideo = admin.video()!;
  const guestVideo = guest.video()!;
  await Promise.all([adminContext.close(), phoneContext.close()]);
  renameSync(await adminVideo.path(), `${out}/join-live-admin.webm`);
  renameSync(await guestVideo.path(), `${out}/join-live-phone.webm`);
  rmSync(videoDir, { recursive: true, force: true });

  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", `${out}/join-live-admin.webm`,
    "-i", `${out}/join-live-phone.webm`,
    "-filter_complex", "[1:v]scale=-2:900,pad=iw+40:900:20:0:color=white[p];[0:v][p]hstack=inputs=2:shortest=1",
    "-c:v", "libvpx", "-b:v", "3M", "-an",
    `${out}/join-live.webm`,
  ]);
});

const quizQuestions = (photo: Buffer): QuestionSpec[] => [
  { kind: "choice", text: "Vilken färg har snöflingan på bilden?", options: ["Blå", "Rosa", "Grön", "Lila"], correct: 0, photo },
  { kind: "number", text: "Hur många ballonger hänger i taket?", answer: "12" },
  { kind: "choice", text: "Vad blir vatten när det fryser?", options: ["Is", "Sand", "Sylt"], correct: 0 },
];

const bots = ["Astrid", "Olle", "Testgäst", "Saga Testsson", "Ture Testsson", "Vera Testsson"] as const;
type Bot = (typeof bots)[number];

// Speed points make the first board Astrid, Saga, Kim, Olle, Ture; the closest guesses on question 2
// then lift Kim to first and Vera from outside the top five, pushing everyone else down.
const plans: Record<Bot | "Kim", [pick: string, afterMs: number]>[] = [
  { Astrid: ["Blå", 800], "Saga Testsson": ["Blå", 1600], Kim: ["Blå", 2800], Olle: ["Blå", 4200], "Ture Testsson": ["Blå", 5600], "Vera Testsson": ["Rosa", 2000], Testgäst: ["Lila", 2400] },
  { Astrid: ["20", 900], "Saga Testsson": ["3", 1200], Kim: ["12", 2600], Olle: ["15", 2000], "Ture Testsson": ["11", 1500], "Vera Testsson": ["12", 3000], Testgäst: ["30", 1800] },
];

async function quizRoom(browser: Browser, admin: Page) {
  await expect(admin.locator(".questions")).toBeVisible();
  if ((await admin.locator(".questions > ol > li").count()) === 0) {
    for (const q of quizQuestions(await placeholder(admin, LOOKS.snow))) await addQuestion(admin, q);
  }
  const pages = await Promise.all(bots.map(async (name) => openShell(await joinViaApi(browser, name))));
  return new Map(bots.map((name, i) => [name, pages[i]!]));
}

function playRound(room: Map<Bot, Page>, plan: (typeof plans)[number]) {
  return Promise.all([...room].map(([name, page]) => answer(page, ...plan[name])));
}

async function step(admin: Page, label: string | RegExp) {
  await admin.getByRole("button", { name: label }).click();
}

test("quiz screenshots", async ({ browser }) => {
  const adminContext = await browser.newContext(laptop);
  const admin = await openAdmin(adminContext);
  const [first, second, third] = quizQuestions(await placeholder(admin, LOOKS.snow));
  await addQuestion(admin, first!);
  await addQuestion(admin, second!);
  const form = await fillQuestion(admin, third!);
  await admin.evaluate(() => document.querySelector(".questions")!.scrollIntoView({ block: "start" }));
  await shot(admin, "16-admin-questions");
  await form.getByRole("button", { name: "Save question" }).click();
  await expect(admin.locator(".questions > ol > li")).toHaveCount(3);
  await admin.evaluate(() => scrollTo(0, 0));

  const room = await quizRoom(browser, admin);
  const kimContext = await joinViaApi(browser, "Kim Testsson");
  const kim = await openShell(kimContext);
  await kim.getByRole("button", { name: "Galleri" }).click();

  await step(admin, "Unlock quiz");
  await expect(kim.getByRole("dialog")).toBeVisible();
  await kim.waitForTimeout(600);
  await shot(kim, "17-quiz-popup");
  await kim.getByRole("button", { name: "Till quizet" }).click();
  await expect(kim.getByRole("heading", { name: "Quizet börjar snart!" })).toBeVisible();
  await shot(kim, "18-quiz-lobby");

  await step(admin, "Start question 1");
  await expect(kim.locator(".q-photo")).toBeVisible();
  await kim.waitForTimeout(1500);
  await shot(kim, "19-quiz-question");
  const [kimPick, kimAfter] = plans[0]!.Kim;
  await Promise.all([playRound(room, plans[0]!), answer(kim, kimPick, Math.max(0, kimAfter - 1500)).then(() => shot(kim, "20-quiz-answered"))]);
  await expect(admin.getByText("Answers closed")).toBeVisible();
  await shot(kim, "21-quiz-closed");

  await step(admin, "Reveal answer");
  await expect(kim.getByRole("heading", { name: "Rätt!" })).toBeVisible();
  await kim.waitForTimeout(1200);
  await shot(kim, "22-quiz-reveal");
  await shot(admin, "23-admin-reveal");

  await step(admin, "Show leaderboard");
  await expect(kim.getByRole("heading", { name: "Topplistan" })).toBeVisible();
  await kim.waitForTimeout(2600);
  await shot(kim, "24-quiz-leaderboard");

  await step(admin, "Next question");
  await expect(kim.getByLabel("Din gissning")).toBeVisible();
  await kim.getByLabel("Din gissning").fill("12");
  await shot(kim, "25-quiz-number");
  await kim.getByLabel("Din gissning").fill("");
  await Promise.all([playRound(room, plans[1]!), answer(kim, ...plans[1]!.Kim)]);
  await expect(admin.getByText("Answers closed")).toBeVisible();
  await step(admin, "Reveal answer");
  await expect(kim.getByRole("heading", { name: "Närmast!" })).toBeVisible();
  await kim.waitForTimeout(800);
  await shot(kim, "26-quiz-reveal-number");
  await expect(room.get("Astrid")!.getByRole("heading", { name: "Inte närmast den här gången" })).toBeVisible();
  await shot(room.get("Astrid")!, "27-quiz-reveal-number-wrong");

  await step(admin, "Show leaderboard");
  await expect(kim.getByRole("heading", { name: "Topplistan" })).toBeVisible();
  await kim.waitForTimeout(2600);
  await shot(kim, "28-quiz-leaderboard-moved");
  await shot(room.get("Testgäst")!, "29-quiz-leaderboard-outside");
  await shot(admin, "30-admin-leaderboard");

  await step(admin, "End quiz");
  await expect(admin.getByText(/End the quiz now\?/)).toBeVisible();
  await step(admin, "Yes, end quiz");
  await expect(kim.getByRole("heading", { name: "Quizet är slut!" })).toBeVisible();
  await kim.waitForTimeout(500);
  await shot(kim, "31-quiz-ended");
  await expect(admin.getByText(/Winner/)).toBeVisible();
  await shot(admin, "32-admin-ended");

  await step(admin, "Reset quiz");
  await step(admin, "Yes, reset quiz");
  await expect(admin.getByText("Locked", { exact: true })).toBeVisible();
  await Promise.all([adminContext.close(), kimContext.close(), ...[...room.values()].map((p) => p.context().close())]);
});

// Playwright's recordings shimmer slightly in every frame; denoising and dropping frames that barely change keeps each GIF a
// few MB, and keeping every sixth still frame holds the final screen instead of looping straight away.
const gifFilter = (width: number) =>
  `fps=12,scale=${width}:-2:flags=lanczos,hqdn3d=4:3:6:6,mpdecimate=max=6,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`;

test("quiz videos", async ({ browser }) => {
  test.setTimeout(240_000);
  const videoDir = `${out}/video-tmp`;
  const adminContext = await browser.newContext({ ...laptop, recordVideo: { dir: videoDir, size: laptop.viewport } });
  const kimContext = await joinViaApi(browser, "Kim Testsson", { ...phone, deviceScaleFactor: 1, recordVideo: { dir: videoDir, size: phone.viewport } });
  const adminOpenedAt = Date.now();
  const admin = await openAdmin(adminContext);
  const room = await quizRoom(browser, admin);
  const kim = await kimContext.newPage();
  const startedAt = Date.now();
  await kim.goto("/app#galleri");
  await kim.waitForTimeout(1500);

  await step(admin, "Unlock quiz");
  await expect(kim.getByRole("dialog")).toBeVisible();
  await kim.waitForTimeout(1800);
  await kim.getByRole("button", { name: "Till quizet" }).click();
  await kim.waitForTimeout(1500);
  await step(admin, "Start question 1");
  await Promise.all([playRound(room, plans[0]!), answer(kim, ...plans[0]!.Kim)]);
  await expect(admin.getByText("Answers closed")).toBeVisible();
  await kim.waitForTimeout(1500);
  await step(admin, "Reveal answer");
  await kim.waitForTimeout(3000);
  await step(admin, "Show leaderboard");
  await kim.waitForTimeout(3500);
  const cycleEnd = Date.now();

  await step(admin, "Next question");
  await Promise.all([playRound(room, plans[1]!), answer(kim, ...plans[1]!.Kim)]);
  await expect(admin.getByText("Answers closed")).toBeVisible();
  await step(admin, "Reveal answer");
  await expect(kim.getByRole("heading", { name: "Närmast!" })).toBeVisible();
  const reorderStart = Date.now();
  await kim.waitForTimeout(2000);
  await step(admin, "Show leaderboard");
  await kim.waitForTimeout(4000);
  const reorderEnd = Date.now();

  await step(admin, "Reset quiz");
  await step(admin, "Yes, reset quiz");
  const adminVideo = admin.video()!;
  const kimVideo = kim.video()!;
  await Promise.all([adminContext.close(), kimContext.close(), ...[...room.values()].map((p) => p.context().close())]);
  renameSync(await adminVideo.path(), `${out}/quiz-admin.webm`);
  renameSync(await kimVideo.path(), `${out}/quiz-phone.webm`);
  rmSync(videoDir, { recursive: true, force: true });

  const secs = (ms: number) => (ms / 1000).toFixed(2);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-ss", secs(startedAt - adminOpenedAt), "-t", secs(cycleEnd - startedAt), "-i", `${out}/quiz-admin.webm`,
    "-t", secs(cycleEnd - startedAt), "-i", `${out}/quiz-phone.webm`,
    "-filter_complex", `[1:v]scale=-2:900,pad=iw+40:900:20:0:color=white[p];[0:v][p]hstack=inputs=2:shortest=1,${gifFilter(1100)}`,
    `${out}/quiz-cycle.gif`,
  ]);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-ss", secs(reorderStart - startedAt), "-t", secs(reorderEnd - reorderStart), "-i", `${out}/quiz-phone.webm`,
    "-vf", gifFilter(390),
    `${out}/quiz-leaderboard.gif`,
  ]);
});

async function wipeParty(admin: Page) {
  const end = admin.locator(".party-end");
  if (await end.getByRole("button", { name: "End the party" }).isVisible()) {
    await end.getByRole("button", { name: "End the party" }).click();
    await end.getByRole("button", { name: "Yes, end the party" }).click();
  }
  await end.getByRole("button", { name: "Wipe all data…" }).click();
  await end.getByRole("button", { name: "Yes, wipe everything" }).click();
  await expect(end.getByText("New guests can join.")).toBeVisible();
}

const finaleGuests = ["Astrid", "Olle", "Kim Testsson"] as const;

// Astrid's and Olle's photos tie on one vote each from Kim, and Astrid and Kim guess the number exactly, so both
// competitions end on a tie: the host picks Olle's photo, and Astrid and Kim are joint quiz winners.
async function finaleRoom(browser: Browser, admin: Page, contextOptions: Parameters<Browser["newContext"]>[0]) {
  await wipeParty(admin);
  await addQuestion(admin, { kind: "number", text: "Hur många snögubbar ryms i trädgården?", answer: "42" });
  const contexts = await Promise.all(finaleGuests.map((name) => joinViaApi(browser, name, contextOptions)));
  const [astrid, olle, kim] = await Promise.all(contexts.map((c) => openShell(c)));
  await uploadViaApi(contexts[0]!, astrid!, LOOKS.snow);
  await uploadViaApi(contexts[1]!, olle!, LOOKS.rose);
  await kim!.getByRole("button", { name: "Galleri" }).click();
  await vote(kim!, 0, 1);
  await vote(kim!, 1, 1);
  await kim!.getByRole("button", { name: "Quiz" }).click();

  await step(admin, "Unlock quiz");
  await step(admin, "Start question 1");
  await Promise.all([answer(astrid!, "42"), answer(olle!, "30"), answer(kim!, "42")]);
  await step(admin, "Reveal answer");
  await step(admin, "End quiz");
  await expect(admin.getByText("Joint winners")).toBeVisible();
  return { contexts, astrid: astrid!, olle: olle!, kim: kim! };
}

test("finale screenshots and video", async ({ browser }) => {
  test.setTimeout(240_000);
  const videoDir = `${out}/video-tmp`;
  const adminContext = await browser.newContext({ ...laptop, recordVideo: { dir: videoDir, size: laptop.viewport } });
  const admin = await openAdmin(adminContext);
  const { contexts, astrid, olle, kim } = await finaleRoom(browser, admin, { ...phone, recordVideo: { dir: videoDir, size: phone.viewport } });
  const phones = [astrid, olle, kim];
  const finaleCard = admin.locator(".finale");
  await finaleCard.evaluate((el) => el.scrollIntoView({ block: "start" }));
  const startedAt = Date.now();
  await admin.waitForTimeout(1200);

  await finaleCard.getByRole("button", { name: "Open suspense page" }).click();
  await shot(admin, "40-admin-finale-confirm");
  await finaleCard.getByRole("button", { name: "Yes, open suspense page" }).click();
  for (const p of phones) await expect(p.getByRole("heading", { name: "Och vinnarna är…" })).toBeVisible();
  await kim.waitForTimeout(2500);
  await shot(kim, "41-suspense");
  await expect(finaleCard.getByText("Tie for first")).toBeVisible();
  await shot(admin, "42-admin-finale-tie");

  await finaleCard.locator(".tie-photos li", { hasText: "Olle" }).getByRole("button", { name: "Pick as winner" }).click();
  await expect(finaleCard.getByRole("button", { name: "Winner ✓" })).toBeVisible();
  await admin.waitForTimeout(1000);
  await finaleCard.getByRole("button", { name: "Reveal photo winner" }).click();
  for (const p of phones) await expect(p.getByText("tog vinnarbilden", { exact: false })).toBeVisible();
  await olle.waitForTimeout(2200);
  await shot(olle, "43-reveal-photo-winner");
  await shot(kim, "44-reveal-photo");
  await shot(admin, "45-admin-finale-photo");
  await admin.waitForTimeout(1500);

  await finaleCard.getByRole("button", { name: "Reveal quiz winners" }).click();
  for (const p of phones) await expect(p.getByText("Quizvinnarna")).toBeVisible();
  await kim.waitForTimeout(2200);
  await shot(kim, "46-reveal-quiz-joint-winner");
  await shot(olle, "47-reveal-quiz");
  await shot(admin, "48-admin-finale-quiz");
  await admin.waitForTimeout(1500);
  const finaleEnd = Date.now();

  const end = admin.locator(".party-end");
  await end.getByRole("button", { name: "End the party" }).click();
  await end.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await shot(admin, "49-admin-end-confirm");
  await end.getByRole("button", { name: "Yes, end the party" }).click();
  await end.getByRole("button", { name: "Wipe all data…" }).click();
  await end.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await shot(admin, "50-admin-wipe-confirm");
  await end.getByRole("button", { name: "Yes, wipe everything" }).click();
  for (const p of phones) await expect(p).toHaveURL(/\/$/);

  const videos = [admin.video()!, ...phones.map((p) => p.video()!)];
  const closedAt = Date.now();
  await Promise.all([adminContext.close(), ...contexts.map((c) => c.close())]);
  const files = ["finale-admin", ...finaleGuests.map((n) => `finale-${n.split(" ")[0]!.toLowerCase()}`)].map((n) => `${out}/${n}.webm`);
  for (const [i, video] of videos.entries()) renameSync(await video.path(), files[i]!);
  rmSync(videoDir, { recursive: true, force: true });

  // A recording starts a moment after its page opens, and the delay differs per page, but all four end together when
  // their contexts close, so each clip is cut back from its end. The admin is cropped to the column with the finale card.
  const secs = (ms: number) => (ms / 1000).toFixed(2);
  const duration = (f: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString()) * 1000;
  const inputs = files.flatMap((f) => ["-ss", secs(duration(f) - (closedAt - startedAt)), "-t", secs(finaleEnd - startedAt), "-i", f]);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", ...inputs,
    "-filter_complex",
    `[0:v]crop=720:900:720:0,scale=-2:844[a];[1:v]pad=iw+16:ih:16:0:color=white[p1];[2:v]pad=iw+16:ih:16:0:color=white[p2];[3:v]pad=iw+16:ih:16:0:color=white[p3];[a][p1][p2][p3]hstack=inputs=4:shortest=1,${gifFilter(1400)}`,
    `${out}/finale.gif`,
  ]);
});
