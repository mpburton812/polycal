import { describe, expect, it } from "vitest";

import {
  formatModerationExpiry,
  moderationExpired,
  moderationExpiresFromDays,
} from "@/lib/users/moderation";

describe("moderation helpers", () => {
  it("detects expired moderation windows", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(moderationExpired(past)).toBe(true);
    expect(moderationExpired(null)).toBe(false);
  });

  it("builds expiry from day count", () => {
    const expires = moderationExpiresFromDays(7);
    expect(expires).toBeTruthy();
    expect(moderationExpiresFromDays(undefined)).toBeNull();
  });

  it("formats expiry for display", () => {
    expect(formatModerationExpiry("2099-01-15T00:00:00.000Z")).toContain("2099");
  });
});
