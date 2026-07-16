import { describe, expect, it } from "vitest";

import {
  LONG_TEXT_MAX,
  SHORT_TEXT_MAX,
  limitedString,
  maxCharsMessage,
  requiredLimitedString,
} from "./string-limits";

describe("string-limits (PC-244)", () => {
  it("exposes 256 / 1024 policy constants", () => {
    expect(SHORT_TEXT_MAX).toBe(256);
    expect(LONG_TEXT_MAX).toBe(1024);
  });

  it("builds human-readable max messages", () => {
    expect(maxCharsMessage("Location", SHORT_TEXT_MAX)).toBe(
      "Location must be 256 characters or fewer.",
    );
  });

  it("rejects over-long location with a clear message", () => {
    const schema = limitedString("Location", SHORT_TEXT_MAX);
    const result = schema.safeParse("x".repeat(SHORT_TEXT_MAX + 1));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Location must be 256 characters or fewer.",
      );
    }
  });

  it("accepts title up to LONG_TEXT_MAX", () => {
    const schema = requiredLimitedString("Title", LONG_TEXT_MAX);
    expect(schema.safeParse("x".repeat(LONG_TEXT_MAX)).success).toBe(true);
    expect(schema.safeParse("x".repeat(LONG_TEXT_MAX + 1)).success).toBe(false);
  });
});
