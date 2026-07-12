import { describe, expect, it, vi, afterEach } from "vitest";

describe("getImpersonationSecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns the dedicated secret on production when configured (PC-179)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("AUTH_IMPERSONATION_SECRET", "prod-impersonation-secret");
    const { getImpersonationSecret, isImpersonationConfigured } = await import(
      "./impersonation"
    );
    expect(getImpersonationSecret()).toBe("prod-impersonation-secret");
    expect(isImpersonationConfigured()).toBe(true);
  });

  it("returns null when the dedicated secret is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("AUTH_IMPERSONATION_SECRET", "");
    const { getImpersonationSecret, isImpersonationConfigured } = await import(
      "./impersonation"
    );
    expect(getImpersonationSecret()).toBeNull();
    expect(isImpersonationConfigured()).toBe(false);
  });
});
