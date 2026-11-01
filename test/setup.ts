import { reset } from "cloudflare:test";
import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  return reset();
});
