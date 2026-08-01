import { describe, expect, it } from "vitest";

import {
  legacyRoleToNetworkRole,
  networkRoleToLegacyRole,
  DEFAULT_PLATFORM_SETTINGS,
} from "@/types/network";

describe("network role mapping (PC-357)", () => {
  it("maps legacy admin to network_admin and back", () => {
    expect(legacyRoleToNetworkRole("admin")).toBe("network_admin");
    expect(networkRoleToLegacyRole("network_admin")).toBe("admin");
  });

  it("maps passive unchanged", () => {
    expect(legacyRoleToNetworkRole("passive")).toBe("passive");
    expect(networkRoleToLegacyRole("passive")).toBe("passive");
  });

  it("exposes sane platform setting defaults", () => {
    expect(DEFAULT_PLATFORM_SETTINGS.maxNetworksPerEmail).toBeGreaterThan(0);
    expect(DEFAULT_PLATFORM_SETTINGS.maxNetworkCreatesPerDay).toBeGreaterThan(0);
  });
});
