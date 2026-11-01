import { chromium, expect, type Browser, type Frame, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { parseArgs } from "node:util";
import { DIRECTIONS } from "../src/lab/directions.ts";
import { chromiumLaunchOptions } from "./drive.ts";

// Screenshots and motion clips of the design lab, from a running `npm run dev`:
//   node e2e/lab-media.ts --base-url http://127.0.0.1:5173 [--only brutal,luxe] [--out artifacts/lab]
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
  const context = await browser.newContext({ viewport: { width: 2150, height: 1100 } });
  const page = await context.newPage();
  await page.goto(`${base}/lab/${id}`, { timeout: 60_000 });
  await expect(page.locator(".lab-frames iframe")).toHaveCount(5);
  for (const frame of page.frames().slice(1)) await rendered(frame);
  await page.waitForTimeout(settle);
  await page.locator(".lab-frames").screenshot({ path: `${out}/${id}.png` });
  await context.close();
}

// The GIF shows the motion the host asked for: the countdown and the winner reveal. The rest is in the live lab.
const clips = ["quiz", "finale"] as const;

async function clip(browser: Browser, id: string) {
  const tmp = `${out}/tmp-${id}`;
  rmSync(tmp, { recursive: true, force: true });
  const parts = await Promise.all(
    clips.map(async (screen) => {
      const dir = `${tmp}/${screen}`;
      const context = await browser.newContext({ viewport: phone, isMobile: true, hasTouch: true, recordVideo: { dir, size: phone } });
      const start = Date.now();
      const page = await context.newPage();
      await page.goto(`${base}/lab/${id}/${screen}?frame`, { timeout: 60_000 });
      await rendered(page);
      const skip = Math.max(0, (Date.now() - start) / 1000 - 0.1).toFixed(2);
      await page.waitForTimeout(7_000);
      await context.close();
      const [file] = readdirSync(dir);
      if (!file) throw new Error(`no video for ${id}/${screen}`);
      renameSync(`${dir}/${file}`, `${out}/${id}-${screen}.webm`);
      return { file: `${out}/${id}-${screen}.webm`, skip };
    }),
  );
  rmSync(tmp, { recursive: true, force: true });
  const inputs = parts.flatMap((p) => ["-ss", p.skip, "-t", "6", "-i", p.file]);
  const pads = parts.map((_, i) => `[${i}:v]setpts=PTS-STARTPTS,pad=iw+${i < parts.length - 1 ? 16 : 0}:ih:0:0:color=white[v${i}]`).join(";");
  const stack = `${parts.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${parts.length}:shortest=1,fps=8,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
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
