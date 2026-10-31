import { expect, type Locator, type Page } from "@playwright/test";

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
