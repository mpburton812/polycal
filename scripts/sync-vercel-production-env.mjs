#!/usr/bin/env node
/**
 * Sync Turso + auth env to Vercel production (polycal-prod).
 *
 * Usage: node scripts/sync-vercel-production-env.mjs [.env.vercel-setup]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const scope = "michael-burton-s-projects";
const tursoHost = "mpburton.aws-us-east-2.turso.io";
const sourceFiles = [process.argv[2], ".env.vercel-setup", ".env.local"].filter(Boolean);

function parseEnv(file) {
  if (!file || !existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index);
        let value = line.slice(index + 1);
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        return [key, value];
      }),
  );
}

function loadEnv() {
  const merged = {};
  for (const file of sourceFiles) Object.assign(merged, parseEnv(file));
  return merged;
}

function createProdToken() {
  const output = execFileSync(
    "powershell",
    ["-File", "scripts/turso.ps1", "db", "tokens", "create", "polycal-prod", "--expiration", "never"],
    { encoding: "utf8", shell: true },
  );
  return output.trim().split(/\r?\n/).pop();
}

function runVercel(args, input) {
  execFileSync("npx", ["vercel", ...args, "--scope", scope, "--yes"], {
    stdio: input ? ["pipe", "inherit", "inherit"] : "inherit",
    input,
    shell: true,
  });
}

function upsertProductionVar(name, value) {
  try {
    runVercel(["env", "rm", name, "production"]);
    console.log(`removed ${name} (production)`);
  } catch {
    console.log(`skip remove ${name} (production)`);
  }
  runVercel(["env", "add", name, "production"], `${value}\n`);
  console.log(`set ${name} for production`);
}

const env = loadEnv();
let token = env.TURSO_AUTH_TOKEN_PROD?.trim();
if (!token) token = createProdToken();

const authSecret = env.AUTH_SECRET?.trim();
if (!authSecret) throw new Error("AUTH_SECRET missing in source env");

const databaseUrl = `libsql://polycal-prod-${tursoHost}`;
const productionUrl = env.AUTH_URL?.trim() || "https://polycal-ebon.vercel.app";

upsertProductionVar("TURSO_DATABASE_URL", databaseUrl);
upsertProductionVar("TURSO_AUTH_TOKEN", token);
upsertProductionVar("NEXT_PUBLIC_APP_ENV", "production");
upsertProductionVar("AUTH_SECRET", authSecret);
upsertProductionVar("AUTH_URL", productionUrl);

console.log("Done. Redeploy production to pick up env changes.");
