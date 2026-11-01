import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { secrets, serverEnv } from "./server";

// vite dev takes the Worker's secrets from .dev.vars when it exists, and from the environment passed below otherwise.
const devVars = existsSync(".dev.vars") ? parseEnv(readFileSync(".dev.vars", "utf8")) : {};
const join = devVars.JOIN_SECRET ?? secrets.join;
const admin = devVars.ADMIN_SECRET ?? secrets.admin;

// Started here rather than as a config webServer, which would run beside the network tests and starve a 4 GB pylon of memory.
let server: ChildProcess | undefined;

const serving = (url: URL) => fetch(new URL("/robots.txt", url), { signal: AbortSignal.timeout(2_000) }).then((r) => r.ok, () => false);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const signalGroup = (pid: number, signal: NodeJS.Signals | 0) => {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    return false;
  }
};
const groupGone = async (pid: number, ms: number) => {
  for (const deadline = Date.now() + ms; Date.now() < deadline; await sleep(200)) if (!signalGroup(pid, 0)) return true;
  return false;
};
let tornDown = false;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  const url = new URL(testInfo.project.use.baseURL!);
  if (await serving(url)) throw new Error(`Something already serves ${url.origin}; the dev test needs its own vite dev there.`);
  if (tornDown) return;
  server = spawn("npx", ["vite", "dev", "--port", url.port, "--strictPort", "--host", url.hostname], {
    detached: true,
    stdio: "ignore",
    env: { ...serverEnv, JOIN_SECRET: secrets.join, ADMIN_SECRET: secrets.admin },
  });
  for (const deadline = Date.now() + 110_000; !(await serving(url)); await sleep(500)) {
    if (server.exitCode !== null || server.signalCode !== null) throw new Error(`vite dev exited (${server.exitCode ?? server.signalCode}) before it served ${url.origin}.`);
    if (Date.now() > deadline) throw new Error(`vite dev did not serve ${url.origin} within 110 s.`);
  }
});

// Waits for the whole process group, so the network tests that follow get the memory back.
test.afterAll(async () => {
  tornDown = true;
  const pid = server?.pid;
  if (!pid || !signalGroup(pid, "SIGTERM") || (await groupGone(pid, 10_000))) return;
  signalGroup(pid, "SIGKILL");
  await groupGone(pid, 5_000);
});

test("the dev server renders the admin and guest pages", async ({ page }) => {
  await page.goto(`/admin/${admin}`);
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await page.goto(`/j/${join}`);
  await expect(page.getByRole("heading", { name: "Dilara fyller 3!" })).toBeVisible();
});

test("the dev server serves the design lab", async ({ page }) => {
  await page.goto("/lab/");
  await expect(page.getByRole("link", { name: /Aurora glass/ })).toBeVisible();
  await expect(page.locator(".lab-list a")).toHaveCount(10);
  await page.goto("/lab/aurora");
  await expect(page.locator(".lab-frames iframe")).toHaveCount(5);
});
