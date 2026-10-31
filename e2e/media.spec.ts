import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync } from "node:fs";
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

const shot = (page: Page, name: string) => page.screenshot({ path: `${out}/${name}.png` });

async function openAdmin(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/admin/${secrets.admin}`);
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  return page;
}

async function snowyPlaceholder(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const size = 1200;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const sky = ctx.createLinearGradient(0, 0, 0, size);
    sky.addColorStop(0, "#bfe0fb");
    sky.addColorStop(0.6, "#e8f4fe");
    sky.addColorStop(1, "#ffffff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(300, 1180, 700, 260, 0, 0, Math.PI * 2);
    ctx.ellipse(1000, 1220, 600, 300, 0, 0, Math.PI * 2);
    ctx.fill();
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 160; i++) {
      ctx.globalAlpha = 0.5 + rand() / 2;
      ctx.beginPath();
      ctx.arc(rand() * size, rand() * size, 3 + rand() * 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#4f9be0";
    ctx.lineWidth = 22;
    ctx.lineCap = "round";
    ctx.translate(size / 2, size / 2 - 60);
    for (let arm = 0; arm < 6; arm++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -300);
      for (const at of [120, 210]) {
        ctx.moveTo(0, -at);
        ctx.lineTo(-70, -at - 70);
        ctx.moveTo(0, -at);
        ctx.lineTo(70, -at - 70);
      }
      ctx.stroke();
    }
    return canvas.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
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
  await admin.locator('input[type="file"]').setInputFiles({ name: "snow.png", mimeType: "image/png", buffer: await snowyPlaceholder(admin) });
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
  await guest.getByRole("button", { name: "Mitt foto" }).click();
  await shot(guest, "06-shell-mitt-foto");
  await guest.getByRole("button", { name: "Galleri" }).click();
  await shot(guest, "07-shell-galleri");
  await guestContext.close();

  const row = admin.locator(".players li", { hasText: "Olle" });
  await expect(row.locator(".dot.on")).toHaveCount(0);
  await expect(admin.locator(".dot.on")).toHaveCount(3);
  await shot(admin, "08-admin");

  await Promise.all([adminContext.close(), ...online.map((c) => c.close())]);
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
