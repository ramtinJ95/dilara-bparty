import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { secrets } from "./server";

// vite dev takes the Worker's secrets from .dev.vars when it exists, and from the environment the config passes otherwise.
const devVars = existsSync(".dev.vars") ? parseEnv(readFileSync(".dev.vars", "utf8")) : {};
const join = devVars.JOIN_SECRET ?? secrets.join;
const admin = devVars.ADMIN_SECRET ?? secrets.admin;

test("the dev server renders the admin and guest pages", async ({ page }) => {
  await page.goto(`/admin/${admin}`);
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await page.goto(`/j/${join}`);
  await expect(page.getByRole("heading", { name: "Dilara fyller 3!" })).toBeVisible();
});
