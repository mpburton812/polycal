import { describe, expect, it } from "vitest";

import { formatBuildTimestamp } from "@/lib/build-info";

describe("formatBuildTimestamp", () => {
  it("formats a valid ISO timestamp", () => {
    const labels = formatBuildTimestamp("2026-07-03T14:30:00.000Z", "en-US");
    expect(labels.buildDateLabel).toContain("2026");
    expect(labels.buildTimeLabel.length).toBeGreaterThan(0);
  });

  it("returns Unknown for invalid timestamps", () => {
    expect(formatBuildTimestamp("not-a-date")).toEqual({
      buildDateLabel: "Unknown",
      buildTimeLabel: "Unknown",
    });
  });
});
