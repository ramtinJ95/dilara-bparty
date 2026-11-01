import { chromium, devices, webkit, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromiumLaunchOptions, openAdmin } from "../drive.ts";
import { shapeNetwork, type ProfileName } from "../phone-network.ts";
import { passed, toHtml, toMarkdown, type StepOutcome, type Summary } from "./report.ts";
import type { BrowserName, CheckResult, DeviceName, Guest, Rehearsal, Timing } from "./rehearsal.ts";
import { steps } from "./steps/index.ts";

const USAGE = "Usage: JOIN_SECRET=… ADMIN_SECRET=… npm run rehearse -- --base-url <url> [--browser chromium|webkit] [--guests 20] [--out <dir>]";
const PROFILES: ProfileName[] = ["good", "slow-4g", "bad-3g", "flaky"];
const DEVICES: DeviceName[] = ["iPhone 15", "Pixel 7"];
// The GIF shows the first phone to lock (bad 3G), the first clean drop (flaky) and the first phone to lose its cookie (good).
const FILMED = new Set([2, 3, 4]);
const LAPTOP = { width: 1440, height: 900 };

function usage(problem: string): never {
  console.error(`${problem}\n${USAGE}`);
  process.exit(2);
}

const { values: args } = parseArgs({
  options: { "base-url": { type: "string" }, browser: { type: "string", default: "chromium" }, guests: { type: "string", default: "20" }, out: { type: "string" } },
});
const baseUrl = args["base-url"] ?? usage("Missing --base-url.");
const browserName: BrowserName = args.browser === "chromium" || args.browser === "webkit" ? args.browser : usage(`Unknown --browser ${args.browser}.`);
const guestCount = Number(args.guests);
if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 40) usage("--guests must be a whole number from 1 to 40.");
const secrets = { join: process.env.JOIN_SECRET ?? usage("Set JOIN_SECRET."), admin: process.env.ADMIN_SECRET ?? usage("Set ADMIN_SECRET.") };
const startedAt = new Date();
const out = args.out ?? `artifacts/rehearsal-${startedAt.toISOString().slice(0, 19).replace(/[T:]/g, "-")}-${browserName}`;
const videoDir = `${out}/video-tmp`;
mkdirSync(`${out}/failures`, { recursive: true });

async function launch(name: BrowserName): Promise<Browser> {
  return name === "webkit" ? webkit.launch() : chromium.launch(chromiumLaunchOptions());
}

function phoneOptions(device: DeviceName) {
  const { defaultBrowserType: _, ...descriptor } = devices[device];
  return descriptor;
}

const checks: CheckResult[] = [];
const timings: Timing[] = [];
const notes: string[] = [];
let currentStep = "setup";
const firstLine = (e: unknown) =>
  (String(e instanceof Error ? e.message : e).replace(/\x1b\[[0-9;]*m/g, "").split("\n").find((l) => l.trim()) ?? "error")
    .replaceAll(secrets.join, "<JOIN_SECRET>")
    .replaceAll(secrets.admin, "<ADMIN_SECRET>");

async function check(label: string, run: () => Promise<unknown>, evidence?: Page): Promise<boolean> {
  const start = Date.now();
  try {
    await run();
    checks.push({ step: currentStep, label, ok: true, ms: Date.now() - start });
    return true;
  } catch (e) {
    // Checks fail concurrently and push only after their screenshot, so number the screenshots from their own counter.
    const screenshot = evidence && `failures/${String(++failureShots).padStart(3, "0")}-${currentStep}.png`;
    if (screenshot) await evidence.screenshot({ path: `${out}/${screenshot}` }).catch(() => {});
    checks.push({ step: currentStep, label, ok: false, ms: Date.now() - start, error: firstLine(e), ...(screenshot && { screenshot }) });
    console.log(`  ✘ ${label}: ${firstLine(e)}`);
    return false;
  }
}

const browser = await launch(browserName);
const adminContext = await browser.newContext({ baseURL: baseUrl, viewport: LAPTOP, recordVideo: { dir: videoDir, size: LAPTOP } });
const admin = await adminContext.newPage();
try {
  await openAdmin(admin, secrets.admin);
} catch (e) {
  console.error(`Could not open the admin view at ${baseUrl}: ${firstLine(e)}`);
  await browser.close();
  process.exit(1);
}
let failureShots = 0;
const baselineOnline = Number(/· (\d+) online/.exec((await admin.locator("#players-title").textContent()) ?? "")?.[1] ?? 0);
if ((await adminContext.request.get("/@vite/client")).ok()) {
  notes.push("The target is a Vite dev server, which serves the client as many unbundled modules, so page loads on slow profiles take far longer than on a deployed build.");
}
const runTag = Math.random().toString(36).slice(2, 5);

const guests: Guest[] = await Promise.all(
  Array.from({ length: guestCount }, async (_, i): Promise<Guest> => {
    const device = DEVICES[Math.floor(i / PROFILES.length) % DEVICES.length]!;
    const options = phoneOptions(device);
    const filmed = FILMED.has(i);
    const context: BrowserContext = await browser.newContext({ ...options, baseURL: baseUrl, ...(filmed && { recordVideo: { dir: videoDir, size: options.viewport } }) });
    const page = await context.newPage();
    const profile = PROFILES[i % PROFILES.length]!;
    return { name: `Gäst ${String(i + 1).padStart(2, "0")} ${runTag}`, profile, device, context, page, line: await shapeNetwork(context, page, profile), filmed };
  }),
);
const probeContext = await browser.newContext({ ...phoneOptions("Pixel 7"), baseURL: baseUrl });
const probe = { name: `Gäst prov ${runTag}`, page: await probeContext.newPage(), joined: false };
const cast = guests.map(({ name, profile, device }) => ({ name, profile, device }));

const rehearsal: Rehearsal = {
  baseUrl,
  browser: browserName,
  secrets,
  admin,
  guests,
  baselineOnline,
  probe,
  check,
  async time(kind, guest, run) {
    const start = Date.now();
    const ok = await check(`${guest.name} (${guest.profile}): ${kind}`, run, guest.page);
    timings.push({ step: currentStep, kind, guest: guest.name, profile: guest.profile, ms: Date.now() - start, ok });
    return ok;
  },
  note: (text) => void notes.push(text),
};

console.log(`Rehearsing against ${baseUrl} with ${guestCount} guests on ${browserName}; writing to ${out}`);
const outcomes: StepOutcome[] = [];
for (const step of steps) {
  if (outcomes.some((o) => o.outcome === "crashed")) {
    outcomes.push({ id: step.id, title: step.title, outcome: "not-run" });
    continue;
  }
  currentStep = step.id;
  console.log(`▶ ${step.id}: ${step.title}`);
  try {
    await step.run(rehearsal);
    outcomes.push({ id: step.id, title: step.title, outcome: "ran" });
  } catch (e) {
    await admin.screenshot({ path: `${out}/failures/crash-${step.id}-admin.png` }).catch(() => {});
    outcomes.push({ id: step.id, title: step.title, outcome: "crashed", error: firstLine(e) });
    console.log(`  ✘ step crashed: ${firstLine(e)}`);
  }
}

currentStep = "report";
const filmedPages = [admin, ...guests.filter((g) => g.filmed).map((g) => g.page)];
const videos = filmedPages.map((p) => p.video()!);
await Promise.all([adminContext.close(), probeContext.close(), ...guests.map((g) => g.context.close())]);
const clips = await Promise.all(
  videos.map(async (v, i) => {
    const path = `${out}/${i === 0 ? "admin" : `phone-${i}`}.webm`;
    renameSync(await v.path(), path);
    return path;
  }),
);
rmSync(videoDir, { recursive: true, force: true });

await check("GIF of the admin view and three phones", async () => {
  // Only the admin's player list changes during a rehearsal, so the GIF crops the laptop view to it.
  // Every clip ends when the contexts close together but starts when its page opened, so a shorter clip gets the difference padded at its start.
  const durations = clips.map((c) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", c], { encoding: "utf8" })));
  const scaled = clips
    .map((_, i) => {
      const lead = i === 0 ? "crop=740:900:700:0," : `tpad=start_duration=${Math.max(0, durations[0]! - durations[i]!)}:start_mode=clone,`;
      return `[${i}:v]${lead}scale=-2:420,pad=iw+12:ih:6:0:white[v${i}]`;
    })
    .join(";");
  const stacked = clips.length > 1 ? `${clips.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${clips.length}:shortest=1,` : "[v0]";
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    ...clips.flatMap((c) => ["-i", c]),
    "-filter_complex", `${scaled};${stacked}setpts=PTS/3,fps=5,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
    `${out}/rehearsal.gif`,
  ]);
});

const summary: Summary = { target: baseUrl, browser: browserName, startedAt, ms: Date.now() - startedAt.getTime(), cast, steps: outcomes, checks, timings, notes };
writeFileSync(`${out}/report.json`, JSON.stringify(summary, null, 2));
writeFileSync(`${out}/report.md`, toMarkdown(summary));
writeFileSync(`${out}/report.html`, toHtml(summary));
const reportPage = await (await browser.newContext({ viewport: { width: 1100, height: 600 } })).newPage();
await reportPage.setContent(toHtml(summary));
await reportPage.screenshot({ path: `${out}/report.png`, fullPage: true });
await browser.close();

const failed = checks.filter((c) => !c.ok).length;
console.log(`${passed(summary) ? "PASS" : "FAIL"}: ${checks.length - failed} of ${checks.length} checks passed. Report: ${out}/report.md`);
process.exit(passed(summary) ? 0 : 1);
