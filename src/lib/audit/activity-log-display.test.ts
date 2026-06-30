import { describe, expect, it } from "vitest";

import { formatActivityLogAction, formatActivityLogDetails } from "@/lib/audit/activity-log-display";

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

  it("shows residency comment body instead of raw JSON", () => {
    const details = JSON.stringify({ residencyId: "res-1", body: "Looking forward to it!" });
    expect(formatActivityLogDetails("residency.comment", details)).toBe(
      "Looking forward to it!",
    );
  });

  it("formats residency propose/accept with place and invitee", () => {
    const details = JSON.stringify({
      placeName: "Cloud City",
      inviteeName: "Leia Organa",
      proposalId: "p-1",
    });
    expect(formatActivityLogDetails("places.propose_residency", details)).toBe(
      "Cloud City · invitee: Leia Organa",
    );
    expect(formatActivityLogDetails("residency.accepted", details)).toBe(
      "Cloud City · invitee: Leia Organa",
    );
  });

  it("formats residency decline with reason", () => {
    const details = JSON.stringify({ proposalId: "p-1", reason: "Not ready yet" });
    expect(formatActivityLogDetails("places.decline_residency", details)).toBe("Not ready yet");
    expect(formatActivityLogDetails("residency.declined", details)).toBe("Not ready yet");
  });

  it("labels impersonation actions and enriches target name (PC-63)", () => {
    expect(formatActivityLogAction("admin.impersonate")).toBe("Impersonation");
    const details = JSON.stringify({
      targetUserId: "u-1",
      targetDisplayName: "Leia Organa",
    });
    expect(formatActivityLogDetails("admin.impersonate", details)).toBe("Target: Leia Organa");
  });
});
