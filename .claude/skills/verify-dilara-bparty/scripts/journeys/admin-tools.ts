#!/usr/bin/env node
import { expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { adminRow, greeting, joinByCode, joinByLink, onlineDot, openAdmin, renameFromAdmin } from "../../../../../e2e/drive.ts";
import { LOOKS, placeholder, pngFile } from "../../../../../e2e/placeholder.ts";
import { openVerify, readSecrets, redact, repoRoot } from "../verify.ts";

const [baseUrl, out = `${repoRoot}artifacts/verify/admin-tools-${Date.now()}`] = process.argv.slice(2);
if (!baseUrl) {
  console.error("Usage: node .claude/skills/verify-dilara-bparty/scripts/journeys/admin-tools.ts <base-url> [evidence-dir]");
  process.exit(2);
}

const SEE = { timeout: 15_000 };
const secrets = readSecrets();
const tag = Math.random().toString(36).slice(2, 6);
const [nameA, nameB, nameC] = ["A", "B", "C"].map((l) => `Testgäst ${tag} ${l}`) as [string, string, string];
const v = await openVerify(baseUrl, out);
try {
  const admin = await v.laptop();
  await openAdmin(admin, secrets.admin);
  await expect(admin.getByText("Nobody has joined yet.")).toBeVisible();

  const card = admin.locator(".landing-photo");
  await card.locator('input[type="file"]').setInputFiles(pngFile("snow", await placeholder(admin, LOOKS.snow)));
  const preview = admin.getByAltText("Current landing photo");
  await expect(preview).toBeVisible(SEE);
  await expect(card.getByRole("button", { name: "Replace photo" })).toBeVisible();
  await v.evidence(admin, "01-admin-landing-photo");
  const src = (await preview.getAttribute("src"))!;
  const id = src.split("/").pop()!;

  const { page: landing } = await v.phone();
  await landing.goto(`/j/${secrets.join}`);
  await expect(landing.getByAltText("Dilara")).toHaveAttribute("src", `/j/${secrets.join}/photos/${id}`);
  await v.evidence(landing, "02-phone-landing-with-photo");
  const blank = await landing.getByLabel("Vad heter du?").fill("   ").then(() => landing.getByRole("button", { name: "Gå med" }).isDisabled());
  expect(blank, "a blank name keeps Gå med disabled").toBe(true);
  await landing.getByLabel("Vad heter du?").fill("a\u0007b");
  await landing.getByRole("button", { name: "Gå med" }).click();
  await expect(landing.getByRole("alert")).toHaveText("Namnet innehåller tecken som inte fungerar.");
  await landing.getByLabel("Vad heter du?").fill(nameA);
  await landing.getByRole("button", { name: "Gå med" }).click();
  await expect(greeting(landing, nameA)).toBeVisible(SEE);

  const record: Record<string, unknown>[] = [];
  const probe = async (label: string, request: { get(url: string, o?: object): Promise<import("@playwright/test").APIResponse> }, url: string, headers?: Record<string, string>) => {
    const res = await request.get(url, headers && { headers });
    const h = res.headers();
    record.push({ label, path: redact(url, secrets), status: res.status(), contentType: h["content-type"], cacheControl: h["cache-control"], etag: h.etag });
    return res;
  };
  const guestRes = await probe("guest", landing.request, src);
  expect(guestRes.status()).toBe(200);
  expect(guestRes.headers()["content-type"]).toBe("image/jpeg");
  expect(guestRes.headers()["cache-control"]).toBe("private, max-age=31536000, immutable");
  expect(guestRes.headers().etag).toBe(`"${id}"`);
  expect((await probe("guest, revalidated", landing.request, src, { "if-none-match": `"${id}"` })).status()).toBe(304);
  expect((await probe("admin", admin.request, src)).status()).toBe(200);
  const { page: anon } = await v.phone();
  expect((await probe("no cookie", anon.request, src)).status()).toBe(401);
  expect((await probe("unknown id", landing.request, "/photos/AAAAAAAAAAAAAAAAAAAAAA")).status()).toBe(404);
  expect((await probe("landing link, no cookie", anon.request, `/j/${secrets.join}/photos/${id}`)).status()).toBe(200);
  expect((await probe("landing link, wrong secret", anon.request, `/j/not-the-secret/photos/${id}`)).status()).toBe(404);
  writeFileSync(`${out}/photo-route.json`, JSON.stringify(record, null, 2));

  const code = (await admin.locator(".code").textContent())!;
  await anon.goto("/");
  await anon.getByLabel("Kod").fill("AAA 222");
  await anon.getByRole("button", { name: "Fortsätt" }).click();
  await expect(anon.getByRole("alert")).toHaveText("Fel kod, försök igen.");
  await joinByCode(anon, code.toLowerCase().replace(" ", "-"), nameB);
  await expect(greeting(anon, nameB)).toBeVisible(SEE);
  const pageB = anon;
  await expect(onlineDot(admin, nameB)).toBeVisible();

  await renameFromAdmin(admin, nameB, `${nameB} ny`);
  await expect(greeting(pageB, `${nameB} ny`)).toBeVisible(SEE);
  await adminRow(admin, `${nameB} ny`).getByRole("button", { name: "Rename" }).click();
  await admin.getByLabel(`New name for ${nameB} ny`).fill(nameA);
  await admin.getByRole("button", { name: "Save" }).click();
  await expect(admin.getByRole("alert")).toHaveText(`"${nameA}" is already taken, possibly by a merged duplicate.`);
  await v.evidence(admin, "03-admin-rename-taken");
  await admin.keyboard.press("Escape");

  await adminRow(admin, nameA).getByRole("button", { name: "Merge…" }).click();
  await admin.getByLabel("Choose the player to keep…").selectOption({ label: `${nameB} ny` });
  await expect(admin.getByText(`“${nameA}” disappears and everything of theirs moves to “${nameB} ny”. This can't be undone.`)).toBeVisible();
  await v.evidence(admin, "04-admin-merge-warning");
  await admin.getByRole("button", { name: "Confirm merge" }).click();
  await expect(adminRow(admin, nameA)).toHaveCount(0, SEE);
  await expect(greeting(landing, `${nameB} ny`)).toBeVisible(SEE);

  const { page: lost } = await v.phone();
  await joinByLink(lost, secrets.join, nameA.toLowerCase());
  await expect(lost.getByRole("heading", { name: "Är det du?" })).toBeVisible(SEE);
  await expect(lost.locator("strong")).toHaveText(`${nameB} ny`);
  await v.evidence(lost, "05-phone-reclaim-merged");
  await lost.getByRole("button", { name: "Nej, byt namn" }).click();
  await expect(lost.getByLabel("Vad heter du?")).toBeFocused();
  await lost.getByLabel("Vad heter du?").fill(nameC);
  await lost.getByRole("button", { name: "Gå med" }).click();
  await expect(greeting(lost, nameC)).toBeVisible(SEE);
  await expect(admin.locator("#players-title")).toContainText(/^Players\s*2/);

  await card.getByRole("button", { name: "Remove" }).click();
  await expect(card.getByText("No photo yet")).toBeVisible(SEE);
  const { page: after } = await v.phone();
  await after.goto(`/j/${secrets.join}`);
  await expect(after.getByRole("heading", { name: "Dilara fyller 3!" })).toBeVisible();
  await expect(after.getByAltText("Dilara")).toHaveCount(0);
  await v.evidence(after, "06-phone-landing-without-photo");

  console.log(`PASS admin-tools: landing photo, photo route, join by code and name rules, rename, merge and reclaim. Evidence: ${out}`);
} catch (e) {
  console.error(`FAIL admin-tools: ${redact(String(e instanceof Error ? e.message : e), secrets)}\nEvidence so far: ${out}`);
  process.exitCode = 1;
} finally {
  await v.close();
}
