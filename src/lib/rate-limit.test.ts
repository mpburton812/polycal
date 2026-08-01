import { describe, expect, it } from "vitest";

import { checkRateLimit, resetRateLimitsForTests } from "./rate-limit";

describe("checkRateLimit", () => {
  it("allows requests within the window", () => {
    resetRateLimitsForTests();
    expect(checkRateLimit("test-key", 3, 60_000, 1_000)).toBe(true);
    expect(checkRateLimit("test-key", 3, 60_000, 2_000)).toBe(true);
    expect(checkRateLimit("test-key", 3, 60_000, 3_000)).toBe(true);
    expect(checkRateLimit("test-key", 3, 60_000, 4_000)).toBe(false);
  });

  it("resets after the window elapses", () => {
    resetRateLimitsForTests();
    expect(checkRateLimit("reset-key", 1, 1_000, 0)).toBe(true);
    expect(checkRateLimit("reset-key", 1, 1_000, 500)).toBe(false);
    expect(checkRateLimit("reset-key", 1, 1_000, 1_001)).toBe(true);
  });
});
