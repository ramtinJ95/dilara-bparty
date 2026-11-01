import { chromium, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromiumLaunchOptions, laptop, phone, redact } from "../../../../e2e/drive.ts";
import { shapeNetwork, type Line, type ProfileName } from "../../../../e2e/phone-network.ts";

export const repoRoot = new URL("../../../../", import.meta.url).pathname;
export { redact };

export function readSecrets(): { join: string; admin: string } {
  const path = `${repoRoot}.dev.vars`;
  const file: Record<string, string> = existsSync(path)
    ? Object.fromEntries(
        readFileSync(path, "utf8")
          .split("\n")
          .filter((line) => /^[A-Z_]+=/.test(line))
          .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
      )
    : {};
  const join = process.env.JOIN_SECRET ?? file.JOIN_SECRET;
  const admin = process.env.ADMIN_SECRET ?? file.ADMIN_SECRET;
  if (!join || !admin) throw new Error("Set JOIN_SECRET and ADMIN_SECRET, or create .dev.vars from .dev.vars.example.");
  return { join, admin };
}

export async function openVerify(baseUrl: string, evidenceDir: string) {
  mkdirSync(evidenceDir, { recursive: true });
  const browser = await chromium.launch(chromiumLaunchOptions());
  return {
    async phone(profile?: ProfileName): Promise<{ page: Page; line: Line | null }> {
      const context = await browser.newContext({ ...phone, baseURL: baseUrl });
      const page = await context.newPage();
      return { page, line: profile ? await shapeNetwork(context, page, profile) : null };
    },
    async laptop(): Promise<Page> {
      return (await browser.newContext({ ...laptop, baseURL: baseUrl })).newPage();
    },
    async evidence(page: Page, name: string): Promise<void> {
      await page.screenshot({ path: `${evidenceDir}/${name}.png` });
      writeFileSync(`${evidenceDir}/${name}.aria.yml`, await page.locator("body").ariaSnapshot());
    },
    close: () => browser.close(),
  };
}
