#!/usr/bin/env node
/**
 * Build Android GitHub Release metadata from the latest change-control entry.
 *
 * Every production push publishes a new APK: tag includes a monotonic
 * versionCode so duplicate CHANGELOG versions still release (domain cutovers,
 * hotfix rebuilds). UpdateChecker prefers the newest android-v* release and
 * compares versionCode.
 *
 * Outputs android-twa/release-meta.json (APK updater) and android-release.json (workflow).
 *
 * Usage: node scripts/android-release-meta.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENTRIES = path.join(ROOT, "src/lib/changelog/entries.ts");
const OUT_DIR = path.join(ROOT, "android-twa");

/**
 * Extract the first CHANGELOG entry block (newest).
 * @returns {string}
 */
function firstEntrySource() {
  const text = fs.readFileSync(ENTRIES, "utf8");
  const marker = "export const CHANGELOG";
  const start = text.indexOf(marker);
  if (start < 0) throw new Error("CHANGELOG export not found");
  const arrayStart = text.indexOf("[", start);
  const firstBrace = text.indexOf("{", arrayStart);
  if (firstBrace < 0) throw new Error("CHANGELOG first entry not found");

  let depth = 0;
  let end = -1;
  for (let i = firstBrace; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error("Unbalanced CHANGELOG entry");
  return text.slice(firstBrace, end);
}

/**
 * @param {string} entry
 * @param {string} field
 * @returns {string}
 */
function readStringField(entry, field) {
  const single = entry.match(new RegExp(`${field}:\\s*"([^"]*)"`));
  if (single) return single[1];
  const multi = entry.match(
    new RegExp(`${field}:\\s*\\n((?:\\s*"[^"]*"\\s*,?\\s*\\n?)+)`),
  );
  if (!multi) return "";
  return [...multi[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("");
}

/**
 * @param {string} entry
 * @returns {{ version: string, summary: string, changes: { type: string, description: string }[] }}
 */
function parseLatestChangelogEntry() {
  const entry = firstEntrySource();
  const version = readStringField(entry, "version");
  const summary = readStringField(entry, "summary");
  if (!version) throw new Error("Could not parse CHANGELOG[0].version");

  const changes = [];
  const changeBlocks = entry.matchAll(
    /\{\s*type:\s*"(added|changed|fixed)",\s*description:\s*(?:"([^"]*)"|((?:\s*"[^"]*"\s*,?\s*\n?)+))\s*,?\s*\}/g,
  );
  for (const match of changeBlocks) {
    const type = match[1];
    let description = match[2] ?? "";
    if (match[3]) {
      description = [...match[3].matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("");
    }
    if (description) changes.push({ type, description });
  }

  return { version, summary: summary || version, changes };
}

/**
 * @returns {number}
 */
function nextVersionCode() {
  try {
    const out = execFileSync(
      "gh",
      ["release", "list", "--limit", "100", "--json", "tagName"],
      { encoding: "utf8" },
    );
    const releases = JSON.parse(out);
    let count = 0;
    for (const release of releases) {
      const tag = release.tagName || "";
      if (tag.startsWith("android-v")) count += 1;
    }
    return Math.max(1, count + 1);
  } catch {
    return 1;
  }
}

const entry = parseLatestChangelogEntry();
const versionCode = nextVersionCode();
/** Unique per production push — still matches UpdateChecker `android-v*` filter. */
const tag = `android-v${entry.version}-b${versionCode}`;
const apkAssetName = `PolyCal-${entry.version}-b${versionCode}.apk`;

const releaseMeta = {
  versionName: entry.version,
  versionCode,
  summary: entry.summary,
  changes: entry.changes,
  apkAssetName,
};

const bodyLines = [
  `## PolyCal Android ${entry.version}`,
  "",
  entry.summary,
  "",
  "### Changes",
  ...(entry.changes.length > 0
    ? entry.changes.map((c) => `- **${c.type}:** ${c.description}`)
    : ["- See CHANGELOG.md"]),
  "",
  `versionCode: ${versionCode}`,
  "",
  "Install the attached APK (sideload). Enable push in Profile for Android system notifications.",
];

const workflowMeta = {
  tag,
  versionName: entry.version,
  versionCode,
  title: `PolyCal Android ${entry.version}`,
  bodyMarkdown: bodyLines.join("\n"),
  apkAssetName,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  path.join(OUT_DIR, "release-meta.json"),
  `${JSON.stringify(releaseMeta, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(ROOT, "android-release.json"),
  `${JSON.stringify(workflowMeta, null, 2)}\n`,
);

console.log(JSON.stringify(workflowMeta, null, 2));
process.exit(0);
