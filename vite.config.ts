import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

const viteDevPaths = ["!/@*", "!/src/*", "!/node_modules/*", "!/.vite/*"];

export default defineConfig(({ command, isPreview }) => ({
  plugins: [
    cloudflare({
      config: command === "serve" && !isPreview ? { assets: { run_worker_first: viteDevPaths } } : undefined,
      persistState: process.env.PARTY_EPHEMERAL_STATE !== "1",
    }),
  ],
  // Outside node_modules, so `npm ci` in .nexus/check doesn't race the dev service writing its dependency cache.
  cacheDir: ".vite",
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
