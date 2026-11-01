import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { PhotoId, PlayerId } from "../src/shared/model";
import { pidCookieValue } from "../src/worker/auth";
import worker from "../src/worker/index";
import { joinedCookie, JOIN_SECRET, ORIGIN, uploadLanding } from "./support/worker";

function countingEnv(log: string[]): Env {
  const track = <T>(name: string, result: Promise<T>) => {
    log.push(name);
    void result.then(() => log.push(`${name} done`));
    return result;
  };
  const stub = (name: string) => {
    const party = env.PARTY.getByName(name) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    return new Proxy(party, { get: (_, method: string) => (...args: unknown[]) => track(`party.${method}`, party[method]!(...args)) });
  };
  return {
    ...env,
    PARTY: { getByName: stub } as unknown as Env["PARTY"],
    ASSETS: { fetch: (...args: Parameters<Fetcher["fetch"]>) => track("assets", env.ASSETS.fetch(...args)) } as Fetcher,
  };
}

async function visit(path: string, cookie?: string): Promise<{ res: Response; log: string[] }> {
  const log: string[] = [];
  const headers = cookie ? { Cookie: cookie } : undefined;
  const res = await worker.fetch(new Request(`${ORIGIN}${path}`, { headers, redirect: "manual" }), countingEnv(log));
  return { res, log };
}

const partyCalls = (log: string[]) => log.filter((e) => e.startsWith("party.") && !e.endsWith(" done"));
const landingMeta = async (res: Response) => (await res.text()).match(/<meta name="landing-photo" content="([^"]+)">/)?.[1];
const staleCookie = () => pidCookieValue("AAAAAAAAAAAAAAAAAAAAAA" as PlayerId, JOIN_SECRET);

async function landing(): Promise<PhotoId> {
  return ((await (await uploadLanding(new Uint8Array([137, 80, 78, 71]))).json()) as { id: PhotoId }).id;
}

describe("/j/<secret> requests", () => {
  it("answers a wrong secret with the unknown-path 404 before touching the party or the assets", async () => {
    const wrong = await visit("/j/not-the-secret", `pid=${await staleCookie()}`);
    const unknown = await visit("/no-such-page");
    expect(wrong.res.status).toBe(404);
    expect(await wrong.res.text()).toBe(await unknown.res.text());
    expect(wrong.log).toEqual([]);
  });

  it("makes one Durable Object request for a joined guest and sends them to /app", async () => {
    const { res, log } = await visit(`/j/${JOIN_SECRET}`, await joinedCookie("Astrid"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/app");
    expect(partyCalls(log)).toHaveLength(1);
  });

  for (const [who, cookie] of [
    ["a new guest", async () => undefined],
    ["a guest with a stale cookie", async () => `pid=${await staleCookie()}`],
  ] as const) {
    it(`makes one Durable Object request for ${who} and fetches the page alongside it`, async () => {
      const id = await landing();
      const { res, log } = await visit(`/j/${JOIN_SECRET}`, await cookie());
      expect(res.status).toBe(200);
      expect(await landingMeta(res)).toBe(id);
      expect(partyCalls(log)).toHaveLength(1);
      expect(log.slice(0, 2).sort(), log.join(", ")).toEqual(["assets", "party.guestEntry"]);
    });
  }
});
