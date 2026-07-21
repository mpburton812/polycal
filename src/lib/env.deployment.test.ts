import { afterEach, describe, expect, it } from "vitest";

import {
  assertProductionHardening,
  getAppEnvironment,
  validateDeploymentDatabaseConfig,
} from "./env";

describe("validateDeploymentDatabaseConfig", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("throws when production uses a file database", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.TURSO_DATABASE_URL = "file:local.db";
    process.env.AUTH_URL = "https://polycal.example";
    expect(() => validateDeploymentDatabaseConfig()).toThrow(/file:/);
  });

  it("allows production Turso URLs", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.TURSO_DATABASE_URL = "libsql://polycal-prod.example";
    process.env.AUTH_URL = "https://polycal.example";
    expect(() => validateDeploymentDatabaseConfig()).not.toThrow();
    expect(getAppEnvironment()).toBe("production");
  });

  it("throws when production AUTH_URL points at localhost (PC-282)", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.TURSO_DATABASE_URL = "libsql://polycal-prod.example";
    process.env.AUTH_URL = "http://localhost:3000";
    expect(() => validateDeploymentDatabaseConfig()).toThrow(/localhost AUTH_URL/);
  });

  it("throws when polycal-prod DB uses localhost AUTH_URL even if env is feature", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "feature";
    process.env.TURSO_DATABASE_URL = "libsql://polycal-prod.example";
    process.env.AUTH_URL = "http://127.0.0.1:3000";
    expect(() => assertProductionHardening()).toThrow(/localhost AUTH_URL/);
  });
});
