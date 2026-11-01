import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { laptop, openAdmin as driveOpenAdmin, phone } from "./drive";
import { secrets } from "./server";

export { laptop, phone };

export async function openAdmin(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await driveOpenAdmin(page, secrets.admin);
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
