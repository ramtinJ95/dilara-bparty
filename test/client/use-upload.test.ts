import { describe, expect, it } from "vitest";
import { nextUploading, percent, settleDelay, type Progress, type Uploading } from "../../src/client/guest/use-upload";
import type { PhotoId } from "../../src/shared/model";

const uploaded = "AAAAAAAAAAAAAAAAAAAAAA" as PhotoId;
const other = "BBBBBBBBBBBBBBBBBBBBBB" as PhotoId;

describe("a finished upload", () => {
  it("settles at once when the snapshot shows it as the guest's photo", () => {
    expect(settleDelay(uploaded, uploaded, true)).toBe(0);
  });

  it("still settles when it was superseded before its response arrived", () => {
    for (const mine of [other, null]) expect(settleDelay(uploaded, mine, true)).toBeGreaterThan(0);
  });

  it("stays on Klart! while the socket is down, so the guest never sees an empty frame and picks the photo again", () => {
    for (const mine of [uploaded, other, null]) expect(settleDelay(uploaded, mine, false)).toBeNull();
  });
});

describe("upload progress", () => {
  const sending = (sent: number, total = 1_000): Uploading => ({ preview: "blob:a", progress: { phase: "sending", sent, total } });
  const feed = (phases: Uploading[]) => {
    let shown: Uploading | null = { preview: null, progress: { phase: "preparing" } };
    const states = [];
    for (const next of phases) {
      const before: Uploading | null = shown;
      shown = nextUploading(shown, next);
      if (shown !== before) states.push(shown);
      expect(shown.progress.phase).toBe(next.progress.phase);
      expect(percent(shown.progress)).toBe(percent(next.progress));
    }
    return states;
  };

  it("makes a new state, and so a render, only when the shown percent moves", () => {
    const states = feed(Array.from({ length: 1_001 }, (_, sent) => sending(sent)));
    expect(states).toHaveLength(101);
  });

  it("keeps one state for repeated events at the same percent", () => {
    expect(feed([sending(500), sending(501), sending(502), sending(504)])).toHaveLength(1);
  });

  it("still shows a change of phase at an unchanged percent", () => {
    const waiting: Progress = { phase: "waiting", retryAt: null };
    const states = feed([sending(0), { preview: "blob:a", progress: waiting }, sending(0), { preview: "blob:a", progress: { phase: "stuck" } }]);
    expect(states.map((s) => s.progress.phase)).toEqual(["sending", "waiting", "sending", "stuck"]);
  });
});
