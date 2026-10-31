import { chromium, expect, type LaunchOptions, type Locator, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { pngFile } from "./placeholder.ts";

// Playwright's own Chromium download is blocked on the pylon, so fall back to Debian's.
export function chromiumLaunchOptions(): LaunchOptions {
  const system = existsSync(chromium.executablePath()) ? undefined : ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
  return system ? { executablePath: system } : {};
}

export const adminRow = (admin: Page, name: string): Locator => admin.locator(".players li").filter({ has: admin.getByText(name, { exact: true }) });
export const onlineDot = (admin: Page, name: string): Locator => adminRow(admin, name).locator(".dot.on");
export const greeting = (phone: Page, name: string): Locator => phone.getByRole("heading", { name: `Hej, ${name}!`, exact: true });
export const reconnecting = (phone: Page): Locator => phone.getByRole("status").filter({ hasText: "Återansluter…" });

export async function openAdmin(admin: Page, adminSecret: string): Promise<void> {
  await admin.goto(`/admin/${adminSecret}`);
  await expect(admin.getByText("Live", { exact: true })).toBeVisible();
}

export async function joinByLink(phone: Page, joinSecret: string, name: string): Promise<void> {
  await phone.goto(`/j/${joinSecret}`);
  await phone.getByLabel("Vad heter du?").fill(name);
  await phone.getByRole("button", { name: "Gå med" }).click();
}

export async function renameFromAdmin(admin: Page, from: string, to: string): Promise<void> {
  await adminRow(admin, from).getByRole("button", { name: "Rename" }).click();
  await admin.getByLabel(`New name for ${from}`).fill(to);
  await admin.getByRole("button", { name: "Save" }).click();
  await expect(adminRow(admin, to)).toBeVisible();
}

export async function joinByCode(phone: Page, code: string, name: string): Promise<void> {
  await phone.goto("/");
  await phone.getByLabel("Kod").fill(code);
  await phone.getByRole("button", { name: "Fortsätt" }).click();
  await phone.getByLabel("Vad heter du?").fill(name);
  await phone.getByRole("button", { name: "Gå med" }).click();
}

export const guestsHere = (n: number) => (n === 1 ? "1 gäst här just nu" : `${n} gäster här just nu`);

export type QuestionSpec = { text: string; seconds?: number; photo?: Buffer } & (
  | { kind: "choice"; options: string[]; correct: number }
  | { kind: "number"; answer: string }
);

export async function fillQuestion(admin: Page, q: QuestionSpec) {
  await admin.getByRole("button", { name: q.kind === "choice" ? "+ Multiple choice" : "+ Closest number" }).click();
  const form = admin.locator(".questions form.editor");
  await form.getByLabel("Question", { exact: true }).fill(q.text);
  if (q.kind === "choice") {
    for (const [i, option] of q.options.entries()) {
      if (i >= 2) await form.getByRole("button", { name: "+ Add option" }).click();
      await form.getByLabel(`Option ${"ABCD"[i]}`, { exact: true }).fill(option);
    }
    await form.getByLabel(`Option ${"ABCD"[q.correct]} is correct`).check();
  } else {
    await form.getByLabel("Correct answer").fill(q.answer);
  }
  if (q.seconds) await form.getByLabel("Seconds").fill(String(q.seconds));
  if (q.photo) {
    await form.getByLabel("Question photo file").setInputFiles(pngFile("question", q.photo));
    await expect(form.getByAltText("Question photo")).toBeVisible();
  }
  return form;
}

export async function addQuestion(admin: Page, q: QuestionSpec) {
  const form = await fillQuestion(admin, q);
  await form.getByRole("button", { name: "Save question" }).click();
  await expect(admin.locator(".questions > ol > li", { hasText: q.text })).toBeVisible();
}

export async function answer(guest: Page, pick: string, afterMs = 0) {
  await expect(guest.locator(".choices, .guess")).toBeVisible();
  if (afterMs) await guest.waitForTimeout(afterMs);
  if (await guest.locator(".guess").isVisible()) {
    await guest.getByLabel("Din gissning").fill(pick);
    await guest.getByRole("button", { name: "Skicka" }).click();
  } else {
    await guest.locator(".choice", { hasText: pick }).click();
  }
  // The last answer closes the round, so the server's confirmation can arrive as the closed screen instead.
  await expect(guest.getByText("Svar skickat!").or(guest.getByText("Väntar på rätt svar …"))).toBeVisible();
}

export const unlockPopup = (phone: Page): Locator => phone.getByRole("dialog", { name: "Quizet har börjat!" });
