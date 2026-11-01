import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { JOIN_SECRET: "test-join-secret", ADMIN_SECRET: "test-admin-secret" },
        assets: { binding: "ASSETS", directory: "./dist/client" },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/build-client.ts"],
    setupFiles: ["test/setup.ts"],
    // On a loaded pylon a test that takes 0.1-0.3 s can take 10 s. 20 s absorbs that and still fails a real hang.
    testTimeout: 20_000,
  },
});
