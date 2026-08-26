import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

  describe("environment-derived sign-in URL", () => {
    const originalAuthUrl = process.env.AUTH_URL;
    const originalNextAuthUrl = process.env.NEXTAUTH_URL;
    const originalAppEnv = process.env.NEXT_PUBLIC_APP_ENV;

    beforeEach(() => {
      delete process.env.AUTH_URL;
      delete process.env.NEXTAUTH_URL;
      delete process.env.NEXT_PUBLIC_APP_ENV;
    });

    afterEach(() => {
      process.env.AUTH_URL = originalAuthUrl;
      process.env.NEXTAUTH_URL = originalNextAuthUrl;
      process.env.NEXT_PUBLIC_APP_ENV = originalAppEnv;
    });

    it("uses AUTH_URL when appUrl is not provided", () => {
      process.env.AUTH_URL = "https://polycal-git-test-example.vercel.app/";
      const text = buildLoginInstructions({ username: "u", password: "p" });
      expect(text).toContain(
        "Sign in: https://polycal-git-test-example.vercel.app/login",
      );
      expect(text).not.toContain("polycal.net/login");
      expect(text).not.toContain("https://polycal.net");
    });

    it("falls back to the tier URL from NEXT_PUBLIC_APP_ENV", () => {
      process.env.NEXT_PUBLIC_APP_ENV = "test";
      const text = buildLoginInstructions({ username: "u", password: "p" });
      expect(text).toContain(
        "Sign in: https://test.polycal.net/login",
      );
    });
  });
});
