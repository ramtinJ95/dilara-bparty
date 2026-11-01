import { chromium, defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { secrets } from "./e2e/server";

const port = Number(process.env.E2E_PORT ?? 4317);
const devPort = port + 1;
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
    // test:e2e otherwise drives only a build, where Vite's dev-only paths never reach the Worker.
    { name: "dev", testMatch: "dev.spec.ts", use: { baseURL: `http://127.0.0.1:${devPort}` } },
  ],
  webServer: [
    {
      command: `node e2e/server.ts ${port}`,
      url: `http://127.0.0.1:${port}/robots.txt`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx vite dev --port ${devPort} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${devPort}/robots.txt`,
      env: { WRANGLER_SEND_METRICS: "false", CLOUDFLARE_CF_FETCH_ENABLED: "false", PARTY_EPHEMERAL_STATE: "1", JOIN_SECRET: secrets.join, ADMIN_SECRET: secrets.admin },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
