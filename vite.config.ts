import { readFile } from "node:fs/promises";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, type Plugin } from "vite";

const viteDevPaths = ["!/@*", "!/src/*", "!/node_modules/*", "!/.vite/*"];

// The design lab lives only on the dev server. It is no build input, so `vite build` never sees it.
// LAB_HOME=1 sends the bare domain to the lab, so the preview opens on it.
// The Cloudflare plugin leaves Vite no HTML middleware, so the lab answers its own page before the Worker sees the request.
const designLab: Plugin = {
  name: "design-lab",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (process.env.LAB_HOME === "1" && req.url === "/") {
        res.writeHead(302, { Location: "/lab/" }).end();
        return;
      }
      if (!req.url || !/^\/lab(\/|\?|$)/.test(req.url)) return next();
      const html = await readFile("src/lab/index.html", "utf8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(await server.transformIndexHtml(req.url, html));
    });
  },
};

export default defineConfig(({ command, isPreview }) => ({
  plugins: [
    designLab,
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
