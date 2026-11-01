import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchSeconds } from "../../src/client/clock";

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("question countdown", () => {
  it("shows each new second once, on the second, and reaches zero at the deadline", () => {
    const deadline = performance.now() + 2600;
    const shown: number[] = [];
    watchSeconds(deadline, 3, (left) => shown.push(left));
    vi.advanceTimersByTime(599);
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(shown).toEqual([2]);
    vi.advanceTimersByTime(999);
    expect(shown).toEqual([2]);
    vi.advanceTimersByTime(1);
    expect(shown).toEqual([2, 1]);
    vi.advanceTimersByTime(1000);
    expect(shown).toEqual([2, 1, 0]);
    vi.advanceTimersByTime(60_000);
    expect(shown).toEqual([2, 1, 0]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("renders the question card 20 times for a 20 s question", () => {
    let renders = 0;
    watchSeconds(performance.now() + 20_000, 20, () => renders++);
    vi.advanceTimersByTime(60_000);
    expect(renders).toBe(20);
  });

  it.each([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])("still shows every second when the browser fires its timer a hair early (+%f ms)", (fraction) => {
    // Chrome truncates a fractional delay, and the clock moves while the page runs.
    const fakeSetTimeout = setTimeout;
    vi.stubGlobal("setTimeout", (fn: () => void, ms: number) => fakeSetTimeout(fn, Math.trunc(ms)));
    const clock = performance.now.bind(performance);
    let reads = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock() + 0.1 * ++reads);
    const shown: number[] = [];
    watchSeconds(performance.now() + 20_000 + fraction, 21, (left) => shown.push(left));
    vi.advanceTimersByTime(30_000);
    expect(shown).toEqual([20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it("catches up at once when a second passed between the render and the start of the watch", () => {
    const shown: number[] = [];
    watchSeconds(performance.now() + 2600, 4, (left) => shown.push(left));
    expect(shown).toEqual([3]);
  });

  it("stops when the question leaves the screen", () => {
    const shown: number[] = [];
    const stop = watchSeconds(performance.now() + 5000, 5, (left) => shown.push(left));
    vi.advanceTimersByTime(1000);
    stop();
    vi.advanceTimersByTime(10_000);
    expect(shown).toEqual([4]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
