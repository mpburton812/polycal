import { existsSync, readFileSync } from "node:fs";

function parseEnv(file: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

/**
 * Wipes and reseeds polycal-test Turso with the Burton-Thompson family fixture set.
 */
async function main(): Promise<void> {
  const setupPath = ".env.vercel-setup";
  if (!existsSync(setupPath)) {
    throw new Error(
      "Missing .env.vercel-setup — copy .env.vercel-setup.example and add TURSO_AUTH_TOKEN_TEST.",
    );
  }

  const env = parseEnv(setupPath);
  process.env.TURSO_DATABASE_URL = "libsql://polycal-test-mpburton.aws-us-east-2.turso.io";
  process.env.TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN_TEST;
  process.env.NEXT_PUBLIC_APP_ENV = "test";
  delete process.env.E2E_TEST_MODE;

  const { runMigrations } = await import("../src/lib/db/migrate");
  const { resetTestDatabase } = await import("../src/lib/seed/reset-test-database");
  const { getTestFamilyPasswordHint } = await import("../src/lib/seed/test-family");

  console.log("[polycal-test] Running migrations…");
  await runMigrations();

  console.log("[polycal-test] Resetting to Burton-Thompson family seed…");
  const result = await resetTestDatabase();
  console.log(
    `[polycal-test] Done (${result.userCount} users, ${result.proposalCount} proposals, profile=${result.seedProfile}).`,
  );
  console.log(`[polycal-test] Default password: ${getTestFamilyPasswordHint()}`);
}

main().catch((error) => {
  console.error("[polycal-test] Reset failed:", error);
  process.exit(1);
});
