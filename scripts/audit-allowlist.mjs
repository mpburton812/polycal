/**
 * Promotion audit gate (feature → dev).
 *
 * Fails on any npm advisory except the allowlist below. An entry is allowed
 * only when no patched release exists and the package is not on the production
 * request path. Dependents are allowed when every path leads to an allowlisted advisory.
 */
import { execSync } from "node:child_process";

/** GHSA ids with a written compensating control. */
const ALLOWED_ADVISORIES = new Set([
  // braces has no patched release (latest 3.0.3 is still flagged). It is pulled
  // only by eslint-config-next → fast-glob → micromatch, which is lint tooling.
  // Downgrading eslint-config-next to 14 is a breaking change and not a fix.
  "GHSA-vfj7-8cjw-p6xm",
]);

function isAllowed(name, vulnerabilities, seen) {
  if (seen.has(name)) return true;
  seen.add(name);
  const entry = vulnerabilities[name];
  if (!entry) return false;
  const via = Array.isArray(entry.via) ? entry.via : [];
  if (via.length === 0) return false;
  return via.every((item) => {
    if (typeof item === "string") return isAllowed(item, vulnerabilities, seen);
    const url = item && typeof item.url === "string" ? item.url : "";
    const match = /GHSA-[a-z0-9-]+/i.exec(url);
    return Boolean(match && ALLOWED_ADVISORIES.has(match[0]));
  });
}

function main() {
  let raw = "";
  try {
    raw = execSync("npm audit --json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stdout = error && typeof error.stdout === "string" ? error.stdout : "";
    if (!stdout) throw error;
    raw = stdout;
  }
  const report = JSON.parse(raw);
  const vulnerabilities = report.vulnerabilities ?? {};
  const blocking = [];

  for (const name of Object.keys(vulnerabilities)) {
    if (!isAllowed(name, vulnerabilities, new Set())) {
      const severity = vulnerabilities[name]?.severity ?? "unknown";
      blocking.push(`${name} (${severity})`);
    }
  }

  if (blocking.length > 0) {
    console.error("[audit] Unresolved vulnerabilities:");
    for (const line of blocking) console.error(`  - ${line}`);
    process.exit(1);
  }

  console.log(
    `[audit] Passed. Allowlisted dev-only advisories: ${[...ALLOWED_ADVISORIES].join(", ")}`,
  );
}

main();
