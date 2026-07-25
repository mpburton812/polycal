import { describe, expect, it } from "vitest";

import { PERFORMANCE_INDEX_STATEMENTS } from "./performance-index-migrations";

describe("performance index DDL (PC-355)", () => {
  it("is idempotent — every statement guards with IF NOT EXISTS", () => {
    for (const statement of PERFORMANCE_INDEX_STATEMENTS) {
      expect(statement).toMatch(/^CREATE INDEX IF NOT EXISTS /);
    }
  });

  it("declares each index name once", () => {
    const names = PERFORMANCE_INDEX_STATEMENTS.map(
      (statement) => /IF NOT EXISTS (\w+) ON/.exec(statement)?.[1],
    );
    expect(names.every(Boolean)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it("covers the hot-path filters the Phase 2 audit flagged", () => {
    const ddl = PERFORMANCE_INDEX_STATEMENTS.join("\n");
    expect(ddl).toContain("ON proposals(state)");
    expect(ddl).toContain("ON proposals(state, scheduled_start_at)");
    expect(ddl).toContain("ON proposals(proposer_id, state)");
    expect(ddl).toContain("ON proposal_invitees(user_id)");
    expect(ddl).toContain("ON proposal_time_slots(proposal_id)");
    expect(ddl).toContain("ON proposal_time_slots(start_at, end_at)");
    expect(ddl).toContain("ON user_activity_log(user_id, event_type, created_at)");
    expect(ddl).toContain("ON location_residents(user_id, status)");
    expect(ddl).toContain("ON sleeping_partnerships(user_low_id, status)");
  });
});
