import { describe, expect, it } from "vitest";

import { inviteeRoles } from "./enums";
import { postingKinds } from "@/types/network-settings";

describe("proposals and bookings enums (PC-427)", () => {
  it("includes booked invitee role", () => {
    expect(inviteeRoles).toEqual(["required", "optional", "booked"]);
  });

  it("uses booking posting kind", () => {
    expect(postingKinds).toEqual(["proposal", "booking"]);
  });
});
