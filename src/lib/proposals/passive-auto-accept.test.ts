import { describe, expect, it } from "vitest";

import { canManageSleepingAttendees } from "@/lib/proposals/passive-auto-accept";

describe("canManageSleepingAttendees", () => {
  it("allows proposer and admin", () => {
    expect(canManageSleepingAttendees(true, false)).toBe(true);
    expect(canManageSleepingAttendees(false, true)).toBe(true);
  });

  it("denies non-proposer non-admin invitees", () => {
    expect(canManageSleepingAttendees(false, false)).toBe(false);
  });
});
