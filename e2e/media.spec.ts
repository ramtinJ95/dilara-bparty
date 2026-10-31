import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { CONTEST_UPLOAD_PATH } from "../src/shared/api";
import { LOOKS, placeholder, pngFile, type Look } from "./placeholder";
import { secrets } from "./server";

const out = "artifacts";
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const laptop = { viewport: { width: 1440, height: 900 } };

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

async function openAdmin(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/admin/${secrets.admin}`);
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  return page;
}

async function joinViaApi(browser: Browser, name: string): Promise<BrowserContext> {
  const context = await browser.newContext(phone);
  const res = await context.request.post("/api/join", { data: { secret: secrets.join, name } });
  expect(await res.json()).toEqual({ status: "joined" });
  return context;
}

async function openShell(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /^Hej, .+!$/ })).toBeVisible();
  return page;
}

test("screenshots", async ({ browser }) => {
  const adminContext = await browser.newContext(laptop);
  const admin = await openAdmin(adminContext);
  await admin.locator('input[type="file"]').setInputFiles({ name: "snow.png", mimeType: "image/png", buffer: await placeholder(admin, LOOKS.snow) });
  await expect(admin.getByAltText("Current landing photo")).toBeVisible();

  const offline = await joinViaApi(browser, "Olle");
  await offline.close();
  const online = await Promise.all(["Astrid", "Testgäst", "Kim Testsson"].map((n) => joinViaApi(browser, n)));
  await Promise.all(online.map(openShell));

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
