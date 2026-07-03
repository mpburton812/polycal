import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseLatestUnreleasedEntry, readProjectChangelog } from "@/lib/changelog";
import { getBuildBranch, getBuildSha } from "@/lib/env";

/** Build metadata shown in admin Version panel and dev tooling. */
export interface BuildInfo {
  /** Human-readable build label (app name + short SHA). */
  name: string;
  /** ISO timestamp frozen when the production bundle was built. */
  builtAtIso: string;
  /** Calendar date portion of the build timestamp in the viewer locale. */
  buildDateLabel: string;
  /** Clock time portion of the build timestamp in the viewer locale. */
  buildTimeLabel: string;
  gitSha: string;
  branch: string;
  /** First [Unreleased] changelog bullet, when CHANGELOG.md is available. */
  changelogEntry: string | null;
}

/**
 * Splits an ISO timestamp into localized date and time labels for display.
 * Separated for unit testing without environment-specific build wiring.
 */
export function formatBuildTimestamp(
  iso: string,
  locale?: string,
): { buildDateLabel: string; buildTimeLabel: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { buildDateLabel: "Unknown", buildTimeLabel: "Unknown" };
  }

  return {
    buildDateLabel: date.toLocaleDateString(locale, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    buildTimeLabel: date.toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

/**
 * Resolves build metadata for the running deployment.
 * When `repoRoot` is provided (server components), changelog is read from disk.
 */
export function getBuildInfo(options?: {
  repoRoot?: string;
  locale?: string;
}): BuildInfo {
  const gitSha = getBuildSha();
  const branch = getBuildBranch();
  const builtAtIso = process.env.NEXT_PUBLIC_BUILD_TIME ?? new Date(0).toISOString();
  const { buildDateLabel, buildTimeLabel } = formatBuildTimestamp(
    builtAtIso,
    options?.locale,
  );

  let changelogEntry: string | null = null;
  if (options?.repoRoot) {
    try {
      const markdown = readProjectChangelog(options.repoRoot);
      changelogEntry = parseLatestUnreleasedEntry(markdown)?.summary ?? null;
    } catch {
      changelogEntry = null;
    }
  }

  return {
    name: `PolyCal ${gitSha}`,
    builtAtIso,
    buildDateLabel,
    buildTimeLabel,
    gitSha,
    branch,
    changelogEntry,
  };
}

/** Server-only helper: build info with changelog loaded from the repo. */
export function getServerBuildInfo(repoRoot: string, locale?: string): BuildInfo {
  return getBuildInfo({ repoRoot, locale });
}

/** Reads package.json name for display fallbacks in scripts. */
export function readPackageName(repoRoot: string): string {
  const pkg = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  ) as { name?: string };
  return pkg.name ?? "polycal";
}
