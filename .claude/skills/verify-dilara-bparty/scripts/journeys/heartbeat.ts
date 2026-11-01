#!/usr/bin/env node
import { expect } from "@playwright/test";
import { greeting, joinByLink, onlineDot, openAdmin, renameFromAdmin, setFastHeartbeat } from "../../../../../e2e/drive.ts";
import { openVerify, readSecrets, redact, repoRoot } from "../verify.ts";

const [baseUrl, out = `${repoRoot}artifacts/verify/heartbeat-${Date.now()}`] = process.argv.slice(2);
if (!baseUrl) {
  console.error("Usage: node .claude/skills/verify-dilara-bparty/scripts/journeys/heartbeat.ts <base-url> [evidence-dir]");
  process.exit(2);
}

// HEARTBEATS in src/shared/protocol.ts: the phone gives up after 11 s without a tick on fast, 70 s on slow.
const FAST_SILENT_MS = 11_000;
const SLOW_SILENT_MS = 70_000;

const secrets = readSecrets();
const tag = Math.random().toString(36).slice(2, 6);
const names = [`Testgäst ${tag}`, `Testgäst ${tag} snabb`, `Testgäst ${tag} lugn`];
const v = await openVerify(baseUrl, out);
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
try {
  const admin = await v.laptop();
  await openAdmin(admin, secrets.admin);
  const state = admin.locator("header .toggle .state");
  await expect(state).toHaveText("Fast heartbeat off");
  const { page, line } = await v.phone("flaky");
  await joinByLink(page, secrets.join, names[0]!);
  await expect(greeting(page, names[0]!)).toBeVisible({ timeout: 15_000 });

  await setFastHeartbeat(admin, true);
  await v.evidence(admin, "01-admin-fast-heartbeat-on");
  await line!.cut("silent");
  const fastCut = Date.now();
  await renameFromAdmin(admin, names[0]!, names[1]!);
  await page.waitForTimeout(2_000);
  await expect(onlineDot(admin, names[1]!)).toBeVisible();
  await expect(greeting(page, names[0]!)).toBeVisible();
  await v.evidence(admin, "02-admin-still-online-during-silent-cut");
  await line!.restore();
  await expect(greeting(page, names[1]!)).toBeVisible({ timeout: FAST_SILENT_MS + 15_000 });
  const fast = Date.now() - fastCut;
  await v.evidence(page, "03-phone-caught-up-fast");

  await setFastHeartbeat(admin, false);
  // The phone learns the mode from the next snapshot, which has to arrive before the cut.
  await page.waitForTimeout(2_000);
  await line!.cut("silent");
  const slowCut = Date.now();
  await renameFromAdmin(admin, names[1]!, names[2]!);
  await page.waitForTimeout(FAST_SILENT_MS + 8_000);
  await expect(greeting(page, names[1]!), "with the slow heartbeat the phone is still stale after the fast timeout").toBeVisible();
  await v.evidence(page, "04-phone-still-stale-on-slow");
  // restore() turns the context online, and the page's online event makes a slow-heartbeat phone ping once.
  await line!.restore();
  const restored = Date.now();
  await expect(greeting(page, names[2]!)).toBeVisible({ timeout: 15_000 });
  const afterRestore = Date.now() - restored;
  expect(Date.now() - slowCut).toBeLessThan(SLOW_SILENT_MS);
  await v.evidence(page, "05-phone-caught-up-after-online");

  console.log(`PASS heartbeat: fast mode caught a silent drop ${seconds(fast)} after the cut; slow mode was still stale ${seconds(restored - slowCut)} into the cut and caught up ${seconds(afterRestore)} after the network came back. Evidence: ${out}`);
} catch (e) {
  console.error(`FAIL heartbeat: ${redact(String(e instanceof Error ? e.message : e), secrets)}\nEvidence so far: ${out}`);
  process.exitCode = 1;
} finally {
  await v.close();
}
