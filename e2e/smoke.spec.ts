import { expect, test, type Page } from "@playwright/test";
import { secrets } from "./server";

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function adminPage(page: Page) {
  await page.goto(`/admin/${secrets.admin}`);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
}

test("a guest finds the party by code, joins, and shows up live for the admin", async ({ browser }) => {
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const admin = await adminContext.newPage();
  await adminPage(admin);
  const code = (await admin.locator(".code").textContent())!;
  await expect(admin.getByText("Nobody has joined yet.")).toBeVisible();

  const guestContext = await browser.newContext(phone);
  const guest = await guestContext.newPage();
  await guest.goto("/");
  await expect(guest.locator("body")).not.toContainText("Dilara");

  await guest.getByLabel("Kod").fill("AAA 222");
  await guest.getByRole("button", { name: "Fortsätt" }).click();
  await expect(guest.getByRole("alert")).toHaveText("Fel kod, försök igen.");

  await guest.getByLabel("Kod").fill(code.toLowerCase());
  await guest.getByRole("button", { name: "Fortsätt" }).click();
  await expect(guest).toHaveURL(new RegExp(`/j/${secrets.join}$`));
  await expect(guest.getByRole("heading", { name: "Dilara fyller 3!" })).toBeVisible();

  await guest.getByLabel("Vad heter du?").fill("Testgäst");
  await guest.getByRole("button", { name: "Gå med" }).click();
  await expect(guest).toHaveURL(/\/app$/);
  await expect(guest.getByRole("heading", { name: "Hej, Testgäst!" })).toBeVisible();

  await expect(guest.getByRole("heading", { name: "Quizet är inte öppet än" })).toBeVisible();
  await guest.getByRole("button", { name: "Mitt foto" }).click();
  await expect(guest).toHaveURL(/#mitt-foto$/);
  await expect(guest.getByRole("heading", { name: "Mitt foto" })).toBeVisible();
  await guest.getByRole("button", { name: "Galleri" }).click();
  await expect(guest.getByRole("heading", { name: "Galleri" })).toBeVisible();
  await guest.reload();
  await expect(guest.getByRole("button", { name: "Galleri" })).toHaveAttribute("aria-current", "page");

  const row = admin.locator(".players li", { hasText: "Testgäst" });
  await expect(row.locator(".dot.on")).toBeVisible();
  await guestContext.close();
  await expect(row.locator(".dot.on")).toHaveCount(0);
  await expect(row.locator(".dot")).toBeVisible();
  await adminContext.close();
});

test("the bare page stays neutral for a joined guest and wrong links look like nothing", async ({ browser }) => {
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  await page.goto(`/j/${secrets.join}`);
  await page.getByLabel("Vad heter du?").fill("Astrid");
  await page.getByRole("button", { name: "Gå med" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto("/");
  await expect(page.getByLabel("Kod")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Dilara");

  const wrong = await page.goto("/j/not-the-secret");
  expect(wrong?.status()).toBe(404);
  expect((await page.goto("/guest.html"))?.status()).toBe(404);
  const robots = await page.goto("/robots.txt");
  expect(await robots?.text()).toContain("Disallow: /");
  expect(robots?.headers()["x-robots-tag"]).toContain("noindex");
  await context.close();
});
