import { describe, expect, it } from "vitest";

import {
  formatActivityLogAction,
  formatActivityLogDetails,
  getNotificationActivityActor,
} from "./activity-log-display";

describe("activity-log-display (PC-245)", () => {
  it("never returns raw JSON for unknown payloads", () => {
    const details = JSON.stringify({ userId: "u-1", username: "luke" });
    const formatted = formatActivityLogDetails("users.create_active", details);
    expect(formatted).not.toContain("{");
    expect(formatted).toContain("luke");
  });

  it("formats force reload environment", () => {
    expect(
      formatActivityLogDetails("admin.force_reload", JSON.stringify({ environment: "dev" })),
    ).toBe("Environment: dev");
  });

  it("labels common actions", () => {
    expect(formatActivityLogAction("users.admin_pause")).toBe("Paused user");
    expect(formatActivityLogAction("places.add_person")).toBe("Added person to place");
    expect(formatActivityLogAction("proposals.admin_delete")).toBe("Admin deleted proposal");
    expect(formatActivityLogAction("proposals.draft_delete")).toBe("Deleted draft proposal");
    expect(formatActivityLogAction("proposal.admin_rescheduled")).toBe(
      "Admin rescheduled proposal",
    );
  });

  it("prefers notification actor metadata and names the recipient in details", () => {
    const details = JSON.stringify({
      message: 'Leia rescheduled "Dinner".',
      actorUserId: "user-leia",
      actorDisplayName: "Leia",
      recipientDisplayName: "Luke",
    });

    expect(getNotificationActivityActor("notification.proposal_rescheduled", details)).toEqual({
      actorUserId: "user-leia",
      actorDisplayName: "Leia",
    });
    expect(formatActivityLogDetails("notification.proposal_rescheduled", details)).toBe(
      'Notified: Luke · Leia rescheduled "Dinner".',
    );
  });

  it("falls back to action label when JSON has no useful fields", () => {
    const formatted = formatActivityLogDetails("mystery.action", JSON.stringify({ foo: 1 }));
    expect(formatted).not.toMatch(/^\s*\{/);
    expect(formatted.length).toBeGreaterThan(0);
  });
});
