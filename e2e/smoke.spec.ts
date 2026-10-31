import { expect, test, type Browser, type Page } from "@playwright/test";
import { LOOKS, placeholder, pngFile } from "./placeholder";
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

async function joinedPhone(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext(phone);
  const res = await context.request.post("/api/join", { data: { secret: secrets.join, name } });
  expect(await res.json()).toEqual({ status: "joined" });
  const page = await context.newPage();
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: `Hej, ${name}!` })).toBeVisible();
  return page;
}

test("a guest uploads a photo, another guest votes for it, and the admin sees the tally", async ({ browser }) => {
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const admin = await adminContext.newPage();
  await adminPage(admin);

  const uploader = await joinedPhone(browser, "Fotogäst");
  await uploader.getByRole("button", { name: "Mitt foto" }).click();
  await uploader.locator('input[type="file"]').setInputFiles(pngFile("snow", await placeholder(uploader, LOOKS.snow)));
  await expect(uploader.getByText("Inga röster än")).toBeVisible();
  await expect(uploader.getByRole("button", { name: "Byt bild" })).toBeVisible();

  const voter = await joinedPhone(browser, "Röstgäst");
  await voter.getByRole("button", { name: "Galleri" }).click();
  await expect(voter.getByText("3 av 3 röster kvar")).toBeVisible();
  await expect(voter.locator(".gallery .tile")).toHaveCount(1);
  await voter.getByRole("button", { name: "Ge en röst" }).click();
  await expect(voter.getByText("2 av 3 röster kvar")).toBeVisible();
  await expect(voter.getByLabel("Dina röster: 1")).toBeVisible();

  await expect(uploader.getByText("Din bild har 1 röst")).toBeVisible();
  const row = admin.locator(".tally li", { hasText: "Fotogäst" });
  await expect(row).toContainText("1 vote");
  await expect(row.locator(".rank")).toHaveText("1");
  await expect(admin.locator(".versions li")).toHaveCount(1);

  await Promise.all([adminContext.close(), uploader.context().close(), voter.context().close()]);
});
