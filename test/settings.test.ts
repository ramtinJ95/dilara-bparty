import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { AdminCmd } from "../src/shared/protocol";
import { adminCookie, call, connectAdmin, uploadLanding, type TestSocket } from "./support/worker";

const party = () => env.PARTY.getByName("party");

const rows = () =>
  runInDurableObject(party(), (_, state) => Object.fromEntries(state.storage.sql.exec<{ key: string; value: string }>("SELECT key, value FROM settings").toArray().map((r) => [r.key, r.value])));

async function command(admin: TestSocket<unknown>, cmd: AdminCmd): Promise<void> {
  admin.send(cmd);
  expect(await admin.next((m) => m.t === "ack" || m.t === "error"), JSON.stringify(cmd)).toEqual({ t: "ack" });
}

// A deployed Durable Object holds these rows; a change to how settings are stored must keep reading and writing them.
describe("settings storage", () => {
  it("reads the landing photo, the contest toggles and live mode from rows a deployed party already holds", async () => {
    await runInDurableObject(party(), (_, state) => {
      for (const [key, value] of [["landing_photo", "seeded-photo"], ["contest_uploads_open", "0"], ["contest_voting_open", "1"], ["live_mode", "on"]]) {
        state.storage.sql.exec("INSERT INTO settings (key, value) VALUES (?, ?)", key, value);
      }
    });
    const admin = await connectAdmin();
    const msg = await admin.next((m) => m.t === "state");
    expect(msg).toMatchObject({ heartbeat: "fast", state: { landingPhoto: "seeded-photo", contest: { uploads: false, voting: true } } });
    admin.close();
  });

  it("writes and deletes the same rows from the admin's commands", async () => {
    const admin = await connectAdmin();
    await admin.state();
    await command(admin, { t: "uploads", open: false });
    await command(admin, { t: "voting", open: true });
    await command(admin, { t: "liveMode", on: true });
    await command(admin, { t: "liveMode", on: true });
    const { id } = (await (await uploadLanding(new Uint8Array([1]))).json()) as { id: string };
    expect(await rows()).toEqual({ contest_uploads_open: "0", contest_voting_open: "1", live_mode: "on", landing_photo: id });

    await command(admin, { t: "uploads", open: true });
    await command(admin, { t: "liveMode", on: false });
    expect((await call("/api/admin/landing-photo", { method: "DELETE", cookie: await adminCookie() })).status).toBe(204);
    expect(await rows()).toEqual({ contest_uploads_open: "1", contest_voting_open: "1" });
    admin.close();
  });
});
