import { describe, expect, it } from "vitest";

import { notificationEmailMatchesToken } from "./setup-creator";

describe("notificationEmailMatchesToken", () => {
  it("accepts when notification email matches token email case-insensitively", () => {
    expect(notificationEmailMatchesToken("User@Example.com", "user@example.com")).toBe(true);
  });

  it("accepts when notification email is unset so the token can bind it", () => {
    expect(notificationEmailMatchesToken(null, "user@example.com")).toBe(true);
    expect(notificationEmailMatchesToken(undefined, "user@example.com")).toBe(true);
  });

  it("rejects when notification email differs from token email", () => {
    expect(notificationEmailMatchesToken("other@example.com", "user@example.com")).toBe(false);
  });
});
