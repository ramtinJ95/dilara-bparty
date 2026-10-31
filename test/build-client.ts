import { execFileSync } from "node:child_process";

export default function buildClient(): void {
  execFileSync("npx", ["vite", "build", "--logLevel", "warn"], { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
}
