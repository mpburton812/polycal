import { describe, expect, it } from "vitest";

import { formatUserRole } from "@/lib/users/role-labels";

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
