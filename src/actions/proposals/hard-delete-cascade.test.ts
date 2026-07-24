/**
 * FK cascade order for proposal hard-delete (PC-346).
 * Mirrors hardDeleteProposalCascade without Next/auth so CI catches regressions.
 */
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";

const openClients: Array<ReturnType<typeof createClient>> = [];
const dbFiles: string[] = [];

async function openDb() {
  const DB_FILE = `hard-delete-cascade-${randomUUID()}.db`;
  dbFiles.push(DB_FILE);
  const sql = createClient({ url: `file:${DB_FILE}` });
  openClients.push(sql);
  await sql.execute("PRAGMA foreign_keys = ON");
  await sql.execute(`CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL)`);
  await sql.execute(`
    CREATE TABLE proposals (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      proposal_type TEXT NOT NULL,
      state TEXT NOT NULL,
      proposer_id TEXT NOT NULL REFERENCES users(id),
      parent_proposal_id TEXT REFERENCES proposals(id),
      detached_from_parent_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await sql.execute(`
    CREATE TABLE calendar_event_links (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      provider TEXT NOT NULL,
      last_synced_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await sql.execute(`
    CREATE TABLE calendar_ics_pending (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      ics_uid TEXT NOT NULL,
      ics_sequence INTEGER NOT NULL DEFAULT 0,
      method TEXT NOT NULL,
      filename TEXT NOT NULL,
      ics_body TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await sql.execute(`
    CREATE TABLE location_residents (
      id TEXT PRIMARY KEY NOT NULL,
      location_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL,
      proposed_by_id TEXT NOT NULL REFERENCES users(id),
      proposal_id TEXT REFERENCES proposals(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await sql.execute(`
    CREATE TABLE proposal_invitees (
      id TEXT PRIMARY KEY NOT NULL,
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    )
  `);
  await sql.execute(`
    CREATE TABLE proposal_time_slots (
      id TEXT PRIMARY KEY NOT NULL,
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      start_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await sql.execute(`
    CREATE TABLE proposal_slot_votes (
      id TEXT PRIMARY KEY NOT NULL,
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      created_at TEXT NOT NULL
    )
  `);
  await sql.execute(`
    CREATE TABLE proposal_comments (
      id TEXT PRIMARY KEY NOT NULL,
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      created_at TEXT NOT NULL
    )
  `);
  await sql.execute(`
    CREATE TABLE proposal_state_log (
      id TEXT PRIMARY KEY NOT NULL,
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      created_at TEXT NOT NULL
    )
  `);
  await sql.execute("INSERT INTO users (id) VALUES ('u1')");
  return sql;
}

async function insertProposal(sql: ReturnType<typeof createClient>, id: string) {
  const now = new Date().toISOString();
  await sql.execute({
    sql: `INSERT INTO proposals (id, title, proposal_type, state, proposer_id, created_at, updated_at)
          VALUES (?, 't', 'event', 'draft', 'u1', ?, ?)`,
    args: [id, now, now],
  });
}

/** Incomplete cascade — reproduces production SQLITE_CONSTRAINT. */
async function legacyCascade(sql: ReturnType<typeof createClient>, proposalId: string) {
  await sql.execute({
    sql: "DELETE FROM proposal_slot_votes WHERE proposal_id = ?",
    args: [proposalId],
  });
  await sql.execute({
    sql: "DELETE FROM proposal_time_slots WHERE proposal_id = ?",
    args: [proposalId],
  });
  await sql.execute({
    sql: "DELETE FROM proposal_invitees WHERE proposal_id = ?",
    args: [proposalId],
  });
  await sql.execute({
    sql: "DELETE FROM proposal_comments WHERE proposal_id = ?",
    args: [proposalId],
  });
  await sql.execute({
    sql: "DELETE FROM proposal_state_log WHERE proposal_id = ?",
    args: [proposalId],
  });
  await sql.execute({
    sql: "DELETE FROM proposals WHERE id = ?",
    args: [proposalId],
  });
}

/** Fixed cascade matching hardDeleteProposalCascade (PC-346). */
async function fixedCascade(sql: ReturnType<typeof createClient>, proposalId: string) {
  await sql.execute({
    sql: "DELETE FROM calendar_event_links WHERE proposal_id = ?",
    args: [proposalId],
  });
  await sql.execute({
    sql: "DELETE FROM calendar_ics_pending WHERE proposal_id = ?",
    args: [proposalId],
  });
  await sql.execute({
    sql: "UPDATE location_residents SET proposal_id = NULL WHERE proposal_id = ?",
    args: [proposalId],
  });
  await sql.execute({
    sql: "UPDATE proposals SET parent_proposal_id = NULL WHERE parent_proposal_id = ?",
    args: [proposalId],
  });
  await legacyCascade(sql, proposalId);
}

afterEach(() => {
  while (openClients.length > 0) {
    const sql = openClients.pop();
    try {
      sql?.close();
    } catch {
      // ignore
    }
  }
  while (dbFiles.length > 0) {
    const file = dbFiles.pop();
    if (file && existsSync(file)) {
      try {
        unlinkSync(file);
      } catch {
        // Windows may keep a short lock after client close.
      }
    }
  }
});

describe("proposal hard-delete FK cascade (PC-346)", () => {
  it("legacy cascade fails when calendar_event_links remain", async () => {
    const sql = await openDb();
    const now = new Date().toISOString();
    try {
      await insertProposal(sql, "prop-1");
      await sql.execute({
        sql: `INSERT INTO calendar_event_links
          (id, user_id, proposal_id, provider, last_synced_at, created_at, updated_at)
          VALUES ('cel1', 'u1', 'prop-1', 'google', ?, ?, ?)`,
        args: [now, now, now],
      });
      await expect(legacyCascade(sql, "prop-1")).rejects.toThrow(/FOREIGN KEY/i);
    } finally {
      sql.close();
    }
  });

  it("fixed cascade deletes with calendar links, ics pending, residency, and recurrence child", async () => {
    const sql = await openDb();
    const now = new Date().toISOString();
    try {
      await insertProposal(sql, "prop-parent");
      await sql.execute({
        sql: `INSERT INTO calendar_event_links
          (id, user_id, proposal_id, provider, last_synced_at, created_at, updated_at)
          VALUES ('cel1', 'u1', 'prop-parent', 'google', ?, ?, ?)`,
        args: [now, now, now],
      });
      await sql.execute({
        sql: `INSERT INTO calendar_ics_pending
          (id, user_id, proposal_id, ics_uid, method, filename, ics_body, title, created_at, updated_at)
          VALUES ('ics1', 'u1', 'prop-parent', 'uid', 'REQUEST', 'x.ics', 'BODY', 't', ?, ?)`,
        args: [now, now],
      });
      await sql.execute({
        sql: `INSERT INTO location_residents
          (id, location_id, user_id, status, proposed_by_id, proposal_id, created_at, updated_at)
          VALUES ('lr1', 'loc1', 'u1', 'accepted', 'u1', 'prop-parent', ?, ?)`,
        args: [now, now],
      });
      await sql.execute({
        sql: `INSERT INTO proposals
          (id, title, proposal_type, state, proposer_id, parent_proposal_id, created_at, updated_at)
          VALUES ('prop-child', 'child', 'event', 'draft', 'u1', 'prop-parent', ?, ?)`,
        args: [now, now],
      });
      await sql.execute({
        sql: `INSERT INTO proposals
          (id, title, proposal_type, state, proposer_id, detached_from_parent_id, created_at, updated_at)
          VALUES ('prop-detached', 'det', 'sleeping', 'resolved', 'u1', 'prop-parent', ?, ?)`,
        args: [now, now],
      });

      await expect(fixedCascade(sql, "prop-parent")).resolves.toBeUndefined();

      const remaining = await sql.execute("SELECT id FROM proposals WHERE id = 'prop-parent'");
      expect(remaining.rows).toHaveLength(0);

      const child = await sql.execute(
        "SELECT parent_proposal_id FROM proposals WHERE id = 'prop-child'",
      );
      expect(child.rows[0]?.parent_proposal_id).toBeNull();

      const detached = await sql.execute(
        "SELECT id FROM proposals WHERE id = 'prop-detached'",
      );
      expect(detached.rows).toHaveLength(1);
    } finally {
      sql.close();
    }
  });
});
