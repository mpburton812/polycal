import { describe, expect, it } from "vitest";

import {
  canAccessRestrictedNetwork,
  isElevatedNetworkRole,
  pickSponsorUserId,
} from "@/lib/networks/roles";
import { networkRoleToLegacyRole, networkMemberRoles, networkStatuses } from "@/types/network";

describe("sponsor role mapping (PC-460)", () => {
  it("includes sponsor in membership roles and pending_delete in statuses", () => {
    expect(networkMemberRoles).toContain("sponsor");
    expect(networkStatuses).toContain("pending_delete");
  });

  it("maps sponsor to legacy admin", () => {
    expect(networkRoleToLegacyRole("sponsor")).toBe("admin");
    expect(isElevatedNetworkRole("sponsor")).toBe(true);
    expect(isElevatedNetworkRole("network_admin")).toBe(true);
    expect(isElevatedNetworkRole("user")).toBe(false);
  });
});

describe("pickSponsorUserId (PC-460)", () => {
  it("prefers createdByUserId when that member is still active", () => {
    expect(
      pickSponsorUserId({
        createdByUserId: "b",
        members: [
          { userId: "a", status: "active", createdAt: "2026-01-01T00:00:00.000Z" },
          { userId: "b", status: "active", createdAt: "2026-01-02T00:00:00.000Z" },
        ],
      }),
    ).toBe("b");
  });

  it("falls back to earliest active membership", () => {
    expect(
      pickSponsorUserId({
        createdByUserId: "gone",
        members: [
          { userId: "late", status: "active", createdAt: "2026-01-02T00:00:00.000Z" },
          { userId: "early", status: "active", createdAt: "2026-01-01T00:00:00.000Z" },
          { userId: "gone", status: "removed", createdAt: "2020-01-01T00:00:00.000Z" },
        ],
      }),
    ).toBe("early");
  });
});

describe("pending-delete session rules (PC-462)", () => {
  it("lets sponsor and platform admin use a closing network", () => {
    expect(
      canAccessRestrictedNetwork({
        role: "sponsor",
        networkStatus: "pending_delete",
      }),
    ).toBe(true);
    expect(
      canAccessRestrictedNetwork({
        role: "network_admin",
        networkStatus: "pending_delete",
        isPlatformAdmin: true,
      }),
    ).toBe(true);
  });

  it("locks network admins and users out of pending_delete", () => {
    expect(
      canAccessRestrictedNetwork({
        role: "network_admin",
        networkStatus: "pending_delete",
      }),
    ).toBe(false);
    expect(
      canAccessRestrictedNetwork({
        role: "user",
        networkStatus: "pending_delete",
      }),
    ).toBe(false);
  });

  it("lets network admins stay on paused networks", () => {
    expect(
      canAccessRestrictedNetwork({
        role: "network_admin",
        networkStatus: "paused",
      }),
    ).toBe(true);
    expect(
      canAccessRestrictedNetwork({
        role: "user",
        networkStatus: "paused",
      }),
    ).toBe(false);
  });
});
