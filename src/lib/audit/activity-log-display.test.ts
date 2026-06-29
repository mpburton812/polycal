import { describe, expect, it } from "vitest";

import { formatActivityLogDetails } from "@/lib/audit/activity-log-display";

describe("formatActivityLogDetails", () => {
  it("shows notification message instead of raw JSON", () => {
    const details = JSON.stringify({
      message: 'Reminder: "Council" starts soon.',
      url: "/proposals?open=abc",
    });
    expect(formatActivityLogDetails("notification.event_reminder", details)).toBe(
      'Reminder: "Council" starts soon.',
    );
  });

  it("returns plain text when details are not JSON", () => {
    expect(formatActivityLogDetails("user.login", "Signed in from Chrome")).toBe(
      "Signed in from Chrome",
    );
  });
});
