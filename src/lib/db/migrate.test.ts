import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION, shouldSkipMigrations } from "./migrate";

describe("shouldSkipMigrations (PC-143)", () => {
  it("skips when stored version matches the target", () => {
    expect(shouldSkipMigrations(SCHEMA_VERSION)).toBe(true);
    expect(shouldSkipMigrations("21", "21")).toBe(true);
  });

  it("runs migrations when versions differ or are missing", () => {
    expect(shouldSkipMigrations(null)).toBe(false);
    expect(shouldSkipMigrations(undefined)).toBe(false);
    expect(shouldSkipMigrations("")).toBe(false);
    expect(shouldSkipMigrations("20")).toBe(false);
    expect(shouldSkipMigrations("20", "21")).toBe(false);
  });

  it("keeps verify-turso-schema.mjs in sync with SCHEMA_VERSION (PC-355)", () => {
    const verifyScript = readFileSync(
      path.join(process.cwd(), "scripts", "verify-turso-schema.mjs"),
      "utf8",
    );
    expect(verifyScript).toContain(`EXPECTED_SCHEMA_VERSION = "${SCHEMA_VERSION}"`);
  });
});
