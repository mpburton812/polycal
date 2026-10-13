import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getSqlClient, resetDbSingleton } from "./client";
import { SCHEMA_VERSION, runMigrations } from "./migrate";

/**
 * Production stamped schema_meta at 55 before schedule_color shipped, then
 * skipped ensureColumn because SCHEMA_VERSION was still 55 (PC-534).
 */
describe("schedule_color on an existing database (PC-534)", () => {
  const previousUrl = process.env.TURSO_DATABASE_URL;
  let directory: string | undefined;

  afterEach(() => {
    resetDbSingleton();
    if (previousUrl === undefined) delete process.env.TURSO_DATABASE_URL;
    else process.env.TURSO_DATABASE_URL = previousUrl;
    if (directory) {
      // libSQL on Windows can keep the file lock for a moment after close.
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Leftover temp dir is outside the repo and does not affect the assertion.
      }
    }
    directory = undefined;
  });

  it("adds schedule_color when the stored version is the pre-color release", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "polycal-schema-"));
    const databaseFile = path.join(directory, "schema.db").replace(/\\/g, "/");
    process.env.TURSO_DATABASE_URL = `file:${databaseFile}`;
    delete process.env.TURSO_AUTH_TOKEN;
    resetDbSingleton();

    await runMigrations();

    const sql = getSqlClient();
    await sql.execute("ALTER TABLE proposals DROP COLUMN schedule_color");
    await sql.execute({
      sql: `UPDATE schema_meta SET value = ? WHERE key = 'version'`,
      args: ["55"],
    });

    resetDbSingleton();
    process.env.TURSO_DATABASE_URL = `file:${databaseFile}`;
    await runMigrations();

    const info = await getSqlClient().execute("PRAGMA table_info(proposals)");
    expect(info.rows.some((row) => row.name === "schedule_color")).toBe(true);
    const version = await getSqlClient().execute(
      `SELECT value FROM schema_meta WHERE key = 'version' LIMIT 1`,
    );
    expect(version.rows[0]?.value).toBe(SCHEMA_VERSION);
  });
});
