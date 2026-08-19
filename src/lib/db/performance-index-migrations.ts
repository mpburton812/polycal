import type { Client } from "@libsql/client";

/**
 * Hot-path covering indexes for the proposal board, schedule, enforcement sweeps,
 * the notification inbox (PC-355), and network-scoped feed/place lookups (PC-450).
 *
 * Index names mirror the `index("…")` declarations in `schema.ts` so Drizzle's
 * view of the schema and the runtime DDL stay in sync. Every statement is
 * `IF NOT EXISTS`, so this module is safe to re-run on existing databases.
 */
export async function applyPerformanceIndexMigrations(sql: Client): Promise<void> {
  for (const statement of PERFORMANCE_INDEX_STATEMENTS) {
    await sql.execute(statement);
  }
}

/**
 * Ordered DDL for every performance index. Exported so seed/reset scripts and
 * tests can assert the exact set without duplicating the SQL.
 */
export const PERFORMANCE_INDEX_STATEMENTS: readonly string[] = [
  // Board columns, enforcement sweeps, and conflict prefilters all scan by state.
  `CREATE INDEX IF NOT EXISTS idx_proposals_state ON proposals(state)`,
  // Schedule range queries: state narrows the set, scheduled_start_at bounds it.
  `CREATE INDEX IF NOT EXISTS idx_proposals_state_scheduled_start ON proposals(state, scheduled_start_at)`,
  // "My proposals" board visibility filter (proposer + state).
  `CREATE INDEX IF NOT EXISTS idx_proposals_proposer_state ON proposals(proposer_id, state)`,
  // Recurrence children lookups (series archive sweep, schedule slices).
  `CREATE INDEX IF NOT EXISTS idx_proposals_parent ON proposals(parent_proposal_id)`,
  // Multi-tenant board, schedule, and enforcement: network then state then start (PC-450).
  `CREATE INDEX IF NOT EXISTS idx_proposals_network_state_scheduled ON proposals(network_id, state, scheduled_start_at)`,
  // Feed milestones and proposal-detail audit trail (PC-450).
  `CREATE INDEX IF NOT EXISTS idx_proposal_state_log_proposal_created ON proposal_state_log(proposal_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_proposal_comments_proposal_created ON proposal_comments(proposal_id, created_at)`,

  // Reverse lookup "which proposals is this user invited to" — previously a full scan.
  `CREATE INDEX IF NOT EXISTS idx_proposal_invitees_user ON proposal_invitees(user_id)`,

  // Batched slot loads keyed by proposal, plus range scans for the calendar.
  `CREATE INDEX IF NOT EXISTS idx_proposal_time_slots_proposal ON proposal_time_slots(proposal_id)`,
  `CREATE INDEX IF NOT EXISTS idx_proposal_time_slots_start_end ON proposal_time_slots(start_at, end_at)`,

  // Notification inbox: per-user system rows ordered by recency.
  `CREATE INDEX IF NOT EXISTS idx_user_activity_log_user_event_created ON user_activity_log(user_id, event_type, created_at)`,

  // People & places hot filters (eligible locations, residency approvals).
  `CREATE INDEX IF NOT EXISTS idx_location_residents_user_status ON location_residents(user_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_location_residents_location_status ON location_residents(location_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_locations_network ON locations(network_id)`,

  // Sleeping partnership lookups are undirected — index both edge columns.
  `CREATE INDEX IF NOT EXISTS idx_sleeping_partnerships_status ON sleeping_partnerships(status)`,
  `CREATE INDEX IF NOT EXISTS idx_sleeping_partnerships_low_status ON sleeping_partnerships(user_low_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_sleeping_partnerships_high_status ON sleeping_partnerships(user_high_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_sleeping_partnerships_network_status ON sleeping_partnerships(network_id, status)`,

  // Feed chat threads scoped by network, then comments by parent message (PC-450).
  `CREATE INDEX IF NOT EXISTS idx_network_chat_messages_network_created ON network_chat_messages(network_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_network_chat_comments_message_created ON network_chat_comments(message_id, created_at)`,
];
