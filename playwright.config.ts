import { defineConfig, devices } from "@playwright/test";
import { chromiumLaunchOptions } from "./e2e/drive.ts";

const port = Number(process.env.E2E_PORT ?? 4317);
const devPort = port + 1;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 4,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...devices["Desktop Chrome"],
    launchOptions: chromiumLaunchOptions(),
  },
  projects: [
    { name: "smoke", testMatch: "smoke.spec.ts" },
    { name: "build", testMatch: "build.spec.ts" },
    // Each network test drives several browsers. On the 4 GB pylon, with the Nexus web dev service running, two of the four tests timed out
    // at four at a time and all passed at two. It waits for dev, so the dev server that test starts is stopped first.
    { name: "network", testMatch: "network.spec.ts", dependencies: ["smoke", "dev"], fullyParallel: true, workers: 2 },
    { name: "media", testMatch: "media.spec.ts" },
    // test:e2e otherwise drives only a build, where Vite's dev-only paths never reach the Worker. dev.spec.ts starts its server.
    { name: "dev", testMatch: "dev.spec.ts", use: { baseURL: `http://127.0.0.1:${devPort}` } },
  ],
  webServer: {
    command: `node e2e/server.ts ${port}`,
    url: `http://127.0.0.1:${port}/robots.txt`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
