import { describe, expect, it } from "vitest";

import { CHANGELOG, getLatestChangelogEntry } from "./entries";

describe("change control log", () => {
  it("has at least one entry", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
  });

  it("is ordered newest first by date", () => {
    for (let i = 1; i < CHANGELOG.length; i += 1) {
      expect(
        CHANGELOG[i - 1]!.date >= CHANGELOG[i]!.date,
      ).toBe(true);
    }
  });

  it("every entry has a version, date, summary, and at least one change", () => {
    for (const entry of CHANGELOG) {
      expect(entry.version).toMatch(/\S/);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.summary).toMatch(/\S/);
      expect(entry.changes.length).toBeGreaterThan(0);
      for (const change of entry.changes) {
        expect(["added", "changed", "fixed"]).toContain(change.type);
        expect(change.description).toMatch(/\S/);
      }
    }
  });

  it("returns the newest entry as the latest", () => {
    expect(getLatestChangelogEntry()).toBe(CHANGELOG[0]);
  });
});
