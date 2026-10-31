import { chromium, defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const port = Number(process.env.E2E_PORT ?? 4317);
const systemChromium = existsSync(chromium.executablePath()) ? undefined : ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 4,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...devices["Desktop Chrome"],
    launchOptions: systemChromium ? { executablePath: systemChromium } : {},
  },
  projects: [
    { name: "smoke", testMatch: "smoke.spec.ts" },
    { name: "network", testMatch: "network.spec.ts", dependencies: ["smoke"], fullyParallel: true },
    { name: "media", testMatch: "media.spec.ts" },
  ],
  webServer: {
    command: `node e2e/server.ts ${port}`,
    url: `http://127.0.0.1:${port}/robots.txt`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
