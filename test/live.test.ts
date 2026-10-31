import { evictAllDurableObjects, reset } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { AdminState } from "../src/shared/protocol";
import { call, connectAdmin, connectGuest, JOIN_SECRET, joinedCookie, ORIGIN, whoAmI } from "./support/worker";

const player = (state: AdminState, name: string) => state.players.find((p) => p.name === name);

describe("admin player list", () => {
  it("updates when a guest joins, connects and leaves", async () => {
    const admin = await connectAdmin();
    expect((await admin.state()).players).toEqual([]);

    const cookie = await joinedCookie("Testgäst");
    expect(player(await admin.state((s) => !!player(s, "Testgäst")), "Testgäst")?.online).toBe(false);

    const guest = await connectGuest(cookie);
    await admin.state((s) => player(s, "Testgäst")?.online === true);

    guest.close();
    await admin.state((s) => player(s, "Testgäst")?.online === false);
    admin.close();
  });

  it("completes the close handshake when a client leaves", async () => {
    const admin = await connectAdmin();
    await admin.state();
    admin.close();
    await expect.poll(() => admin.closed).toBe(true);
  });

  it("keeps delivering to sockets that hibernated", async () => {
    const admin = await connectAdmin();
    await admin.state();
    await evictAllDurableObjects();
    await joinedCookie("Olle");
    expect(player(await admin.state((s) => !!player(s, "Olle")), "Olle")).toBeDefined();
    admin.close();
  });
});

describe("guest socket", () => {
  it("gets a snapshot with the changes it missed after reconnecting", async () => {
    const cookie = await joinedCookie("Astrid");
    const first = await connectGuest(cookie);
    const { you } = await first.state();
    first.close();

    const admin = await connectAdmin();
    admin.send({ t: "rename", id: you.id, name: "Astrid Prinsessa" });
    await admin.state((s) => !!player(s, "Astrid Prinsessa"));
    admin.close();

    const again = await connectGuest(cookie);
    expect((await again.state()).you).toEqual({ id: you.id, name: "Astrid Prinsessa" });
    again.close();
  });

  it("follows a merge to the surviving name while it stays open", async () => {
    const duplicate = await connectGuest(await joinedCookie("Olle"));
    const { you } = await duplicate.state();
    const survivor = await whoAmI(await joinedCookie("Olle Testsson"));

    const admin = await connectAdmin();
    admin.send({ t: "merge", from: you.id, into: survivor.id });
    const after = await admin.state((s) => s.players.length === 1);
    expect(after.players).toEqual([expect.objectContaining({ id: survivor.id, name: "Olle Testsson", online: true })]);

    expect((await duplicate.state((s) => s.you.id === survivor.id)).you.name).toBe("Olle Testsson");
    duplicate.close();
    admin.close();
  });

  it("counts players online, not sockets", async () => {
    const cookie = await joinedCookie("Astrid");
    const phone = await connectGuest(cookie);
    const laptop = await connectGuest(cookie);
    const other = await connectGuest(await joinedCookie("Olle"));
    expect((await other.state()).online).toBe(2);
    for (const s of [phone, laptop, other]) s.close();
  });

  it("is told the player is gone when the player no longer exists", async () => {
    const cookie = await joinedCookie("Testgäst");
    await reset();
    const guest = await connectGuest(cookie);
    expect(await guest.next()).toEqual({ t: "gone" });
    const landing = await call(`/j/${JOIN_SECRET}`, { cookie });
    expect(landing.status).toBe(200);
  });

  it("needs a pid cookie and a same-host Origin", async () => {
    const cookie = await joinedCookie("Astrid");
    const upgrade = { Upgrade: "websocket" };
    expect((await call("/ws", { headers: { ...upgrade, Origin: ORIGIN } })).status).toBe(401);
    expect((await call("/ws", { cookie, headers: { ...upgrade, Origin: "https://evil.test" } })).status).toBe(403);
    expect((await call("/ws", { cookie, headers: upgrade })).status).toBe(403);
    expect((await call("/ws", { cookie, headers: { Origin: ORIGIN } })).status).toBe(426);
  });

  it("ignores commands from guests", async () => {
    const cookie = await joinedCookie("Astrid");
    const guest = await connectGuest(cookie);
    const { you } = await guest.state();
    guest.ws.send(JSON.stringify({ t: "rename", id: you.id, name: "Hacker" }));
    const admin = await connectAdmin();
    await guest.state();
    expect((await admin.state()).players.map((p) => p.name)).toEqual(["Astrid"]);
    guest.close();
    admin.close();
  });
});

describe("admin commands", () => {
  it("reports a rename to a taken name as an error and changes nothing", async () => {
    const cookie = await joinedCookie("Astrid");
    const astrid = await whoAmI(cookie);
    await joinedCookie("Olle");
    const admin = await connectAdmin();
    await admin.state();
    admin.send({ t: "rename", id: astrid.id, name: "  OLLE " });
    expect((await admin.next((m) => m.t === "error")).t).toBe("error");
    admin.send({ t: "rename", id: astrid.id, name: "" });
    expect((await admin.next((m) => m.t === "error")).t).toBe("error");
    admin.close();
    expect(await whoAmI(cookie)).toEqual(astrid);
  });

  it("answers malformed commands with an error", async () => {
    const admin = await connectAdmin();
    await admin.state();
    for (const raw of ["nonsense", "{}", '{"t":"merge","from":"x","into":"y"}', '{"t":"__proto__"}']) {
      admin.ws.send(raw);
      expect(await admin.next((m) => m.t === "error")).toEqual({ t: "error", message: "Unknown command." });
    }
    admin.close();
  });
});
