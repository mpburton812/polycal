import { describe, expect, it } from "vitest";

import { isAdminOversightView } from "./proposalCardTheme";

describe("isAdminOversightView", () => {
  it("is true when admin views another user's proposal", () => {
    expect(isAdminOversightView(true, "admin-1", "user-2")).toBe(true);
  });

  it("is false for the proposer's own cards", () => {
    expect(isAdminOversightView(true, "admin-1", "admin-1")).toBe(false);
  });

  it("is false for non-admins", () => {
    expect(isAdminOversightView(false, "user-1", "user-2")).toBe(false);
  });

  it("is false when proposer is missing", () => {
    expect(isAdminOversightView(true, "admin-1", null)).toBe(false);
    expect(isAdminOversightView(true, "admin-1", undefined)).toBe(false);
  });
});
