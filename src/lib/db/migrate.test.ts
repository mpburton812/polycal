import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION, shouldSkipMigrations } from "./migrate";

describe("shouldSkipMigrations (PC-143)", () => {
  it("skips when stored version matches the target", () => {
    expect(shouldSkipMigrations(SCHEMA_VERSION)).toBe(true);
    expect(shouldSkipMigrations("20", "20")).toBe(true);
  });

  it("runs migrations when versions differ or are missing", () => {
    expect(shouldSkipMigrations(null)).toBe(false);
    expect(shouldSkipMigrations(undefined)).toBe(false);
    expect(shouldSkipMigrations("")).toBe(false);
    expect(shouldSkipMigrations("19")).toBe(false);
    expect(shouldSkipMigrations("20", "21")).toBe(false);
  });
});
