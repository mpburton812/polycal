import { describe, expect, it } from "vitest";

import { isFeedMilestoneVisibleViaAdminOnly } from "./admin-only-visibility";

describe("isFeedMilestoneVisibleViaAdminOnly (PC-250)", () => {
  it("is false for non-admins", () => {
    expect(
      isFeedMilestoneVisibleViaAdminOnly({
        isAdmin: false,
        nonAdminWouldSeeProposal: false,
        nonAdminWouldSeeAudit: false,
      }),
    ).toBe(false);
  });

  it("is true when admin sees sleeping content a non-admin would not", () => {
    expect(
      isFeedMilestoneVisibleViaAdminOnly({
        isAdmin: true,
        nonAdminWouldSeeProposal: false,
        nonAdminWouldSeeAudit: true,
      }),
    ).toBe(true);
  });

  it("is true when audit log is admin-only and viewer is uninvolved", () => {
    expect(
      isFeedMilestoneVisibleViaAdminOnly({
        isAdmin: true,
        nonAdminWouldSeeProposal: true,
        nonAdminWouldSeeAudit: false,
      }),
    ).toBe(true);
  });

  it("is false when a non-admin in the same seat would also see it", () => {
    expect(
      isFeedMilestoneVisibleViaAdminOnly({
        isAdmin: true,
        nonAdminWouldSeeProposal: true,
        nonAdminWouldSeeAudit: true,
      }),
    ).toBe(false);
  });
});
