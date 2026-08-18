import { describe, expect, it } from "vitest";

import { nextInviteeSelection } from "@/lib/proposals/invitee-tap-cycle";

describe("nextInviteeSelection (PC-435)", () => {
  it("cycles none → required → optional → none for proposals", () => {
    expect(nextInviteeSelection("none", "proposal")).toBe("required");
    expect(nextInviteeSelection("required", "proposal")).toBe("optional");
    expect(nextInviteeSelection("optional", "proposal")).toBe("none");
    expect(nextInviteeSelection("booked", "proposal")).toBe("none");
  });

  it("cycles none → booked → optional → none for bookings", () => {
    expect(nextInviteeSelection("none", "booking")).toBe("booked");
    expect(nextInviteeSelection("booked", "booking")).toBe("optional");
    expect(nextInviteeSelection("optional", "booking")).toBe("none");
  });
});
