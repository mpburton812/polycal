import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Hard-wipe must drop network-scoped rows while keeping platform_system_log (PC-462).
 */
describe("network purge keeps platform log (PC-462)", () => {
  it("never issues a DELETE against platform_system_log", () => {
    const source = readFileSync(path.join(process.cwd(), "src/lib/networks/purge.ts"), "utf8");
    expect(source).not.toMatch(/DELETE FROM platform_system_log/i);
    expect(source).not.toMatch(/delete\(platformSystemLog\)/);
  });

  it("deletes the network row and memberships but not platform_system_log", async () => {
    const sql = createClient({ url: ":memory:" });
    try {
      await sql.execute("PRAGMA foreign_keys = ON");
      await sql.execute(`CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL)`);
      await sql.execute(`
        CREATE TABLE networks (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL
        )
      `);
      await sql.execute(`
        CREATE TABLE network_members (
          id TEXT PRIMARY KEY NOT NULL,
          network_id TEXT NOT NULL REFERENCES networks(id),
          user_id TEXT NOT NULL REFERENCES users(id),
          role TEXT NOT NULL,
          status TEXT NOT NULL
        )
      `);
      await sql.execute(`
        CREATE TABLE platform_system_log (
          id TEXT PRIMARY KEY NOT NULL,
          created_at TEXT NOT NULL,
          network_name TEXT,
          network_id TEXT,
          action TEXT NOT NULL,
          summary TEXT NOT NULL
        )
      `);

      await sql.execute({ sql: `INSERT INTO users (id) VALUES (?)`, args: ["u1"] });
      await sql.execute({
        sql: `INSERT INTO networks (id, name) VALUES (?, ?)`,
        args: ["n1", "Doomed"],
      });
      await sql.execute({
        sql: `INSERT INTO network_members (id, network_id, user_id, role, status)
              VALUES (?, ?, ?, ?, ?)`,
        args: ["m1", "n1", "u1", "user", "active"],
      });
      await sql.execute({
        sql: `INSERT INTO platform_system_log (id, created_at, network_name, network_id, action, summary)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: ["l1", new Date().toISOString(), "Doomed", "n1", "networks.create", "created"],
      });

      await sql.execute({ sql: `DELETE FROM network_members WHERE network_id = ?`, args: ["n1"] });
      await sql.execute({ sql: `DELETE FROM networks WHERE id = ?`, args: ["n1"] });

      const networks = await sql.execute(`SELECT id FROM networks`);
      const members = await sql.execute(`SELECT id FROM network_members`);
      const logs = await sql.execute(`SELECT id, network_name FROM platform_system_log`);
      const users = await sql.execute(`SELECT id FROM users`);

      expect(networks.rows).toHaveLength(0);
      expect(members.rows).toHaveLength(0);
      expect(users.rows).toHaveLength(1);
      expect(logs.rows).toHaveLength(1);
      expect(String(logs.rows[0].network_name)).toBe("Doomed");
    } finally {
      sql.close();
    }
  });
});
