import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

const viteDevPaths = ["!/@*", "!/src/*", "!/node_modules/*"];

export default defineConfig(({ command, isPreview }) => ({
  plugins: [
    cloudflare({
      config: command === "serve" && !isPreview ? { assets: { run_worker_first: viteDevPaths } } : undefined,
      persistState: process.env.PARTY_EPHEMERAL_STATE !== "1",
    }),
  ],
  server: { allowedHosts: [".ts.net"] },
  build: { modulePreload: { polyfill: false } },
  environments: {
    client: {
      build: {
        rolldownOptions: { input: ["neutral.html", "guest.html", "admin.html"] },
      },
    },
  },
}));
