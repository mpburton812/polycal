import { describe, expect, it } from "vitest";

import { isEmailLoginTokenExpired, isNextRedirectError } from "@/lib/auth/email-login";

describe("email login token expiry (PC-465)", () => {
  it("treats missing expiry as expired", () => {
    expect(isEmailLoginTokenExpired(null)).toBe(true);
    expect(isEmailLoginTokenExpired(undefined)).toBe(true);
  });

  it("redeems a token still inside the window", () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    expect(isEmailLoginTokenExpired(expiresAt)).toBe(false);
  });

  it("rejects an expired token", () => {
    const expiresAt = new Date(Date.now() - 1_000).toISOString();
    expect(isEmailLoginTokenExpired(expiresAt)).toBe(true);
  });
});

describe("isNextRedirectError", () => {
  it("recognizes Auth.js / Next.js redirect errors", () => {
    expect(isNextRedirectError({ digest: "NEXT_REDIRECT;replace;/feed;303;" })).toBe(true);
    expect(isNextRedirectError(new Error("CredentialsSignin"))).toBe(false);
    expect(isNextRedirectError(null)).toBe(false);
  });
});
