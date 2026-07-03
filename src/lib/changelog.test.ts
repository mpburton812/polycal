import { describe, expect, it } from "vitest";

import {
  extractUnreleasedSection,
  parseLatestUnreleasedEntry,
  unreleasedSectionCoversJiraKeys,
} from "@/lib/changelog";

const SAMPLE = `# Changelog

## [Unreleased]

### Added

- PC-74: All-day events with date pickers.
- PC-75: Admin Version panel.

## [1.0.0]
`;

describe("changelog parsing", () => {
  it("extracts the unreleased section", () => {
    const section = extractUnreleasedSection(SAMPLE);
    expect(section).toContain("PC-74");
    expect(section).not.toContain("[1.0.0]");
  });

  it("returns the first unreleased bullet", () => {
    expect(parseLatestUnreleasedEntry(SAMPLE)).toEqual({
      summary: "PC-74: All-day events with date pickers.",
      jiraKey: "PC-74",
    });
  });

  it("validates jira keys appear in unreleased", () => {
    expect(unreleasedSectionCoversJiraKeys(SAMPLE, ["PC-74", "PC-75"])).toBe(true);
    expect(unreleasedSectionCoversJiraKeys(SAMPLE, ["PC-99"])).toBe(false);
  });
});
