import { afterEach, describe, expect, it } from "vitest";

import { E2E_API_SECRET_HEADER, isE2eApiAuthorized, isE2eApiEnabled } from "./e2e-api";

describe("isE2eApiEnabled", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("is disabled in production even when E2E_TEST_MODE is set", () => {
    process.env.E2E_TEST_MODE = "1";
    process.env.E2E_API_SECRET = "secret";
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    expect(isE2eApiEnabled()).toBe(false);
  });

  it("requires E2E_API_SECRET when test mode is on", () => {
    process.env.E2E_TEST_MODE = "1";
    process.env.NEXT_PUBLIC_APP_ENV = "feature";
    delete process.env.E2E_API_SECRET;
    expect(isE2eApiEnabled()).toBe(false);

    process.env.E2E_API_SECRET = "secret";
    expect(isE2eApiEnabled()).toBe(true);
  });

  it("refuses a production database URL regardless of tier (PC-353)", () => {
    process.env.E2E_TEST_MODE = "1";
    process.env.E2E_API_SECRET = "secret";
    process.env.NEXT_PUBLIC_APP_ENV = "test";
    process.env.TURSO_DATABASE_URL = "libsql://polycal-prod-mpburton.turso.io";
    expect(isE2eApiEnabled()).toBe(false);
  });

  it("refuses NODE_ENV=production when no non-production tier is declared (PC-353)", () => {
    process.env.E2E_TEST_MODE = "1";
    process.env.E2E_API_SECRET = "secret";
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.TURSO_DATABASE_URL;
    expect(isE2eApiEnabled()).toBe(false);
  });

  it("still allows the CI harness, which serves a production build on a feature tier", () => {
    process.env.E2E_TEST_MODE = "1";
    process.env.E2E_API_SECRET = "secret";
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_ENV = "feature";
    process.env.TURSO_DATABASE_URL = "file:e2e-w0.db";
    expect(isE2eApiEnabled()).toBe(true);
  });
});

describe("isE2eApiAuthorized", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  function requestWithSecret(secret?: string): Request {
    return new Request("http://localhost/api/e2e/seed", {
      headers: secret ? { [E2E_API_SECRET_HEADER]: secret } : {},
    });
  }

  it("accepts the configured secret and rejects everything else", () => {
    process.env.E2E_TEST_MODE = "1";
    process.env.NEXT_PUBLIC_APP_ENV = "feature";
    process.env.E2E_API_SECRET = "harness-secret";
    delete process.env.TURSO_DATABASE_URL;

    expect(isE2eApiAuthorized(requestWithSecret("harness-secret"))).toBe(true);
    expect(isE2eApiAuthorized(requestWithSecret("harness-secre"))).toBe(false);
    expect(isE2eApiAuthorized(requestWithSecret())).toBe(false);
  });

  it("rejects a valid secret once the gate is closed", () => {
    process.env.E2E_TEST_MODE = "1";
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.E2E_API_SECRET = "harness-secret";
    expect(isE2eApiAuthorized(requestWithSecret("harness-secret"))).toBe(false);
  });
});
