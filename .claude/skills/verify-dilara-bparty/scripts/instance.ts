#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { chromiumLaunchOptions } from "../../../../e2e/drive.ts";
import { serverEnv } from "../../../../e2e/server.ts";
import { readSecrets, repoRoot } from "./verify.ts";

const USAGE = `Usage: node .claude/skills/verify-dilara-bparty/scripts/instance.ts <command>
  start [port] [--build]  start an isolated dev server (or, with --build, a built Worker) with in-memory state and print BASE_URL
  doctor <base-url>       read-only checks: is this instance worth driving?
  stop <port>|--all       stop instances this script started; logs and evidence stay`;

const instancesDir = `${repoRoot}artifacts/verify/instances`;
type Instance = { port: number; pid: number; baseUrl: string; log: string; startedAt: string };

const instanceFile = (port: number) => `${instancesDir}/${port}.json`;
const readInstance = (port: number): Instance | null => (existsSync(instanceFile(port)) ? JSON.parse(readFileSync(instanceFile(port), "utf8")) : null);
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function claimPort(port = 0): Promise<number | null> {
  return new Promise((resolve) => {
    const server = createServer()
      .once("error", () => resolve(null))
      .listen(port, "127.0.0.1", () => {
        const { port: claimed } = server.address() as { port: number };
        server.close(() => resolve(claimed));
      });
  });
}

// A recorded PID may have been reused after a restart, so signal it only while it still runs this instance's dev server.
function ownsPort(pid: number, port: number): boolean {
  try {
    return new RegExp(`vite (dev|preview) --port ${port}( |$)`, "m").test(execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }));
  } catch {
    return false;
  }
}

async function status(url: string): Promise<number> {
  try {
    return (await fetch(url, { redirect: "manual" })).status;
  } catch {
    return 0;
  }
}

async function start(args: string[]): Promise<number> {
  const build = args.includes("--build");
  const portArg = args.find((a) => a !== "--build");
  const secrets = readSecrets();
  const port = await claimPort(portArg ? Number(portArg) : 0);
  if (!port) {
    console.error(`Port ${portArg} is in use. Pick another, or omit it to get a free one.`);
    return 1;
  }
  mkdirSync(instancesDir, { recursive: true });
  const prior = readInstance(port);
  if (prior && (!prior.pid || ownsPort(prior.pid, port))) {
    console.error(`Port ${port} is claimed by another start of this script${prior.pid ? ` (pid ${prior.pid})` : ""}; stop it first.`);
    return 1;
  }
  if (prior) rmSync(instanceFile(port));
  // The exclusive create makes a second start on the same port fail here instead of racing this one for the record.
  try {
    writeFileSync(instanceFile(port), "{}", { flag: "wx" });
  } catch {
    console.error(`Another start is claiming port ${port}.`);
    return 1;
  }
  const log = `${instancesDir}/${port}.log`;
  const out = openSync(log, "w");
  if (build) {
    try {
      // The build copies .dev.vars into dist/, where vite preview reads the secrets.
      execFileSync("npx", ["vite", "build", "--logLevel", "warn"], { cwd: repoRoot, stdio: ["ignore", out, out], env: serverEnv });
    } catch {
      rmSync(instanceFile(port));
      console.error(`The build failed. Log: ${log}`);
      return 1;
    }
  }
  const child = spawn("npx", ["vite", build ? "preview" : "dev", "--port", String(port), "--host", "127.0.0.1", "--strictPort"], {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", out, out],
    env: serverEnv,
  });
  child.unref();
  const baseUrl = `http://127.0.0.1:${port}`;
  const instance: Instance = { port, pid: child.pid!, baseUrl, log, startedAt: new Date().toISOString() };
  writeFileSync(instanceFile(port), JSON.stringify(instance, null, 2));
  // Ready means the join page answers, which needs the Worker, the Durable Object and its migrations.
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if ((await status(`${baseUrl}/j/${secrets.join}`)) === 200 && alive(child.pid!)) {
      console.log(`BASE_URL=${baseUrl}\nlog: ${log}`);
      return 0;
    }
    if (!alive(child.pid!)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`The dev server on port ${port} did not become ready. Last log lines:\n${readFileSync(log, "utf8").split("\n").slice(-20).join("\n")}`);
  await stop([String(port)]);
  return 1;
}

async function doctor([baseUrl]: string[]): Promise<number> {
  if (!baseUrl) return usage();
  const secrets = readSecrets();
  const checks: [string, () => Promise<string | null>][] = [
    ["the Worker serves the neutral page with noindex", async () => {
      const res = await fetch(baseUrl).catch(() => null);
      if (!res) return "no answer";
      const body = await res.text();
      if (res.status !== 200) return `HTTP ${res.status}`;
      if (!res.headers.get("x-robots-tag")?.includes("noindex")) return "no X-Robots-Tag: noindex";
      return body.includes("Dilara") ? "the bare page mentions the party" : null;
    }],
    ["JOIN_SECRET opens the join page (Durable Object reachable)", async () => {
      const code = await status(`${baseUrl}/j/${secrets.join}`);
      return code === 200 ? null : `HTTP ${code}: wrong JOIN_SECRET for this instance, or the Durable Object failed`;
    }],
    ["ADMIN_SECRET gives the admin cookie", async () => {
      const res = await fetch(`${baseUrl}/admin/${secrets.admin}`, { redirect: "manual" }).catch(() => null);
      return res?.status === 302 && res.headers.getSetCookie().some((c) => c.startsWith("admin=")) ? null : `HTTP ${res?.status ?? "no answer"}: wrong ADMIN_SECRET?`;
    }],
    ["the admin page's scripts load (a blank page otherwise)", async () => {
      const login = await fetch(`${baseUrl}/admin/${secrets.admin}`, { redirect: "manual" }).catch(() => null);
      const cookie = login?.headers.getSetCookie().find((c) => c.startsWith("admin="))?.split(";")[0];
      if (!cookie) return "no admin cookie";
      const html = await fetch(`${baseUrl}/admin`, { headers: { cookie } }).then((r) => r.text()).catch(() => "");
      const dev = (await status(`${baseUrl}/@vite/client`)) === 200;
      const scripts = [...html.matchAll(/<script[^>]* src="(\/[^"]+)"/g)].map((m) => m[1]!);
      // On the dev server the entry's own imports are what fail, so check those too.
      const sources = dev ? await Promise.all(scripts.map((path) => fetch(`${baseUrl}${path}`).then((r) => r.text()).catch(() => ""))) : [];
      const paths = [...scripts, ...sources.flatMap((source) => [...source.matchAll(/from "(\/[^"]+)"/g)].map((m) => m[1]!))];
      if (!paths.length) return "the admin page names no script";
      const broken = (await Promise.all(paths.map(async (path) => [path.split("?")[0], await status(`${baseUrl}${path}`)] as const))).filter(([, code]) => code !== 200);
      if (!broken.length) return null;
      const list = [...new Set(broken.map(([path, code]) => `${path} HTTP ${code}`))].join(", ");
      return dev ? `${list}: see issue #11, or start with --build` : `${list}: dist/ was rebuilt under this instance (npm test, test:e2e or another --build); stop and start it again`;
    }],
    ["Chromium for Playwright", async () => {
      const path = chromiumLaunchOptions().executablePath ?? chromium.executablePath();
      return existsSync(path) ? null : `missing ${path}: run .nexus/setup or npx playwright install chromium`;
    }],
    ["ffmpeg for GIFs", async () => {
      try {
        execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
        return null;
      } catch {
        return "missing: sudo apt-get install ffmpeg, or brew install ffmpeg";
      }
    }],
  ];
  let failed = 0;
  for (const [label, run] of checks) {
    const problem = await run();
    if (problem) failed++;
    console.log(problem ? `FAIL ${label}: ${problem}` : `ok   ${label}`);
  }
  const port = Number(new URL(baseUrl).port);
  const mine = readInstance(port);
  console.log(
    mine && alive(mine.pid)
      ? `info started by this skill (pid ${mine.pid}, in-memory state, log ${mine.log})`
      : "info not started by this skill: shared state, so drive it only with throwaway names and never merge or rename real players",
  );
  console.log(`info ${(await status(`${baseUrl}/@vite/client`)) === 200 ? "Vite dev server: slow page loads on throttled profiles are inflated" : "built Worker"}`);
  return failed ? 1 : 0;
}

async function stop([target]: string[]): Promise<number> {
  if (!target) return usage();
  const ports = target === "--all" ? readdirSync(instancesDir).filter((f) => f.endsWith(".json")).map((f) => Number(f.slice(0, -5))) : [Number(target)];
  for (const port of ports) {
    const instance = readInstance(port);
    if (!instance) {
      console.error(`No instance on port ${port} was started by this script; leaving it alone.`);
      continue;
    }
    // npx starts vite, which starts workerd; they share the process group that start created.
    if (ownsPort(instance.pid, port)) {
      process.kill(-instance.pid, "SIGTERM");
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && alive(instance.pid)) await new Promise((r) => setTimeout(r, 200));
      console.log(`stopped ${instance.baseUrl} (log kept at ${instance.log})`);
    } else {
      console.error(`pid ${instance.pid} no longer runs the dev server on port ${port}; removing the stale record only.`);
    }
    rmSync(instanceFile(port));
  }
  return 0;
}

function usage(): number {
  console.error(USAGE);
  return 2;
}

const commands: Record<string, (args: string[]) => Promise<number>> = { start, doctor, stop };
const [command, ...args] = process.argv.slice(2);
process.exit(await (command && Object.hasOwn(commands, command) ? commands[command]!(args) : Promise.resolve(usage())));
