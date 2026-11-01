import { chromium, expect, type Browser, type Frame, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { parseArgs } from "node:util";
import { DIRECTIONS } from "../src/lab/directions.ts";
import { chromiumLaunchOptions } from "./drive.ts";

// Screenshots and motion clips of the design lab, from a running `npm run dev`:
//   node e2e/lab-media.ts --base-url http://127.0.0.1:5173 [--only aurora,pearl] [--out artifacts/lab]
const { values } = parseArgs({ options: { "base-url": { type: "string", default: "http://127.0.0.1:5173" }, only: { type: "string" }, out: { type: "string", default: "artifacts/lab" } } });
const base = values["base-url"];
const out = values.out;
const only = values.only?.split(",");
const directions = only ? DIRECTIONS.filter((d) => only.includes(d.id)) : DIRECTIONS;
if (only && directions.length !== only.length) throw new Error(`unknown direction in --only ${values.only}`);

const phone = { width: 390, height: 844 };
const settle = 2_500;

const rendered = (page: Page | Frame) => page.waitForFunction(() => document.querySelector("#app > *") !== null && document.fonts.status === "loaded", undefined, { timeout: 60_000 });

async function sheet(browser: Browser, id: string) {
  const context = await browser.newContext({ viewport: { width: 2150, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${base}/lab/${id}`, { timeout: 60_000 });
  await expect(page.locator(".lab-frames iframe")).toHaveCount(5);
  for (const frame of page.frames().slice(1)) await rendered(frame);
  await page.waitForTimeout(settle);
  await page.locator(".lab-frames").screenshot({ path: `${out}/${id}.png` });
  await context.close();
}

async function tap(page: Page, name: string, nth: number) {
  const button = page.getByRole("button", { name, exact: true }).nth(nth);
  await button.scrollIntoViewIfNeeded({ timeout: 5_000 });
  await button.click();
  await page.waitForTimeout(1_100);
}

const scripts: Record<"quiz" | "reveal" | "gallery" | "finale", (page: Page) => Promise<void>> = {
  quiz: (page) => page.waitForTimeout(7_000),
  reveal: (page) => page.waitForTimeout(7_000),
  gallery: async (page) => {
    await page.waitForTimeout(1_400);
    await tap(page, "Ge en röst", 1);
    await tap(page, "Ta tillbaka en röst", 0);
    await tap(page, "Ge en röst", 2);
    await tap(page, "Ta tillbaka en röst", 0);
    await page.waitForTimeout(1_000);
  },
  finale: (page) => page.waitForTimeout(7_000),
};

async function clip(browser: Browser, id: string) {
  const tmp = `${out}/tmp-${id}`;
  rmSync(tmp, { recursive: true, force: true });
  const parts = await Promise.all(
    Object.entries(scripts).map(async ([screen, script]) => {
      const dir = `${tmp}/${screen}`;
      const context = await browser.newContext({ viewport: phone, isMobile: true, hasTouch: true, recordVideo: { dir, size: phone } });
      const page = await context.newPage();
      await page.goto(`${base}/lab/${id}/${screen}`, { timeout: 60_000 });
      await rendered(page);
      await script(page);
      await context.close();
      const [file] = readdirSync(dir);
      if (!file) throw new Error(`no video for ${id}/${screen}`);
      renameSync(`${dir}/${file}`, `${out}/${id}-${screen}.webm`);
      return `${out}/${id}-${screen}.webm`;
    }),
  );
  rmSync(tmp, { recursive: true, force: true });
  const inputs = parts.flatMap((p) => ["-ss", "0.6", "-t", "6", "-i", p]);
  const pads = parts.map((_, i) => `[${i}:v]setpts=PTS-STARTPTS,pad=iw+${i < parts.length - 1 ? 16 : 0}:ih:0:0:color=white[v${i}]`).join(";");
  const stack = `${parts.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${parts.length}:shortest=1,fps=12,scale=1200:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", `${pads};${stack}`, `${out}/${id}.gif`]);
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch(chromiumLaunchOptions());
try {
  for (const { id } of directions) {
    await sheet(browser, id);
    await clip(browser, id);
    console.log(`${out}/${id}.png ${out}/${id}.gif`);
  }
} finally {
  await browser.close();
}
