import { describe, expect, it } from "vitest";

import { buildLoginInstructions, generateTemporaryPassword } from "./credentials";

describe("generateTemporaryPassword", () => {
  it("returns a password of the requested length", () => {
    expect(generateTemporaryPassword(16)).toHaveLength(16);
  });

  it("uses only characters from the safe alphabet", () => {
    const alphabet =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const password = generateTemporaryPassword(32);
    expect([...password].every((char) => alphabet.includes(char))).toBe(true);
  });
});

describe("buildLoginInstructions", () => {
  it("includes username, password, and login URL", () => {
    const text = buildLoginInstructions({
      username: "newuser",
      password: "TempPass123",
      appUrl: "https://example.test",
    });
    expect(text).toContain("Username: newuser");
    expect(text).toContain("Temporary password: TempPass123");
    expect(text).toContain("https://example.test/login");
    expect(text).toContain("change your password");
  });
});
