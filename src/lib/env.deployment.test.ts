import { afterEach, describe, expect, it } from "vitest";

import { getAppEnvironment, validateDeploymentDatabaseConfig } from "./env";

describe("validateDeploymentDatabaseConfig", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("throws when production uses a file database", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.TURSO_DATABASE_URL = "file:local.db";
    expect(() => validateDeploymentDatabaseConfig()).toThrow(/file:/);
  });

  it("allows production Turso URLs", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.TURSO_DATABASE_URL = "libsql://polycal-prod.example";
    expect(() => validateDeploymentDatabaseConfig()).not.toThrow();
    expect(getAppEnvironment()).toBe("production");
  });
});
