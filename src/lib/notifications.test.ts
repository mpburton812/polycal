import { describe, expect, it } from "vitest";

import { actorNotifyFields, resolveNotificationUrl } from "@/lib/notifications";

describe("resolveNotificationUrl", () => {
  it("uses explicit metadata url when provided", () => {
    expect(resolveNotificationUrl("proposal_submitted", { url: "/profile" })).toBe("/profile");
  });

  it("links proposals with open query", () => {
    expect(resolveNotificationUrl("proposal_submitted", { proposalId: "prop-1" })).toBe(
      "/proposals?open=prop-1",
    );
  });

  it("links event reminders to the proposal detail", () => {
    expect(resolveNotificationUrl("event_reminder", { proposalId: "prop-2" })).toBe(
      "/proposals?open=prop-2",
    );
  });

  it("routes partnership notifications to people-places", () => {
    expect(resolveNotificationUrl("partnership_proposed", {})).toBe("/people-places");
  });

  it("deep-links partnership notifications with partnershipId", () => {
    expect(
      resolveNotificationUrl("partnership_proposed", { partnershipId: "pship-1" }),
    ).toBe("/people-places?partnership=pship-1");
  });

  it("links Google Calendar sync success to the proposal", () => {
    expect(
      resolveNotificationUrl("calendar_google_synced", { proposalId: "prop-g" }),
    ).toBe("/proposals?open=prop-g");
  });

  it("routes Google Calendar sync failures to Profile", () => {
    expect(resolveNotificationUrl("calendar_google_failed", {})).toBe("/profile");
  });
});

describe("actorNotifyFields", () => {
  it("uses the named actor and preserves their user id", () => {
    expect(actorNotifyFields({ id: "user-1", displayName: "Leia" })).toEqual({
      actorUserId: "user-1",
      actorDisplayName: "Leia",
    });
  });

  it("falls back to Someone for a blank display name", () => {
    expect(actorNotifyFields({ id: "user-2", displayName: "  " })).toEqual({
      actorUserId: "user-2",
      actorDisplayName: "Someone",
    });
  });
});
