#!/usr/bin/env node
/**
 * Build .env.vercel-setup from .env.local plus fresh polycal-test and polycal-prod tokens.
 * Output is gitignored — used by sync-vercel-preview-env.mjs.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

function parseEnv(file) {
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index);
        let value = line.slice(index + 1);
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
}

const local = parseEnv(".env.local");
const testTokenOutput = execFileSync(
  "powershell",
  ["-File", "scripts/turso.ps1", "db", "tokens", "create", "polycal-test", "--expiration", "never"],
  { encoding: "utf8", shell: true },
);
const testToken = testTokenOutput.trim().split(/\r?\n/).pop();

const prodTokenOutput = execFileSync(
  "powershell",
  ["-File", "scripts/turso.ps1", "db", "tokens", "create", "polycal-prod", "--expiration", "never"],
  { encoding: "utf8", shell: true },
);
const prodToken = prodTokenOutput.trim().split(/\r?\n/).pop();

if (!local.TURSO_AUTH_TOKEN?.trim()) {
  throw new Error("TURSO_AUTH_TOKEN missing in .env.local");
}
if (!local.AUTH_SECRET?.trim()) {
  throw new Error("AUTH_SECRET missing in .env.local");
}
if (!testToken) {
  throw new Error("Failed to create polycal-test token");
}
if (!prodToken) {
  throw new Error("Failed to create polycal-prod token");
}

writeFileSync(
  ".env.vercel-setup",
  [
    "# generated — do not commit",
    `AUTH_SECRET=${local.AUTH_SECRET.trim()}`,
    `TURSO_AUTH_TOKEN_DEV=${local.TURSO_AUTH_TOKEN.trim()}`,
    `TURSO_AUTH_TOKEN_TEST=${testToken}`,
    `TURSO_AUTH_TOKEN_PROD=${prodToken}`,
    "",
  ].join("\n"),
);

console.log("Wrote .env.vercel-setup (polycal-dev + polycal-test + polycal-prod tokens)");
