import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const secrets = { join: "e2e-join-secret", admin: "e2e-admin-secret" };

const port = Number(process.argv[2] ?? 4317);
export const serverEnv = { ...process.env, WRANGLER_SEND_METRICS: "false", CLOUDFLARE_CF_FETCH_ENABLED: "false", PARTY_EPHEMERAL_STATE: "1" };
const workerDir = "dist/dilara_bparty";

// The Worker's cookies are Secure, and WebKit sends them back only over HTTPS, even to 127.0.0.1. The browsers ignore the certificate's errors.
function selfSigned(): { key: Buffer; cert: Buffer } {
  const dir = mkdtempSync(join(tmpdir(), "e2e-tls-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", `${dir}/key.pem`, "-out", `${dir}/cert.pem`], { stdio: "ignore" });
  return { key: readFileSync(`${dir}/key.pem`), cert: readFileSync(`${dir}/cert.pem`) };
}

if (import.meta.main) {
  execFileSync("npx", ["vite", "build", "--logLevel", "warn"], { stdio: "inherit", env: serverEnv });
  if (!existsSync(`${workerDir}/wrangler.json`)) throw new Error(`no Worker build in ${workerDir}`);
  writeFileSync(`${workerDir}/.dev.vars`, `JOIN_SECRET=${secrets.join}\nADMIN_SECRET=${secrets.admin}\n`);
  Object.assign(process.env, serverEnv);
  const { preview } = await import("vite");
  await preview({ preview: { port, strictPort: true, host: "127.0.0.1", https: selfSigned() } });
}
