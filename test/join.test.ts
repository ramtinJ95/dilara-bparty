import { describe, expect, it } from "vitest";
import type { AdminState } from "../src/shared/protocol";
import { call, connectAdmin, join, joinedCookie, JOIN_SECRET, postJson, whoAmI } from "./support/worker";

describe("joining", () => {
  it("refuses a bad secret", async () => {
    const res = await postJson("/api/join", { secret: "not-the-secret", name: "Astrid" });
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("refuses an oversized body without reading it as JSON, even when streamed", async () => {
    const json = JSON.stringify({ secret: JOIN_SECRET, name: "Astrid", padding: "x".repeat(10_000) });
    const body = new Blob([json]).stream();
    const res = await call("/api/join", { method: "POST", body, headers: { "Content-Type": "application/json" } });
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect((await postJson("/api/join", JSON.parse(json))).status).toBe(403);
  });

  it("sets an HttpOnly, Secure, SameSite=Lax pid cookie", async () => {
    const { res, body } = await join("Astrid");
    expect(body).toEqual({ status: "joined" });
    const [cookie] = res.headers.getSetCookie();
    expect(cookie).toMatch(/^pid=[\w-]+\.[\w-]+;/);
    for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=604800"]) {
      expect(cookie).toContain(attribute);
    }
  });

  it("lets /app through only with a valid pid cookie", async () => {
    const cookie = await joinedCookie("Astrid");
    const ok = await call("/app", { cookie });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toContain("text/html");

    const [id, sig] = cookie.slice("pid=".length).split(".");
    const otherId = (await whoAmI(await joinedCookie("Olle"))).id;
    const flipped = sig!.slice(0, -1) + (sig!.endsWith("A") ? "B" : "A");
    for (const bad of [undefined, `pid=${id}.${flipped}`, `pid=${otherId}.${sig}`, `pid=${id}`, "pid=garbage"]) {
      const res = await call("/app", { cookie: bad });
      expect(res.status, String(bad)).toBe(302);
      expect(res.headers.get("Location")).toBe("/");
    }
  });

  it("sends a joined guest from the join link straight to /app", async () => {
    const cookie = await joinedCookie("Astrid");
    const res = await call(`/j/${JOIN_SECRET}`, { cookie });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/app");
    expect((await call(`/j/${JOIN_SECRET}`)).status).toBe(200);
  });

  it("answers a wrong join secret exactly like an unknown path", async () => {
    const wrong = await call("/j/not-the-secret");
    const unknown = await call("/no-such-page");
    expect(wrong.status).toBe(404);
    expect(await wrong.text()).toBe(await unknown.text());
  });

  it("rejects an invalid name with a Swedish message", async () => {
    for (const name of ["   ", "x".repeat(31), 42]) {
      const res = await postJson("/api/join", { secret: JOIN_SECRET, name });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toMatch(/namn/i);
    }
  });

  it("accepts a 30-character name", async () => {
    expect((await join("Å".repeat(30))).body).toEqual({ status: "joined" });
  });
});

describe("reclaiming a name", () => {
  it("asks 'is it you' for the same name in another case and spacing, without a cookie", async () => {
    await joinedCookie("Olle Testsson");
    const again = await join("  olle   TESTSSON ");
    expect(again.body).toEqual({ status: "exists", name: "Olle Testsson" });
    expect(again.cookie).toBeUndefined();
  });

  it("gives back the same identity on reclaim", async () => {
    const first = await whoAmI(await joinedCookie("Olle Testsson"));
    const reclaimed = await join("olle testsson", true);
    expect(reclaimed.body).toEqual({ status: "joined" });
    expect(await whoAmI(reclaimed.cookie!)).toEqual(first);
  });

  it("reclaims a merged-away name as the surviving player", async () => {
    const duplicate = await whoAmI(await joinedCookie("Testgäst"));
    const survivor = await whoAmI(await joinedCookie("Testgäst Andersson"));
    const admin = await connectAdmin();
    admin.send({ t: "merge", from: duplicate.id, into: survivor.id });
    await admin.state((s) => s.players.length === 1);
    admin.close();

    expect((await join("testgäst")).body).toEqual({ status: "exists", name: "Testgäst Andersson" });
    expect(await whoAmI((await join("testgäst", true)).cookie!)).toEqual(survivor);
  });

  it("follows a chain of merges to the last survivor", async () => {
    const firstCookie = await joinedCookie("Astrid");
    const first = await whoAmI(firstCookie);
    const second = await whoAmI(await joinedCookie("Astrid B"));
    const third = await whoAmI(await joinedCookie("Astrid Testsson"));
    const admin = await connectAdmin();
    admin.send({ t: "merge", from: first.id, into: second.id });
    await admin.state((s) => s.players.length === 2);
    admin.send({ t: "merge", from: second.id, into: third.id });
    await admin.state((s) => s.players.length === 1);
    admin.close();

    expect(await whoAmI(firstCookie)).toEqual(third);
    expect(await whoAmI((await join("astrid", true)).cookie!)).toEqual(third);
  });
});

describe("join code", () => {
  async function shownCode(): Promise<string> {
    const admin = await connectAdmin();
    const state: AdminState = await admin.state();
    admin.close();
    return state.join.code;
  }

  it("turns the code shown to the admin into the join path, in any case and spacing", async () => {
    const code = await shownCode();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
    for (const typed of [code, code.toLowerCase(), ` ${code.slice(0, 3)} ${code.slice(3).toLowerCase()} `]) {
      const res = await postJson("/api/code", { code: typed });
      expect(res.status, typed).toBe(200);
      expect(await res.json()).toEqual({ ok: true, path: `/j/${JOIN_SECRET}` });
    }
  });

  it("refuses a wrong code", async () => {
    const code = await shownCode();
    const wrong = code === "AAAAAA" ? "BBBBBB" : "AAAAAA";
    for (const body of [{ code: wrong }, { code: "" }, {}]) {
      expect((await postJson("/api/code", body)).status).toBe(403);
    }
  });
});
