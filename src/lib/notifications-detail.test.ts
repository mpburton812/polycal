import { describe, expect, it } from "vitest";

import {
  buildProposalNotificationDetail,
  formatNotificationWhen,
} from "./notifications-detail";

describe("formatNotificationWhen", () => {
  it("formats a timed event with start and end on the same day", () => {
    const label = formatNotificationWhen(
      "2026-07-15T14:00:00.000Z",
      "2026-07-15T16:00:00.000Z",
      { proposalType: "event", timeZone: "UTC" },
    );
    expect(label).toContain("Jul 15");
    expect(label).toContain("2:00");
    expect(label).toContain("4:00");
    expect(label).toContain("–");
  });

  it("omits the time for all-day proposals", () => {
    const label = formatNotificationWhen(
      "2026-07-15T00:00:00.000Z",
      "2026-07-15T23:59:00.000Z",
      { proposalType: "event", isAllDay: true, timeZone: "UTC" },
    );
    expect(label).toContain("Jul 15");
    expect(label).not.toMatch(/\d:\d\d/);
  });

  it("omits the time for sleeping proposals", () => {
    const label = formatNotificationWhen("2026-07-15T00:00:00.000Z", null, {
      proposalType: "sleeping",
      timeZone: "UTC",
    });
    expect(label).toContain("Jul 15");
    expect(label).not.toMatch(/\d:\d\d/);
  });

  it("returns null for missing or invalid start", () => {
    expect(formatNotificationWhen(null, null)).toBeNull();
    expect(formatNotificationWhen("not-a-date", null)).toBeNull();
  });
});

describe("buildProposalNotificationDetail", () => {
  it("includes when and where when available", () => {
    const detail = buildProposalNotificationDetail(
      {
        scheduledStartAt: "2026-07-15T14:00:00.000Z",
        scheduledEndAt: "2026-07-15T16:00:00.000Z",
        proposalType: "event",
        placeName: "The Lake House",
      },
      { timeZone: "UTC" },
    );
    expect(detail).toContain("When:");
    expect(detail).toContain("Where: The Lake House");
    expect(detail).toContain("·");
  });

  it("falls back to locationText when no place name", () => {
    const detail = buildProposalNotificationDetail(
      { locationText: "Downtown cafe" },
      { timeZone: "UTC" },
    );
    expect(detail).toBe("Where: Downtown cafe");
  });

  it("returns an empty string when no context is present", () => {
    expect(buildProposalNotificationDetail(undefined)).toBe("");
    expect(buildProposalNotificationDetail({ proposalId: "abc" })).toBe("");
  });
});
