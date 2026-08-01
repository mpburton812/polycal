import { describe, expect, it } from "vitest";

import type { ProposalConflictWarning } from "@/actions/proposals/types";
import { formatConflictMessage } from "./conflict-message";

describe("formatConflictMessage", () => {
  it("lists each conflict on its own line (PC-263)", () => {
    const warnings: ProposalConflictWarning[] = [
      {
        userId: "u1",
        displayName: "Luke",
        conflictingTitle: "Party",
        conflictingState: "resolved",
        overlapStart: "2026-07-17T00:00:00.000Z",
        overlapEnd: "2026-07-18T00:00:00.000Z",
      },
      {
        userId: "u2",
        displayName: "Leia",
        conflictingTitle: "Sleeping: Han",
        conflictingState: "proposed",
        overlapStart: "2026-07-17T00:00:00.000Z",
        overlapEnd: "2026-07-18T00:00:00.000Z",
        conflictKind: "place_asset",
      },
    ];
    const message = formatConflictMessage(warnings);
    expect(message).toContain("Schedule conflicts detected:");
    expect(message).toContain('Luke overlaps with "Party" (resolved)');
    expect(message).toContain('Place overlaps with "Sleeping: Han" (proposed)');
  });

  it("returns no-conflicts copy when empty", () => {
    expect(formatConflictMessage([])).toBe("No conflicts.");
  });
});
