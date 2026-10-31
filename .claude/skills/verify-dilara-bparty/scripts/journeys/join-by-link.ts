#!/usr/bin/env node
import { expect } from "@playwright/test";
import { greeting, onlineDot, openAdmin } from "../../../../../e2e/drive.ts";
import { openVerify, readSecrets, redact, repoRoot } from "../verify.ts";

const [baseUrl, out = `${repoRoot}artifacts/verify/join-by-link-${Date.now()}`] = process.argv.slice(2);
if (!baseUrl) {
  console.error("Usage: node .claude/skills/verify-dilara-bparty/scripts/journeys/join-by-link.ts <base-url> [evidence-dir]");
  process.exit(2);
}

const secrets = readSecrets();
const name = `Testgäst ${Math.random().toString(36).slice(2, 6)}`;
const v = await openVerify(baseUrl, out);
try {
  const admin = await v.laptop();
  await openAdmin(admin, secrets.admin);
  await expect(onlineDot(admin, name)).toHaveCount(0);
  await v.evidence(admin, "01-admin-before");

  const { page } = await v.phone();
  await page.goto(`/j/${secrets.join}`);
  await expect(page.getByRole("heading", { name: "Dilara fyller 3!" })).toBeVisible();
  await page.getByLabel("Vad heter du?").fill(name);
  await v.evidence(page, "02-landing-name-typed");

  await page.getByRole("button", { name: "Gå med" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(greeting(page, name)).toBeVisible();
  await v.evidence(page, "03-guest-shell");

  await expect(onlineDot(admin, name)).toBeVisible();
  await v.evidence(admin, "04-admin-sees-guest-live");

  await page.goto(`/j/${secrets.join}`);
  await expect(page).toHaveURL(/\/app$/);
  await expect(greeting(page, name)).toBeVisible();
  await v.evidence(page, "05-join-link-again-goes-to-app");

  console.log(`PASS join-by-link: "${name}" joined, the admin saw them live, and the cookie held. Evidence: ${out}`);
} catch (e) {
  console.error(`FAIL join-by-link: ${redact(String(e instanceof Error ? e.message : e), secrets)}\nEvidence so far: ${out}`);
  process.exitCode = 1;
} finally {
  await v.close();
}
