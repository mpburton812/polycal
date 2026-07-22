import { describe, expect, it } from "vitest";

import { logProposalTransition } from "./state-log";

type InsertedRow = {
  id: string;
  proposalId: string;
  actorUserId: string | null;
  action: string;
  details: string | null;
  createdAt: string;
};

/** Captures the row passed to db.insert(...).values(...) for assertions. */
function fakeDb() {
  const inserted: InsertedRow[] = [];
  const db = {
    insert: () => ({
      values: async (row: InsertedRow) => {
        inserted.push(row);
      },
    }),
  } as never;
  return { db, inserted };
}

describe("logProposalTransition", () => {
  it("writes an actor-attributed transition row with a psl- id", async () => {
    const { db, inserted } = fakeDb();

    await logProposalTransition(db, "prop-1", "user-1", "proposal.resolved", "all good");

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      proposalId: "prop-1",
      actorUserId: "user-1",
      action: "proposal.resolved",
      details: "all good",
    });
    expect(inserted[0]!.id).toMatch(/^psl-/);
    expect(typeof inserted[0]!.createdAt).toBe("string");
  });

  it("supports system transitions (null actor) and null-defaults missing details", async () => {
    const { db, inserted } = fakeDb();

    await logProposalTransition(db, "prop-2", null, "proposal.auto_archived");

    expect(inserted[0]).toMatchObject({
      proposalId: "prop-2",
      actorUserId: null,
      action: "proposal.auto_archived",
      details: null,
    });
  });
});
