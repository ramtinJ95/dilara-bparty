import { defineConfig, devices } from "@playwright/test";
import { chromiumLaunchOptions } from "./e2e/drive.ts";

const port = Number(process.env.E2E_PORT ?? 4317);
const devPort = port + 1;
// Headless WebKit draws in software: three idle phones with the snow falling kept 90% of the pylon's 4 CPUs busy, 5% with motion reduced.
const webkit = { ...devices["Desktop Safari"], launchOptions: {}, reducedMotion: "reduce" as const };

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 4,
  reporter: "list",
  use: {
    baseURL: `https://127.0.0.1:${port}`,
    ignoreHTTPSErrors: true,
    ...devices["Desktop Chrome"],
    launchOptions: chromiumLaunchOptions(),
  },
  projects: [
    { name: "smoke", testMatch: "smoke.spec.ts" },
    // Each network test drives several browsers. On the 4 GB pylon, with the Nexus web dev service running, two of the four tests timed out
    // at four at a time and all passed at two. It waits for dev, so the dev server that test starts is stopped first.
    { name: "network", testMatch: "network.spec.ts", dependencies: ["smoke", "dev"], fullyParallel: true, workers: 2 },
    { name: "media", testMatch: "media.spec.ts" },
    // test:e2e otherwise drives only a build, where Vite's dev-only paths never reach the Worker. dev.spec.ts starts its server.
    { name: "dev", testMatch: "dev.spec.ts", use: { baseURL: `http://127.0.0.1:${devPort}` } },
    // It ends and wipes the one party every project shares, so it runs last, on its own.
    { name: "admin", testMatch: "admin.spec.ts", dependencies: ["network"] },
    // The same specs in WebKit, run as their own `playwright test`, so they get their own server and party and never meet the admin wipe above.
    // The quiz smoke test took 9 s in Chromium and 20 to 27 s in WebKit.
    { name: "webkit-smoke", testMatch: "smoke.spec.ts", use: webkit, timeout: 60_000 },
    { name: "webkit-network", testMatch: "network.spec.ts", use: webkit, timeout: 60_000, dependencies: ["webkit-smoke"], fullyParallel: true, workers: 2 },
    { name: "webkit-admin", testMatch: "admin.spec.ts", use: webkit, timeout: 60_000, dependencies: ["webkit-network"] },
  ],
  webServer: {
    command: `node e2e/server.ts ${port}`,
    url: `https://127.0.0.1:${port}/robots.txt`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
