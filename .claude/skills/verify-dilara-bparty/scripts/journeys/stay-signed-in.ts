#!/usr/bin/env node
import { expect } from "@playwright/test";
import { greeting, joinByLink, openAdmin } from "../../../../../e2e/drive.ts";
import { openVerify, readSecrets, redact, repoRoot } from "../verify.ts";

const [baseUrl, out = `${repoRoot}artifacts/verify/stay-signed-in-${Date.now()}`] = process.argv.slice(2);
if (!baseUrl) {
  console.error("Usage: node .claude/skills/verify-dilara-bparty/scripts/journeys/stay-signed-in.ts <base-url> [evidence-dir]");
  process.exit(2);
}

const secrets = readSecrets();
const name = `Testgäst ${Math.random().toString(36).slice(2, 6)}`;
const v = await openVerify(baseUrl, out);
try {
  const { page } = await v.phone();
  await joinByLink(page, secrets.join, name);
  await expect(greeting(page, name)).toBeVisible();
  const saved = await page.evaluate(() => localStorage.getItem("pid"));
  expect(saved, "the app saves the signed identity").toMatch(/^[\w-]+\.[\w-]+$/);
  expect(saved).not.toContain(secrets.join);

  for (const path of ["/app", "/", `/j/${secrets.join}`]) {
    await page.context().clearCookies();
    await page.goto(path);
    await expect(page, `without the cookie, ${path} gets back to the app`).toHaveURL(/\/app$/);
    await expect(greeting(page, name)).toBeVisible();
  }
  await v.evidence(page, "01-back-in-without-the-code");

  await page.goto("/");
  await expect(page, "with the cookie, / goes to the app").toHaveURL(/\/app$/);

  const admin = await v.laptop();
  await openAdmin(admin, secrets.admin);
  const end = admin.locator(".party-end");
  await end.getByRole("button", { name: "Reset party…" }).click();
  await end.getByLabel("Type RESET to confirm").fill("RESET");
  await end.getByRole("button", { name: "Yes, reset the party" }).click();
  await expect(page, "the reset sends the phone to the bare page").toHaveURL(/\/$/);
  await page.reload();
  await expect(page.getByLabel("Kod"), "and it stays there").toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("pid"))).toBeNull();
  await v.evidence(page, "02-after-reset-stays-on-bare-page");

  console.log(`PASS stay-signed-in: "${name}" got back in from /app, / and the join link without the cookie, and stayed out after the reset. Evidence: ${out}`);
} catch (e) {
  console.error(`FAIL stay-signed-in: ${redact(String(e instanceof Error ? e.message : e), secrets)}\nEvidence so far: ${out}`);
  process.exitCode = 1;
} finally {
  await v.close();
}
