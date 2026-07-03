import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Parsed headline from the [Unreleased] section of CHANGELOG.md. */
export interface ChangelogHeadline {
  /** First substantive bullet under [Unreleased], without the leading dash. */
  summary: string;
  /** PC-xxx key when present on that bullet. */
  jiraKey: string | null;
}

const UNRELEASED_HEADER = "## [Unreleased]";

/**
 * Returns the markdown body between [Unreleased] and the next ## heading.
 * Keeps parsing logic isolated so admin UI and promotion scripts share one source.
 */
export function extractUnreleasedSection(markdown: string): string {
  const start = markdown.indexOf(UNRELEASED_HEADER);
  if (start === -1) return "";

  const afterHeader = markdown.slice(start + UNRELEASED_HEADER.length);
  const nextSection = afterHeader.search(/\r?\n## /);
  return nextSection === -1 ? afterHeader : afterHeader.slice(0, nextSection);
}

/**
 * First bullet line in [Unreleased] (skips ### sub-headings).
 * Used for the admin Version panel "most recent build" changelog line.
 */
export function parseLatestUnreleasedEntry(markdown: string): ChangelogHeadline | null {
  const section = extractUnreleasedSection(markdown);
  const lines = section.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) continue;

    const summary = trimmed.slice(2).trim();
    if (!summary) continue;

    const keyMatch = summary.match(/\b(PC-\d+)\b/);
    return {
      summary,
      jiraKey: keyMatch?.[1] ?? null,
    };
  }

  return null;
}

/** Reads CHANGELOG.md from the repository root. */
export function readProjectChangelog(repoRoot: string): string {
  return readFileSync(join(repoRoot, "CHANGELOG.md"), "utf8");
}

/**
 * True when every supplied Jira key appears somewhere in [Unreleased].
 * Promotion gate uses commit keys; changelog may mention them on any bullet.
 */
export function unreleasedSectionCoversJiraKeys(
  markdown: string,
  jiraKeys: string[],
): boolean {
  if (jiraKeys.length === 0) return true;

  const section = extractUnreleasedSection(markdown);
  const normalized = new Set(
    jiraKeys.map((key) => key.toUpperCase()),
  );

  for (const key of normalized) {
    if (!section.toUpperCase().includes(key)) {
      return false;
    }
  }

  return true;
}
