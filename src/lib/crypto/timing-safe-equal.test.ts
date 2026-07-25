import { describe, expect, it } from "vitest";

import { timingSafeEqualStrings } from "./timing-safe-equal";

describe("timingSafeEqualStrings", () => {
  it("matches identical secrets", () => {
    expect(timingSafeEqualStrings("s3cret-value", "s3cret-value")).toBe(true);
  });

  it("rejects different secrets, including same-length near misses", () => {
    expect(timingSafeEqualStrings("s3cret-value", "s3cret-valuf")).toBe(false);
    expect(timingSafeEqualStrings("short", "much-longer-secret")).toBe(false);
  });

  it("rejects missing values instead of throwing", () => {
    expect(timingSafeEqualStrings(null, "secret")).toBe(false);
    expect(timingSafeEqualStrings("secret", undefined)).toBe(false);
    expect(timingSafeEqualStrings(null, null)).toBe(false);
  });

  it("treats empty strings as a real (matching) comparison", () => {
    expect(timingSafeEqualStrings("", "")).toBe(true);
    expect(timingSafeEqualStrings("", "secret")).toBe(false);
  });
});
