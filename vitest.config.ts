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
  },
});
