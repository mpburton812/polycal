import { describe, expect, it } from "vitest";

import { inviteeRoles } from "./enums";
import { postingKinds } from "@/types/network-settings";
import { networkMemberRoles, networkStatuses } from "@/types/network";

describe("proposals and bookings enums (PC-427)", () => {
  it("includes booked invitee role", () => {
    expect(inviteeRoles).toEqual(["required", "optional", "booked"]);
  });

  it("uses booking posting kind", () => {
    expect(postingKinds).toEqual(["proposal", "booking"]);
  });
});

describe("network enums (PC-460 / PC-462)", () => {
  it("includes sponsor membership role", () => {
    expect(networkMemberRoles).toEqual(["sponsor", "network_admin", "user", "passive"]);
  });

  it("includes pending_delete network status", () => {
    expect(networkStatuses).toEqual(["active", "paused", "pending_delete"]);
  });
});
