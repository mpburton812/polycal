import { describe, expect, it } from "vitest";

import { formatCountdownRemaining } from "./proposalExpiryFormat";

describe("formatCountdownRemaining", () => {
  it("returns Expired when past", () => {
    expect(formatCountdownRemaining("2020-01-01T00:00:00.000Z", Date.parse("2020-01-02T00:00:00.000Z"))).toBe(
      "Expired",
    );
  });

  it("formats days and hours", () => {
    const now = Date.parse("2099-01-01T00:00:00.000Z");
    const target = Date.parse("2099-01-03T05:00:00.000Z");
    expect(formatCountdownRemaining(new Date(target).toISOString(), now)).toBe("2d 5h");
  });

  it("formats minutes and seconds under an hour", () => {
    const now = Date.parse("2099-01-01T00:00:00.000Z");
    const target = Date.parse("2099-01-01T00:10:15.000Z");
    expect(formatCountdownRemaining(new Date(target).toISOString(), now)).toBe("10m 15s");
  });
});
