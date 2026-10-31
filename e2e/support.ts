import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { pngFile } from "./placeholder";
import { secrets } from "./server";

export const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
export const laptop = { viewport: { width: 1440, height: 900 } };

export async function openAdmin(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/admin/${secrets.admin}`);
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  return page;
}

// Reclaiming lets a later test pick up a placeholder guest an earlier one created.
export async function joinViaApi(browser: Browser, name: string, options: Parameters<Browser["newContext"]>[0] = phone): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  const res = await context.request.post("/api/join", { data: { secret: secrets.join, name, reclaim: true } });
  expect(await res.json()).toEqual({ status: "joined" });
  return context;
}

export async function openShell(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /^Hej, .+!$/ })).toBeVisible();
  return page;
}

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
  await expect(guest.getByText("Svar skickat!")).toBeVisible();
}
