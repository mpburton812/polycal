import { describe, expect, it } from "vitest";

import {
  formatAccessLevel,
  formatUserRole,
  resolveAccessLevel,
} from "@/lib/users/role-labels";

describe("formatUserRole", () => {
  it("maps passive to Proxy for user-facing copy", () => {
    expect(formatUserRole("passive")).toBe("Proxy");
  });

  it("maps admin and user roles", () => {
    expect(formatUserRole("admin")).toBe("Admin");
    expect(formatUserRole("user")).toBe("User");
  });

  it("passes through unknown roles", () => {
    expect(formatUserRole("custom")).toBe("custom");
  });
});

describe("resolveAccessLevel / formatAccessLevel", () => {
  it("ranks platform admin above role", () => {
    expect(resolveAccessLevel({ role: "user", isPlatformAdmin: true })).toBe(
      "platform_admin",
    );
    expect(formatAccessLevel({ role: "user", isPlatformAdmin: true })).toBe(
      "Platform Admin",
    );
  });

  it("falls back to role when not platform admin", () => {
    expect(resolveAccessLevel({ role: "admin", isPlatformAdmin: false })).toBe("admin");
    expect(resolveAccessLevel({ role: "passive", isPlatformAdmin: false })).toBe(
      "passive",
    );
    expect(formatAccessLevel("user")).toBe("User");
    expect(formatAccessLevel("passive")).toBe("Proxy");
  });
});
