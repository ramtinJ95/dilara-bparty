import { describe, expect, it } from "vitest";
import { contentRefusal, existingContent, partyDayRefusal } from "../e2e/rehearsal/guards";
import { choice, closeAll, host, number } from "./support/quiz";
import { connectAdmin, joinedCookie, uploadContest, uploadLanding } from "./support/worker";

const STAGING = "https://dilara-bparty-staging.example.workers.dev";
const PRODUCTION = "https://kalas.example.com";
const at = (iso: string) => new Date(iso);

describe("the rehearsal on the party day", () => {
  it("refuses staging and production for the whole UTC day", () => {
    for (const url of [STAGING, PRODUCTION, "https://infra-testbench.example.ts.net:10211"]) {
      expect(partyDayRefusal(url, at("2026-11-07T00:00:00Z"), false), url).toMatch(/^Refusing to rehearse against .* 2026-11-07 \(UTC\)/);
      expect(partyDayRefusal(url, at("2026-11-07T23:59:59.999Z"), false), url).not.toBeNull();
    }
  });

  it("goes by UTC, not the local clock", () => {
    expect(partyDayRefusal(PRODUCTION, at("2026-11-08T00:30:00+01:00"), false)).not.toBeNull();
    expect(partyDayRefusal(PRODUCTION, at("2026-11-07T00:30:00+01:00"), false)).toBeNull();
    expect(partyDayRefusal(PRODUCTION, at("2026-11-08T00:00:00Z"), false)).toBeNull();
  });

  it("allows local instances, --force and any other day", () => {
    for (const url of ["http://127.0.0.1:4317", "http://localhost:5173", "http://[::1]:8787", "http://party.localhost"]) {
      expect(partyDayRefusal(url, at("2026-11-07T12:00:00Z"), false), url).toBeNull();
    }
    expect(partyDayRefusal(PRODUCTION, at("2026-11-07T12:00:00Z"), true)).toBeNull();
    expect(partyDayRefusal(PRODUCTION, at("2026-11-06T23:59:59Z"), false)).toBeNull();
  });

  it("treats a base URL it cannot parse as deployed", () => {
    expect(partyDayRefusal("kalas", at("2026-11-07T12:00:00Z"), false)).not.toBeNull();
  });
});

describe("the rehearsal on a party with content", () => {
  it("finds nothing on an empty party", async () => {
    const admin = await connectAdmin();
    const found = existingContent(await admin.state());
    expect(found).toEqual([]);
    expect(contentRefusal(PRODUCTION, found, false)).toBeNull();
    closeAll(admin);
  });

  it("names the questions, the landing photo and the contest photos the wipe would delete", async () => {
    const admin = await host(choice(), number());
    expect((await uploadLanding(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).status).toBe(200);
    for (const name of ["Gäst Ett", "Gäst Två"]) expect((await uploadContest(await joinedCookie(name))).ok).toBe(true);
    const found = existingContent(await admin.state((s) => s.landingPhoto !== null && s.contest.entrants.length === 2));
    expect(found).toEqual(["2 quiz questions", "a landing photo", "2 contest photos"]);
    expect(contentRefusal(PRODUCTION, found, false)).toBe(
      `Refusing to rehearse against ${PRODUCTION}: it holds 2 quiz questions, a landing photo, 2 contest photos. The rehearsal ends by wiping the party, which deletes all of it. Pass --force only if it is disposable.`,
    );
    expect(contentRefusal(PRODUCTION, found, true)).toBeNull();
    closeAll(admin);
  });

  it("counts one question and one photo in the singular", async () => {
    const admin = await host(choice());
    expect((await uploadContest(await joinedCookie("Gäst Ett"))).ok).toBe(true);
    expect(existingContent(await admin.state((s) => s.contest.entrants.length === 1))).toEqual(["1 quiz question", "1 contest photo"]);
    closeAll(admin);
  });
});
