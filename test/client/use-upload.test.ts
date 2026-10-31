import { describe, expect, it } from "vitest";
import { settleDelay } from "../../src/client/guest/use-upload";
import type { PhotoId } from "../../src/shared/model";

const uploaded = "AAAAAAAAAAAAAAAAAAAAAA" as PhotoId;
const other = "BBBBBBBBBBBBBBBBBBBBBB" as PhotoId;

describe("a finished upload", () => {
  it("settles at once when the snapshot shows it as the guest's photo", () => {
    expect(settleDelay(uploaded, uploaded)).toBe(0);
  });

  it("still settles when it was superseded before its response arrived", () => {
    for (const mine of [other, null]) expect(settleDelay(uploaded, mine)).toBeGreaterThan(0);
  });
});
