import { execFileSync, spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

export const secrets = { join: "e2e-join-secret", admin: "e2e-admin-secret" };

const port = process.argv[2] ?? "4317";
export const serverEnv = { ...process.env, WRANGLER_SEND_METRICS: "false", CLOUDFLARE_CF_FETCH_ENABLED: "false", PARTY_EPHEMERAL_STATE: "1" };
const workerDir = "dist/dilara_bparty";

if (import.meta.main) {
  execFileSync("npx", ["vite", "build", "--logLevel", "warn"], { stdio: "inherit", env: serverEnv });
  if (!existsSync(`${workerDir}/wrangler.json`)) throw new Error(`no Worker build in ${workerDir}`);
  writeFileSync(`${workerDir}/.dev.vars`, `JOIN_SECRET=${secrets.join}\nADMIN_SECRET=${secrets.admin}\n`);
  spawn("npx", ["vite", "preview", "--port", port, "--strictPort", "--host", "127.0.0.1"], { stdio: "inherit", env: serverEnv });
}
