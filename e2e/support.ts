import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
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
