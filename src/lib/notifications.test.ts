import { describe, expect, it } from "vitest";

import { resolveNotificationUrl } from "@/lib/notifications";

describe("resolveNotificationUrl", () => {
  it("uses explicit metadata url when provided", () => {
    expect(resolveNotificationUrl("proposal_submitted", { url: "/profile" })).toBe("/profile");
  });

  it("links proposals with highlight query", () => {
    expect(resolveNotificationUrl("proposal_submitted", { proposalId: "prop-1" })).toBe(
      "/proposals?highlight=prop-1",
    );
  });

  it("routes partnership notifications to people", () => {
    expect(resolveNotificationUrl("partnership_proposed", {})).toBe("/people");
  });

  it("routes residency notifications to places", () => {
    expect(resolveNotificationUrl("residency_proposed", {})).toBe("/places");
  });
});
