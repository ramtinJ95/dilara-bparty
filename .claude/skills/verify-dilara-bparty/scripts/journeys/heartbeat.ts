#!/usr/bin/env node
import { expect } from "@playwright/test";
import { greeting, heartbeatState, joinByLink, onlineDot, openAdmin, reconnecting, renameFromAdmin, setFastHeartbeat } from "../../../../../e2e/drive.ts";
import { openVerify, readSecrets, redact, repoRoot } from "../verify.ts";

const [baseUrl, out = `${repoRoot}artifacts/verify/heartbeat-${Date.now()}`] = process.argv.slice(2);
if (!baseUrl) {
  console.error("Usage: node .claude/skills/verify-dilara-bparty/scripts/journeys/heartbeat.ts <base-url> [evidence-dir]");
  process.exit(2);
}

// HEARTBEATS in src/shared/protocol.ts: on the fast heartbeat the phone gives up after 11 s without a tick, on the slow one after 70 s.
const FAST_SILENT_MS = 11_000;

const secrets = readSecrets();
const tag = Math.random().toString(36).slice(2, 6);
const names = ["", " ett", " två", " tre", " fyra"].map((suffix) => `Testgäst ${tag}${suffix}`);
const v = await openVerify(baseUrl, out);
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
try {
  const admin = await v.laptop();
  await openAdmin(admin, secrets.admin);
  await expect(heartbeatState(admin)).toHaveText("Fast heartbeat off");
  const { page, line } = await v.phone("flaky");
  await joinByLink(page, secrets.join, names[0]!);
  await expect(greeting(page, names[0]!)).toBeVisible({ timeout: 15_000 });
  // Each snapshot carries the mode, so a phone that shows a rename made after the toggle has the new mode.
  const switchTo = async (fast: boolean, from: string, to: string) => {
    await setFastHeartbeat(admin, fast);
    await renameFromAdmin(admin, from, to);
    await expect(greeting(page, to)).toBeVisible({ timeout: 15_000 });
  };

  await switchTo(true, names[0]!, names[1]!);
  await v.evidence(admin, "01-admin-fast-heartbeat-on");
  await line!.cut("silent");
  const fastCut = Date.now();
  await expect(reconnecting(page), "with the fast heartbeat the phone gives up on its own").toBeVisible({ timeout: FAST_SILENT_MS + 5_000 });
  const fastNoticed = Date.now() - fastCut;
  expect(fastNoticed, "the phone noticed the silence, not an instant close").toBeGreaterThan(FAST_SILENT_MS - 4_000);
  await expect(onlineDot(admin, names[1]!), "the server still counts the silent phone online").toBeVisible();
  await v.evidence(page, "02-phone-reconnecting-fast");
  await renameFromAdmin(admin, names[1]!, names[2]!);
  await line!.restore();
  await expect(greeting(page, names[2]!)).toBeVisible({ timeout: 15_000 });

  await switchTo(false, names[2]!, names[3]!);
  await line!.cut("silent");
  await page.waitForTimeout(FAST_SILENT_MS + 8_000);
  await expect(reconnecting(page), "with the slow heartbeat the phone still trusts its socket after the fast timeout").toHaveCount(0);
  await v.evidence(page, "03-phone-still-trusting-slow");
  await renameFromAdmin(admin, names[3]!, names[4]!);
  // restore() turns the context online, and the page's online event makes a slow-heartbeat phone ping once.
  await line!.restore();
  const restored = Date.now();
  await expect(greeting(page, names[4]!)).toBeVisible({ timeout: 15_000 });
  const afterRestore = Date.now() - restored;
  await v.evidence(page, "04-phone-caught-up-after-online");

  console.log(`PASS heartbeat: fast mode noticed a silent drop after ${seconds(fastNoticed)}; slow mode still trusted its socket ${seconds(FAST_SILENT_MS + 8_000)} into the cut and caught up ${seconds(afterRestore)} after the network came back. Evidence: ${out}`);
} catch (e) {
  console.error(`FAIL heartbeat: ${redact(String(e instanceof Error ? e.message : e), secrets)}\nEvidence so far: ${out}`);
  process.exitCode = 1;
} finally {
  await v.close();
}
