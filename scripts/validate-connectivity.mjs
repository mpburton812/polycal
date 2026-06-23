#!/usr/bin/env node
/**
 * Validate Turso database connectivity and Vercel deployment health across
 * feature (local), dev, test, and production environments.
 *
 * Usage: node scripts/validate-connectivity.mjs
 */
import { createClient } from "@libsql/client";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

const tursoHost = "mpburton.aws-us-east-2.turso.io";
const scope = "michael-burton-s-projects";

const deployments = {
  feature: {
    label: "Feature (Vercel preview — generic)",
    vercelEnv: "preview",
    gitBranch: null,
    expectedDb: "polycal-dev",
    url: "https://polycal-git-feature-pc-26-test-turso-db-michael-burton-s-projects.vercel.app",
  },
  dev: {
    label: "Dev",
    vercelEnv: "preview",
    gitBranch: "dev",
    expectedDb: "polycal-dev",
    url: "https://polycal-git-dev-michael-burton-s-projects.vercel.app",
  },
  test: {
    label: "Test",
    vercelEnv: "preview",
    gitBranch: "test",
    expectedDb: "polycal-test",
    url: "https://polycal-git-test-michael-burton-s-projects.vercel.app",
  },
  production: {
    label: "Production",
    vercelEnv: "production",
    gitBranch: null,
    expectedDb: "polycal-prod",
    url: "https://polycal-ebon.vercel.app",
  },
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

function tursoUrl(database) {
  return `libsql://${database}-${tursoHost}`;
}

function createTursoToken(database) {
  const output = execFileSync(
    "powershell",
    ["-File", "scripts/turso.ps1", "db", "tokens", "create", database, "--expiration", "never"],
    { encoding: "utf8", shell: true },
  );
  return output.trim().split(/\r?\n/).pop();
}

async function testTursoDirect(name, url, token) {
  const result = { name, url, ok: false, users: null, schema: false, error: null };
  if (!url?.trim() || !token?.trim()) {
    result.error = "missing url or token";
    return result;
  }
  try {
    const client = createClient({ url: url.trim(), authToken: token.trim() });
    await client.execute("SELECT 1 AS ok");
    result.ok = true;
    try {
      const users = await client.execute("SELECT COUNT(*) AS c FROM users");
      result.users = Number(users.rows[0]?.c ?? 0);
      result.schema = true;
    } catch {
      result.schema = false;
      result.users = null;
    }
  } catch (error) {
    result.error = error.message;
  }
  return result;
}

function runVercelEnvCheck(target) {
  const args = ["vercel", "env", "run", "-e", target.vercelEnv];
  if (target.gitBranch) {
    args.push("--git-branch", target.gitBranch);
  }
  args.push("--", "node", "scripts/vercel-env-dump.mjs");

  const envBackup = ".env.local.validate-backup";
  try {
    if (existsSync(".env.local")) {
      renameSync(".env.local", envBackup);
    }
    const stdout = execFileSync("npx", args, {
      encoding: "utf8",
      shell: true,
    });
    const jsonLine = stdout.split(/\r?\n/).find((line) => line.startsWith("{"));
    return jsonLine ? JSON.parse(jsonLine) : { error: "no json in output", raw: stdout.slice(0, 200) };
  } catch (error) {
    const stdout = error.stdout?.toString() ?? "";
    const jsonLine = stdout.split(/\r?\n/).find((line) => line.startsWith("{"));
    if (jsonLine) {
      return JSON.parse(jsonLine);
    }
    return { error: error.message, stderr: error.stderr?.toString()?.slice(0, 200) };
  } finally {
    if (existsSync(envBackup)) {
      renameSync(envBackup, ".env.local");
    }
  }
}

async function testHttpDeployment(name, url, expectedDb) {
  const result = { name, url, ok: false, status: null, apiStatus: null, userCount: null, error: null };
  try {
    const loginRes = await fetch(`${url}/login`, { redirect: "manual" });
    result.status = loginRes.status;

    const apiRes = await fetch(`${url}/api/dev/users`);
    result.apiStatus = apiRes.status;
    if (apiRes.ok) {
      const body = await apiRes.json();
      result.userCount = body.users?.length ?? 0;
      result.ok = loginRes.status < 500 && apiRes.ok;
    } else {
      result.ok = loginRes.status < 500 && loginRes.status !== 404;
      result.error = apiRes.status === 403 ? "api forbidden (may be production)" : `api ${apiRes.status}`;
    }
  } catch (error) {
    result.error = error.message;
  }
  result.expectedDb = expectedDb;
  return result;
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function status(ok) {
  return ok ? "PASS" : "FAIL";
}

// --- Direct Turso tests ---
printSection("Direct Turso connectivity");
const setup = parseEnv(".env.vercel-setup");
const local = parseEnv(".env.local");

const dbTargets = [
  { key: "feature/local", db: "polycal-dev", token: local.TURSO_AUTH_TOKEN },
  { key: "dev", db: "polycal-dev", token: setup.TURSO_AUTH_TOKEN_DEV || local.TURSO_AUTH_TOKEN },
  { key: "test", db: "polycal-test", token: setup.TURSO_AUTH_TOKEN_TEST },
  { key: "prod", db: "polycal-prod", token: setup.TURSO_AUTH_TOKEN_PROD },
];

for (const { key, db, token } of dbTargets) {
  let resolvedToken = token?.trim();
  if (!resolvedToken && db === "polycal-prod") {
    try {
      resolvedToken = createTursoToken("polycal-prod");
      console.log(`(created fresh token for ${db})`);
    } catch (error) {
      console.log(`${key}: SKIP — no token (${error.message})`);
      continue;
    }
  }
  if (!resolvedToken) {
    console.log(`${key}: SKIP — no token available`);
    continue;
  }
  const url = tursoUrl(db);
  const r = await testTursoDirect(key, url, resolvedToken);
  console.log(
    `${status(r.ok)} ${key} → ${db} | schema=${r.schema} users=${r.users ?? "n/a"}${r.error ? ` | ${r.error}` : ""}`,
  );
}

// --- Vercel env resolution ---
printSection("Vercel env resolution (runtime vars)");
for (const [key, target] of Object.entries(deployments)) {
  const env = runVercelEnvCheck(target);
  const dbName = (env.url || "").includes("polycal-test")
    ? "polycal-test"
    : (env.url || "").includes("polycal-prod")
      ? "polycal-prod"
      : (env.url || "").includes("polycal-dev")
        ? "polycal-dev"
        : "unknown";
  const envOk =
    env.tokenLen > 0 &&
    env.url &&
    dbName === target.expectedDb &&
    (key === "production"
      ? env.env === "production"
      : key === "feature"
        ? Boolean(env.env)
        : env.env === key);
  console.log(
    `${status(envOk)} ${target.label} | db=${dbName} (expected ${target.expectedDb}) | APP_ENV=${env.env || env.error || "?"} | tokenLen=${env.tokenLen ?? 0}`,
  );
}

// --- HTTP deployment tests ---
printSection("Vercel HTTP + /api/dev/users");
for (const [key, target] of Object.entries(deployments)) {
  if (key === "feature") {
    continue;
  }
  const r = await testHttpDeployment(target.label, target.url, target.expectedDb);
  console.log(
    `${status(r.ok)} ${target.label} | /login=${r.status} /api/dev/users=${r.apiStatus} users=${r.userCount ?? "n/a"}${r.error ? ` | ${r.error}` : ""}`,
  );
}

// Feature branch URL only exists after push — try if deployed
const featureUrl = deployments.feature.url;
try {
  const featureRes = await fetch(featureUrl, { method: "HEAD", redirect: "manual" });
  if (featureRes.status !== 404) {
    const r = await testHttpDeployment("Feature branch", featureUrl, "polycal-dev");
    console.log(
      `${status(r.ok)} Feature branch | /login=${r.status} /api/dev/users=${r.apiStatus} users=${r.userCount ?? "n/a"}`,
    );
  } else {
    console.log(`SKIP Feature branch — deployment not ready yet (${featureUrl})`);
  }
} catch {
  console.log("SKIP Feature branch — not deployed yet");
}

console.log("\nDone.");
