import { afterEach, describe, expect, it } from "vitest";

import { isE2eApiEnabled } from "./e2e-api";

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
});
