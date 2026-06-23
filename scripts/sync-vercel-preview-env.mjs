#!/usr/bin/env node
/**
 * Sync Turso + auth env to Vercel preview branches.
 *
 * Branch → Turso database:
 *   dev  → polycal-dev
 *   test → polycal-test
 *
 * Token resolution order per branch:
 *   TURSO_AUTH_TOKEN_<BRANCH> in source file, else TURSO_AUTH_TOKEN (dev only fallback).
 *
 * Usage:
 *   node scripts/sync-vercel-preview-env.mjs [.env.vercel-setup]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const scope = "michael-burton-s-projects";
const tursoHost = "mpburton.aws-us-east-2.turso.io";
const sourceFiles = [process.argv[2], ".env.vercel-setup"].filter(Boolean);

const PREVIEW_URLS = {
  dev: "https://polycal-git-dev-michael-burton-s-projects.vercel.app",
  test: "https://polycal-git-test-michael-burton-s-projects.vercel.app",
};

function parseEnv(file) {
  if (!file || !existsSync(file)) {
    return {};
  }
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

function loadEnv() {
  const merged = {};
  for (const file of sourceFiles) {
    Object.assign(merged, parseEnv(file));
  }
  return merged;
}

function tursoDatabaseUrl(database) {
  return `libsql://${database}-${tursoHost}`;
}

function runVercel(args, input) {
  execFileSync("npx", ["vercel", ...args, "--scope", scope, "--yes"], {
    stdio: input ? ["pipe", "inherit", "inherit"] : "inherit",
    input,
    shell: true,
  });
}

function removeBranchVar(name, branch) {
  try {
    runVercel(["env", "rm", name, "preview", branch]);
    console.log(`removed ${name} (preview/${branch})`);
  } catch {
    console.log(`skip remove ${name} (preview/${branch})`);
  }
}

function upsertBranchVar(name, value, branch) {
  removeBranchVar(name, branch);
  runVercel(["env", "add", name, "preview", branch], `${value}\n`);
  console.log(`set ${name} for preview/${branch}`);
}

const env = loadEnv();
let authSecret = env.AUTH_SECRET?.trim();
if (!authSecret) {
  const local = parseEnv(".env.local");
  authSecret = local.AUTH_SECRET?.trim();
  if (!authSecret) {
    throw new Error("AUTH_SECRET missing in .env.vercel-setup or .env.local");
  }
}

const branches = [
  {
    gitBranch: "dev",
    appEnv: "dev",
    database: "polycal-dev",
    authUrl: PREVIEW_URLS.dev,
    tokenKeys: ["TURSO_AUTH_TOKEN_DEV", "TURSO_AUTH_TOKEN"],
  },
  {
    gitBranch: "test",
    appEnv: "test",
    database: "polycal-test",
    authUrl: PREVIEW_URLS.test,
    tokenKeys: ["TURSO_AUTH_TOKEN_TEST", "TURSO_AUTH_TOKEN"],
  },
];

for (const { gitBranch, appEnv, database, authUrl, tokenKeys } of branches) {
  const url = tursoDatabaseUrl(database);
  const token = tokenKeys.map((key) => env[key]?.trim()).find(Boolean);

  if (!token) {
    throw new Error(
      `Missing Turso token for ${gitBranch}. Set one of: ${tokenKeys.join(", ")}`,
    );
  }

  upsertBranchVar("TURSO_DATABASE_URL", url, gitBranch);
  upsertBranchVar("TURSO_AUTH_TOKEN", token, gitBranch);
  upsertBranchVar("NEXT_PUBLIC_APP_ENV", appEnv, gitBranch);
  upsertBranchVar("AUTH_SECRET", authSecret, gitBranch);
  upsertBranchVar("AUTH_URL", authUrl, gitBranch);
}

console.log("Done. Redeploy preview branches to pick up env changes.");
