import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Jira issue key pattern for the PolyCal project (PC). */
export const JIRA_KEY_PATTERN = /PC-\d+/g;

/** Branches that require a Jira key in every non-merge commit message. */
export const JIRA_REQUIRED_BRANCH_PREFIX = "feature/";

export const REQUIREMENTS_FILE = ".requirements";
export const LOG_SEPARATOR = "--- log entries below this line ---";

export interface RequirementEntry {
  date: string;
  commitSha: string;
  jiraKey: string;
  summary: string;
  module: string;
}

/**
 * Run a git command and return trimmed stdout.
 * Uses execFileSync to avoid shell injection from branch or path values.
 */
export function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/** Current checked-out branch name. */
export function currentBranch(): string {
  return git(["rev-parse", "--abbrev-ref", "HEAD"]);
}

/** True when the branch is a feature/* branch subject to Jira key enforcement. */
export function isFeatureBranch(branch = currentBranch()): boolean {
  return branch.startsWith(JIRA_REQUIRED_BRANCH_PREFIX);
}

/** Extract the first Jira key from text, or null if none found. */
export function extractJiraKey(text: string): string | null {
  const match = text.match(JIRA_KEY_PATTERN);
  return match?.[0] ?? null;
}

/** Extract all unique Jira keys from text. */
export function extractAllJiraKeys(text: string): string[] {
  return [...new Set(text.match(JIRA_KEY_PATTERN) ?? [])];
}

/** Extract all unique Jira keys from every commit in a revision range. */
export function jiraKeysInRange(range: string): string[] {
  try {
    const output = git(["log", "--no-merges", "--format=%s%n%b", range]);
    if (!output) {
      return [];
    }

    return [...new Set(extractAllJiraKeys(output))];
  } catch {
    return [];
  }
}


/**
 * Strip conventional-commit prefix and Jira keys from a subject line
 * so the remaining text can serve as the requirement summary.
 */
export function cleanCommitSubject(subject: string): string {
  return subject
    .replace(/^(feat|fix|chore|docs|refactor|test|ci|build|perf|style)(\([^)]+\))?!?:\s*/i, "")
    .replace(JIRA_KEY_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Short (7-char) commit SHA for log readability. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** ISO date (YYYY-MM-DD) in local timezone for log entries. */
export function formatLogDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Pick the most representative changed file path for a commit.
 * Prefers src/ paths and ignores lockfiles and the requirements log itself.
 */
export function pickPrimaryModule(changedFiles: string[]): string {
  const ignored = new Set([REQUIREMENTS_FILE, "package-lock.json", "pnpm-lock.yaml"]);
  const candidates = changedFiles
    .filter((file) => !ignored.has(file))
    .filter((file) => !file.endsWith(".lock"));

  const srcFile = candidates.find((file) => file.startsWith("src/"));
  if (srcFile) {
    return srcFile;
  }

  const appFile = candidates.find((file) => file.startsWith("app/"));
  if (appFile) {
    return appFile;
  }

  return candidates[0] ?? "n/a";
}

/** Serialize a log entry using the project pipe-delimited format. */
export function formatEntry(entry: RequirementEntry): string {
  return `${entry.date} | ${entry.commitSha} | ${entry.jiraKey} | ${entry.summary} | ${entry.module}`;
}

/** Parse a log line into an entry, or null if the line is a comment/blank. */
export function parseEntry(line: string): RequirementEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const parts = trimmed.split("|").map((part) => part.trim());
  if (parts.length < 5) {
    return null;
  }

  const [date, commitSha, jiraKey, summary, ...moduleParts] = parts;
  return {
    date,
    commitSha,
    jiraKey,
    summary,
    module: moduleParts.join(" | "),
  };
}

/** Read existing log entries from .requirements (below the separator). */
export function readEntries(repoRoot: string): RequirementEntry[] {
  const filePath = join(repoRoot, REQUIREMENTS_FILE);
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, "utf8");
  const logSection = content.includes(LOG_SEPARATOR)
    ? content.split(LOG_SEPARATOR).slice(1).join(LOG_SEPARATOR)
    : content;

  return logSection
    .split("\n")
    .map(parseEntry)
    .filter((entry): entry is RequirementEntry => entry !== null);
}

/** True when an entry for the given full commit SHA already exists. */
export function hasEntryForCommit(entries: RequirementEntry[], commitSha: string): boolean {
  const short = shortSha(commitSha);
  return entries.some(
    (entry) => entry.commitSha === commitSha || entry.commitSha === short,
  );
}

/**
 * Append a formatted entry to .requirements if not already present.
 * Returns true when a new line was written.
 */
export function appendEntry(repoRoot: string, entry: RequirementEntry): boolean {
  const filePath = join(repoRoot, REQUIREMENTS_FILE);
  const existing = readEntries(repoRoot);

  if (hasEntryForCommit(existing, entry.commitSha)) {
    return false;
  }

  let content = existsSync(filePath)
    ? readFileSync(filePath, "utf8")
    : `# ${REQUIREMENTS_FILE}\n\n${LOG_SEPARATOR}\n`;

  if (!content.includes(LOG_SEPARATOR)) {
    content = `${content.trimEnd()}\n\n${LOG_SEPARATOR}\n`;
  }

  if (!content.endsWith("\n")) {
    content += "\n";
  }

  content += `${formatEntry(entry)}\n`;
  writeFileSync(filePath, content, "utf8");
  return true;
}
