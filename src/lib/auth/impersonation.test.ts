import { describe, expect, it, vi, afterEach } from "vitest";

describe("getImpersonationSecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reads the dedicated secret and never AUTH_SECRET (PC-179)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "dev");
    vi.stubEnv("AUTH_IMPERSONATION_SECRET", "dev-impersonation-secret");
    const { getImpersonationSecret, isImpersonationConfigured } = await import(
      "./impersonation"
    );
    expect(getImpersonationSecret()).toBe("dev-impersonation-secret");
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

  it("denies production impersonation unless explicitly allowed (PC-353)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("AUTH_IMPERSONATION_SECRET", "prod-impersonation-secret");
    vi.stubEnv("ALLOW_PROD_IMPERSONATION", "");
    const {
      isImpersonationAllowedForEnvironment,
      isImpersonationConfigured,
      isValidImpersonationSecret,
    } = await import("./impersonation");

    expect(isImpersonationAllowedForEnvironment()).toBe(false);
    expect(isImpersonationConfigured()).toBe(false);
    expect(isValidImpersonationSecret("prod-impersonation-secret")).toBe(false);
  });

  it("allows production impersonation with ALLOW_PROD_IMPERSONATION=1 (PC-353)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("AUTH_IMPERSONATION_SECRET", "prod-impersonation-secret");
    vi.stubEnv("ALLOW_PROD_IMPERSONATION", "1");
    const { isImpersonationConfigured, isValidImpersonationSecret } = await import(
      "./impersonation"
    );

    expect(isImpersonationConfigured()).toBe(true);
    expect(isValidImpersonationSecret("prod-impersonation-secret")).toBe(true);
    expect(isValidImpersonationSecret("wrong-secret")).toBe(false);
    expect(isValidImpersonationSecret(undefined)).toBe(false);
  });

  it("keeps the DevBar impersonation UI off production regardless of the override", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    vi.stubEnv("AUTH_IMPERSONATION_SECRET", "prod-impersonation-secret");
    vi.stubEnv("ALLOW_PROD_IMPERSONATION", "1");
    const { isDevImpersonationUiEnabled } = await import("./impersonation");
    expect(isDevImpersonationUiEnabled()).toBe(false);
  });
});
