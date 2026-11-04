import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { AdminState } from "../src/shared/protocol";
import { migrate } from "../src/worker/schema";
import { call, connectAdmin, connectGuest, joinedCookie, uploadContestAs, whoAmI } from "./support/worker";

const party = () => env.PARTY.getByName("party");

// A party deployed with the single finale holds its stage and frozen winners under the old keys, at schema version 4.
async function seedLegacy(entries: Record<string, unknown>): Promise<void> {
  await runInDurableObject(party(), (_, state) => {
    state.storage.kv.put("schema_version", 4);
    for (const [key, value] of Object.entries(entries)) state.storage.kv.put(key, value);
    migrate(state.storage);
  });
}

const legacyKeys = () =>
  runInDurableObject(party(), (_, state) => ["finale_stage", "finale_quiz", "finale_photo"].filter((k) => state.storage.kv.get(k) !== undefined));

async function finales(): Promise<AdminState["finale"]> {
  const admin = await connectAdmin();
  const { finale } = await admin.state();
  admin.close();
  return finale;
}

describe("a party deployed with the single finale", () => {
  it("keeps an open suspense page as the quiz finale's, so the quiz stays frozen, on the fast heartbeat through its reveal", async () => {
    await seedLegacy({ finale_stage: "suspense" });
    const admin = await connectAdmin();
    expect(await admin.next((m) => m.t === "state")).toMatchObject({ heartbeat: "fast", state: { finale: { quiz: { stage: "suspense" }, photo: { stage: "off" } } } });
    expect(await legacyKeys()).toEqual([]);
    admin.send({ t: "finale", kind: "quiz", step: "reveal" });
    expect(await admin.next((m) => m.t === "state" && m.state.finale.quiz.stage === "reveal")).toMatchObject({ heartbeat: "fast" });
    admin.close();
  });

  it("keeps a revealed quiz winner, back in the app", async () => {
    const playerId = (await whoAmI(await joinedCookie("Astrid"))).id;
    await seedLegacy({ finale_stage: "quiz", finale_quiz: [{ id: playerId, score: 1000 }] });
    expect(await finales()).toMatchObject({ quiz: { stage: "done", win: [{ id: playerId, name: "Astrid", score: 1000 }] }, photo: { stage: "off" } });
    expect(await legacyKeys()).toEqual([]);
  });

  it("keeps both revealed winners, and the winning photo visible to guests after the host hid it", async () => {
    const olle = { cookie: await joinedCookie("Olle") };
    const socket = await connectGuest(olle.cookie);
    const { id, state } = await uploadContestAs({ ...olle, socket });
    socket.close();
    const admin = await connectAdmin();
    await admin.state();
    admin.send({ t: "hide", photo: id, hidden: true });
    await admin.next((m) => m.t === "ack");
    admin.close();
    const astrid = await joinedCookie("Astrid");
    expect((await call(`/photos/${id}`, { cookie: astrid })).status, "hidden before the migration").toBe(404);

    const photo = { photo: id, thumb: state.contest.mine!.thumb, owner: state.you.id, votes: 3 };
    await seedLegacy({ finale_stage: "photo", finale_quiz: [], finale_photo: photo });
    expect(await finales()).toMatchObject({ quiz: { stage: "done", win: [] }, photo: { stage: "done", win: { ...photo, name: "Olle" } } });
    expect((await call(`/photos/${id}`, { cookie: astrid })).status).toBe(200);
    expect(await legacyKeys()).toEqual([]);
  });

  it("leaves a party that never opened the finale with both finales off", async () => {
    await seedLegacy({});
    expect(await finales()).toMatchObject({ quiz: { stage: "off" }, photo: { stage: "off" } });
  });
});
