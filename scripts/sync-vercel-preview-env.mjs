#!/usr/bin/env node
/**
 * Sync Turso + app env from .env.local to Vercel preview branch targets.
 * Removes empty branch overrides that block inherited Preview env vars.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const scope = "michael-burton-s-projects";
const sourceFile = process.argv[2] ?? ".env.local";

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
    console.log(`removed empty override: ${name} (preview/${branch})`);
  } catch {
    console.log(`skip remove ${name} (preview/${branch})`);
  }
}

function upsertBranchVar(name, value, branch) {
  removeBranchVar(name, branch);
  runVercel(["env", "add", name, "preview", branch], `${value}\n`);
  console.log(`set ${name} for preview/${branch}`);
}

const env = parseEnv(sourceFile);
const branches = [
  { gitBranch: "test", appEnv: "test" },
  { gitBranch: "dev", appEnv: "dev" },
];

for (const { gitBranch, appEnv } of branches) {
  for (const key of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]) {
    removeBranchVar(key, gitBranch);
  }

  upsertBranchVar("NEXT_PUBLIC_APP_ENV", appEnv, gitBranch);

  if (env.AUTH_SECRET?.trim()) {
    upsertBranchVar("AUTH_SECRET", env.AUTH_SECRET.trim(), gitBranch);
  }
}

console.log("Done. Redeploy test/dev previews to pick up env changes.");
